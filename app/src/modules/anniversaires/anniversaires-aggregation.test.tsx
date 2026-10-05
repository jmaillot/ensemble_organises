import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AnniversairesPage from './anniversaires-page';
import { aggregateBirthdays } from './types';
import type { BirthdayRow, ContactRow } from '@/types';

const list = () => screen.findByRole('list', { name: 'Liste des anniversaires' });

describe('AnniversairesPage agrégée', () => {
  it('fusionne la paire miroir en une seule ligne et badge les homonymes indépendants', async () => {
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    const rows = await list();
    await within(rows).findByText('Maya Martin');

    // Paire miroir (birthday-4 ↔ contact-noe) : une seule ligne.
    expect(await within(rows).findAllByText('Noé Martin')).toHaveLength(1);

    // Homonymes indépendants (Maya des deux côtés, sans lien) : badge deux-sources.
    const maya = (await within(rows).findByText('Maya Martin')).closest('[role="listitem"]');
    expect(maya).toHaveTextContent('2 sources');

    // Fiche contact seule (Léa Moreau) : ligne agrégée, édition côté Contacts.
    const lea = (await within(rows).findByText('Léa Moreau')).closest('[role="listitem"]');
    expect(lea).toHaveTextContent(/via Contacts/);
    expect(
      within(lea as HTMLElement).getByRole('link', { name: /Voir la fiche de Léa Moreau/ }),
    ).toHaveAttribute('href', '/contacts');
  });

  it('propose « créer aussi un contact » coché par défaut à la création', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un anniversaire' })[0]);

    const dialog = await screen.findByRole('dialog');
    const checkbox = within(dialog).getByRole('checkbox', { name: /Créer aussi un contact/ });
    expect(checkbox).toBeChecked();

    await user.type(within(dialog).getByLabelText(/^Nom/), 'Robin Petit');
    await user.type(within(dialog).getByLabelText(/^Date de naissance/), '02/02/2000');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’anniversaire/ }));

    // L'anniversaire rejoint la vue agrégée…
    const rows = await list();
    expect(await within(rows).findByText('Robin Petit')).toBeInTheDocument();

    // …et la case D-10 a créé la fiche contact (garde serveur 0078 : aucun doublon).
    const { default: ContactsPage } = await import('@/modules/contacts/contacts-page');
    const { unmount } = renderWithProviders(<ContactsPage />, { route: '/contacts' });
    const contactRows = await screen.findByRole('list', { name: 'Liste des contacts' });
    expect(await within(contactRows).findByText('Robin Petit')).toBeInTheDocument();
    unmount();
  });
});

describe('aggregateBirthdays', () => {
  const birthday = (overrides: Partial<BirthdayRow> = {}): BirthdayRow => ({
    id: 'b1',
    household_id: 'h1',
    name: 'Maya Martin',
    birth_date: '1992-10-07',
    photo_url: 'birthday.jpg',
    linked_member_id: null,
    contact_id: null,
    ...overrides,
  });
  const contact = (overrides: Partial<ContactRow> = {}): ContactRow => ({
    id: 'c1',
    list_id: 'l1',
    household_id: 'h1',
    name: 'Maya Martin',
    birth_date: '1992-10-07',
    photo_url: 'contact.jpg',
    linked_member_id: null,
    ...overrides,
  });

  it('priorise la photo du contact, avec repli sur la photo birthday', () => {
    const [merged] = aggregateBirthdays([birthday()], [contact()], []);
    expect(merged.twoSources).toBe(true);
    expect(merged.displayPhotoUrl).toBe('contact.jpg');

    const [fallback] = aggregateBirthdays([birthday()], [contact({ photo_url: null })], []);
    expect(fallback.displayPhotoUrl).toBe('birthday.jpg');
  });

  it('ne fusionne jamais deux foyers par la clé homonyme', () => {
    // Deux lignes du même foyer et de même clé : une seule ligne badgée…
    const same = aggregateBirthdays([birthday()], [contact()], []);
    expect(same).toHaveLength(1);
    // …et un contact sans date ne rejoint jamais l'agrégation.
    const noDate = aggregateBirthdays([birthday()], [contact({ birth_date: null })], []);
    expect(noDate).toHaveLength(1);
    expect(noDate[0].twoSources).toBe(false);
  });
});
