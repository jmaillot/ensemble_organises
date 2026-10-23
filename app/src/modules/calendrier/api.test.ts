import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { instantToLocalInput } from '@/lib/datetime';

/**
 * Preuve comportementale WR-07 au troisième site de saisie (D-05) : le rappel
 * d'un événement est un **instant** (`event_reminders.remind_at`), alors que
 * `events.start_at`/`end_at` restent l'heure **murale** du foyer (`eventWallDate`).
 * Le fichier épingle donc les deux frontières dans le même test : celle qu'on
 * convertit, et celle qu'on ne doit surtout pas convertir.
 *
 * L'adaptateur est simulé : c'est la seule façon d'observer la valeur exacte
 * écrite dans `event_reminders`, qu'un aller-retour Dexie masquerait.
 */

const { mockCreate, mockList, mockRemove, mockUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockList: vi.fn(),
  mockRemove: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { create: mockCreate, list: mockList, remove: mockRemove, update: mockUpdate } };
});

const { createCategory, replaceEventReminder, saveEvent } = await import('./api');

/**
 * Fuseau épinglé à celui du foyer : sans cela, l'instant attendu serait celui de
 * la machine, et le test mesurerait l'environnement (AGENTS.md §2.7 D.3).
 */
const PREVIOUS_TZ = process.env.TZ;
process.env.TZ = 'Europe/Paris';
afterAll(() => {
  if (PREVIOUS_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREVIOUS_TZ;
});

const input = (overrides: Partial<Parameters<typeof saveEvent>[1]> = {}) => ({
  householdId: 'household-1',
  createdBy: 'member-1',
  color: null,
  calendarId: null,
  categoryId: null,
  title: 'Balade au lac',
  date: '2026-10-15',
  startTime: '19:30',
  endTime: '',
  allDay: false,
  location: '',
  description: '',
  memberId: '',
  remindAt: '2026-10-15T18:30',
  ...overrides,
});

const written = (table: string) =>
  mockCreate.mock.calls.filter(([name]) => name === table).map(([, values]) => values as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockRemove.mockResolvedValue(undefined);
  mockCreate.mockImplementation(async (table: string, values: Record<string, unknown>) => ({
    id: table === 'events' ? 'event-1' : 'reminder-1',
    ...values,
  }));
  mockUpdate.mockImplementation(async (_table: string, id: string, values: Record<string, unknown>) => ({ id, ...values }));
});

describe('saveEvent — le rappel s’écrit en instant, la date reste murale (WR-07)', () => {
  it('convertit la valeur locale du champ en instant, et la relit à l’identique', async () => {
    await saveEvent(null, input());

    const [reminder] = written('event_reminders');
    expect(reminder).toEqual({ event_id: 'event-1', remind_at: '2026-10-15T16:30:00.000Z' });
    // Aller-retour : 18:30 locale saisie, 18:30 locale réaffichée.
    expect(instantToLocalInput(reminder?.remind_at as string)).toBe('2026-10-15T18:30');
  });

  it('conserve `start_at`/`end_at` en heure murale (doctrine `eventWallDate`)', async () => {
    await saveEvent(null, input({ startTime: '19:30', endTime: '20:15' }));

    const [event] = written('events');
    // Aucun `Z`, aucun offset : 19:30 écrit est 19:30 relu par le calendrier.
    expect(event?.start_at).toBe('2026-10-15T19:30:00');
    expect(event?.end_at).toBe('2026-10-15T20:15:00');
  });

  it('n’écrit `end_at` qu’en heure murale aussi quand la journée est entière', async () => {
    await saveEvent(null, input({ allDay: true }));

    const [event] = written('events');
    expect(event?.start_at).toBe('2026-10-15T00:00:00');
    expect(event?.end_at).toBeNull();
  });

  it('n’écrit aucun rappel quand le champ est vide', async () => {
    await saveEvent(null, input({ remindAt: '   ' }));
    expect(written('event_reminders')).toEqual([]);
  });

  it('remplace le rappel existant à la mise à jour', async () => {
    mockList.mockResolvedValue([{ id: 'reminder-old', event_id: 'event-1', remind_at: '2026-10-14T16:30:00.000Z' }]);

    await saveEvent('event-1', input({ remindAt: '2026-10-15T18:30' }));

    expect(mockRemove).toHaveBeenCalledWith('event_reminders', 'reminder-old');
    expect(written('event_reminders')).toEqual([{ event_id: 'event-1', remind_at: '2026-10-15T16:30:00.000Z' }]);
  });

  it('`replaceEventReminder` reçoit un instant, jamais une chaîne naïve castée par le serveur', async () => {
    await replaceEventReminder('event-1', '2026-10-15T16:30:00.000Z');
    expect(written('event_reminders')).toEqual([{ event_id: 'event-1', remind_at: '2026-10-15T16:30:00.000Z' }]);
  });
});

/**
 * 0138 — l'emoji d'une catégorie est facultatif, mais ce qui part en base est
 * borné comme la contrainte le fera : un champ laissé vide ne doit pas écrire
 * une chaîne vide, qui passerait pour une icône posée et donnerait un chip
 * sans signe. La borne haute est refusée ici, avant l'aller-retour.
 */
describe('createCategory — emoji borné (0138)', () => {
  it('écrit l’emoji fourni, espaces de bord retirés', async () => {
    await createCategory('household-1', 'member-1', 'École', '#3E7CB1', ' 🎒 ');

    expect(written('event_categories')).toEqual([
      {
        household_id: 'household-1',
        name: 'École',
        color: '#3E7CB1',
        icon: '🎒',
        created_by: 'member-1',
      },
    ]);
  });

  it('n’écrit aucune icône quand le champ est vide ou blanc', async () => {
    await createCategory('household-1', 'member-1', 'Divers', '#4CAF50', '   ');

    expect(written('event_categories')[0]?.icon).toBeNull();
  });

  it('refuse plus de 32 signes avant l’aller-retour', async () => {
    await expect(
      createCategory('household-1', 'member-1', 'Trop long', '#4CAF50', '🎒'.repeat(33)),
    ).rejects.toThrow('Emoji de catégorie invalide (32 signes au maximum).');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('compte les signes, pas les unités UTF-16 : 17 emoji tiennent dans la borne', async () => {
    await createCategory('household-1', 'member-1', 'Drapeaux', '#4CAF50', '🎒'.repeat(17));

    expect(written('event_categories')[0]?.icon).toBe('🎒'.repeat(17));
  });
});
