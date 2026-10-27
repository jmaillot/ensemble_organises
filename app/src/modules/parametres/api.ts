import { data } from '@/lib/data';
import { getInviteTokenSummary, isRecallValid, recallInviteToken } from '@/lib/invites';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type {
  DashboardWidgetRow,
  HouseholdMemberRow,
  HouseholdRow,
  MemberColorTag,
  ProfileRow,
  Role,
} from '@/types';
import type { AccountDeletionRequestRow, GdprExportJobRow, HouseholdColor } from './types';

/**
 * Préférences : profil, foyer, membres. Tout passe par l'adaptateur de données,
 * donc par la RLS côté Supabase. Les changements de rôle passent par le RPC
 * serveur `set_member_role` (migration 0036), jamais par une écriture directe :
 * seule la fonction protège le dernier administrateur.
 */

/**
 * Le profil porte la ville (`profiles.city`), source de vérité du widget
 * météo. Les réglages du widget (`dashboard_widgets.settings.city`) restent
 * lus en repli et réécrits à la sauvegarde, le temps que chaque profil ait
 * une ville.
 */
export const DEFAULT_CITY = 'Lyon';

export interface ProfileSettings {
  userId: string;
  displayName: string;
  email: string;
  city: string;
  provider: ProfileRow['provider'];
}

export interface ProfileTarget {
  userId: string;
  memberId: string;
  householdId: string;
}

const cityFromSettings = (settings: Record<string, unknown> | null) =>
  typeof settings?.city === 'string' && settings.city.trim() ? settings.city.trim() : '';

export async function fetchProfile({ userId, memberId, householdId }: ProfileTarget): Promise<ProfileSettings> {
  const [profile] = await data.list<ProfileRow>('profiles', { id: userId });
  const cityFromProfile = profile?.city?.trim() ?? '';
  if (cityFromProfile) {
    return {
      userId,
      displayName: profile?.display_name ?? '',
      email: profile?.email ?? '',
      city: cityFromProfile,
      provider: profile?.provider ?? 'email',
    };
  }
  const widgets = await data.list<DashboardWidgetRow>('dashboard_widgets', { household_id: householdId });
  const meteo = widgets.find((widget) => widget.widget_type === 'meteo' && widget.member_id === memberId);
  return {
    userId,
    displayName: profile?.display_name ?? '',
    email: profile?.email ?? '',
    city: cityFromSettings(meteo?.settings ?? null) || DEFAULT_CITY,
    provider: profile?.provider ?? 'email',
  };
}

export async function saveProfile(target: ProfileTarget, values: { displayName: string; city: string }): Promise<void> {
  const city = values.city.trim();
  const displayName = values.displayName.trim();
  await data.update<ProfileRow>('profiles', target.userId, { display_name: displayName, city });

  // La ligne membre porte le nom affiché partout (listes, soldes serveur,
  // avatars) : elle suit le profil. En mode Supabase, seul le RPC y touche —
  // la RLS réserve l'écriture directe aux admins — et il refuse toute ligne
  // qui n'est pas la sienne (un parent renomme un enfant depuis le panneau
  // du foyer, via `renameMember`).
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('rename_own_member_name', {
      p_member_id: target.memberId,
      p_display_name: displayName,
    });
    if (error) throw new Error(error.message || 'Renommage impossible.');
  } else {
    await data.update('household_members', target.memberId, { display_name: displayName });
  }

  const widgets = await data.list<DashboardWidgetRow>('dashboard_widgets', { household_id: target.householdId });
  const meteo = widgets.find((widget) => widget.widget_type === 'meteo' && widget.member_id === target.memberId);
  if (meteo) {
    await data.update<DashboardWidgetRow>('dashboard_widgets', meteo.id, {
      settings: { ...(meteo.settings ?? {}), city: values.city },
    });
    return;
  }
  await data.create<DashboardWidgetRow>('dashboard_widgets', {
    id: randomId('widget'),
    member_id: target.memberId,
    household_id: target.householdId,
    widget_type: 'meteo',
    position_x: 0,
    position_y: 0,
    width: 1,
    height: 1,
    settings: { city: values.city },
  });
}

export async function fetchHousehold(householdId: string | null): Promise<HouseholdRow | null> {
  if (!householdId) return null;
  const [household] = await data.list<HouseholdRow>('households', { id: householdId });
  return household ?? null;
}

