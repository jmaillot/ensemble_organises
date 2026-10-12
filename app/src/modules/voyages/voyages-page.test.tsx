import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import VoyagesPage from './voyages-page';
import { isServableCoverUrl } from './voyages-page';
import {
  deleteTripCover,
  isTripCoverPath,
  resolveTripCoverUrl,
  tripCoverPathOf,
} from './api';
import type { TripRow } from '@/types';

const { storageMocks, supabaseState } = vi.hoisted(() => {
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  const storageMocks = {
    createSignedUrl: vi.fn(async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const supabaseState = { configured: false };
  return { storageMocks, supabaseState };
});

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'blob:apercu-defaut',
      path: null,
      name: file.name,
      mime: 'image/jpeg',
      size: 18,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/client')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return supabaseState.configured;
    },
    get supabase() {
      return supabaseState.configured
        ? { storage: { from: (_bucket: string) => ({ createSignedUrl: storageMocks.createSignedUrl, remove: storageMocks.remove }) } }
        : null;
    },
  };
});

import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';

const depositMock = vi.mocked(depositHouseholdFile);
const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
});

function imageFile(name = 'couverture.jpg'): File {
  return new File(['pixels'], name, { type: 'image/jpeg' });
}

async function listTrips(): Promise<TripRow[]> {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return getLocalAdapter().list<TripRow>('trips');
}

