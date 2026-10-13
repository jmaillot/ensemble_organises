/**
 * Accès aux données des Voyages via l'adaptateur actif (PostgREST + RLS en
 * ligne, IndexedDB hors ligne). Les tâches du foyer servent d'indicateur
 * « éléments à préparer », faute de liste de préparation dédiée.
 */

import { data } from '@/lib/data';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type { NoteRow, PlaceRow, ShoppingListItemRow, ShoppingListRow, TaskRow, TripGuestRow, TripMemberRow, TripRow } from '@/types';
import { randomId } from '@/lib/utils';
import { DEFAULT_TRIP_COVER, tabStateFromEnabled, type TabState, type TripInput } from './types';

function requireHousehold(householdId: string | null): string {
  if (!householdId) throw new Error('Aucun foyer sélectionné.');
  return householdId;
}

/** Charge utile renvoyée à PostgreSQL (clés `snake_case`). */
export function toTripPayload(householdId: string, input: TripInput): Partial<TripRow> {
  return {
    household_id: householdId,
    name: input.name.trim(),
    destination: input.destination.trim() || input.name.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    cover_photo: input.coverPhoto || DEFAULT_TRIP_COVER,
    notes: input.notes.trim() || null,
  } as Partial<TripRow>;
}

export function listTrips(householdId: string | null): Promise<TripRow[]> {
  return data.list<TripRow>('trips', { household_id: requireHousehold(householdId) });
}

export function listTasks(householdId: string | null): Promise<TaskRow[]> {
  return data.list<TaskRow>('tasks', { household_id: requireHousehold(householdId) });
}

/**
 * Tâches du foyer (phase 15) : les lignes propres à un voyage (`trip_id`
 * renseigné) ne comptent pas dans les indicateurs du foyer — le régime
 * historique ne voit que les lignes `trip_id NULL` (15-01).
 */
export function householdTasksOf(rows: TaskRow[]): TaskRow[] {
  return rows.filter((row) => row.trip_id == null);
}

export interface TripMutationArgs {
  /** Identifiant préparé par l'appelant (publication optimiste). */
  id: string;
  householdId: string;
  input: TripInput;
}

export async function createTrip({ id, householdId, input }: TripMutationArgs): Promise<TripRow> {
  return data.create<TripRow>('trips', {
    id,
    ...toTripPayload(householdId, input),
    created_at: new Date().toISOString(),
  } as Partial<TripRow>);
}

export async function updateTrip({ id, householdId, input }: TripMutationArgs): Promise<TripRow> {
  return data.update<TripRow>('trips', id, toTripPayload(householdId, input) as Partial<TripRow>);
}

export function deleteTrip(id: string): Promise<void> {
  return data.remove('trips', id);
}

/**
 * Couverture téléversable (D-11) : comme les photos de lieux, la colonne
 * `cover_photo` porte le CHEMIN bucket pour les nouveaux dépôts, et l'URL
 * courte est forgée à la lecture. Les URL http(s) et les actifs `/…`
 * hérités rendent tels quels (aucun ré-upload forcé des lignes existantes).
 * RLS et politiques Storage inchangées : même bucket, même préfixe foyer
 * (0010 ne contraint que le premier segment du chemin).
 */
export const TRIP_COVERS_BUCKET = 'household-media';
/** Courte (1 h) : même régime que les photos de lieux et les pièces prestataires. */
const TRIP_COVER_URL_TTL = 60 * 60;

/**
 * Vrai quand la valeur stockée est un chemin bucket à forger : ni URL
 * http(s) (saisie manuelle ou signée héritée), ni aperçu local `blob:`, ni
 * ressource applicative `/…`, ni `data:` hérité.
 */
export function isTripCoverPath(stored: string): boolean {
  return !/^(https?:\/\/|blob:|data:|\/)/i.test(stored);
}

/** Chemin bucket d'une valeur stockée, `null` pour les autres formes. */
export function tripCoverPathOf(stored: string | null): string | null {
  if (!stored) return null;
  return isTripCoverPath(stored) ? stored : null;
}

/**
 * Forge la couverture affichable (forme invité 06-04 : échec fermé). Les
 * formes non-chemin rendent telles quelles ; un chemin se forge en URL
 * courte ; tout échec de forge donne `null` (jamais de lien mort vers le
 * héros — la garde D-06 ne rend alors aucune image).
 */
export async function resolveTripCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored || !isTripCoverPath(stored)) return stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from(TRIP_COVERS_BUCKET)
      .createSignedUrl(stored, TRIP_COVER_URL_TTL);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque couverture en URL affichable, en une passe (échec fermé par voyage). */
