import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { demoUser } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import {
  clearPendingInviteToken,
  getArdoiseLanding,
  getPendingInviteToken,
  setArdoiseLanding,
  setPendingInviteToken,
} from '@/lib/invites';

/**
 * 31-03 (OUV-04, D-18/D-19/D-20) — `join-household-page` est le **pré-écran
 * d'invitation** : la page consulte le foyer via l'Edge preview (31-02),
 * nomme l'inviteur et le foyer (D-20), et propose UNE action selon la session
 * (D-19) — « Continuer vers l'inscription » pour l'étranger (token copié en
 * sessionStorage au départ, D-06), « Rejoindre le foyer » pour la personne
 * déjà connectée. Jamais de redeem au simple chargement (D-08) : un aperçu de
 * lien ne consomme pas un token à usage compté.
 *
 * La surface publique ne nuance jamais les motifs d'échec (D-03) : token mort
 * et erreur réseau portent le MÊME message uniforme.
 */
const { previewHouseholdInviteMock, redeemInviteTokenMock, joinHouseholdLocalMock, loadHouseholdMock, supabaseClient } =
  vi.hoisted(() => ({
    previewHouseholdInviteMock: vi.fn(),
    redeemInviteTokenMock: vi.fn(),
    joinHouseholdLocalMock: vi.fn(),
    loadHouseholdMock: vi.fn(),
    // Drapeau mutable : `vi.mock` est hissé et son résultat est mis en cache,
    // donc les cas (démo / configuration complète) basculent le drapeau.
    supabaseClient: { configured: false },
  }));

vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return {
    ...actual,
    previewHouseholdInvite: previewHouseholdInviteMock,
    redeemInviteToken: redeemInviteTokenMock,
  };
});

vi.mock('@/stores/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/session-store')>();
  return { ...actual, joinHouseholdLocal: joinHouseholdLocalMock, loadHousehold: loadHouseholdMock };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: null,
  // Accesseur, et non valeur : la page lit l'export au montage, donc le cas
  // peut le faire basculer avant le rendu.
  get isSupabaseConfigured() {
    return supabaseClient.configured;
  },
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

import JoinHouseholdPage from './join-household-page';

// 25 caractères, distinct de tout identifiant de la graine.
const TOKEN = 'jeton-invitation-31-03-abcdefgh';

/** Sonde de localisation : le MemoryRouter de `renderWithProviders` ne
    partage pas `window.location` avec l'historique du navigateur. */
function LocationProbe() {
  const location = useLocation();
  return (
    <span
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-state={JSON.stringify(location.state ?? null)}
    />
  );
}

function renderPage(route: string) {
  return renderWithProviders(
    <>
      <LocationProbe />
      <JoinHouseholdPage />
    </>,
    { route, withHousehold: false },
  );
}

const probe = () => document.querySelector('[data-testid="location-probe"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  supabaseClient.configured = true;
  window.sessionStorage.clear();
  previewHouseholdInviteMock.mockResolvedValue({ householdName: 'Foyer Martin', inviterFirstName: 'Marie' });
  redeemInviteTokenMock.mockResolvedValue('household-rejoint');
  joinHouseholdLocalMock.mockResolvedValue({ id: 'household-demo' });
  loadHouseholdMock.mockResolvedValue(undefined);
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe('Pré-écran — titre selon la réponse preview (D-20)', () => {
  it('nomme l’inviteur et le foyer : « Marie t’invite à rejoindre Foyer Martin »', async () => {
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Marie t’invite à rejoindre Foyer Martin' }),
    ).toBeInTheDocument();
    // Aucun redeem au chargement : la consultation ne consomme rien (D-08).
    expect(redeemInviteTokenMock).not.toHaveBeenCalled();
    expect(previewHouseholdInviteMock).toHaveBeenCalledWith(TOKEN);
  });

  it('sans inviteur connu : « Vous avez été invité à rejoindre Foyer Martin »', async () => {
    previewHouseholdInviteMock.mockResolvedValue({ householdName: 'Foyer Martin' });
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vous avez été invité à rejoindre Foyer Martin' }),
    ).toBeInTheDocument();
  });
});

