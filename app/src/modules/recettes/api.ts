import { DataError, data } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import {
  depositHouseholdFile,
  householdMediaPathOf,
  isHouseholdMediaPath,
  removeHouseholdFile,
  replacedMediaPath,
  resolveHouseholdMediaUrl,
  storedValueOf,
} from '@/lib/storage';
import type {
  RecipeCategoryRow,
  RecipeFavoriteRow,
  RecipeIngredientRow,
  RecipeRow,
  RecipeStepRow,
  RecipeTagLinkRow,
  RecipeTagRow,
  ShoppingListItemRow,
} from '@/types';
import { createShoppingItem, listShoppingItems, updateShoppingItem } from '../courses/api';
import { guessRayon } from '../courses/types';
import { agreeUnit, scaleQuantity, type RecipeFormValues } from './types';

export const RECIPES_TABLE = 'recipes';
export const RECIPE_CATEGORIES_TABLE = 'recipe_categories';
export const RECIPE_TAGS_TABLE = 'recipe_tags';
export const RECIPE_TAG_LINKS_TABLE = 'recipe_tag_links';
export const RECIPE_INGREDIENTS_TABLE = 'recipe_ingredients';
export const RECIPE_STEPS_TABLE = 'recipe_steps';
export const RECIPE_FAVORITES_TABLE = 'recipe_favorites';

/** TTL court des URL signees de couverture (T-16-07, echec ferme). */
export const RECIPE_COVER_URL_TTL = 3600;

/**
 * Écritures du module. Les lectures passent par `useResource`
 * (`src/lib/data/useResource.ts`), qui filtre sur le foyer courant ; seules
 * les écritures propres au domaine sont ici. `household_id` est renseigné
 * explicitement : la RLS reste la seule barrière d'autorisation côté
 * serveur. Chaque mutation porte la garde enfant (R10, motif tâches).
 */

export async function createRecipeCategory(householdId: string, name: string): Promise<RecipeCategoryRow> {
  return data.create<RecipeCategoryRow>(RECIPE_CATEGORIES_TABLE, {
    household_id: householdId,
    name: name.trim(),
  });
}

export async function renameRecipeCategory(id: string, name: string): Promise<RecipeCategoryRow> {
  return data.update<RecipeCategoryRow>(RECIPE_CATEGORIES_TABLE, id, { name: name.trim() });
}

/**
 * Supprime une categorie : le trigger serveur `reassign_recipe_category`
 * re-assignne les recettes pleines vers `Recettes du foyer` (R2) ; une
 * categorie vide part en DELETE direct.
 */
export async function deleteRecipeCategory(id: string): Promise<void> {
  await data.remove(RECIPE_CATEGORIES_TABLE, id);
}

export async function createRecipeTag(householdId: string, name: string): Promise<RecipeTagRow> {
  return data.create<RecipeTagRow>(RECIPE_TAGS_TABLE, { household_id: householdId, name: name.trim() });
}

export async function renameRecipeTag(id: string, name: string): Promise<RecipeTagRow> {
  return data.update<RecipeTagRow>(RECIPE_TAGS_TABLE, id, { name: name.trim() });
}

/** Supprimer un tag ne detruit que ses liens (FK cascade, R4). */
export async function deleteRecipeTag(id: string): Promise<void> {
  await data.remove(RECIPE_TAGS_TABLE, id);
}

/**
 * Remplace les tags d'une recette. La table de liens n'a pas de colonne
 * `id` : on repart de la liste existante (motif `setTaskAssignees`).
 * La frappe libre cree le tag manquant avant le lien (D-09).
 */
