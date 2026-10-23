import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AllSpacesSheet } from './all-spaces-sheet';

/**
 * La feuille « Tous les espaces » est le pendant du tiroir : mêmes entrées
 * visibles (rôle enfant + menu des applications 0140), geste différent — le
 * « Plus » de la barre basse l'ouvre, le hamburger reste réservé aux
 * réglages. L'invariant de couverture (chaque espace + la maison) est posé
 * ici comme il l'est sur le tiroir.
 */
function renderSheet(open = true, onOpenChange = () => {}) {
  return render(
    <MemoryRouter initialEntries={['/accueil']}>
      <AllSpacesSheet open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
}

describe('AllSpacesSheet', () => {
  it('expose chaque espace du catalogue plus la maison, en liens nommés', () => {
    renderSheet();

    const links = screen.getAllByRole('link', { name: /^Ouvrir / });
    // Maison + dix-neuf modules du catalogue (frigo et menu, vague 3.1) :
    // la feuille ne doit jamais en lister moins que le tiroir.
    expect(links.length).toBe(20);
    expect(screen.getByRole('dialog', { name: 'Tous les espaces' })).toBeInTheDocument();
  });

  it('referme la feuille après avoir choisi un espace', async () => {
    const onOpenChange = vi.fn();
    renderSheet(true, onOpenChange);

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Ouvrir Courses' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ne rend aucun espace quand elle est fermée', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog', { name: 'Tous les espaces' })).not.toBeInTheDocument();
  });
});