describe('Pré-écran — chargement et échec (D-03)', () => {
  it('pendant la preview : skeleton sur la ligne du foyer et CTA désactivé', async () => {
    previewHouseholdInviteMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    // Le skeleton est le seul titre affiché tant que la réponse n'est pas là.
    expect(container.querySelector('[aria-hidden="true"].animate-pulse')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Continuer vers l’inscription' })).toBeDisabled();
  });

  it('token mort : le message uniforme public, sans distinction de motif', async () => {
    previewHouseholdInviteMock.mockRejectedValue(new Error('Ce lien d’invitation n’est plus valable.'));
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    expect(
      await screen.findByText(
        'Ce lien d’invitation n’est plus valable. Demandez un nouveau lien à l’administrateur de votre foyer.',
      ),
    ).toBeInTheDocument();
    // Aucun CTA d'action tant que le lien est mort : la surface publique ne
    // propose de continuer que pour un lien vivant.
    expect(screen.queryByRole('button', { name: 'Continuer vers l’inscription' })).not.toBeInTheDocument();
  });

  it('échec réseau : le MÊME message uniforme (l’UI ne nuance jamais)', async () => {
    previewHouseholdInviteMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    expect(
      await screen.findByText(
        'Ce lien d’invitation n’est plus valable. Demandez un nouveau lien à l’administrateur de votre foyer.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Pré-écran — traversée du token par sessionStorage (D-06/D-07)', () => {
  it('l’étranger qui continue vers l’inscription pose le token AVANT de naviguer, en mode inscription', async () => {
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Continuer vers l’inscription' }));

    // D-06 : le token est en sessionStorage AVANT de quitter le pré-écran.
    expect(getPendingInviteToken()).toBe(TOKEN);
    await waitFor(() => expect(probe().dataset.pathname).toBe('/connexion'));
    // Le CTA mène au MODE inscription de sign-in, avec la route d'origine
    // préservée dans `from` (retour au pré-écran après une session immédiate).
    const state = JSON.parse(probe().dataset.state ?? 'null') as { mode?: string; from?: string };
    expect(state.mode).toBe('inscription');
    expect(state.from).toBe(`/foyer/rejoindre?token=${TOKEN}`);
  });

  it('au retour sans token dans l’URL, le pré-écran réadopte le token en attente', async () => {
    // D-07 : le mail de confirmation ramène génériquement — le token attend
    // en sessionStorage est la seule mémoire du parcours.
    setPendingInviteToken(TOKEN);
    renderPage('/foyer/rejoindre');

    expect(previewHouseholdInviteMock).toHaveBeenCalledWith(TOKEN);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Marie t’invite à rejoindre Foyer Martin' }),
    ).toBeInTheDocument();
  });

  it('après application (redeem réussi), le token est nettoyé de sessionStorage', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));

    await waitFor(() => expect(loadHouseholdMock).toHaveBeenCalled());
    expect(redeemInviteTokenMock).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => expect(getPendingInviteToken()).toBeNull());
    await waitFor(() => expect(probe().dataset.pathname).toBe('/accueil'));
  });

  it('après abandon (token mort au retour), le token en attente est nettoyé', async () => {
    setPendingInviteToken(TOKEN);
    previewHouseholdInviteMock.mockRejectedValue(new Error('mort'));
    renderPage('/foyer/rejoindre');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(getPendingInviteToken()).toBeNull());
  });
});