export async function setRecipeTags(recipeId: string, householdId: string, tagNames: string[]): Promise<void> {
  const names = [...new Set(tagNames.map((name) => name.trim()).filter((name) => name !== ''))];
  const existing = await data.list<RecipeTagRow>(RECIPE_TAGS_TABLE, { household_id: householdId });
  const byName = new Map(existing.map((tag) => [tag.name.toLocaleLowerCase('fr'), tag]));
  const tags: RecipeTagRow[] = [];
  for (const name of names) {
    const found = byName.get(name.toLocaleLowerCase('fr'));
    if (found) tags.push(found);
    else {
      const created = await createRecipeTag(householdId, name);
      byName.set(name.toLocaleLowerCase('fr'), created);
      tags.push(created);
    }
  }
  // Remplacement en bloc des liens : partir d'un état vide (recette sans tag)
  // supprime légitimement zéro ligne — tolérance déclarée.
  await data.removeWhere(RECIPE_TAG_LINKS_TABLE, { recipe_id: recipeId }, { ifMissing: 'ignore' });
  await Promise.all(
    tags.map((tag) =>
      data.create<RecipeTagLinkRow>(RECIPE_TAG_LINKS_TABLE, {
        recipe_id: recipeId,
        household_id: householdId,
        tag_id: tag.id,
      }),
    ),
  );
}

export interface RecipePayload {
  title: string;
  category_id: string | null;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  cover_photo: string | null;
}

/** Transforme la saisie du dialogue en ligne `recipes` (nom 1–200, R3). */
export function toRecipePayload(values: RecipeFormValues, extra: { categoryId: string | null; coverPhoto: string | null }): RecipePayload {
  const prep = (values.prepHours ?? 0) * 60 + (values.prepMins ?? 0);
  const cook = (values.cookHours ?? 0) * 60 + (values.cookMins ?? 0);
  return {
    title: values.title.trim(),
    category_id: extra.categoryId,
    servings: values.servings,
    prep_minutes: prep > 0 ? prep : null,
    cook_minutes: cook > 0 ? cook : null,
    cover_photo: extra.coverPhoto,
  };
}

/** Ingredients d'un ensemble de recettes, tries par position. */
export async function listRecipeIngredients(recipeIds: string[]): Promise<RecipeIngredientRow[]> {
  if (recipeIds.length === 0) return [];
  const rows = await data.list<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, { recipe_id: recipeIds });
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Etapes d'un ensemble de recettes, triees par position. */
export async function listRecipeSteps(recipeIds: string[]): Promise<RecipeStepRow[]> {
  if (recipeIds.length === 0) return [];
  const rows = await data.list<RecipeStepRow>(RECIPE_STEPS_TABLE, { recipe_id: recipeIds });
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Liens tags d'un ensemble de recettes. */
export async function listRecipeTagLinks(recipeIds: string[]): Promise<RecipeTagLinkRow[]> {
  if (recipeIds.length === 0) return [];
  return data.list<RecipeTagLinkRow>(RECIPE_TAG_LINKS_TABLE, { recipe_id: recipeIds });
}

/** Favoris du membre courant sur un ensemble de recettes. */
export async function listRecipeFavorites(recipeIds: string[], memberId: string): Promise<RecipeFavoriteRow[]> {
  if (recipeIds.length === 0 || memberId === '') return [];
  return data.list<RecipeFavoriteRow>(RECIPE_FAVORITES_TABLE, { recipe_id: recipeIds, member_id: memberId });
}

/** Bascule le favori du membre sur une recette (coeur carte, R13). */
export async function toggleRecipeFavorite(recipeId: string, householdId: string, memberId: string, active: boolean): Promise<void> {
  if (active) {
    await data.create<RecipeFavoriteRow>(RECIPE_FAVORITES_TABLE, {
      recipe_id: recipeId,
      household_id: householdId,
      member_id: memberId,
    });
  } else {
    // Éteindre un favori déjà absent (double-clic, deux onglets) reste un no-op
    // volontaire : tolérance déclarée, pas une erreur.
    await data.removeWhere(RECIPE_FAVORITES_TABLE, { recipe_id: recipeId, member_id: memberId }, { ifMissing: 'ignore' });
  }
}

export async function createRecipeIngredient(input: {
  recipeId: string;
  householdId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
}): Promise<RecipeIngredientRow> {
  return data.create<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, {
    recipe_id: input.recipeId,
    household_id: input.householdId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    position: input.position,
  });
}

export async function updateRecipeIngredient(
  id: string,
  input: { name: string; quantity: number | null; unit: string | null },
): Promise<RecipeIngredientRow> {
  return data.update<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, id, {
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
  });
}

