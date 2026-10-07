import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
import { demoProfile } from '@/lib/data/seed';
import GuestCadeauPage from './guest-cadeau-page';

const { mockGetSession } = vi.hoisted(() => {
  const mockGetSession = vi.fn(
    async (): Promise<{ data: { session: { access_token: string } | null } }> => ({ data: { session: null } }),
  );
  return { mockGetSession };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: mockGetSession } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';
type SeenCall = { url: string; init: RequestInit; body: Record<string, unknown> };

const GUEST_VIEW = {
  listId: 'gift-list-1',
  listName: 'Noël Mamie',
  items: [
    { id: 'gift-item-1', name: 'Foulard', price: 29, comment: null, reserved: false },
    { id: 'gift-item-2', name: 'Théière', price: 45, comment: 'Bleue', reserved: true },
  ],
};

function mockRedeemFetch(ok = true, payload: unknown = { list_id: 'gift-list-1', already_shared: false }) {
  const seen: SeenCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      seen.push({ url, init: (init ?? {}) as RequestInit, body: JSON.parse(String(init?.body ?? '{}')) });
      if (!ok) return { ok: false, json: async () => ({ error: 'code invalide' }) };
      return { ok: true, json: async () => payload };
    }),
  );
  return seen;
}

/** Stub orienté action pour la branche invitée (guest-view / guest-reserve). */
function mockGuestFetch(handlers: {
  view?: unknown | Error;
  reserve?: unknown | Error | ((body: Record<string, unknown>) => unknown | Error);
}) {
  const seen: SeenCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seen.push({ url: _url, init: (init ?? {}) as RequestInit, body });
      const outcome =
        body.action === 'guest-view'
          ? handlers.view ?? GUEST_VIEW
          : typeof handlers.reserve === 'function'
            ? handlers.reserve(body)
            : (handlers.reserve ?? { itemId: 'gift-item-1', alreadyReserved: false });
      if (outcome instanceof Error) return { ok: false, json: async () => ({ error: outcome.message }) };
      return { ok: true, json: async () => outcome };
    }),
  );
  return seen;
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/cadeau" element={<GuestCadeauPage />} />
    </Routes>,
    { route: code ? `/invitation/cadeau?code=${code}` : '/invitation/cadeau', withHousehold: false },
  );
}