export async function saveHousehold(
  householdId: string,
  values: { name: string; avatar_color: HouseholdColor },
): Promise<HouseholdRow> {
  return data.update<HouseholdRow>('households', householdId, values);
}

/**
 * Change les espaces éteints du foyer (menu des applications, migration
 * 0140). La RLS `households_update` (0007) réserve l'écriture d'une ligne
 * foyer aux administrateurs : la fonction ne fait que transmettre, jamais
 * décider. La validité des clés est tenue par la base — la contrainte 0140
 * refuse une chaîne hors format maison, donc une clé mal écrite ne peut pas
 * éteindre un module qui n'existe pas.
 */
export async function saveDisabledModules(householdId: string, disabledModules: string[]): Promise<HouseholdRow> {
  return data.update<HouseholdRow>('households', householdId, { disabled_modules: disabledModules });
}

/** Retire un membre du foyer : action réservée à l'administrateur. */
export async function removeMember(memberId: string): Promise<void> {
  await data.remove('household_members', memberId);
}

/**
 * Profils enfants gérés par le parent (phase 25, migrations 0146/0148). En
 * mode connecté, TOUT passe par les RPC serveur — les gardes (adulte requis,
 * nom 2-120, périmètre D-06 des cinq modules, archivage sans suppression,
 * fusion D-19) vivent en base. Jamais d'écriture directe sur
 * `household_members` côté Supabase : la ligne membre porte l'historique.
 */

/** Les six espaces qu'un adulte peut ouvrir à un enfant (0146+0157, D-06). */
export const CHILD_MANAGEABLE_MODULES = ['taches', 'routines', 'messages', 'anniversaires', 'menu', 'voyages'] as const;

/** Le socle proposé à la création d'une fiche enfant (D-06) : sans messages. */
export const CHILD_DEFAULT_MODULES = ['taches', 'routines', 'anniversaires', 'menu'] as const;

/** Ligne retournée par `create_managed_child_profile` (jsonb, 0146+0154). */
export interface ChildProfileCreation {
  id: string;
  household_id: string;
  display_name: string;
  color_tag: MemberColorTag;
  role: Role;
  birth_date: string | null;
  avatar_url: string | null;
  managed_modules: string[];
}

export interface ChildProfileInput {
  displayName: string;
  colorTag: MemberColorTag;
  birthDate: string | null;
  avatarUrl: string | null;
}

const assertChildName = (displayName: string): string => {
  const name = displayName.trim();
  if (name.length < 2) throw new Error('Indiquez au moins deux caractères.');
  if (name.length > 120) throw new Error('120 caractères maximum.');
  return name;
};

const rejectIfChildModulesOutOfRange = (modules: string[]): void => {
  const unknown = modules.filter((key) => !(CHILD_MANAGEABLE_MODULES as readonly string[]).includes(key));
  if (unknown.length > 0) {
    // 22023 côté serveur : la clé morte ne part jamais sur le réseau.
    throw new Error(`Espaces d'enfant : clé hors du périmètre 0146 (refusée : ${unknown.join(', ')}).`);
  }
};

/**
 * Crée une fiche enfant sans compte : le serveur pose le socle D-06 et rend
 * la jsonb de la ligne créée. Le nom est borné localement pour ne pas partir
 * en réseau pour un refus prévisible.
 */