export async function deleteRecipeIngredient(id: string): Promise<void> {
  await data.remove(RECIPE_INGREDIENTS_TABLE, id);
}

export async function createRecipeStep(input: {
  recipeId: string;
  householdId: string;
  content: string;
  position: number;
}): Promise<RecipeStepRow> {
  return data.create<RecipeStepRow>(RECIPE_STEPS_TABLE, {
    recipe_id: input.recipeId,
    household_id: input.householdId,
    content: input.content.trim(),
    position: input.position,
  });
}

export async function updateRecipeStep(id: string, content: string): Promise<RecipeStepRow> {
  return data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, id, { content: content.trim() });
}

export async function deleteRecipeStep(id: string, photoPath: string | null = null): Promise<void> {
  await data.remove(RECIPE_STEPS_TABLE, id);
  await removeStepPhotoObject(photoPath);
}

/**
 * Renumerotation serveur dense a chaque reorder (T-16-08) : les positions
 * sont reecrites 0..n sans doublon ni trou.
 */
export async function reorderRecipeSteps(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, position) => data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, id, { position })));
}

/**
 * Supprime une recette puis ses médias : le SQL en cascade ne touche pas le
 * Storage (R9). La couverture est retirée en best-effort silencieux
 * (comportement inchangé) ; les objets des étapes sont **tous** tentés, même
 * si l'un échoue — l'échec d'un objet n'empêche ni les autres ni la remontée
 * de l'erreur d'origine de `data.remove` (R5, arête ordering).
 */
export async function deleteRecipe(
  id: string,
  coverPhoto: string | null,
  stepPhotoPaths: (string | null)[] = [],
): Promise<void> {
  await data.remove(RECIPES_TABLE, id);
  const path = recipeCoverPathOf(coverPhoto);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
  await Promise.all(stepPhotoPaths.map((photoPath) => removeStepPhotoObject(photoPath)));
}

/* ------------------------------------------------------------------ */
/* Couverture (R9) : bucket prive + URL signee TTL court + cleanup.     */
/* ------------------------------------------------------------------ */

/**
 * Chemin bucket d'une couverture stockee, `null` sinon (jamais d'URL).
 *
 * Le prédicat est celui de `isHouseholdMediaPath` (D-01) : un seul verdict de
 * forme de valeur de média fait foi pour le module, plutôt qu'une copie plus
 * lâche qui dériverait de lui en silence (IN-03).
 */
export function recipeCoverPathOf(stored: string | null | undefined): string | null {
  if (typeof stored !== 'string' || stored === '') return null;
  return isHouseholdMediaPath(stored) ? stored : null;
}

/** Depose la couverture (`recipes/<id>`, compression native partagee). */
export async function uploadRecipeCover(householdId: string, recipeId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}`, file });
  return storedValueOf(deposited);
}

/** Supprime le fichier d'une couverture (no-op hors chemin bucket). */
export function deleteRecipeCover(stored: string | null): Promise<void> {
  const path = recipeCoverPathOf(stored);
  if (path) return removeHouseholdFile(path).catch(() => undefined);
  return Promise.resolve();
}

/**
 * Forge la couverture affichable (echec ferme, T-16-07) : les formes
 * non-chemin (apercu demo `blob:`, actif `/assets`) rendent telles quelles ;
 * un chemin se forge en URL signee ; tout echec donne `null`, jamais de
 * lien mort.
 */
export async function resolveRecipeCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isHouseholdMediaPath(stored)) {
    return /^blob:|^https?:|^data:|^\/assets\//i.test(stored) ? stored : null;
  }
  // La signature passe par le point unique de la lecture (D-01) : seul l'appel
  // change de propriétaire, la TTL courte reste celle du module.
  return resolveHouseholdMediaUrl(stored, RECIPE_COVER_URL_TTL);
}

/** Forge chaque couverture en une passe (echec ferme par recette). */
export async function resolveRecipeCoverUrls(
  rows: { id: string; cover_photo?: string | null }[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    rows.map(async (row) => [row.id, await resolveRecipeCoverUrl(row.cover_photo ?? null)] as const),
  );
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

export type { RecipeRow };

/* ------------------------------------------------------------------ */
/* Photo d'étape (R1, D-02/D-03) : même régime que la couverture —      */
/* chemin de bucket signé à la lecture, valeur produite par `storedValueOf`. */
/* ------------------------------------------------------------------ */

/** Dépose la photo d'une étape (`recipes/<recipeId>/steps/<stepId>`, compression partagée). */
export async function uploadRecipeStepPhoto(
  householdId: string,
  recipeId: string,
  stepId: string,
  file: File,
): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}/steps/${stepId}`, file });
  // Valeur de colonne par le point unique (D-02, D-03) : jamais un champ du
  // dépôt lu à la main, qui persisterait une URL signée éphémère.
  return storedValueOf(deposited);
}

