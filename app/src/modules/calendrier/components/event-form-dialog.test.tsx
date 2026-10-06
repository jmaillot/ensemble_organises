import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { EventFormDialog, buildEventSchema } from './event-form-dialog';

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

const validValues = {
  title: 'Balade au lac',
  date: '2026-10-07',
  startTime: '19:30',
  endTime: '',
  allDay: false,
  location: '',
  description: '',
  memberId: '',
  categoryId: '',
  calendarId: '',
  remindAt: '',
};

describe('EventFormDialog — choix calendrier explicite (D-03)', () => {
  it('rend le Select calendrier même avec un seul calendrier, Commun présélectionné, sans valeur vide soumise', async () => {
    const communId = await data
      .create<{ id: string }>('event_calendars', {
        household_id: DEMO_HOUSEHOLD_ID,
        name: 'Commun',
        visibility: 'commun',
        owner_member_id: null,
      } as never)
      .then((row) => row.id);

    const onSubmit = vi.fn();
    renderWithProviders(
      <EventFormDialog
        open
        onOpenChange={() => {}}
        event={null}
        defaultDate="2026-10-07"
        onSubmit={onSubmit}
      />,
      { route: '/calendrier' },
    );

    const dialog = await screen.findByRole('dialog');
    const select = (await within(dialog).findByLabelText(/^Calendrier/)) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(communId));
    expect(within(select).getByRole('option', { name: 'Commun du foyer' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText(/^Titre/), 'Balade au lac');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’événement/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ calendarId: communId });
  });

  it('refuse un calendarId vide quand plusieurs calendriers existent (validation Zod, pas de repli silencieux)', () => {
    const schema = buildEventSchema(2);
    const result = schema.safeParse(validValues);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'calendarId')).toBe(true);
    }
    expect(buildEventSchema(2).safeParse({ ...validValues, calendarId: 'cal-perso' }).success).toBe(true);
    expect(buildEventSchema(1).safeParse(validValues).success).toBe(true);
  });

  it('affiche le Perso du membre courant comme option explicite quand il existe', async () => {
    await data.create('event_calendars', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Commun',
      visibility: 'commun',
      owner_member_id: null,
    } as never);
    await data.create('event_calendars', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Perso',
      visibility: 'perso',
      owner_member_id: DEMO_MEMBERS.camille,
    } as never);

    renderWithProviders(
      <EventFormDialog
        open
        onOpenChange={() => {}}
        event={null}
        defaultDate="2026-10-07"
        onSubmit={vi.fn()}
      />,
      { route: '/calendrier' },
    );

    const dialog = await screen.findByRole('dialog');
    const select = await within(dialog).findByLabelText(/^Calendrier/);
    expect(within(select).getByRole('option', { name: 'Perso (perso)' })).toBeInTheDocument();
  });
});