export async function saveChildProfile(householdId: string, values: ChildProfileInput): Promise<ChildProfileCreation> {
  const displayName = assertChildName(values.displayName);
  if (isSupabaseConfigured && supabase) {
    const { data: creation, error } = await supabase.rpc('create_managed_child_profile', {
      p_household_id: householdId,
      p_display_name: displayName,
      p_color_tag: values.colorTag,
      p_birth_date: values.birthDate,
      p_avatar_url: values.avatarUrl,
    });
    if (error) throw new Error(error.message || 'Création de la fiche enfant impossible.');
    const row = (creation ?? {}) as Partial<ChildProfileCreation>;
    // Le socle D-06 est posé en base ; le repli ici couvre un jsonb ancien.
    return {
      id: row.id ?? '',
      household_id: row.household_id ?? householdId,
      display_name: row.display_name ?? displayName,
      color_tag: row.color_tag ?? values.colorTag,
      role: 'enfant',
      birth_date: row.birth_date ?? values.birthDate,
      avatar_url: row.avatar_url ?? values.avatarUrl,
      managed_modules: row.managed_modules ?? [...CHILD_DEFAULT_MODULES],
    };
  }
  const row: HouseholdMemberRow = {
    id: randomId('member'),
    household_id: householdId,
    user_id: null,
    display_name: displayName,
    avatar_url: values.avatarUrl,
    color_tag: values.colorTag,
    role: 'enfant',
    birth_date: values.birthDate,
    // Démo : le socle est posé ici, comme la base le fait en connecté.
    managed_modules: [...CHILD_DEFAULT_MODULES],
    deleted_at: null,
    created_at: new Date().toISOString(),
  };
  await data.create<HouseholdMemberRow>('household_members', row);
  return {
    id: row.id,
    household_id: row.household_id,
    display_name: row.display_name,
    color_tag: row.color_tag,
    role: 'enfant',
    birth_date: row.birth_date,
    avatar_url: row.avatar_url,
    managed_modules: [...row.managed_modules],
  };
}

/**
 * Met à jour la fiche : nom, couleur, date de naissance. La base écrase
 * `birth_date` SANS coalesce — l'appelant renvoie donc TOUJOURS la valeur
 * courante, modifiée ou non (voir 0146, `update_managed_child_profile`).
 */
export async function updateChildProfile(memberId: string, values: ChildProfileInput): Promise<void> {
  const displayName = assertChildName(values.displayName);
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('update_managed_child_profile', {
      p_member_id: memberId,
      p_display_name: displayName,
      p_color_tag: values.colorTag,
      p_birth_date: values.birthDate,
      p_avatar_url: values.avatarUrl,
      // 0154 : la fiche sait supprimer l'avatar — l'UI demande la suppression
      // quand la valeur saisie est explicitement vidée (null), sinon null
      // signifie « ne pas toucher ».
      p_clear_avatar: values.avatarUrl === null,
      p_managed_modules: null,
    });
    if (error) throw new Error(error.message || 'Mise à jour de la fiche impossible.');
    return;
  }
  await data.update<HouseholdMemberRow>('household_members', memberId, {
    display_name: displayName,
    color_tag: values.colorTag,
    birth_date: values.birthDate,
    avatar_url: values.avatarUrl,
  });
}

/**
 * Choisit les espaces servis à CET enfant. Le choix est borné localement aux
 * CINQ clés de 0146 : une clé hors périmètre échoue ici, jamais sur le réseau.
 * L'écriture porte la LIGNE MEMBRE (`p_managed_modules`) — jamais `households`
 * (D-05) — et renvoie la date de naissance et la photo courantes car la base
 * réécrit ces colonnes sans coalesce.
 */
export async function setManagedModules(
  memberId: string,
  modules: string[],
  current: { birthDate: string | null; avatarUrl: string | null },
): Promise<void> {
  rejectIfChildModulesOutOfRange(modules);
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('update_managed_child_profile', {
      p_member_id: memberId,
      // Nom et couleur inchangés : la base garde la valeur courante (coalesce).
      p_display_name: null,
      p_color_tag: null,
      p_birth_date: current.birthDate,
      p_avatar_url: current.avatarUrl,
      p_managed_modules: modules,
    });
    if (error) throw new Error(error.message || 'Enregistrement des espaces impossible.');
    return;
  }
  await data.update<HouseholdMemberRow>('household_members', memberId, { managed_modules: modules });
}

/**
 * Archive la fiche (deleted_at) : D-04, jamais un delete — les cascades 0003
 * purgeraient l'historique. Le serveur (0146) revérifie adulte + enfant géré.
 */
export async function archiveChildProfile(memberId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('archive_managed_child_profile', { p_member_id: memberId });
    if (error) throw new Error(error.message || 'Suppression de la fiche impossible.');
    return;
  }
  await data.update<HouseholdMemberRow>('household_members', memberId, {
    deleted_at: new Date().toISOString(),
  });
}

/**
 * Fusionne la fiche enfant dans le compte adulte du même foyer (0148, D-19) :
 * réattribution de tout l'historique puis suppression de la ligne enfant.
 * Irréversible — l'appelant affiche une confirmation explicite avant l'appel.
 */
