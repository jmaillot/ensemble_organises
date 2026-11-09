import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { renderWithProviders } from '@/test/render';
import GuestArdoisePage from './guest-ardoise-page';
import { InviteRequestError } from './api';

const { authed, exchangeMock } = vi.hoisted(() => ({
  authed: { value: false },
  exchangeMock: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useIsAuthenticated: () => authed.value,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  exchangeArdoiseCodeForHouseholdToken: exchangeMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'code-partage-12345678901234';

const viewPayload = {
  ardoise: { id: 'ardoise-1', name: 'Week-end', description: null, coverUrl: null, is_active: true },
  householdName: 'Foyer Test',
  guest: null,
  expenses: [
    {
      id: 'e1',
      title: 'Courses',
      amount: 60,
      date: '2026-10-01',
      paidByName: 'Camille',
      participants: [{ name: 'Camille', share: 30 }],
    },
  ],
  settlement: {
    ardoise_id: 'ardoise-1',
    household_id: 'household-1',
    balances: [{ kind: 'membre', participant_id: 'm1', display_name: 'Camille', amount: 30 }],
    settlements: [],
    generated_at: '2026-10-03T10:00:00.000Z',
  },
};

function mockViewFetch(calls: string[], ok = true, payload: unknown = viewPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const body = (JSON.parse((init?.body as string) ?? '{}') as { action?: string; code?: string }) ?? {};
      calls.push(`${body.action ?? '?'}`);
      // `status: 404` est porté comme l'Edge le fait : la page distingue un
      // lien réellement invalide (4xx → « ne passe plus ») d'un échec serveur
      // (5xx → message générique, WR-01/WR-03).
      if (!ok) return { ok: false, status: 404, json: async () => ({ error: 'Lien invalide.' }) };
      return { ok: true, json: async () => payload };
    }),
  );
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/ardoise" element={<GuestArdoisePage />} />
    </Routes>,
    { route: code ? `/invitation/ardoise?code=${code}` : '/invitation/ardoise', withHousehold: false },
  );
}