export async function resolveTripCoverUrls(rows: { id: string; cover_photo: string | null }[]): Promise<Record<string, string>> {
  const entries = await Promise.all(rows.map(async (row) => [row.id, await resolveTripCoverUrl(row.cover_photo)] as const));
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

/**
 * Dépose la couverture d'un voyage dans le bucket (`depositHouseholdFile`
 * compresse déjà les images, motif partagé) et renvoie la valeur à stocker :
 * le chemin en mode Supabase, l'aperçu local éphémère en démo.
 */
export async function uploadTripCover(householdId: string, tripId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `trips/${tripId}`, file });
  return deposited.path ?? deposited.url;
}

/** Supprime le fichier d'une couverture (no-op pour les autres formes). */
export function deleteTripCover(stored: string | null): Promise<void> {
  const path = tripCoverPathOf(stored);
  if (path) return removeHouseholdFile(path).catch(() => undefined);
  return Promise.resolve();
}

/* ------------------------------------------------------------------ */
/* Espace voyage (phase 15) : création atomique + fiche via l'Edge      */
/* `trip-invite`, lectures RLS via l'adaptateur.                       */
/*                                                                     */
/* La création ne passe JAMAIS par `data.create('trips')` : l'atomicité */
/* (voyage + participants + ardoise liée) vit côté serveur (RPC        */
/* `create_trip_atomic`, 15-01). En démo (backend absent), le repli     */
/* local rejoue les mêmes lignes pour que le parcours reste prouvable. */
/* ------------------------------------------------------------------ */

/** Appel session attachée vers l'Edge `trip-invite` (miroir gift-list-invite). */
async function callTripInvite<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/trip-invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Opération impossible.');
  }
  return (await response.json()) as T;
}