describe('Voyages', () => {
  it('met en avant le voyage de démonstration avec sa destination et ses dates', async () => {
    renderWithProviders(<VoyagesPage />);

    // Le héros affiche la destination puis la période, comme dans l’export.
    const hero = await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    expect(hero).toBeInTheDocument();
    expect(screen.getByText(/Prochain voyage · Confirmé/)).toBeInTheDocument();
    // La période apparaît dans le héros puis dans l’indicateur « jours sur place ».
    expect(screen.getAllByText(/12 — 18 avril 2027/)).toHaveLength(2);
    // Les indicateurs : jours sur place, tâches et membres nommés à l'échelle du foyer.
    expect(screen.getByText('jours sur place').previousSibling).toHaveTextContent('6');
    expect(screen.getByText('tâches du foyer à préparer').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('membres du foyer').previousSibling).toHaveTextContent('5');
  });

  it('crée un voyage depuis le dialogue et le fait apparaître', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour à Copenhague');
    await user.type(screen.getByLabelText(/Destination/), 'Copenhague');
    await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
    await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

    // Le dialogue se ferme et le nouveau voyage rejoint la liste des autres voyages.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Copenhague')).toBeInTheDocument();
    expect(screen.getByText('10 — 16 septembre 2027')).toBeInTheDocument();
    // Le héros reste sur le voyage à venir le plus proche.
    expect(screen.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeInTheDocument();
  });

  it('masque les suppressions aux non-administrateurs, sans les remplacer par une erreur', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    renderWithProviders(<VoyagesPage />, { withHousehold: false });

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    // Aucun affordance de suppression : ni sur le héros, ni ailleurs.
    expect(screen.queryByRole('button', { name: 'Supprimer ce voyage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer le voyage/ })).not.toBeInTheDocument();
    // La modification reste offerte : seul le delete est admin-only.
    expect(screen.getByRole('button', { name: 'Modifier ce voyage' })).toBeInTheDocument();
  });

  it('ne propose plus de statut et exige les dates comme la base', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    // Le sélecteur mort a disparu du formulaire…
    expect(within(dialog).queryByLabelText(/Statut/)).not.toBeInTheDocument();

    // …et un envoi sans dates est refuse, comme le NOT NULL de `trips`.
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));
    expect(await within(dialog).findByText('Indiquez la date de départ.')).toBeInTheDocument();
    expect(within(dialog).getByText('Indiquez la date de retour.')).toBeInTheDocument();
    expect(screen.queryByText('Copenhague')).not.toBeInTheDocument();
  });

  it('ne rend aucune image de héros quand la couverture est invalide', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    await getLocalAdapter().update('trips', 'trip-1', { cover_photo: 'ftp://exemple.fr/x.jpg' } as never);
    renderWithProviders(<VoyagesPage />);

    const hero = await screen.findByRole('region', { name: 'Voyage vers Lisbonne' });
    // Échec fermé : pas d'image, jamais d'erreur — le titre reste lisible.
    expect((hero as HTMLElement).style.backgroundImage).toBe('');
    expect(screen.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeInTheDocument();
  });

  it('laisse passer les couvertures http(s) et premier parti', () => {
    expect(isServableCoverUrl('https://exemple.fr/lisbonne.jpg')).toBe(true);
    expect(isServableCoverUrl('/assets/lisbonne.jpg')).toBe(true);
    // D-11 : les aperçus locaux des couvertures téléversées rendent en démo.
    expect(isServableCoverUrl('blob:apercu-demo')).toBe(true);
    expect(isServableCoverUrl('ftp://exemple.fr/x.jpg')).toBe(false);
    expect(isServableCoverUrl('javascript:alert(1)')).toBe(false);
    expect(isServableCoverUrl('')).toBe(false);
    expect(isServableCoverUrl(null)).toBe(false);
  });

  it('téléverse une couverture au bucket et affiche le héros (D-11)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour fichier à Bergen');
    await user.type(screen.getByLabelText(/Destination/), 'Bergen');
    await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
    await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
    await user.upload(screen.getByLabelText(/Téléverser une photo/), imageFile());
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

    // Le dépôt précède l'écriture, sous le préfixe du voyage.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(depositMock).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: DEMO_HOUSEHOLD_ID, folder: expect.stringMatching(/^trips\//) }),
    );
    // La ligne porte l'aperçu démo, et sa sélection l'affiche en héros.
    const stored = (await listTrips()).find((row) => row.name === 'Séjour fichier à Bergen');
    expect(stored?.cover_photo).toBe('blob:apercu-defaut');
    await user.click(screen.getByRole('button', { name: 'Bergen10 — 16 septembre 2027' }));
    const hero = await screen.findByRole('region', { name: 'Voyage vers Bergen' });
    expect((hero as HTMLElement).style.backgroundImage).toContain('blob:apercu-defaut');
  });

  it('garde le champ URL intact : sans fichier, aucun dépôt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour URL à Porto');
    await user.type(screen.getByLabelText(/Destination/), 'Porto');
    await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
    await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
    const coverField = screen.getByLabelText(/Photo de couverture/) as HTMLInputElement;
    await user.clear(coverField);
    await user.type(coverField, 'https://exemple.fr/porto.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(depositMock).not.toHaveBeenCalled();
    const stored = (await listTrips()).find((row) => row.name === 'Séjour URL à Porto');
    expect(stored?.cover_photo).toBe('https://exemple.fr/porto.jpg');
  });

  it('échec du dépôt : erreur dite, aucune ligne, rien à nettoyer', async () => {
    depositMock.mockRejectedValueOnce(new Error('Dépôt impossible.'));
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour refusé à Oslo');
    await user.type(screen.getByLabelText(/Destination/), 'Oslo');
    await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
    await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
    await user.upload(screen.getByLabelText(/Téléverser une photo/), imageFile());
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

    // Copie d'erreur standard, dialogue conservé, aucune ligne partielle…
    expect(await screen.findByText('Le voyage n’a pas pu être enregistré.')).toBeInTheDocument();
    // …et rien n'a été déposé, donc aucun nettoyage à prouver.
    expect(removeFileMock).not.toHaveBeenCalled();
    expect((await listTrips()).some((row) => row.name === 'Séjour refusé à Oslo')).toBe(false);
  });

  it('échec après dépôt : erreur dite, aucune ligne, fichier nettoyé (pas d’orphelin)', async () => {
    depositMock.mockResolvedValueOnce({
      url: 'https://signe.example/depot-initial',
      path: 'foyer/trips/voyage-x/couverture.webp',
      name: 'couverture.jpg',
      mime: 'image/webp',
      size: 21,
    });
    const { data } = await import('@/lib/data');
    const createSpy = vi.spyOn(data, 'create').mockRejectedValueOnce(new Error('RLS refuse'));
    try {
      const user = userEvent.setup();
      renderWithProviders(<VoyagesPage />);

      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

      const dialog = await screen.findByRole('dialog');
      await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour orphelin à Tromso');
      await user.type(screen.getByLabelText(/Destination/), 'Tromso');
      await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
      await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
      await user.upload(screen.getByLabelText(/Téléverser une photo/), imageFile());
      await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

      // Dépôt puis écriture : l'écriture refuse…
      expect(await screen.findByText('Le voyage n’a pas pu être enregistré.')).toBeInTheDocument();
      // …la ligne optimiste est retirée…
      expect((await listTrips()).some((row) => row.name === 'Séjour orphelin à Tromso')).toBe(false);
      // …et l'objet tout juste déposé est nettoyé.
      expect(removeFileMock).toHaveBeenCalledWith('foyer/trips/voyage-x/couverture.webp');
    } finally {
      createSpy.mockRestore();
    }
  });

  it('couvertures : chemins forgés en URL courte, échec fermé, autres formes intactes', async () => {
    supabaseState.configured = true;

    expect(await resolveTripCoverUrl('foyer/trips/voyage-x/couverture.webp')).toBe(
      'https://signe.example/foyer/trips/voyage-x/couverture.webp',
    );
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer/trips/voyage-x/couverture.webp', 60 * 60);

    storageMocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'expiré' } });
    expect(await resolveTripCoverUrl('foyer/trips/voyage-x/couverture.webp')).toBeNull();

    supabaseState.configured = false;
    expect(await resolveTripCoverUrl('foyer/trips/voyage-x/couverture.webp')).toBeNull();

    expect(await resolveTripCoverUrl(null)).toBeNull();
    expect(await resolveTripCoverUrl('/assets/lisbonne.jpg')).toBe('/assets/lisbonne.jpg');
    expect(await resolveTripCoverUrl('blob:apercu-demo')).toBe('blob:apercu-demo');
    expect(await resolveTripCoverUrl('https://exemple.fr/porto.jpg')).toBe('https://exemple.fr/porto.jpg');
    expect(isTripCoverPath('/assets/lisbonne.jpg')).toBe(false);
    expect(isTripCoverPath('blob:apercu-demo')).toBe(false);
    expect(isTripCoverPath('https://exemple.fr/porto.jpg')).toBe(false);
    expect(isTripCoverPath('foyer/trips/voyage-x/couverture.webp')).toBe(true);
    expect(tripCoverPathOf('foyer/trips/voyage-x/couverture.webp')).toBe('foyer/trips/voyage-x/couverture.webp');
    expect(tripCoverPathOf('blob:apercu-demo')).toBeNull();
    expect(tripCoverPathOf(null)).toBeNull();
  });

  it('suppression de couverture : seul un chemin déclenche un nettoyage bucket', async () => {
    await deleteTripCover('foyer/trips/voyage-x/couverture.webp');
    expect(removeFileMock).toHaveBeenCalledTimes(1);

    await deleteTripCover('https://exemple.fr/porto.jpg');
    await deleteTripCover('/assets/lisbonne.jpg');
    await deleteTripCover('blob:apercu-demo');
    await deleteTripCover(null);
    expect(removeFileMock).toHaveBeenCalledTimes(1);
  });
});