describe('GuestArdoisePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('affiche l’ardoise directement depuis le lien, sans nom ni ticket', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(screen.getByText('Participer ?')).toBeInTheDocument();
      expect(screen.queryByLabelText(/pseudonyme/i)).not.toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * Le cas qui manquait à la phase 19 : le cas existant ne posait que
   * `coverUrl: null`, donc une couverture cassée passait inaperçue. La charge
   * utile invitée porte une URL **servable** (signée par le serveur), jamais le
   * chemin de bucket — la page doit la rendre telle quelle, sans rien
   * reconstruire.
   */
  it('rend la couverture servable de la charge utile, pas un chemin reconstruit', async () => {
    const calls: string[] = [];
    const signed = 'https://api.example/storage/v1/object/sign/household-media/foyer-1/ardoises/plage.webp?token=abc.def';
    mockViewFetch(calls, true, {
      ...viewPayload,
      ardoise: { ...viewPayload.ardoise, coverUrl: signed },
    });
    try {
      renderGuest(CODE);
      const cover = await screen.findByAltText('Couverture de Week-end');
      // La page rend la valeur de la charge utile TELLE QUELLE : ni un chemin
      // de bucket, ni une URL re-signée côté client (impossible pour un invité
      // anonyme) ne produiraient ce `src`.
      expect(cover).toHaveAttribute('src', signed);
      // L'assertion qui dit la PROPRIÉTÉ, et non un motif : la valeur est
      // servable parce qu'elle est absolue. Un chemin de bucket ne commence pas
      // par `https://`. (On ne peut pas interdire `household-media/…` dans le
      // `src` : une URL signée de Supabase contient légitimement ce chemin dans
      // son propre segment — AGENTS.md §2.7D.6.)
      expect(cover.getAttribute('src')).toMatch(/^https:\/\//);
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propose le formulaire sans code, puis ouvre le lien saisi', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(null);
      await user.type(screen.getByLabelText(/Code d’invitation/), CODE);
      await user.click(screen.getByRole('button', { name: 'Voir l’ardoise' }));
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien révoqué : message et retour au formulaire', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, false);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * WR-01/WR-03 (37-REVIEW) : un 5xx n'est PAS un lien révoqué. Affirmer
   * « ce lien ne passe plus » sur une panne serveur serait un mensonge qui
   * envoie l'invité redemander un lien valide. Le statut porté par
   * `InviteRequestError` décide, jamais la copie du message.
   */
  it('échec serveur 5xx : message générique, pas le verdict « lien révoqué »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Erreur interne.' }),
      })),
    );
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/Impossible de charger/)).toBeInTheDocument();
      expect(screen.queryByText(/ne passe plus/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('GuestArdoisePage — branche authentifiée (G-37-2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    authed.value = false;
    exchangeMock.mockReset();
  });

  /**
   * Le modèle de partage ardoise reste BINAIRE : lien anonyme lecture seule
   * ↔ rattachement réservé aux membres du foyer. Un visiteur CONNECTÉ voit
   * une branche « Rejoindre via mon compte » (parité d'entrée avec
   * cadeaux/voyages, sans en copier la sémantique) ; un non-membre reçoit le
   * message serveur 403 EXPLICITE — aucun faux succès, aucune permission
   * intermédiaire inventée, aucun appel redeem-guest déguisé.
   */
  it('visiteur non authentifié : vue lecture seule inchangée, sans bouton de rattachement', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Créer un compte' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rejoindre via mon compte' })).not.toBeInTheDocument();
      expect(exchangeMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * Phase 40 (ARD-01) : le clic n'ouvre QUE le dialog de confirmation —
   * aucun appel Edge tant que la personne n'a pas confirmé explicitement
   * (anti-feature « adhésion implicite », REQUIREMENTS v1.3). À la
   * confirmation, l'échange code→token est appelé avec le code actif.
   */
  it('visiteur authentifié : le clic ouvre le dialog, aucun appel Edge avant confirmation', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    exchangeMock.mockResolvedValue({ token: 'tok_abc' });
    const user = userEvent.setup();
    try {
      authed.value = true;
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/Vous allez rejoindre le foyer Foyer Test/)).toBeInTheDocument();
      expect(exchangeMock).not.toHaveBeenCalled();
      expect(calls).toEqual(['link-view']);
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(exchangeMock).toHaveBeenCalledTimes(1);
      expect(exchangeMock).toHaveBeenCalledWith(CODE);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  function SondeAtterrissage() {
    const [params] = useSearchParams();
    return <p>token-probe:{params.get('token') ?? 'aucun'}</p>;
  }

  /** Succès : le pré-écran foyer existant prend le relais avec le token bridge. */
  it('succès de l’échange : navigation vers /foyer/rejoindre?token=…', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    exchangeMock.mockResolvedValue({ token: 'tok_abc-123' });
    const user = userEvent.setup();
    try {
      authed.value = true;
      renderWithProviders(
        <Routes>
          <Route path="/invitation/ardoise" element={<GuestArdoisePage />} />
          <Route path="/foyer/rejoindre" element={<SondeAtterrissage />} />
        </Routes>,
        { route: `/invitation/ardoise?code=${CODE}`, withHousehold: false },
      );
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(await screen.findByText('token-probe:tok_abc-123')).toBeInTheDocument();
      expect(exchangeMock).toHaveBeenCalledWith(CODE);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejet 403 : le message serveur s’affiche TEL QUEL, aucun faux succès', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const serveur = 'Vous n’appartenez pas au foyer de cette ardoise : utilisez le lien invité.';
    exchangeMock.mockRejectedValue(new InviteRequestError(403, serveur));
    const user = userEvent.setup();
    try {
      authed.value = true;
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      // L'échange ne part qu'à la confirmation du dialog (ARD-01).
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(serveur);
      // Le 403 est le comportement CORRECT pour un non-membre : la page le
      // surface sans le maquiller, et propose l'aide « bon compte » —
      // déclenchée par le STATUT (WR-01), pas par le texte du message.
      expect(screen.getByRole('status')).toHaveTextContent(/bon compte/i);
      expect(screen.queryByRole('link', { name: 'Ouvrir l’ardoise' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * WR-01 : un 5xx n'est pas un refus de membership. Le message serveur
   * s'affiche, mais SANS l'aide « bon compte » — elle serait un conseil faux
   * (le compte est peut-être le bon, c'est le serveur qui est en panne).
   */
  it('rejet 500 : message serveur affiché, aide « bon compte » absente', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    exchangeMock.mockRejectedValue(new InviteRequestError(500, 'Erreur interne.'));
    const user = userEvent.setup();
    try {
      authed.value = true;
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      // L'échange ne part qu'à la confirmation du dialog (ARD-01).
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Erreur interne.');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ouvrir l’ardoise' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * WR-05 (37-REVIEW) : l'état du rattachement appartient à UN code. Un
   * succès (message + lien « Ouvrir l'ardoise ») obtenu sur l'ardoise A ne
   * doit pas survivre à l'affichage de l'ardoise B dans le même montage.
   */
  it('changement de code : l’état du join est réinitialisé', async () => {
    const CODE_B = 'code-second-123456789012345';
    const viewB = {
      ...viewPayload,
      ardoise: { ...viewPayload.ardoise, id: 'ardoise-2', name: 'Barbecue' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        const body = (JSON.parse((init?.body as string) ?? '{}') as { code?: string }) ?? {};
        return { ok: true, json: async () => (body.code === CODE_B ? viewB : viewPayload) };
      }),
    );
    function NavToB() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(`/invitation/ardoise?code=${CODE_B}`)}>aller-B</button>;
    }
    exchangeMock.mockResolvedValue({ token: 'tok_abc' });
    const user = userEvent.setup();
    try {
      authed.value = true;
      renderWithProviders(
        <Routes>
          <Route
            path="/invitation/ardoise"
            element={
              <>
                <GuestArdoisePage />
                <NavToB />
              </>
            }
          />
        </Routes>,
        { route: `/invitation/ardoise?code=${CODE}`, withHousehold: false },
      );
      await screen.findByText('Week-end');
      await user.click(screen.getByRole('button', { name: 'Rejoindre via mon compte' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      // Radix pose `aria-hidden` sur le contenu hors dialog : `dom-accessibility-api`
      // renvoie alors un nom vide pour ce bouton, même avec `hidden: true`
      // (timing de pose de l'attribut). `getByText` ne passe pas par le nom
      // accessible ; `fireEvent` (et non userEvent) car le bouton est derrière
      // l'overlay — scénario voulu : navigation PENDANT un dialog ouvert
      // sur A, qui doit le fermer (WR-05 : dialog appartient à un code).
      fireEvent.click(screen.getByText('aller-B'));
      expect(await screen.findByText('Barbecue')).toBeInTheDocument();
      // Le résidu du dialog ouvert sur A a disparu : pas de dialog fantôme
      // sur l'ardoise B, le bouton repart de l'état neutre.
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rejoindre via mon compte' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('GuestArdoisePage — dialog UI-SPEC (phase 40, ARD-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    authed.value = true;
    exchangeMock.mockReset();
  });

  /** « Ne pas rejoindre » referme le dialog sans AUCUN appel réseau. */
  it('annuler ferme le dialog, toujours aucun appel Edge', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ne pas rejoindre' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(exchangeMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** L'état « Adhésion en cours… » est visible pendant l'échange (bouton désactivé). */
  it('confirmation : bouton « Adhésion en cours… » désactivé pendant l’échange, puis navigation', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    let resolveExchange: (v: { token: string }) => void = () => {};
    exchangeMock.mockReturnValue(
      new Promise<{ token: string }>((resolve) => {
        resolveExchange = resolve;
      }),
    );
    const user = userEvent.setup();
    function SondeLocale() {
      const [params] = useSearchParams();
      return <p>token-probe:{params.get('token') ?? 'aucun'}</p>;
    }
    try {
      renderWithProviders(
        <Routes>
          <Route path="/invitation/ardoise" element={<GuestArdoisePage />} />
          <Route path="/foyer/rejoindre" element={<SondeLocale />} />
        </Routes>,
        { route: `/invitation/ardoise?code=${CODE}`, withHousehold: false },
      );
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      const enCours = screen.getByRole('button', { name: 'Adhésion en cours…' });
      expect(enCours).toBeDisabled();
      resolveExchange({ token: 'tok_def-456' });
      expect(await screen.findByText('token-probe:tok_def-456')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** householdName absent : le titre de repli s'affiche (décision verrouillée UI-SPEC). */
  it('householdName null : titre de repli « foyer de cette ardoise »', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, true, { ...viewPayload, householdName: null });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      expect(screen.getByText('Vous allez rejoindre le foyer de cette ardoise')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** L'icône de la pastille est l'adhésion (users), pas la corbeille (trash). */
  it('l’icône du dialog est l’adhésion, pas la corbeille', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      // Ancrage sur le littéral du jeu d'icônes export (icon.tsx) : la pastille
      // du dialog doit porter le chemin `users`, jamais celui de `trash`.
      const path = document.querySelector('[class*="bg-coral-soft"] svg path');
      expect(path).not.toBeNull();
      const d = path?.getAttribute('d') ?? '';
      expect(d).toContain('M9 9m-3');
      expect(d).not.toContain('M5 7h14');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** 401 : session expirée — message tel quel, sans l'aide « bon compte ». */
  it('rejet 401 : message serveur tel quel, aide « bon compte » absente', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    exchangeMock.mockRejectedValue(new InviteRequestError(401, 'Session expirée.'));
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Session expirée.');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** 404 : code mort (D-03) — message uniforme tel quel. */
  it('rejet 404 : « Lien invalide. » tel quel, aide « bon compte » absente', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    exchangeMock.mockRejectedValue(new InviteRequestError(404, 'Lien invalide.'));
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: 'Rejoindre via mon compte' }));
      await user.click(screen.getByRole('button', { name: 'Rejoindre le foyer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Lien invalide.');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
