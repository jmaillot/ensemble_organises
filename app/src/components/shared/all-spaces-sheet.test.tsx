import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AllSpacesSheet } from './all-spaces-sheet';

/**
 * La feuille « Tous les espaces » est le « Plus » de la barre basse. Depuis
 * le pass adapt du 23 octobre 2026, elle expose les espaces HORS barre basse
 * (benchmark §2.6 : « “Plus” ouvre une feuille avec les autres espaces ») en
 * tuiles pastel — la barre basse sert déjà Maison, Courses, Agenda et Tâches
 * d'un tap ; les répéter ici re-mettait deux fois la même destination sous
 * le pouce. La visibilité suit les mêmes règles que le tiroir (rôle enfant,
 * menu des applications 0140).
 */
function renderSheet(open = true, onOpenChange = () => {}) {
  return render(
    <MemoryRouter initialEntries={['/accueil']}>
      <AllSpacesSheet open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
}

describe('AllSpacesSheet', () => {
  it('expose les espaces hors barre basse, en tuiles nommées, sans doublon', () => {
    renderSheet();

    const links = screen.getAllByRole('link', { name: /^Ouvrir / });
    // Vingt modules du catalogue (frigo, menu, vague 3.1 ; documents,
    // vague 3.2) MINUS les quatre que la barre basse sert déjà (Maison,
    // Courses, Agenda, Tâches) : 20 − 3 modules + 0 (la maison n'est pas
    // un module du catalogue) = 17.
    expect(links.length).toBe(17);
    for (const absent of ['Ouvrir Maison', 'Ouvrir Courses', 'Ouvrir Tâches']) {
      expect(screen.queryByRole('link', { name: absent })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('dialog', { name: 'Tous les espaces' })).toBeInTheDocument();
  });

  it('referme la feuille après avoir choisi un espace', async () => {
    const onOpenChange = vi.fn();
    renderSheet(true, onOpenChange);

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Ouvrir Notes' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ne rend aucun espace quand elle est fermée', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog', { name: 'Tous les espaces' })).not.toBeInTheDocument();
  });
});
