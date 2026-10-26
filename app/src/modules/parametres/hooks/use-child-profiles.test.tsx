/**
 * T2 (25-05) — profils enfants : wrappers RPC, fiche dans la liste des membres,
 * espaces par membre, âge et « Donner accès ».
 *
 * Pourquoi chaque cas :
 * - Les wrappers isolent le module des écritures directes : en mode connecté,
 *   TOUT passe par les RPC 0146/0148 (les gardes vivent en base) —
 *   jamais `data.create/update/remove('household_members')`.
 * - `setManagedModules` borne localement le choix aux CINQ clés gérables
 *   (0146 — 22023 sinon) : une clé hors périmètre ne part jamais sur le réseau
 *   pour se faire refuser (clé morte, must_haves).
 * - L'écriture des modules porte la ligne MEMBRE (p_managed_modules) — jamais
 *   `households` (D-05) ; le panneau rend le même contrat.
 * - L'archivage est une modale de confirmation AVANT l'appel (guideline §6) et
 *   l'enfant disparaît de la liste rendue PAR LE FILTRE DU STORE (D-04) — la
 *   preuve UI que le filtre unique couvre le panneau.
 * - L'âge (D-05) dérive de birth_date via date-fns ; sans date, rien.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatISO, subYears } from 'date-fns';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { rememberInviteToken } from '@/lib/invites';
import type { HouseholdMemberRow, HouseholdRow, InviteTokenSummary } from '@/types';
import { MembersPanel } from '../components/members-panel';
import {
  archiveChildProfile,
  CHILD_DEFAULT_MODULES,
  CHILD_MANAGEABLE_MODULES,
  giveChildAccess,
  linkChildToAccount,
  saveChildProfile,
  setManagedModules,
} from '../api';
import { childAgeLabel, useChildProfiles } from './use-child-profiles';

const { rpcMock, summaryMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  summaryMock: vi.fn(),
}));

// Mode Supabase simulé : les assertions portent sur les RPC réellement appelées
// par `api.ts` — c'est le contrat serveur (0146/0148) qui est éprouvé ici.
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: rpcMock },
}));

// Le résumé du token d'invitation est sous contrôle (D-21) : le reste du
// module `invites` (rappel local, validité) reste réel.
vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return { ...actual, getInviteTokenSummary: summaryMock };
});

const baseMember = {
  household_id: 'h-1',
  user_id: null,
  avatar_url: null,
  color_tag: 'accent',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
} as const;

const memberRow = (
  overrides: Partial<HouseholdMemberRow> & Pick<HouseholdMemberRow, 'id' | 'role' | 'display_name'>,
): HouseholdMemberRow => ({ ...baseMember, ...overrides });

const adulte = memberRow({ id: 'm-camille', role: 'membre', display_name: 'Camille Martin' });
const autreAdulte = memberRow({ id: 'm-lior', role: 'membre', display_name: 'Lior Martin', color_tag: 'ink' });
const PETITE = 'Noé Martin';
const enfantBirth = formatISO(subYears(new Date(), 8), { representation: 'date' });
const enfant = memberRow({
  id: 'm-noe',
  role: 'enfant',
  display_name: PETITE,
  color_tag: 'amber',
  birth_date: enfantBirth,
  managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
});

const householdRow = {
  id: 'h-1',
  name: 'Foyer Test',
  avatar_color: 'accent',
  school_zone: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  disabled_modules: [],
} as HouseholdRow;

const seedStore = (...rows: HouseholdMemberRow[]) => {
  useHouseholdStore.setState({
    householdId: 'h-1',
    householdName: 'Foyer Test',
    members: rows,
    currentMemberId: 'm-camille',
  });
};

const summaryActif = (createdAt: string): InviteTokenSummary => ({
  householdId: 'h-1',
  isActive: true,
  expiresAt: null,
  maxUses: 10,
  useCount: 0,
  createdAt,
});

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: {}, error: null });
  summaryMock.mockReset();
  useHouseholdStore.getState().reset();
  localStorage.clear();
});

describe('api.ts — wrappers RPC des profils enfants (D-01/0146)', () => {
  it("saveChildProfile appelle create_managed_child_profile avec nom, couleur, date et photo, et retourne l'id", async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'm-nouveau', household_id: 'h-1', display_name: 'Jade Martin', color_tag: 'violet', role: 'enfant', birth_date: null },
      error: null,
    });

    const creation = await saveChildProfile('h-1', {
      displayName: 'Jade Martin',
      colorTag: 'violet',
      birthDate: null,
      avatarUrl: null,
    });

    expect(creation.id).toBe('m-nouveau');
    expect(creation.managed_modules).toEqual(['taches', 'routines', 'anniversaires', 'menu']);
    expect(rpcMock).toHaveBeenCalledWith('create_managed_child_profile', {
      p_household_id: 'h-1',
      p_display_name: 'Jade Martin',
      p_color_tag: 'violet',
      p_birth_date: null,
      p_avatar_url: null,
    });
    // Jamais d'écriture directe sur la ligne membre en mode connecté.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('saveChildProfile refuse localement un nom hors 2-120, sans appel réseau', async () => {
    await expect(saveChildProfile('h-1', { displayName: 'J', colorTag: 'accent', birthDate: null, avatarUrl: null })).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
    await expect(
      saveChildProfile('h-1', { displayName: 'J'.repeat(121), colorTag: 'accent', birthDate: null, avatarUrl: null }),
    ).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('setManagedModules refuse une clé hors des CINQ clés gérables (22023 côté serveur, refus local ici)', async () => {
    await expect(setManagedModules('m-noe', ['cadeaux'], { birthDate: enfantBirth, avatarUrl: null })).rejects.toThrow(/cadeaux/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('setManagedModules passe par update_managed_child_profile avec p_managed_modules sur la LIGNE MEMBRE', async () => {
    await setManagedModules('m-noe', ['taches', 'menu'], { birthDate: enfantBirth, avatarUrl: null });

    expect(rpcMock).toHaveBeenCalledWith('update_managed_child_profile', {
      p_member_id: 'm-noe',
      p_display_name: null,
      p_color_tag: null,
      p_birth_date: enfantBirth,
      p_avatar_url: null,
      p_managed_modules: ['taches', 'menu'],
    });
    // D-05 : jamais une écriture `households`.
    expect(rpcMock.mock.calls.every(([, name]) => name !== 'save_disabled_modules')).toBe(true);
  });

  it('archiveChildProfile appelle archive_managed_child_profile (deleted_at) — jamais data.remove', async () => {
    await archiveChildProfile('m-noe');
    expect(rpcMock).toHaveBeenCalledWith('archive_managed_child_profile', { p_member_id: 'm-noe' });
  });

  it('linkChildToAccount appelle link_managed_child avec la fiche enfant et le compte adulte', async () => {
    await linkChildToAccount('m-noe', 'm-lior');
    expect(rpcMock).toHaveBeenCalledWith('link_managed_child', { p_child_member_id: 'm-noe', p_account_member_id: 'm-lior' });
  });

  it("giveChildAccess retourne le lien d'invitation standard D-21 quand le token brut est rappelable", async () => {
    const createdAt = '2026-10-01T00:00:00Z';
    summaryMock.mockResolvedValue(summaryActif(createdAt));
    rememberInviteToken({ token: 't0ken', householdId: 'h-1', createdAt });

    expect(await giveChildAccess('h-1')).toContain('foyer/rejoindre?token=t0ken');
  });

  it("giveChildAccess retourne null sans token rappelable — la fiche renvoie vers la section Inviter", async () => {
    summaryMock.mockResolvedValue(null);
    expect(await giveChildAccess('h-1')).toBeNull();
  });
});

describe('childAgeLabel — âge affiché (D-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcule les années via date-fns depuis birth_date', () => {
    expect(childAgeLabel('2018-10-26', new Date('2026-10-26T12:00:00Z'))).toBe('8 ans');
    expect(childAgeLabel('2016-09-29', new Date('2026-10-26T12:00:00Z'))).toBe('10 ans');
  });

  it('annonce les mois sous trois ans, puis combinaison années/mois', () => {
    expect(childAgeLabel('2024-07-26', new Date('2026-10-26T12:00:00Z'))).toBe('2 ans, 3 mois');
    expect(childAgeLabel('2026-01-26', new Date('2026-10-26T12:00:00Z'))).toBe('9 mois');
  });

  it('ne dit rien sans birth_date (D-05)', () => {
    expect(childAgeLabel(null, new Date('2026-10-26T12:00:00Z'))).toBeNull();
  });
});

describe('MembersPanel — CRUD enfant DANS la liste des membres (D-02)', () => {
  it('affiche l’âge de l’enfant et les actions adultes de la fiche', () => {
    renderWithProviders(<MembersPanel />);
    seedStore(adulte, enfant);
    // L'âge court sur la ligne (D-05) ; l'adulte sans date n'affiche rien.
    expect(screen.getByText('8 ans')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Modifier la fiche de ${PETITE}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Espaces de ${PETITE}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Donner accès à ${PETITE}` })).toBeInTheDocument();
  });

  it('tronque un nom de 120 caractères sans casser la ligne (A5, backstop)', () => {
    const longNom = `Z${'e'.repeat(118)}n`;
    seedStore(adulte, memberRow({ id: 'm-long', role: 'enfant', display_name: longNom, birth_date: null }));
    renderWithProviders(<MembersPanel />);
    const nameEl = screen.getByText(longNom);
    expect(nameEl.className).toContain('truncate');
  });

  it("crée une fiche enfant depuis le panneau : RPC create + invalidation du store (socle D-06)", async () => {
    const user = userEvent.setup();
    seedStore(adulte);
    rpcMock.mockResolvedValue({
      data: { id: 'm-jade', household_id: 'h-1', display_name: 'Jade Martin', color_tag: 'amber', role: 'enfant', birth_date: null },
      error: null,
    });
    renderWithProviders(<MembersPanel />);

    await user.click(screen.getByRole('button', { name: 'Ajouter un enfant' }));
    await user.type(screen.getByLabelText('Prénom de l’enfant'), 'Jade Martin');
    await user.click(screen.getByRole('button', { name: 'Ajouter la fiche' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('create_managed_child_profile', {
        p_household_id: 'h-1',
        p_display_name: 'Jade Martin',
        p_color_tag: 'amber',
        p_birth_date: null,
        p_avatar_url: null,
      });
    });
    // Test 7 — le store est invalidé après la mutation réussie.
    await waitFor(() => {
      const created = useHouseholdStore.getState().members.find((member) => member.id === 'm-jade');
      expect(created?.managed_modules).toEqual(['taches', 'routines', 'anniversaires', 'menu']);
      expect(created?.deleted_at).toBeNull();
    });
    expect(screen.getByText('Jade Martin')).toBeInTheDocument();
  });

  it('enregistre les espaces PAR MEMBRE et met le store à jour (D-05)', async () => {
    const user = userEvent.setup();
    seedStore(adulte, enfant);
    renderWithProviders(<MembersPanel />);

    await user.click(screen.getByRole('button', { name: `Espaces de ${PETITE}` }));
    expect(screen.getByRole('heading', { name: `Espaces de ${PETITE}` })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Espace Tâches' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Espace Menu' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Espace Messages' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Espace Anniversaires' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les espaces' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('update_managed_child_profile', expect.objectContaining({
        p_member_id: 'm-noe',
        p_managed_modules: ['taches', 'routines', 'menu'],
      }));
    });
    await waitFor(() => {
      const updated = useHouseholdStore.getState().members.find((member) => member.id === 'm-noe');
      expect(updated?.managed_modules).toEqual(['taches', 'routines', 'menu']);
    });
  });

  it('archive la fiche APRÈS confirmation explicite, et l’enfant disparaît de la liste rendue (D-04, preuve UI)', async () => {
    const user = userEvent.setup();
    seedStore(adulte, enfant);
    renderWithProviders(<MembersPanel />);

    await user.click(screen.getByRole('button', { name: `Supprimer la fiche de ${PETITE}` }));
    // La modale exige une confirmation : aucun appel réseau avant elle.
    expect(screen.getByText(`Supprimer la fiche de ${PETITE} ?`)).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Supprimer la fiche' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('archive_managed_child_profile', { p_member_id: 'm-noe' });
    });
    // Test 6 — le filtre du store (vivantes) écarte la ligne ; le panneau ne
    // la retire jamais localement.
    await waitFor(() => {
      expect(screen.queryByText(PETITE)).not.toBeInTheDocument();
    });
    expect(useHouseholdStore.getState().members.some((member) => member.id === 'm-noe')).toBe(false);
  });

  it('propose la liaison irréversible depuis le dialogue « Donner accès » (D-19/D-21)', async () => {
    const user = userEvent.setup();
    seedStore(adulte, autreAdulte, enfant);
    renderWithProviders(<MembersPanel />);

    await user.click(screen.getByRole('button', { name: `Donner accès à ${PETITE}` }));
    expect(await screen.findByText(/lien d’invitation/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Compte à relier'), 'm-lior');
    await user.click(screen.getByRole('button', { name: 'Lier le compte' }));
    expect(screen.getByText('Irréversible : tout l’historique suivra le compte.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Relier le compte' }));
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('link_managed_child', { p_child_member_id: 'm-noe', p_account_member_id: 'm-lior' });
    });
    await waitFor(() => {
      expect(screen.queryByText(PETITE)).not.toBeInTheDocument();
    });
  });

  it('annonce le statut sans compte et l’état vide « Aucun profil enfant »', () => {
    seedStore(adulte);
    const { unmount } = renderWithProviders(<MembersPanel />);
    expect(screen.getByText(/Aucun profil enfant/)).toBeInTheDocument();
    unmount();

    seedStore(adulte, enfant);
    renderWithProviders(<MembersPanel />);
    expect(screen.getByText(/n’a pas de compte : un adulte agit pour elle/)).toBeInTheDocument();
  });
});
