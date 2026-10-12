/**
 * Accès aux données des Voyages via l'adaptateur actif (PostgREST + RLS en
 * ligne, IndexedDB hors ligne). Les tâches du foyer servent d'indicateur
 * « éléments à préparer », faute de liste de préparation dédiée.
 */

import { data } from '@/lib/data';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type { TaskRow, TripGuestRow, TripMemberRow, TripRow } from '@/types';
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
 * les participants (admin/membre seuls, enfants ignorés) et l'ardoise liée
 * dans la même transaction. L'identité vient du JWT, jamais d'un id passé.
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
  return callTripInvite<TripInviteCode>('create', { tripId });
}

/** Arrête le partage : le code ne passe plus, l'historique reste. */
export async function revokeTripInviteCode(tripId: string): Promise<void> {
  await callTripInvite('revoke', { tripId });
}

export async function fetchTripInviteSummary(tripId: string): Promise<TripInviteSummary | null> {
  if (!isSupabaseConfigured) return null;
  return callTripInvite<TripInviteSummary | null>('summary', { tripId });
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