export async function linkChildToAccount(childMemberId: string, accountMemberId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour relier une fiche à un compte.');
  }
  const { error } = await supabase.rpc('link_managed_child', {
    p_child_member_id: childMemberId,
    p_account_member_id: accountMemberId,
  });
  if (error) throw new Error(error.message || 'Liaison du compte impossible.');
}

/**
 * D-21 : donner accès à un enfant = lui créer un compte réel via le lien
 * d'invitation du foyer. Le brut n'est relu que s'il est encore rappelable
 * (même foyer, même token actif) ; sinon null — la fiche renvoie vers la
 * section Inviter plutôt que de deviner un token.
 */
export async function giveChildAccess(householdId: string): Promise<string | null> {
  const saved = recallInviteToken();
  if (!saved || saved.householdId !== householdId) return null;
  const summary = await getInviteTokenSummary();
  if (!isRecallValid(saved, summary)) return null;
  return `${window.location.origin}/foyer/rejoindre?token=${encodeURIComponent(saved.token)}`;
}

/**
 * Change le rôle d'un membre : opération serveur (`public.set_member_role`,
 * migration 0036), jamais une écriture directe — seule la fonction vérifie
 * qu'on ne rétrograde pas le dernier administrateur. En mode local, écriture
 * directe (pas de RLS).
 */
export async function setMemberRole(memberId: string, role: Role): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role });
      if (error) throw new Error(error.message || 'Changement de rôle impossible.');
      return;
    } catch (requestError) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Hors ligne : reconnectez-vous pour changer un rôle.');
      }
      throw requestError instanceof Error ? requestError : new Error('Changement de rôle impossible.');
    }
  }
  await data.update('household_members', memberId, { role });
}

/** Renomme la ligne foyer d'un membre : réservé à l'administrateur par la RLS. */
export async function renameMember(memberId: string, displayName: string): Promise<void> {
  const name = displayName.trim();
  if (name.length < 2) throw new Error('Indiquez au moins deux caractères.');
  if (name.length > 120) throw new Error('120 caractères maximum.');
  await data.update('household_members', memberId, { display_name: name });
}

export interface HouseholdDeleteResult {
  household_id: string;
  expenses: number;
  storage_objects: number;
  storage_cleanup: 'ok' | 'partial';
}

/**
 * Supprime le foyer et tout son contenu, via l'Edge Function
 * `household-delete` (RPC serveur + nettoyage Storage). Action réservée à
 * l'administrateur, revérifiée en base. Irréversible : l'appelant affiche
 * une confirmation explicite avant tout appel.
 */
export async function deleteHousehold(householdId: string): Promise<HouseholdDeleteResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour supprimer le foyer.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Hors ligne : reconnectez-vous pour supprimer le foyer.');
  }
  const { data: body, error, response } = await supabase.functions.invoke('household-delete', {
    body: { householdId },
  });
  if (error) {
    throw new Error(await readFunctionError(response, 'Suppression du foyer impossible pour le moment.'));
  }
  return body as HouseholdDeleteResult;
}

async function readFunctionError(response: Response | undefined, fallback: string): Promise<string> {
  if (response) {
    try {
      const parsed = (await response.clone().json()) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Corps vide ou non JSON : repli générique ci-dessous.
    }
  }
  return fallback;
}

/**
 * Export RGPD (phase 26, migration 0158). Le déclencheur passe par le RPC
 * serveur `request_gdpr_export` : l'acteur est résolu en base via `auth.uid()`
 * (jamais un paramètre du client) et l'unicité d'un job actif (D-06) est
 * tenue par l'index unique partiel. AUCUN repli démo : le job vit côté
 * serveur uniquement, comme `linkChildToAccount`.
 */
export async function requestGdprExport(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour demander votre export.');
  }
  const { error } = await supabase.rpc('request_gdpr_export');
  if (error) throw new Error(error.message || 'Demande d’export impossible.');
}

/**
 * Historique des exports du membre : lecture RLS de `gdpr_export_jobs`
 * (politique `gdpr_export_jobs_select_own`, 0158) — la base ne rend que les
 * lignes du demandeur, le tri « plus récent d'abord » est demandé ici (D-07).
 */
export async function fetchGdprExports(): Promise<GdprExportJobRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour consulter vos exports.');
  }
  const { data, error } = await supabase
    .from('gdpr_export_jobs')
    .select('id,status,storage_path,error,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Historique des exports indisponible.');
  return (data ?? []) as GdprExportJobRow[];
}

