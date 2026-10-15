import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { PlaceFormDialog } from './place-form-dialog';
import type { Place, PlaceInput } from '../types';

/**
 * WR-05 : ce test vit dans un fichier neuf parce que le comportement fautif
 * (l'URL signée réécrite dans `places.photo_url`, et l'objet du bucket détruit)
 * n'existe qu'en mode Supabase — que la CI ne peut pas monter. Ce qui est
 * prouvable partout, et qui suffit à empêcher la perte : le formulaire
 * **transporte la valeur stockée** (le chemin), jamais l'URL signée qu'il se
 * contente d'afficher. C'est cette valeur-là que `editPlace` compare.
 */

const signedUrl = 'https://signe.example/foyer-1/places/photo.webp';
const storedPath = 'foyer-1/places/photo.webp';

const place: Place = {
  id: 'place-1',
  type: 'cafe',
  typeLabel: 'Café',
  photoUrl: signedUrl,
  photoStored: storedPath,
  name: 'Le Café du Matin',
  street: '12 rue des Tilleuls',
  postalCode: '69006',
  city: 'Lyon',
  phone: null,
  rating: 4,
  visited: false,
  note: null,
  createdAt: '2026-10-02',
  addressLine: '12 rue des Tilleuls, 69006 Lyon',
};

function renderDialog(target: Place | null, onSubmit: (input: PlaceInput) => Promise<void>) {
  return renderWithProviders(
    <PlaceFormDialog open onOpenChange={vi.fn()} place={target} isSaving={false} onSubmit={onSubmit} />,
  );
}

describe('PlaceFormDialog — la valeur transportée est la valeur stockée (WR-05)', () => {
  it('photo non touchée : affiche l’URL résolue, soumet le chemin stocké', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    renderDialog(place, onSubmit);
    const dialog = screen.getByRole('dialog');

    // L'affichage reste la valeur résolue (D-06).
    expect(within(dialog).getByAltText('Aperçu de la photo du lieu')).toHaveAttribute('src', signedUrl);

    await user.click(within(dialog).getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ photoUrl: storedPath, photoFile: null });
  });

  it('« Retirer la photo » : soumet `null`, le signal de retrait attendu par editPlace', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    renderDialog(place, onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Retirer la photo' }));
    expect(within(dialog).queryByAltText('Aperçu de la photo du lieu')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ photoUrl: null, photoFile: null });
  });

  it('lieu neuf sans photo : soumet `null` et affiche l’icône du type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    renderDialog(null, onSubmit);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByAltText('Aperçu de la photo du lieu')).toBeNull();

    await user.type(within(dialog).getByLabelText(/nom du lieu/i), 'Boulangerie du Coin');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer le lieu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ photoUrl: null, photoFile: null });
  });
});