/**
 * Forge la photo d'étape affichable (échec fermé) : les formes non-chemin
 * (aperçu démo `blob:`, URL héritée, actif `/assets`) rendent telles quelles ;
 * un chemin se forge en URL signée sur le bucket du foyer ; tout échec donne
 * `null`, jamais de lien mort.
 */
export async function resolveRecipeStepPhotoUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isHouseholdMediaPath(stored)) {
    return /^blob:|^https?:|^data:|^\/assets\//i.test(stored) ? stored : null;
  }
  // La signature passe par le point unique de la lecture (D-01) : seul le
  // propriétaire de l'appel change, la TTL courte reste celle du module.
  return resolveHouseholdMediaUrl(stored, RECIPE_COVER_URL_TTL);
}

/** Forge chaque photo d'étape en une passe (échec fermé par étape). */
export async function resolveRecipeStepPhotoUrls(
  steps: { id: string; photoPath: string | null }[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    steps.map(async (step) => [step.id, await resolveRecipeStepPhotoUrl(step.photoPath)] as const),
  );
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

/**
 * Retire un objet de photo d'étape du bucket, en journalisant l'échec sans
 * jamais le laisser remonter (motif `notes`/`cercle`/`animaux`, même message) :
 * le retrait est best-effort — il n'annule jamais la nouvelle photo ni ne
 * masque l'erreur d'origine de l'appelant.
 */
async function removeStepPhotoObject(stored: string | null): Promise<void> {
  const path = householdMediaPathOf(stored);
  if (!path) return;
  try {
    await removeHouseholdFile(path);
  } catch (error) {
    console.warn(`Objet de média non retiré du bucket : ${path}`, error);
  }
}

/**
 * Écrit la référence `photo_path` d'une étape et rend si l'écriture a atterri.
 *
 * L'étape visée peut avoir disparu par cascade (suppression de la recette) ou
 * par une autre session ; au niveau de l'adaptateur, « zéro ligne écrite » et
 * un échec transitoire produisent le même `DataError`, donc les distinguer par
 * motif serait une garde qui se périmerait en silence. Aucune lecture préalable
 * d'existence n'est faite : décider après une lecture serait la course proscrite
 * par `adapter.ts`. On écrit, et un `DataError` devient un no-op JOURNALISÉ
 * (§2.7 F) qui rend `false` — c'est ce booléen, et non un motif d'erreur, qui
 * décide si l'appelant peut nettoyer l'objet PRÉCÉDENT sans détruire une photo
 * encore référencée (CR-01). L'erreur d'une autre nature remonte intacte.
 */
async function writeStepPhoto(stepId: string, value: string | null): Promise<boolean> {
  try {
    await data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, stepId, { photo_path: value });
    return true;
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    console.warn(`Photo d’étape non écrite : ${stepId}`, error);
    return false;
  }
}

/**
 * Dépose une nouvelle photo d'étape, écrit la référence par le helper gardé,
 * puis retire l'objet précédent s'il est un chemin de bucket distinct (D-04,
 * D-05). Le dépôt est committé d'abord ; le retrait de l'ancien objet ne
 * l'annule jamais.
 *
 * CR-01 : quand l'écriture n'atterrit pas (`writeStepPhoto` rend `false`), la
 * ligne peut encore référencer `previous` — retirer l'ancien détruirait une
 * photo encore affichée. On retire alors seulement l'objet NEUF, que personne
 * ne référence, et on ne touche pas à l'ancien.
 */