/** Appel sans session (invités externes) : le ticket/code EST le contrôle d'accès. */
async function callTripInvitePublishable<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
  try {
    const session = (await supabase?.auth.getSession())?.data.session ?? null;
    if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
  } catch {
    // Stockage de session illisible : on part sans jeton (chemin visiteur).
  }
  const response = await fetch(`${supabaseFunctionsBase}/trip-invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Opération impossible.');
  }
  return (await response.json()) as T;
}

export interface CreateTripViaEdgeArgs {
  householdId?: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes?: string;
  memberIds?: string[];
  tabState?: TabState;
}

/**
 * Création atomique via l'Edge `create-trip` : le serveur génère l'id, crée
 * les participants (0119 : toute la famille, enfants compris — ardoise liée
 * aux adultes seuls) et l'ardoise liée dans la même transaction. L'identité
 * vient du JWT, jamais d'un id passé.
 */
export async function createTripViaEdge(args: CreateTripViaEdgeArgs): Promise<{ tripId: string; ardoiseId: string }> {
  const created = await callTripInvite<{ trip_id: string; ardoise_id: string }>('create-trip', {
    name: args.name.trim(),
    destination: (args.destination.trim() || args.name.trim()),
    startDate: args.startDate,
    endDate: args.endDate,
    ...(args.notes?.trim() ? { notes: args.notes.trim() } : {}),
    ...(args.householdId ? { householdId: args.householdId } : {}),
    ...(args.memberIds ? { memberIds: args.memberIds } : {}),
    ...(args.tabState ? { tabState: args.tabState } : {}),
  });
  return { tripId: created.trip_id, ardoiseId: created.ardoise_id };
}

export interface CreateTripFlowArgs {
  householdId: string;
  input: TripInput;
  /** Membre courant (modération `created_by`) : ignoré côté serveur (JWT). */
  createdByMemberId?: string | null;
}

/**
 * Parcours de création complet (couverture + lignes) :
 * - backend configuré : Edge `create-trip`, puis dépôt/téléversement de la
 *   couverture et mise à jour méta (la ligne existe déjà, aucun orphelin) ;
 * - démo : mêmes lignes rejouées en local (voyage + participants + ardoise
 *   liée + inscriptions miroirs), dépôt-puis-écriture comme `save`.
 * Renvoie l'id du voyage pour naviguer vers sa fiche.
 */
export async function createTripFlow({ householdId, input, createdByMemberId }: CreateTripFlowArgs): Promise<string> {
  const name = input.name.trim();
  const destination = input.destination.trim() || name;
  const tabState = tabStateFromEnabled(input.enabledTabs ?? []);
  if (isSupabaseConfigured) {
    const { tripId } = await createTripViaEdge({
      householdId,
      name,
      destination,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      memberIds: input.participantIds,
      tabState,
    });
    if (input.coverFile) {
      try {
        const coverPhoto = await uploadTripCover(householdId, tripId, input.coverFile);
        await updateTripMeta(tripId, { cover_photo: coverPhoto });
      } catch (uploadError) {
        const path = tripCoverPathOf(input.coverPhoto);
        if (path) await deleteTripCover(path);
        throw uploadError instanceof Error ? uploadError : new Error('Couverture impossible.');
      }
    } else if (input.coverPhoto && input.coverPhoto !== DEFAULT_TRIP_COVER) {
      await updateTripMeta(tripId, { cover_photo: input.coverPhoto });
    }
    return tripId;
  }
  const tripId = randomId('trip');
  let coverPhoto = input.coverPhoto;
  let depositedPath: string | null = null;
  if (input.coverFile) {
    coverPhoto = await uploadTripCover(householdId, tripId, input.coverFile);
    depositedPath = tripCoverPathOf(coverPhoto);
  }
  // L'ardoise liée est rejouée en démo pour que la fiche (onglet Budget,
  // tâche 2/15-03) trouve les mêmes lignes que le serveur produit.
  const ardoiseId = randomId('ardoise');
  try {
    await data.create<TripRow>('trips', {
      id: tripId,
      household_id: householdId,
      name,
      destination,
      start_date: input.startDate,
      end_date: input.endDate,
      cover_photo: coverPhoto,
      notes: input.notes.trim() || null,
      created_by: createdByMemberId ?? null,
      tab_state: tabState,
      is_closed: false,
      created_at: new Date().toISOString(),
    } as Partial<TripRow>);
    for (const memberId of input.participantIds ?? []) {
      await data.create<TripMemberRow>('trip_members', { trip_id: tripId, member_id: memberId } as Partial<TripMemberRow>);
    }
    await data.create('ardoises', {
      id: ardoiseId,
      household_id: householdId,
      name,
      created_by: createdByMemberId ?? null,
      trip_id: tripId,
    } as never);
    for (const memberId of input.participantIds ?? []) {
      await data.create('ardoise_members', { ardoise_id: ardoiseId, member_id: memberId } as never);
    }
    return tripId;
  } catch (error) {
    if (depositedPath) await deleteTripCover(depositedPath);
    await data.remove('trips', tripId).catch(() => undefined);
    await data.removeWhere('trip_members', { trip_id: tripId }).catch(() => undefined);
    await data.removeWhere('ardoises', { trip_id: tripId }).catch(() => undefined);
    await data.removeWhere('ardoise_members', { ardoise_id: ardoiseId }).catch(() => undefined);
    throw error instanceof Error ? error : new Error('Création impossible.');
  }
}

/** Lecture d'un voyage (RLS : un non-membre reçoit `null`, jamais une coquille vide). */
export async function fetchTripRow(tripId: string): Promise<TripRow | null> {
  const rows = await data.list<TripRow>('trips', { id: tripId });
  return rows.find((row) => row.id === tripId) ?? null;
}

/** Participants d'un voyage (RLS : vide pour un non-membre). */
export function fetchTripMembers(tripId: string): Promise<TripMemberRow[]> {
  return data.list<TripMemberRow>('trip_members', { trip_id: tripId });
}

/** Invités externes d'un voyage (RLS : vide pour un non-membre). */
export function fetchTripGuests(tripId: string): Promise<TripGuestRow[]> {
  return data.list<TripGuestRow>('trip_guests', { trip_id: tripId });
}

/**
 * Mise à jour méta d'un voyage (infos + `tab_state`, jamais `is_closed` ni
 * `created_by` — le trigger serveur refuse, la fermeture passe par l'Edge).
 */
export function updateTripMeta(tripId: string, patch: Partial<TripRow>): Promise<TripRow> {
  const { is_closed: _closed, created_by: _author, id: _id, household_id: _household, created_at: _created, ...safe } = patch;
  return data.update<TripRow>('trips', tripId, safe as Partial<TripRow>);
}

/** Départ volontaire (Edge `member-leave`, identité résolue en base). */
export async function leaveTrip(tripId: string): Promise<void> {
  await callTripInvite('member-leave', { tripId });
}

/* ------------------------------------------------------------------ */
/* Rubrique Membres (0120) : cochage par les admins du foyer seuls.    */
/*                                                                     */
/* En ligne : Edge `member-add` / `member-remove` (RPC 0120, admin     */
/* seul, jamais le dernier). En démo : mêmes lignes rejouées en local */
/* (voyage + miroir ardoise adultes seuls, comme `createTripFlow`).    */
/* ------------------------------------------------------------------ */

/** Coche un membre du foyer comme participant (idempotent, admin seul en ligne). */
export async function addTripMember(tripId: string, memberId: string): Promise<void> {
  if (isSupabaseConfigured) {
    await callTripInvite('member-add', { tripId, memberId });
    return;
  }
  const existing = await data.list<{ member_id: string }>('trip_members', { trip_id: tripId });
  if (existing.some((entry) => entry.member_id === memberId)) return;
  await data.create('trip_members', { trip_id: tripId, member_id: memberId });
  const role = (await data.list<{ id: string; role: string }>('household_members', { id: memberId }))[0]?.role;
  if (role === 'admin' || role === 'membre') {
    const ardoises = await data.list<{ id: string }>('ardoises', { trip_id: tripId }).catch(() => []);
    const ardoiseId = ardoises[0]?.id;
    if (ardoiseId) {
      await data.create('ardoise_members', { ardoise_id: ardoiseId, member_id: memberId }).catch(() => undefined);
    }
  }
}

/** Décoche un participant (admin seul en ligne, jamais le dernier — garde RPC). */
export async function removeTripMember(tripId: string, memberId: string): Promise<void> {
  if (isSupabaseConfigured) {
    await callTripInvite('member-remove', { tripId, memberId });
    return;
  }
  const remaining = (await data.list<{ member_id: string }>('trip_members', { trip_id: tripId })).filter(
    (entry) => entry.member_id !== memberId,
  );
  if (remaining.length === 0) throw new Error('Le voyage garde au moins un participant.');
  await data.removeWhere('trip_members', { trip_id: tripId, member_id: memberId });
  const ardoises = await data.list<{ id: string }>('ardoises', { trip_id: tripId }).catch(() => []);
  const ardoiseId = ardoises[0]?.id;
  if (ardoiseId) {
    await data.removeWhere('ardoise_members', { ardoise_id: ardoiseId, member_id: memberId }).catch(() => undefined);
  }
}

/**
 * Fermeture douce (D-08) : fige sans détruire, via l'Edge `close` (jamais en
 * PostgREST direct — le trigger serveur refuse `is_closed` au client).
 */
export async function closeTrip(tripId: string): Promise<void> {
  await callTripInvite('close', { tripId });
}

/** Réouverture (D-08) : admin du foyer seul, via l'Edge `reopen`. */
export async function reopenTrip(tripId: string): Promise<void> {
  await callTripInvite('reopen', { tripId });
}

export interface SaveTripMetaArgs {
  tripId: string;
  householdId: string;
  input: TripInput;
  previousCover: string | null;
}

/**
 * Enregistrement méta (Paramètres) : dépôt-puis-écriture comme `save`, sans
 * optimisme (la fiche relit après). Ne touche jamais `is_closed` ni
 * `created_by` (bandeau figé + trigger serveur).
 */
export async function saveTripMeta({ tripId, householdId, input, previousCover }: SaveTripMetaArgs): Promise<TripRow> {
  let coverPhoto = input.coverPhoto;
  let depositedPath: string | null = null;
  if (input.coverFile) {
    coverPhoto = await uploadTripCover(householdId, tripId, input.coverFile);
    depositedPath = tripCoverPathOf(coverPhoto);
  }
  try {
    const updated = await updateTripMeta(tripId, {
      name: input.name.trim(),
      destination: input.destination.trim() || input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      cover_photo: coverPhoto,
      notes: input.notes.trim() || null,
    });
    if (previousCover && previousCover !== coverPhoto) await deleteTripCover(previousCover);
    return updated;
  } catch (error) {
    if (depositedPath) await deleteTripCover(depositedPath);
    throw error instanceof Error ? error : new Error('Enregistrement impossible.');
  }
}

/* ------------------------------------------------------------------ */
/* Compteurs Infos (phase 15, tâche 2) : chaque chiffre vient d'une     */
/* lecture réelle, jamais d'une valeur décorative. `null` = illisible   */
/* (RLS) : la fiche l'avoue au lieu d'inventer un zéro.                */
/* ------------------------------------------------------------------ */

export interface TripCounts {
  lists: number | null;
  notes: number | null;
  tasks: number | null;
  places: number | null;
  ardoiseId: string | null;
  expenseCount: number | null;
  /** Total des dépenses de l'ardoise liée, en euros. */
  expenseTotal: number | null;
}

async function countOrNull(table: string, filter: Record<string, string>): Promise<number | null> {
  try {
    return (await data.list(table, filter)).length;
  } catch {
    return null;
  }
}

/**
 * Compteurs d'un voyage : lignes tripées + ardoise liée (dépenses via leur
 * ardoise, jamais de `trip_id` direct sur expenses — D-02).
 */
export async function fetchTripCounts(tripId: string): Promise<TripCounts> {
  const [lists, notes, tasks, places] = await Promise.all([
    countOrNull('shopping_lists', { trip_id: tripId }),
    countOrNull('notes', { trip_id: tripId }),
    countOrNull('tasks', { trip_id: tripId }),
    countOrNull('places', { trip_id: tripId }),
  ]);
  try {
    const ardoises = await data.list<{ id: string }>('ardoises', { trip_id: tripId });
    const ardoiseId = ardoises[0]?.id ?? null;
    if (!ardoiseId) return { lists, notes, tasks, places, ardoiseId: null, expenseCount: null, expenseTotal: null };
    const expenses = await data.list<{ amount: number | string }>('expenses', { ardoise_id: ardoiseId });
    return {
      lists,
      notes,
      tasks,
      places,
      ardoiseId,
      expenseCount: expenses.length,
      expenseTotal: expenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    };
  } catch {
    return { lists, notes, tasks, places, ardoiseId: null, expenseCount: null, expenseTotal: null };
  }
}

/* ------------------------------------------------------------------ */
/* Partage par code (miroir gift-share-dialog, D-09)                    */
/* ------------------------------------------------------------------ */

/** Lien à envoyer à l'externe : affiché une seule fois avec le code. */
export function tripInviteLink(code: string): string {
  return `/invitation/voyage?code=${encodeURIComponent(code)}`;
}

export interface TripInviteCode {
  code: string;
  expiresAt: string | null;
  maxUses: number;
  tripId: string;
}

export interface TripInviteSummary {
  tripId: string;
  isActive: boolean;
  hasCode: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}

/** Génère (ou régénère, invalidant le précédent) le code d'un voyage. */
export async function createTripInviteCode(tripId: string): Promise<TripInviteCode> {
  const created = await callTripInvite<TripInviteCode>('create', { tripId });
  writeTripCode(tripId, created.code);
  return created;
}

/** Arrête le partage : le code ne passe plus, l'historique reste. */
export async function revokeTripInviteCode(tripId: string): Promise<void> {
  await callTripInvite('revoke', { tripId });
  clearTripCode(tripId);
}

export async function fetchTripInviteSummary(tripId: string): Promise<TripInviteSummary | null> {
  if (!isSupabaseConfigured) return null;
  return callTripInvite<TripInviteSummary | null>('summary', { tripId });
}

/* ------------------------------------------------------------------ */
/* Code de partage mémorisé (0121) : le code brut n'est rendu qu'à sa  */
/* génération — le dialogue le conserve sur CET appareil pour réafficher */
/* QR + lien sans régénérer (qui invaliderait le précédent). Un code    */
/* régénéré ailleurs rend le lien mémorisé caduc : la régénération      */
/* reste proposée, et l'arrêt du partage efface la mémoire.            */
/* ------------------------------------------------------------------ */

export const tripCodeStorageKey = (tripId: string): string => `eo:trip:code:${tripId}`;

export function readTripCode(tripId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(tripCodeStorageKey(tripId));
    const trimmed = stored?.trim() ?? '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeTripCode(tripId: string, code: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(tripCodeStorageKey(tripId), code.trim());
  } catch {
    // Stockage plein ou bloqué : le code reste affiché, sans mémoire.
  }
}

export function clearTripCode(tripId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(tripCodeStorageKey(tripId));
  } catch {
    // Décoratif : un code restant ne fait qu'afficher un lien caduc.
  }
}

/**
 * Échange membre (compte du même foyer) : idempotent, sans pseudonyme.
 * Hors foyer, le serveur répond 403 avec la consigne invitée.
 */
export async function joinTripWithCode(code: string): Promise<{ trip_id: string; already_member: boolean }> {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Un code fait au moins 22 caractères.');
  return callTripInvite('join', { code: trimmed });
}

/* ------------------------------------------------------------------ */
/* Invités externes (ticket, D-01/D-09)                                 */
/*                                                                     */
/* Le ticket brut vit dans `localStorage["eo:trip:ticket:<tripId>"]` :  */
/* seule credence, transmise à l'Edge seule — aucun PostgREST invité.  */
/* ------------------------------------------------------------------ */

export const tripTicketStorageKey = (tripId: string): string => `eo:trip:ticket:${tripId}`;

export function readTripTicket(tripId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(tripTicketStorageKey(tripId));
    const trimmed = stored?.trim() ?? '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeTripTicket(tripId: string, ticket: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(tripTicketStorageKey(tripId), ticket.trim());
  } catch {
    // Stockage plein ou bloqué : l'échange a réussi, on n'échoue pas pour ça.
  }
}

export function clearTripTicket(tripId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(tripTicketStorageKey(tripId));
  } catch {
    // Décoratif : le ticket restant ne donne que la vue invitée.
  }
}

function assertTripCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Un code fait au moins 22 caractères.');
  return trimmed;
}

function assertTripDisplayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) throw new Error('Indiquez un pseudonyme (1 à 120 caractères).');
  return trimmed;
}

/** Échange invité : code + pseudonyme contre un ticket (seule credence). */
export async function redeemTripGuest(code: string, displayName: string): Promise<{ tripId: string; ticket: string }> {
  const redeemed = await callTripInvitePublishable<{ trip_id: string; guest_ticket: string }>('redeem-guest', {
    code: assertTripCode(code),
    displayName: assertTripDisplayName(displayName),
  });
  return { tripId: redeemed.trip_id, ticket: redeemed.guest_ticket };
}

export interface TripGuestView {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverPhoto: string | null;
  notes: string | null;
  isClosed: boolean;
  displayName: string | null;
}

function toTripGuestView(entry: unknown): TripGuestView {
  const row = (entry ?? {}) as Record<string, unknown>;
  const trip = (row.trip ?? {}) as Record<string, unknown>;
  const guest = (row.guest ?? null) as { display_name?: unknown } | null;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value : null;
  return {
    id: String(trip.id ?? ''),
    name: String(trip.name ?? ''),
    destination: String(trip.destination ?? ''),
    startDate: String(trip.startDate ?? ''),
    endDate: String(trip.endDate ?? ''),
    coverPhoto: text(trip.coverPhoto),
    notes: text(trip.notes),
    isClosed: trip.isClosed === true,
    displayName: typeof guest?.display_name === 'string' ? guest.display_name : null,
  };
}

/** Vue invitée sous ticket (lecture seule, sans conso `use_count`). */
export async function fetchTripGuestView(ticket: string): Promise<TripGuestView> {
  const trimmed = ticket.trim();
  if (!trimmed) throw new Error('Ticket invalide.');
  const view = await callTripInvitePublishable<unknown>('guest-view', { ticket: trimmed });
  return toTripGuestView(view);
}

/** Vue anonyme par lien (code vérifié actif, sans ticket ni nom). */
export async function fetchTripLinkView(code: string): Promise<TripGuestView> {
  const view = await callTripInvitePublishable<unknown>('link-view', { code: assertTripCode(code) });
  return toTripGuestView(view);
}

/* ------------------------------------------------------------------ */
/* Onglets du voyage (phase 15, 15-03) : fourches à filtre `tripId`     */
/*                                                                     */
/* Chaque onglet est une fourche, jamais un drop-in du composant foyer */
/* (D-09) : la requête filtre `trip_id = voyage courant`, la création  */
/* pose `trip_id` explicitement (les triggers d'alignement 15-01 ne    */
/* sont qu'un garde-fou, jamais le poseur), et les dossiers restent au */
/* foyer (`folder_id = NULL` sur les lignes tripées). Le filtre client */
/* est un confort ; la conjonction RLS 15-01 est la vraie frontière.   */
/* ------------------------------------------------------------------ */

/**
 * Filtre strict d'étanchéité : seules les lignes de ce voyage passent —
 * ni les lignes du foyer (`trip_id NULL`), ni celles d'un autre voyage.
 */
export function tripRowsOf<T extends { trip_id: string | null }>(rows: T[], tripId: string): T[] {
  return rows.filter((row) => row.trip_id === tripId);
}

/**
 * Garde d'assignation (T-15-12) : l'onglet ne propose que les participants
 * du voyage ; toute tentative hors voyage lève ici, et le garde de portée
 * serveur 15-01 tranche en dernier ressort.
 */
export function assertTripAssignees(assigneeIds: string[], tripMemberIds: string[]): void {
  const allowed = new Set(tripMemberIds);
  for (const assigneeId of assigneeIds) {
    if (!allowed.has(assigneeId)) {
      throw new Error('Assigné hors voyage : seuls les participants du voyage peuvent être assignés.');
    }
  }
}

/** Tâches de CE voyage (jamais celles du foyer ni d'un voyage sibling). */
export function fetchTripTasks(tripId: string): Promise<TaskRow[]> {
  return data.list<TaskRow>('tasks', { trip_id: tripId });
}

export interface CreateTripTaskArgs {
  tripId: string;
  householdId: string;
  name: string;
  dueDate?: string | null;
  /** Assignataires : tous doivent être participants du voyage (T-15-12). */
  assigneeIds?: string[];
  tripMemberIds: string[];
  createdBy?: string | null;
}

/**
 * Création d'une tâche de voyage : `trip_id` posé explicitement,
 * `folder_id` à NULL (les dossiers `task_lists` restent au foyer),
 * assignataires validés contre les participants du voyage.
 */
export async function createTripTask(args: CreateTripTaskArgs): Promise<TaskRow> {
  const name = args.name.trim();
  if (name.length === 0 || name.length > 200) throw new Error('Nommez la tâche (1 à 200 caractères).');
  const assigneeIds = args.assigneeIds ?? [];
  assertTripAssignees(assigneeIds, args.tripMemberIds);
  const existing = await fetchTripTasks(args.tripId).catch(() => []);
  const priorityOrder = existing.reduce((max, row) => Math.max(max, row.priority_order ?? 0), -1) + 1;
  const created = await data.create<TaskRow>('tasks', {
    household_id: args.householdId,
    trip_id: args.tripId,
    name,
    description: null,
    due_date: args.dueDate?.trim() || null,
    priority_order: priorityOrder,
    status: 'a_faire',
    folder_id: null,
    created_by: args.createdBy ?? null,
    created_at: new Date().toISOString(),
  } as Partial<TaskRow>);
  if (assigneeIds.length > 0) {
    await Promise.all(
      assigneeIds.map((memberId) =>
        data.create('task_assignees', { task_id: created.id, member_id: memberId }),
      ),
    );
  }
  return created;
}

/** Assignataires d'un ensemble de tâches du voyage (jointure sans foyer). */
export function listTripTaskAssignees(taskIds: string[]) {
  if (taskIds.length === 0) return Promise.resolve([] as { task_id: string; member_id: string }[]);
  return data.list<{ task_id: string; member_id: string }>('task_assignees', { task_id: taskIds });
}

/* ------------------------------------------------------------------ */
/* Fourches Courses / Notes / Adresses (tâche 2) : même contrat que la  */
/* fourche Tâches — filtre `trip_id`, création posée, dossiers au foyer. */
/* Les articles suivent leur liste ; les pièces jointes suivent leur    */
/* note ; les photos de lieux restent supportées en lecture.            */
/* ------------------------------------------------------------------ */

/** Listes de courses de CE voyage (les articles suivent par `list_id`). */
export function fetchTripShoppingLists(tripId: string): Promise<ShoppingListRow[]> {
  return data.list<ShoppingListRow>('shopping_lists', { trip_id: tripId });
}

/** Articles des listes données (héritent du voyage par leur liste). */
export function fetchTripListItems(listIds: string[]): Promise<ShoppingListItemRow[]> {
  if (listIds.length === 0) return Promise.resolve([]);
  return data.list<ShoppingListItemRow>('shopping_list_items', { list_id: listIds });
}

export interface CreateTripListArgs {
  tripId: string;
  householdId: string;
  name: string;
  createdBy?: string | null;
}

/** Création d'une liste de voyage : `trip_id` posé explicitement. */
export async function createTripList(args: CreateTripListArgs): Promise<ShoppingListRow> {
  const name = args.name.trim();
  if (name.length === 0 || name.length > 120) throw new Error('Nommez la liste (1 à 120 caractères).');
  return data.create<ShoppingListRow>('shopping_lists', {
    household_id: args.householdId,
    trip_id: args.tripId,
    name,
    created_by: args.createdBy ?? null,
    created_at: new Date().toISOString(),
  } as Partial<ShoppingListRow>);
}

/** Notes de CE voyage (`note_folders` reste au foyer : `folder_id` NULL). */
export function fetchTripNotes(tripId: string): Promise<NoteRow[]> {
  return data.list<NoteRow>('notes', { trip_id: tripId });
}

export interface CreateTripNoteArgs {
  tripId: string;
  householdId: string;
  title: string;
  content: string;
  category?: string | null;
  createdBy?: string | null;
}

/** Création d'une note de voyage : `trip_id` posé, dossier à NULL. */
export async function createTripNote(args: CreateTripNoteArgs): Promise<NoteRow> {
  const title = args.title.trim();
  if (title.length === 0 || title.length > 200) throw new Error('Titre requis (1 à 200 caractères).');
  const stamped = new Date().toISOString();
  return data.create<NoteRow>('notes', {
    household_id: args.householdId,
    trip_id: args.tripId,
    title,
    content: args.content.trim(),
    category: args.category?.trim() || 'Voyage',
    color: null,
    folder_id: null,
    created_by: args.createdBy ?? null,
    created_at: stamped,
    updated_at: stamped,
  } as Partial<NoteRow>);
}

/** Adresses de CE voyage (photos relues telles quelles, sans dépôt ici). */
export function fetchTripPlaces(tripId: string): Promise<PlaceRow[]> {
  return data.list<PlaceRow>('places', { trip_id: tripId });
}

export interface CreateTripPlaceArgs {
  tripId: string;
  householdId: string;
  /** Charge du formulaire, `visited` exclu (bascule dédiée seule). */
  input: {
    name: string;
    type: PlaceRow['type'];
    rating?: number;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
    phone?: string | null;
    note?: string | null;
    /** Photo déposée (chemin bucket ou aperçu démo), NULL sans photo. */
    photoUrl?: string | null;
  };
}

/**
 * Création d'une adresse de voyage : charge du formulaire foyer
 * (`toPlacePayload`, jamais réinventée) + `trip_id` posé explicitement.
 * Sans note saisie, `rating` part à NULL (0121 : 0 viole
 * `places_rating_check`, qui n'admet que NULL ou 1–5).
 */
export async function createTripPlace(args: CreateTripPlaceArgs): Promise<PlaceRow> {
  const { toPlacePayload } = await import('@/modules/adresses/api');
  const name = args.input.name.trim();
  if (name.length === 0 || name.length > 120) throw new Error('Nommez le lieu (1 à 120 caractères).');
  const rating = args.input.rating && args.input.rating >= 1 && args.input.rating <= 5 ? args.input.rating : null;
  return data.create<PlaceRow>('places', {
    ...toPlacePayload(
      {
        name,
        type: args.input.type,
        rating: rating ?? 0,
        street: args.input.street?.trim() || null,
        postalCode: args.input.postalCode?.trim() || null,
        city: args.input.city?.trim() || null,
        phone: args.input.phone?.trim() || null,
        note: args.input.note?.trim() || null,
        photoUrl: args.input.photoUrl ?? null,
      },
      args.householdId,
    ),
    rating,
    trip_id: args.tripId,
  } as Partial<PlaceRow>);
}

/* ------------------------------------------------------------------ */
/* Onglet Budget (tâche 3) : enveloppe fine sur l'ardoise liée          */
/*                                                                     */
/* Aucune logique de règlement forkée (D-09) : l'ardoise est résolue   */
/* strictement par `ardoises.trip_id = voyage courant` (T-15-13), le    */
/* détail et la répartition viennent du hook et des panneaux existants */
/* (`useArdoiseDetail`, `fetchArdoiseSettlement` tels quels). Les       */
/* dépenses membres suivent les chemins membres ; les dépenses invités  */
/* passent par l'action Edge `guest-expense-create` sous ticket vérifié */
/* (jamais PostgREST — D-04).                                          */
/* ------------------------------------------------------------------ */

/**
 * Résolution stricte de l'ardoise liée (T-15-13) : `trip_id` ET foyer
 * doivent correspondre — une ardoise d'un autre voyage (même du même
 * foyer) ne résout jamais.
 */
export function resolveTripArdoiseId(
  rows: { id: string; trip_id: string | null; household_id: string }[],
  tripId: string,
  householdId: string,
): string | null {
  return rows.find((row) => row.trip_id === tripId && row.household_id === householdId)?.id ?? null;
}

/** Ardoise liée au voyage (`null` honnête si absente — jamais un onglet vide). */
export async function fetchTripArdoise(tripId: string, householdId: string) {
  const rows = await data.list<{ id: string; trip_id: string | null; household_id: string }>('ardoises', {
    trip_id: tripId,
  });
  const id = resolveTripArdoiseId(rows, tripId, householdId);
  if (!id) return null;
  return (rows.find((row) => row.id === id) ?? null) as import('@/types').ArdoiseRow | null;
}

export interface TripGuestExpensePart {
  participantType: 'membre' | 'guest';
  /** Membre inscrit à l'ardoise (parts `membre`). */
  memberId?: string;
  /** Invité du voyage, id miroir (parts `guest`, dual 0064). */
  guestId?: string;
  shareAmount: number;
}

export interface TripGuestExpenseArgs {
  /** Ticket brut `eo:trip:ticket:<tripId>` : seule credence, au corps. */
  ticket: string;
  title: string;
  amount: number;
  expenseDate?: string;
  /** Parts membres et/ou invités (dual member/guest, D-03). */
  parts: TripGuestExpensePart[];
}

/**
 * Corps de l'action `guest-expense-create` : validé ici (montant, libellé,
 * au moins une part, chaque part qualifiée), vérifié en base par le RPC
 * (`create_trip_guest_expense`, ticket haché, voyage non figé).
 */
export function toTripGuestExpenseBody(args: TripGuestExpenseArgs): Record<string, unknown> {
  const ticket = args.ticket.trim();
  if (!ticket) throw new Error('Ticket invalide.');
  const title = args.title.trim();
  if (title.length === 0 || title.length > 200) throw new Error('Nommez la dépense (1 à 200 caractères).');
  const amount = Math.round(args.amount * 100) / 100;
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
  if (args.parts.length === 0) throw new Error('Choisissez au moins une personne qui partage la dépense.');
  const parts = args.parts.map((part) => {
    if (part.participantType === 'membre' && !part.memberId) throw new Error('Participant invalide.');
    if (part.participantType === 'guest' && !part.guestId) throw new Error('Participant invalide.');
    const shareAmount = Math.round(part.shareAmount * 100) / 100;
    if (!(shareAmount > 0)) throw new Error('Part invalide.');
    return {
      participantType: part.participantType,
      ...(part.participantType === 'membre' ? { memberId: part.memberId } : { guestId: part.guestId }),
      shareAmount,
    };
  });
  return {
    ticket,
    title,
    amount,
    ...(args.expenseDate ? { expenseDate: args.expenseDate } : {}),
    splitType: 'egal',
    parts,
  };
}

/**
 * Dépense d'invité (D-04) : via l'Edge `trip-invite` sous ticket, jamais en
 * PostgREST direct. Le payeur est l'invité porteur du ticket (résolu en
 * base) ; les parts portent les ids miroirs membres/invités.
 */
export async function createTripGuestExpense(args: TripGuestExpenseArgs): Promise<unknown> {
  return callTripInvitePublishable('guest-expense-create', toTripGuestExpenseBody(args));
}
