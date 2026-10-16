import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
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
    const onSubmit = vi.fn<(input: PlaceInput) => Promise<void>>(async () => {});
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
    const onSubmit = vi.fn<(input: PlaceInput) => Promise<void>>(async () => {});
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
    const onSubmit = vi.fn<(input: PlaceInput) => Promise<void>>(async () => {});
    renderDialog(null, onSubmit);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByAltText('Aperçu de la photo du lieu')).toBeNull();

    await user.type(within(dialog).getByLabelText(/nom du lieu/i), 'Boulangerie du Coin');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer le lieu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ photoUrl: null, photoFile: null });
  });
});

/**
 * D-14 : un dialogue qui se rouvre repart de sa cible. Le `key` de la page
 * (`adresses-page.tsx:233`) ne change pas quand la même cible est rouverte,
 * donc l'instance survit à la fermeture et l'état local reviendrait sans un
 * effet qui lit `open` **et** la cible.
 *
 * Le harnais ne porte qu'un bouton « Rouvrir » : tant que le dialogue modal est
 * ouvert, Radix rend le reste du document `aria-hidden` et sans pointer-events,
 * donc on referme par le geste réel du dialogue (« Annuler »), et on ne rouvre
 * qu'une fois le dialogue fermé.
 */
function ReopenHarness({ target, onSubmit }: { target: Place | null; onSubmit: (input: PlaceInput) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Rouvrir
      </button>
      <PlaceFormDialog open={open} onOpenChange={setOpen} place={target} isSaving={false} onSubmit={onSubmit} />
    </>
  );
}

describe('PlaceFormDialog — un dialogue qui se rouvre repart de sa cible (D-14)', () => {
  it('aucun aperçu ni fichier abandonné ne survit à la réouverture de la même cible', async () => {
    // jsdom n'implémente pas `URL.createObjectURL` : sans ce stub, `onPickPhoto`
    // retombe sur `null` et le test prouverait le repli, pas la remise à zéro.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:apercu-abandonne' });
    try {
      const user = userEvent.setup();
      const onSubmit = vi.fn<(input: PlaceInput) => Promise<void>>(async () => {});
      renderWithProviders(<ReopenHarness target={null} onSubmit={onSubmit} />);

      const dialog = screen.getByRole('dialog');
      await user.upload(
        within(dialog).getByLabelText('Photo du lieu'),
        new File(['img'], 'photo.png', { type: 'image/png' }),
      );
      // L'aperçu local est rendu : la photo est bien « abandonnée » dans l'état.
      expect(within(dialog).getByAltText('Aperçu de la photo du lieu')).toHaveAttribute('src', 'blob:apercu-abandonne');

      await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Rouvrir' }));
      const reopened = await screen.findByRole('dialog');
      // La cible est un lieu neuf : aucun aperçu abandonné ne doit resurgir.
      expect(within(reopened).queryByAltText('Aperçu de la photo du lieu')).toBeNull();
      expect((within(reopened).getByLabelText('Photo du lieu') as HTMLInputElement).files).toHaveLength(0);

      await user.type(within(reopened).getByLabelText(/nom du lieu/i), 'Boulangerie du Coin');
      await user.click(within(reopened).getByRole('button', { name: /enregistrer le lieu/i }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      // Le fichier abandonné n'est pas resoumis.
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ photoFile: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('la cible fait foi : rouvrir le lieu existant rend l’aperçu de sa photo', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PlaceInput) => Promise<void>>(async () => {});
    renderWithProviders(<ReopenHarness target={place} onSubmit={onSubmit} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('Aperçu de la photo du lieu')).toHaveAttribute('src', signedUrl);

    // On retire la photo, puis on rouvre la MÊME cible : l'effet repart de la
    // cible, donc l'aperçu de sa photo revient — ce n'est pas « vide » qui fait
    // foi, c'est la cible.
    await user.click(within(dialog).getByRole('button', { name: 'Retirer la photo' }));
    expect(within(dialog).queryByAltText('Aperçu de la photo du lieu')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Rouvrir' }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByAltText('Aperçu de la photo du lieu')).toHaveAttribute('src', signedUrl);
  });
});