export async function replaceRecipeStepPhoto(input: {
  householdId: string;
  recipeId: string;
  stepId: string;
  previous: string | null;
  file: File;
}): Promise<void> {
  const next = await uploadRecipeStepPhoto(input.householdId, input.recipeId, input.stepId, input.file);
  const landed = await writeStepPhoto(input.stepId, next);
  if (!landed) {
    await removeStepPhotoObject(next);
    return;
  }
  await removeStepPhotoObject(replacedMediaPath(input.previous, next));
}

/**
 * Retire la photo d'une étape : référence effacée par le helper gardé, objet
 * précédent nettoyé. Un retrait sur une étape disparue est un no-op, comme le
 * dépôt.
 *
 * CR-01 : l'objet précédent n'est retiré que si l'écriture a atterri ; sinon la
 * ligne peut encore le référencer et le retrait serait destructeur.
 */
export async function clearRecipeStepPhoto(stepId: string, previous: string | null): Promise<void> {
  const landed = await writeStepPhoto(stepId, null);
  if (!landed) return;
  await removeStepPhotoObject(replacedMediaPath(previous, null));
}

/* ------------------------------------------------------------------ */
/* Partage invité (Edge Function `recipe-invite`, R11, D-13/D-14)       */
/*                                                                     */
/* Même régime que `ardoise-invite` / `gift-list-invite` : lien seul   */
/* `link-view` en lecture seule, code brut affiché une seule fois,     */
/* révocation immédiate, compteur max-uses consommé côté serveur       */
/* (`FOR UPDATE`, prouvé en 0054, 16-01). La page invitée n'appelle     */
/* jamais PostgREST en direct — `fetchGuestRecipeView` seul y accède.  */
/* ------------------------------------------------------------------ */

/** Lien à envoyer à l'externe : affiché une seule fois avec le code (QR). */
export function recipeInviteLink(code: string): string {
  return `/invitation/recette?code=${encodeURIComponent(code)}`;
}