/**
 * Lien signé de téléchargement, calculé AU CLIC uniquement (D-04/RGEX-01) :
 * TTL de 86 400 s (24 h maximum — jamais la valeur 30 j de l'ardoise),
 * politique Storage `gdpr_exports_read` (0158) évaluée côté storage-api à la
 * signature. La valeur n'est ni persistée ni envoyée hors de l'écran export.
 */
export async function signGdprExportDownload(storagePath: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour télécharger votre export.');
  }
  const { data, error } = await supabase.storage.from('gdpr-exports').createSignedUrl(storagePath, 86400);
  if (error || !data?.signedUrl) throw new Error('Lien de téléchargement indisponible pour le moment.');
  return data.signedUrl;
}

/**
 * Suppression de compte RGPD (phase 27, migrations 0166/0167). Toute écriture
 * passe par les RPC serveur — la base fait foi (instantané D-04,
 * déshumanisation D-01/02/03, demande D-06) — AUCUNE écriture directe des
 * tables `account_deletion_*`. L'orchestration rpc → Edge vit ICI, dans CET
 * ordre, et signale honnêtement une erreur si l'étape Edge échoue (D-02,
 * jamais d'échec silencieux) : la demande est alors déjà enregistrée, seule
 * la coupure des sessions / l'e-mail ont manqué.
 */
export interface AccountDeletionResult {
  request_id: string;
  sessions_revoked: boolean;
  email_sent: boolean;
  email_error?: string;
}

export async function requestAccountDeletion(): Promise<AccountDeletionResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour demander la suppression de votre compte.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Hors ligne : reconnectez-vous pour demander la suppression.');
  }
  // 1. Le RPC 0167 enregistre la demande (et déshumanise la surface publique).
  //    Le paramètre `p_user_id` est posé en texte : la base refuse tout acteur
  //    autre que `auth.uid()` (42501), jamais cru.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Connectez-vous pour demander la suppression de votre compte.');
  const { data: requestId, error: rpcError } = await supabase.rpc('request_account_deletion', {
    p_user_id: user.id,
  });
  if (rpcError) throw new Error(rpcError.message || 'Demande de suppression impossible.');
  if (typeof requestId !== 'string' || requestId === '') {
    throw new Error('Demande de suppression impossible.');
  }

  // 2. L'Edge unifiée mode 'compte' : kill global des sessions + e-mail de
  //    confirmation avec lien d'annulation. Si elle échoue, la demande reste
  //    enregistrée — l'erreur le dit, sans mentir sur le premier pas.
  try {
    const { data: body, error, response } = await supabase.functions.invoke('household-delete', {
      body: { mode: 'compte' },
    });
    if (error) {
      throw new Error(await readFunctionError(response, 'Coupure des sessions impossible pour le moment.'));
    }
    const result = (body ?? {}) as Partial<AccountDeletionResult>;
    return {
      request_id: requestId,
      sessions_revoked: result.sessions_revoked === true,
      email_sent: result.email_sent === true,
      ...(typeof result.email_error === 'string' ? { email_error: result.email_error } : {}),
    };
  } catch (edgeError) {
    throw new Error(
      edgeError instanceof Error
        ? `Demande enregistrée, mais l'e-mail et la coupure des sessions ont échoué : ${edgeError.message}`
        : 'Demande enregistrée, mais l’e-mail et la coupure des sessions ont échoué.',
    );
  }
}

/** Annule la demande (restauration D-05 côté base) : RPC pur. */
export async function cancelAccountDeletion(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour annuler la demande.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Connectez-vous pour annuler la demande.');
  const { error } = await supabase.rpc('cancel_account_deletion', { p_user_id: user.id });
  if (error) throw new Error(error.message || 'Annulation de la demande impossible.');
}

/**
 * Demande active du membre : lecture RLS `account_deletion_requests_select_own`
 * (0166) — la base ne rend que les siennes. La plus récente d'abord.
 */
export async function fetchAccountDeletionRequests(): Promise<AccountDeletionRequestRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour consulter votre demande.');
  }
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('id,status,created_at,purge_due_at,rappel_envoye')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Demande de suppression indisponible.');
  return (data ?? []) as AccountDeletionRequestRow[];
}