describe('GuestCadeauPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useSessionStore.setState({ status: 'guest', user: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test');
  });

  it('sans session : nom déclaré puis réserve, sans compte', async () => {
    mockGuestFetch({});
    const user = userEvent.setup();
    try {
      renderGuest(CODE);

      // La liste et les états réservés seuls (jamais d'auteur).
      expect(await screen.findByText(/Noël Mamie/)).toBeInTheDocument();
      expect(screen.getByText('Foulard')).toBeInTheDocument();
      expect(screen.getByText('Théière')).toBeInTheDocument();
      expect(screen.queryByText(/Thomas/)).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/réservé au nom de Mamie/)).toBeInTheDocument();
      // Mémoire cosmétique : le nom est mémorisé pour la pré-remplissage.
      expect(localStorage.getItem(`cadeaux:guest-name:${CODE}`)).toBe('Mamie');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('contenu invité : photo et lien rendus quand présents, rien quand absents (G-06-1a)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          {
            id: 'gift-item-1',
            name: 'Foulard',
            price: 29,
            comment: 'Laine',
            url: 'https://boutique.example.fr/foulard-32',
            photoUrl: 'https://cdn.example.fr/foulard-32.jpg',
            reserved: false,
          },
          { id: 'gift-item-2', name: 'Théière', price: 45, comment: null, url: null, photoUrl: null, reserved: false },
        ],
      },
    });
    const user = userEvent.setup();
    try {
      const { container } = renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      // Replié : résumé seul, aucun contenu servi (G-06-1a-bis).
      expect(container.querySelector('li img')).toBeNull();
      expect(container.querySelector('li a')).toBeNull();

      // Tap : le détail déplié porte la photo et le lien.
      await user.click(screen.getByRole('button', { name: /Foulard/ }));
      const photos = container.querySelectorAll('li img');
      expect(photos).toHaveLength(1);
      expect(photos[0]?.getAttribute('src')).toBe('https://cdn.example.fr/foulard-32.jpg');
      expect(photos[0]?.getAttribute('loading')).toBe('lazy');
      const link = screen.getByRole('link', { name: /Voir : Foulard/ });
      expect(link).toHaveAttribute('href', 'https://boutique.example.fr/foulard-32');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');

      // Article nu : aucune photo ni lien — rendu propre, sans erreur.
      const rows = container.querySelectorAll('li');
      expect(rows).toHaveLength(2);
      expect(rows[1]?.querySelector('img')).toBeNull();
      expect(rows[1]?.querySelector('a')).toBeNull();

      // Masquage intact : aucun auteur nulle part dans le DOM.
      expect(container.textContent).not.toMatch(/Thomas|member-/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lignes repliées : résumé seul, détail absent, bascule annoncée (G-06-1a-bis)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          {
            id: 'gift-item-1',
            name: 'Foulard',
            price: 29,
            comment: 'Laine mérinos',
            url: 'https://boutique.example.fr/foulard-32',
            photoUrl: 'https://cdn.example.fr/foulard-32.jpg',
            reserved: false,
          },
        ],
      },
    });
    try {
      const { container } = renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      // Le résumé (nom + prix) est visible, le détail est absent du DOM.
      const toggle = screen.getByRole('button', { name: /Foulard/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle.getAttribute('aria-controls')).toBe('guest-item-detail-gift-item-1');
      expect(container.querySelector('#guest-item-detail-gift-item-1')).toBeNull();
      expect(screen.queryByText('Laine mérinos')).not.toBeInTheDocument();
      expect(container.querySelector('li img')).toBeNull();
      expect(container.querySelector('li a')).toBeNull();
      // La réserve reste joignable même repliée.
      expect(screen.getByRole('button', { name: 'Réserver' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('tap : le détail se déplie puis se replie, clavier et lecteur d’écran (G-06-1a-bis)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          {
            id: 'gift-item-1',
            name: 'Foulard',
            price: 29,
            comment: 'Laine mérinos',
            url: 'https://boutique.example.fr/foulard-32',
            photoUrl: 'https://cdn.example.fr/foulard-32.jpg',
            reserved: false,
          },
        ],
      },
    });
    const user = userEvent.setup();
    try {
      const { container } = renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: /Foulard/ });

      // Ouverture : photo large, commentaire entier, prix, lien externe.
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const detail = container.querySelector('#guest-item-detail-gift-item-1');
      expect(detail).not.toBeNull();
      expect(detail?.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.fr/foulard-32.jpg');
      expect(screen.getByText('Laine mérinos')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Voir : Foulard/ })).toHaveAttribute(
        'href',
        'https://boutique.example.fr/foulard-32',
      );
      // Masquage intact jusque dans le détail (D-07).
      expect(container.textContent).not.toMatch(/Thomas|member-/);

      // Refermeture : le détail quitte le DOM, le résumé demeure.
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector('#guest-item-detail-gift-item-1')).toBeNull();
      expect(screen.getByText('Foulard')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('réserve depuis le détail déplié : succès, sans nouvel appel (G-06-1a-bis)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          {
            id: 'gift-item-1',
            name: 'Foulard',
            price: 29,
            comment: 'Laine',
            url: 'https://boutique.example.fr/foulard-32',
            photoUrl: 'https://cdn.example.fr/foulard-32.jpg',
            reserved: false,
          },
        ],
      },
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: /Foulard/ }));
      expect(screen.getByRole('link', { name: /Voir : Foulard/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/réservé au nom de Mamie/)).toBeInTheDocument();
      // Le flux de réserve est inchangé : le détail n'a ajouté aucun fetch.
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('détail déplié sans photo ni lien : rendu propre, sans erreur (G-06-1a-bis)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          { id: 'gift-item-2', name: 'Théière', price: 45, comment: null, url: null, photoUrl: null, reserved: false },
        ],
      },
    });
    const user = userEvent.setup();
    try {
      const { container } = renderGuest(CODE);
      expect(await screen.findByText('Théière')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Théière/ }));
      const detail = container.querySelector('#guest-item-detail-gift-item-2');
      expect(detail).not.toBeNull();
      expect(detail?.querySelector('img')).toBeNull();
      expect(detail?.querySelector('a')).toBeNull();
      // Prix présent même sans contenu, réserve toujours joignable.
      expect(detail?.textContent).toMatch(/45/);
      expect(screen.getByRole('button', { name: 'Réserver' })).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/Thomas|member-/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien ou photo non-http : rien rendu (échec fermé, T-06-10)', async () => {
    mockGuestFetch({
      view: {
        listId: 'gift-list-1',
        listName: 'Noël Mamie',
        items: [
          {
            id: 'gift-item-1',
            name: 'Piège',
            price: 1,
            comment: null,
            url: 'javascript:alert(1)',
            photoUrl: 'data:image/png;base64,eG1s',
            reserved: false,
          },
        ],
      },
    });
    const user = userEvent.setup();
    try {
      const { container } = renderGuest(CODE);
      expect(await screen.findByText('Piège')).toBeInTheDocument();

      // La couche données laisse passer la chaîne, le rendu refuse le schéma —
      // jusque dans le détail déplié (même garde que la vignette).
      await user.click(screen.getByRole('button', { name: /Piège/ }));
      expect(container.querySelector('#guest-item-detail-gift-item-1')).not.toBeNull();
      expect(container.querySelector('li img')).toBeNull();
      expect(container.querySelector('li a')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('réserve idempotente à nom égal : succès affiché comme succès', async () => {
    mockGuestFetch({ reserve: { itemId: 'gift-item-1', alreadyReserved: true } });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/déjà réservé à ce nom/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('conflit à nom différent : message distinct de l’oracle', async () => {
    mockGuestFetch({ reserve: new Error('Cet article est déjà réservé.') });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Papi');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/vient de réserver cet article/)).toBeInTheDocument();
      expect(screen.queryByText(/ne passe plus/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code invalide : message oracle et retour au formulaire', async () => {
    mockGuestFetch({ view: new Error('Ce code est invalide.') });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);

      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('en session : choix explicite, rejoindre échange puis propose d’ouvrir les cadeaux', async () => {
    mockRedeemFetch();
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      // Le choix précède tout échange : rejoindre déclenche le redeem historique.
      await user.click(await screen.findByRole('button', { name: /Rejoindre via mon compte/ }));
      expect(await screen.findByText(/Partage activé/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ouvrir les cadeaux/ })).toHaveAttribute('href', '/cadeaux');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien révoqué en session : message et retour au formulaire', async () => {
    mockRedeemFetch(false);
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: /Rejoindre via mon compte/ }));
      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('en session : les deux options sont proposées et aucun échange ne part avant le choix (G-06-1b)', async () => {
    const seen = mockGuestFetch({});
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    try {
      renderGuest(CODE);

      expect(await screen.findByRole('button', { name: /Rejoindre via mon compte/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Continuer sans lier mon compte/ })).toBeInTheDocument();
      // La copie précise que la seconde voie reste anonyme.
      expect(screen.getByText(/rien ne sera rattaché à votre compte/)).toBeInTheDocument();
      // Ni redeem ni vue invitée : le choix précède tout appel réseau.
      expect(seen).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('en session : continuer sans lier réserve en anonyme, sans porteur (G-06-1b, T-06-11)', async () => {
    // Une session Supabase réelle existe : la preuve exige son absence des appels.
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-test' } } });
    const seen = mockGuestFetch({});
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: /Continuer sans lier mon compte/ }));

      // La même vue que les visiteurs : nom déclaré puis réserve.
      await user.type(await screen.findByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));
      expect(await screen.findByText(/réservé au nom de Mamie/)).toBeInTheDocument();

      // Copie d'attribution anonyme, pas d'invite à se connecter (déjà en session).
      expect(screen.getByText(/sans lier votre compte/)).toBeInTheDocument();
      expect(screen.queryByText(/Connectez-vous avec l’e-mail invité/)).not.toBeInTheDocument();

      // guest-view ET guest-reserve sans porteur, malgré la session présente…
      const guestCalls = seen.filter(
        (call) => call.body.action === 'guest-view' || call.body.action === 'guest-reserve',
      );
      expect(guestCalls.length).toBeGreaterThan(0);
      for (const call of guestCalls) {
        expect((call.init.headers as Record<string, string>).authorization).toBeUndefined();
      }
      // …et aucun redeem : le compte n'est jamais lié sur cette voie.
      expect(seen.some((call) => call.body.action === 'redeem')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('en session : rejoindre appelle le redeem historique avec les mêmes arguments', async () => {
    const seen = mockRedeemFetch();
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      await user.click(await screen.findByRole('button', { name: /Rejoindre via mon compte/ }));
      expect(await screen.findByText(/Partage activé/)).toBeInTheDocument();

      // Sémantique redeem inchangée : un seul appel, code + e-mail du compte.
      const redeemCalls = seen.filter((call) => call.body.action === 'redeem');
      expect(redeemCalls).toHaveLength(1);
      expect(redeemCalls[0]?.body).toMatchObject({ action: 'redeem', code: CODE, email: 'bob-cal@example.fr' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