async function callRecipeInvite<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/recipe-invite`, {
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
    throw new Error((detail as { error?: string } | null)?.error ?? 'Partage impossible.');
  }
  return (await response.json()) as T;
}

/**
 * Appel sans session (invités externes) : le code EST le contrôle d'accès.
 * La clé publiable part toujours, le jeton porteur seulement quand une
 * session existe — un visiteur sans compte reste strictement anonyme.
 */
async function callRecipeInvitePublishable<T>(action: string, body: Record<string, unknown>): Promise<T> {
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
  const response = await fetch(`${supabaseFunctionsBase}/recipe-invite`, {
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

export interface RecipeInviteCode {
  code: string;
  expiresAt: string | null;
  maxUses: number;
  recipeId: string;
}

export interface RecipeInviteSummary {
  recipeId: string;
  isActive: boolean;
  hasCode: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}

/** Génère (ou régénère, invalidant le précédent) le lien d'une recette. */
export async function createRecipeInviteCode(
  recipeId: string,
  options?: { expiresAt?: string; maxUses?: number },
): Promise<RecipeInviteCode> {
  const created = await callRecipeInvite<RecipeInviteCode>('create', {
    recipeId,
    ...(options?.expiresAt ? { expiresAt: options.expiresAt } : {}),
    ...(options?.maxUses ? { maxUses: options.maxUses } : {}),
  });
  writeRecipeInviteCode(recipeId, created.code);
  return created;
}

/** Arrête le partage : tous les liens actifs de la recette sont révoqués. */
export async function revokeRecipeInviteCode(recipeId: string): Promise<void> {
  await callRecipeInvite('revoke', { recipeId });
  clearRecipeInviteCode(recipeId);
}

export async function fetchRecipeInviteSummary(recipeId: string): Promise<RecipeInviteSummary | null> {
  if (!isSupabaseConfigured) return null;
  return callRecipeInvite<RecipeInviteSummary | null>('summary', { recipeId });
}

/* ------------------------------------------------------------------ */
/* Code de partage mémorisé (même régime qu'ardoise/voyage) : le code  */
/* brut n'est rendu qu'à sa génération — le dialogue le conserve sur   */
/* CET appareil (`eo:recipe:code:<recipeId>`) pour réafficher QR + lien */
/* sans régénérer (qui invaliderait le précédent). Un code régénéré    */
/* ailleurs rend le lien mémorisé caduc : la régénération reste        */
/* proposée, et l'arrêt du partage efface la mémoire.                  */
/* ------------------------------------------------------------------ */

export const recipeInviteCodeStorageKey = (recipeId: string): string => `eo:recipe:code:${recipeId}`;

export function readRecipeInviteCode(recipeId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(recipeInviteCodeStorageKey(recipeId));
    const trimmed = stored?.trim() ?? '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeRecipeInviteCode(recipeId: string, code: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(recipeInviteCodeStorageKey(recipeId), code.trim());
  } catch {
    // Stockage plein ou bloqué : le code reste affiché, sans mémoire.
  }
}

export function clearRecipeInviteCode(recipeId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(recipeInviteCodeStorageKey(recipeId));
  } catch {
    // Décoratif : un code restant ne fait qu'afficher un lien caduc.
  }
}

/* ------------------------------------------------------------------ */
/* Vue invitée sans compte (R11, T-16-10/T-16-12)                       */
/* ------------------------------------------------------------------ */

export interface GuestRecipeIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
}

export interface GuestRecipeStep {
  id: string;
  content: string;
  position: number;
  /**
   * URL signée éphémère forgée par l'Edge `recipe-invite`, ou `null` (échec
   * fermé). Même nom et même forme que `coverPhotoUrl` (D-15) : la projection
   * cliente lit le nom de la CHARGE servie, jamais le nom de la colonne
   * (`photo_path`) — une charge qui ne porterait que le chemin brut rend
   * `null` (T-21-04). Requis, donc la chaîne de typage force chaque fixture à
   * le renseigner.
   */
  photoUrl: string | null;
}

/** Fiche telle que la voit un visiteur : contenu seul, jamais d'auteur. */
export interface GuestRecipeView {
  recipeId: string | null;
  title: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** URL signée éphémère forgée par requête, ou null (échec fermé). */
  coverPhotoUrl: string | null;
  category: string | null;
  ingredients: GuestRecipeIngredient[];
  steps: GuestRecipeStep[];
  tags: string[];
}

/** Chaîne non vide telle quelle, sinon null (même normalisation que l'Edge). */
function asGuestText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toGuestIngredient(entry: unknown): GuestRecipeIngredient {
  const row = (entry ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    quantity: typeof row.quantity === 'number' ? row.quantity : null,
    unit: typeof row.unit === 'string' ? row.unit : null,
    position: typeof row.position === 'number' ? row.position : 0,
  };
}

function toGuestStep(entry: unknown): GuestRecipeStep {
  const row = (entry ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    content: String(row.content ?? ''),
    position: typeof row.position === 'number' ? row.position : 0,
    // Projection symétrique de la couverture : on lit `photoUrl` (le nom de la
    // charge servie), jamais `photo_path` (le nom de la colonne). Une charge
    // qui ne porterait que le chemin brut rend donc `null` (échec fermé,
    // T-21-04) — le client ne fabrique aucune URL d'un chemin.
    photoUrl: asGuestText(row.photoUrl),
  };
}

/**
 * Lecture invitée sans compte : rend la fiche lecture seule. Projection
 * défensive côté client (miroir du handler Edge) : même si la charge servie
 * rendait un jour plus, aucun identifiant de membre ne quitte ce helper.
 * Les erreurs Edge sont des messages utilisateurs (oracle unique
 * `Ce lien est invalide.`) : propagés tels quels, sans reformulation.
 */
export async function fetchGuestRecipeView(code: string): Promise<GuestRecipeView> {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Lien invalide.');
  const view = await callRecipeInvitePublishable<{
    recipeId: string | null;
    title: string | null;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    coverPhotoUrl: string | null;
    category: string | null;
    ingredients: unknown;
    steps: unknown;
    tags: unknown;
  }>('link-view', { code: trimmed });
  return {
    recipeId: typeof view.recipeId === 'string' ? view.recipeId : null,
    title: typeof view.title === 'string' ? view.title : null,
    servings: typeof view.servings === 'number' ? view.servings : null,
    prepMinutes: typeof view.prepMinutes === 'number' ? view.prepMinutes : null,
    cookMinutes: typeof view.cookMinutes === 'number' ? view.cookMinutes : null,
    coverPhotoUrl: asGuestText(view.coverPhotoUrl),
    category: asGuestText(view.category),
    ingredients: Array.isArray(view.ingredients) ? view.ingredients.map(toGuestIngredient) : [],
    steps: Array.isArray(view.steps) ? view.steps.map(toGuestStep) : [],
    tags: Array.isArray(view.tags) ? view.tags.map(String) : [],
  };
}

/* ------------------------------------------------------------------ */
/* Envoi vers Courses (R14, D-16)                                       */
/* ------------------------------------------------------------------ */

export interface RecipeCoursesSendInput {
  householdId: string;
  listId: string;
  addedBy: string | null;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  baseServings: number;
  targetServings: number;
}

/**
 * Insère les ingrédients aux quantités de l'échelle courante
 * (`qté × cible/base`, NULL « au goût » intact), unité accordée (+s/+x),
 * rayon deviné depuis le nom. Les lignes existantes non cochées de même
 * nom (insensible casse/accents) et même unité sont incrémentées au lieu
 * d'être dupliquées ; les lignes cochées (déjà achetées), les unités
 * différentes et les quantités NULL restent des lignes séparées.
 * Le chemin d'appel est gardé `canWrite` (T-16-13, garde page) ; la RLS
 * refuse de toute façon les écritures enfant côté serveur.
 */
export interface RecipeCoursesSendResult {
  rows: ShoppingListItemRow[];
  createdCount: number;
  mergedCount: number;
}

/** Normalisation de comparaison : casse + accents + ligatures + espaces ignorés. */
function normalizeItemName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function normalizeItemUnit(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed) return null;
  // Forme singulière : l'accord (+s au-delà de 1) ne doit pas empêcher la
  // fusion (`1 œuf` existant + `3 œufs` calculés = `4 œufs`).
  return trimmed.replace(/s$/, '');
}

export async function sendRecipeIngredientsToCourses(input: RecipeCoursesSendInput): Promise<RecipeCoursesSendResult> {
  const existing = await listShoppingItems(input.listId, input.householdId);
  // Copie de travail : deux ingrédients identiques de la même recette
  // s'accumulent sur la même ligne plutôt qu'en deux créations.
  const working = existing.map((row) => ({ ...row }));
  const rows: ShoppingListItemRow[] = [];
  let createdCount = 0;
  let mergedCount = 0;
  for (const ingredient of input.ingredients) {
    const scaled = scaleQuantity(ingredient.quantity, input.baseServings, input.targetServings);
    const unit = agreeUnit(ingredient.unit, scaled);
    const nameKey = normalizeItemName(ingredient.name);
    const unitKey = normalizeItemUnit(unit);
    const match =
      scaled !== null
        ? working.find(
            (row) =>
              !row.checked &&
              row.quantity !== null &&
              normalizeItemName(row.name) === nameKey &&
              normalizeItemUnit(row.unit) === unitKey,
          )
        : undefined;
    if (match) {
      const mergedQuantity = (match.quantity as number) + (scaled as number);
      const updated = await updateShoppingItem(match.id, {
        name: match.name,
        quantity: mergedQuantity,
        // Accord réévalué sur le total (`1 œuf` + 3 → `4 œufs`).
        unit: agreeUnit(match.unit, mergedQuantity),
        rayon: match.category ?? guessRayon(match.name),
      });
      match.quantity = updated.quantity;
      rows.push(updated);
      mergedCount += 1;
    } else {
      rows.push(
        await createShoppingItem({
          householdId: input.householdId,
          listId: input.listId,
          name: ingredient.name,
          quantity: scaled,
          unit,
          rayon: guessRayon(ingredient.name),
          addedBy: input.addedBy,
        }),
      );
      createdCount += 1;
    }
  }
  return { rows, createdCount, mergedCount };
}
