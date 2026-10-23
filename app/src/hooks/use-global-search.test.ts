import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowFilter } from '@/types';
import type { ModuleKey } from '@/lib/modules';
import type { SearchRecord } from '@/lib/global-search';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { loadSearchRecords } from './use-global-search';

/**
 * Ce que la palette sait chercher.
 *
 * Les six espaces ajoutés aux onze premiers ne sont pas des cas d'égalité :
 * chacun a une règle de visibilité que la palette doit REPRENDRE, sinon elle
 * montrerait ce que l'écran du module cache. Les deux règles qui ont un prix
 * sont ici : le masque de surprise des idées cadeaux, et le périmètre des
 * messages (les seuls fils dont on est membre).
 *
 * La lecture réelle est conservée : seule la table choisie échoue, pour
 * prouver qu'un module en échec ne vide pas les seize autres.
 */
const { mockList, failing } = vi.hoisted(() => ({
  mockList: vi.fn(),
  failing: new Set<string>(),
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  mockList.mockImplementation(async (table: string, filter?: RowFilter) => {
    if (failing.has(table)) throw new Error(`lecture impossible : ${table}`);
    return actual.data.list(table, filter);
  });
  // `Object.create` et non `{ ...actual.data }` : l'adaptateur est une
  // instance de classe, et étaler ses champs perdrait ses méthodes.
  return { ...actual, data: Object.create(actual.data, { list: { value: mockList } }) };
});

const recordsOf = (records: SearchRecord[], module: ModuleKey) => records.filter((row) => row.module === module);

const load = (currentMemberId: string | null = DEMO_MEMBERS.camille, isChild = false) =>
  loadSearchRecords(DEMO_HOUSEHOLD_ID, isChild, currentMemberId);

beforeEach(() => {
  failing.clear();
  mockList.mockClear();
});

describe('loadSearchRecords — les espaces ajoutés', () => {
  it('trouve une routine et dit sa fréquence en français', async () => {
    const { records } = await load();
    const routine = recordsOf(records, 'routines').find((row) => row.label === 'Sortie canine');
    expect(routine).toBeDefined();
    // La RRULE est traduite par le module des routines, pas recalée ici.
    expect(routine?.hint).toContain('Tous les jours');
  });

  it('trouve un anniversaire et dit sa date de naissance', async () => {
    const { records } = await load();
    const birthday = recordsOf(records, 'anniversaires').find((row) => row.label === 'Maya Martin');
    expect(birthday).toBeDefined();
    expect(birthday?.hint).toContain('1992');
  });

  it('trouve une dépense et dit son montant', async () => {
    const { records } = await load();
    const expense = recordsOf(records, 'ardoise').find((row) => row.label === 'Courses du samedi');
    expect(expense).toBeDefined();
    expect(expense?.hint).toContain('84,50');
  });

  it('trouve une idée cadeau et son prix', async () => {
    const { records } = await load(DEMO_MEMBERS.thomas);
    const idea = recordsOf(records, 'cadeaux').find((row) => row.label === 'Montre connectée');
    expect(idea).toBeDefined();
    expect(idea?.hint).toContain('199');
  });

  it('trouve une publication du Cercle et la coupe pour l’affichage', async () => {
    const { records } = await load();
    const post = recordsOf(records, 'cercle').find((row) => row.label.startsWith('Le soleil'));
    expect(post).toBeDefined();
    // Le texte entier reste cherchable, la ligne affichée est coupée.
    expect(post?.extra).toContain('balade au bord du lac');
  });

  it('trouve un message', async () => {
    const { records } = await load();
    const message = recordsOf(records, 'messages').find((row) => row.label.includes('parc'));
    expect(message).toBeDefined();
  });
});

describe('loadSearchRecords — ce que la palette ne doit pas montrer', () => {
  it('ne montre pas l’idée offerte au membre courant', async () => {
    // L'idée « Montre connectée » est destinée à Camille (contact lié à
    // Camille) : Camille ne la voit pas, Thomas la voit.
    const pourCamille = await load(DEMO_MEMBERS.camille);
    expect(recordsOf(pourCamille.records, 'cadeaux').map((row) => row.label)).not.toContain('Montre connectée');

    const pourThomas = await load(DEMO_MEMBERS.thomas);
    expect(recordsOf(pourThomas.records, 'cadeaux').map((row) => row.label)).toContain('Montre connectée');
  });

  it('ne montre pas les messages d’un fil où l’on n’est pas', async () => {
    // Maya n’appartient à aucun fil de démonstration : elle ne voit aucun
    // message, là où la RLS le ferait en ligne.
    const { records } = await load(DEMO_MEMBERS.maya);
    expect(recordsOf(records, 'messages')).toEqual([]);
  });

  it('ne lit pas les espaces hors périmètre du rôle enfant', async () => {
    const { records } = await load(DEMO_MEMBERS.noe, true);
    expect(recordsOf(records, 'ardoise')).toEqual([]);
    expect(recordsOf(records, 'cadeaux')).toEqual([]);
    // Les espaces autorisés restent lus : le rôle enfant n'est pas un rôle vide.
    expect(recordsOf(records, 'routines').length).toBeGreaterThan(0);
  });
});

describe('loadSearchRecords — une lecture en échec', () => {
  it('garde les autres modules et dit le module fautif', async () => {
    failing.add('pets');
    const { records, failedModules } = await load();
    expect(failedModules).toContain('animaux');
    expect(recordsOf(records, 'animaux')).toEqual([]);
    // Un module en échec ne vide pas les seize autres.
    expect(recordsOf(records, 'routines').length).toBeGreaterThan(0);
    expect(recordsOf(records, 'taches').length).toBeGreaterThan(0);
  });
});