describe('Pré-écran — une action selon la session (D-19)', () => {
  it('connecté : le CTA « Rejoindre le foyer » déclenche le redeem (consentement explicite, D-08)', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    // Jamais de redeem au chargement : seul le clic applique le token.
    expect(redeemInviteTokenMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    await waitFor(() => expect(redeemInviteTokenMock).toHaveBeenCalledWith(TOKEN));
  });

  it('la session de démonstration (backend absent) reste fonctionnelle sans Edge preview', async () => {
    supabaseClient.configured = false;
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    // Pas d'Edge à interroger : le pré-écran s'affiche sans nom de foyer, et
    // le redeem LOCAL reste possible (le mode démo ne régresse pas).
    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    await waitFor(() => expect(joinHouseholdLocalMock).toHaveBeenCalled());
    expect(previewHouseholdInviteMock).not.toHaveBeenCalled();
  });
});

describe('Pré-écran — vocabulaire (UI-SPEC copywriting)', () => {
  it('aucun vocabulaire technique à l’écran', async () => {
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);
    await screen.findByRole('heading', { level: 1 });
    const bodyText = document.body.textContent ?? '';
    for (const mot of ['token', 'Token', 'Edge', 'HMAC', 'base64url']) {
      expect(bodyText).not.toContain(mot);
    }
  });
});

describe('Redeem authentifié — messages D-17 et atterrissage D-09', () => {
  const casRedeem = [
    ['inconnu', 'Ce token est introuvable.', 'Ce lien est invalide.'],
    ['révoqué', 'Ce token a été révoqué.', 'Ce lien est invalide.'],
    ['expiré', 'Ce token est expiré.', 'Ce lien a expiré. Demandez-en un nouveau à l’administrateur.'],
    [
      'épuisé',
      'Ce token a atteint son nombre d’utilisations maximal.',
      'Ce lien a atteint sa limite d’utilisations. Demandez-en un nouveau à l’administrateur.',
    ],
  ] as const;

  it.each(casRedeem)('serveur %s → verbatim « %s »', async (_motif, messageServeur, verbatim) => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    redeemInviteTokenMock.mockRejectedValue(new Error(messageServeur));
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(verbatim);
    // Aucun verbatim technique ne fuit : le motif serveur reste hors écran.
    expect(document.body.textContent).not.toContain('token');
  });

  it('après l’échec, atterrissage sur le choix créer/rejoindre (D-09, jamais bloqué)', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    redeemInviteTokenMock.mockRejectedValue(new Error('Ce token est expiré.'));
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien a expiré.');
    // Le message reste lisible un instant, puis l'état normal de l'utilisateur
    // reprend la main (choix créer/rejoindre d'un utilisateur sans foyer).
    await waitFor(() => expect(probe().dataset.pathname).toBe('/foyer'), { timeout: 6000 });
    // La traversée a échoué : la mémoire du token s'est effacée.
    expect(getPendingInviteToken()).toBeNull();
  }, 10_000);
});


describe('Atterrissage conditionnel ardoise (phase 40, ARD-01)', () => {
  it('avec marqueur posé : atterrissage sur /ardoise, marqueur lu-et-effacé', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    setArdoiseLanding();
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    await waitFor(() => expect(probe().dataset.pathname).toBe('/ardoise'));
    // Un passage n'y laisse rien traîner : le marqueur est lu PUIS effacé —
    // un atterrissage ultérieur ordinaire ne retourne pas sur l'ardoise.
    expect(getArdoiseLanding()).toBe(false);
  });

  it('sans marqueur : atterrissage ordinaire sur /accueil', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    const user = userEvent.setup();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Rejoindre le foyer' }));
    await waitFor(() => expect(probe().dataset.pathname).toBe('/accueil'));
    expect(getArdoiseLanding()).toBe(false);
  });

  it('aucun redeem au montage, marqueur posé ou non (D-08)', async () => {
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    setArdoiseLanding();
    renderPage(`/foyer/rejoindre?token=${TOKEN}`);

    // La page s'affiche (preview chargée) SANS redeem : la consultation ne
    // consomme pas un token à usage compté.
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(redeemInviteTokenMock).not.toHaveBeenCalled();
    expect(getArdoiseLanding()).not.toBeNull();
    window.sessionStorage.clear();
  });
});

afterEach(() => {
  clearPendingInviteToken();
});
