import { isChildHiddenModule, type ModuleEntry, type ModuleKey } from './modules';

/**
 * Recherche de la palette de commandes (Ctrl/Cmd + K).
 *
 * Deux natures de résultats, volontairement séparées : les **espaces** (la
 * navigation entre 17 modules, qui est le problème que la palette résout) et
 * les **entrées du foyer** (une tâche, une note, un contact…), qui mènent à
 * la FICHE quand le module sait l'ouvrir, et à son espace sinon
 * (`record-paths.ts` — la table des modules qui ont un lien profond).
 *
 * Le repli des accents vit ici, en un seul endroit : « ecole » doit trouver
 * « École », et « dejeuner » « Déjeuner ». La normalisation NFD + suppression
 * des diacritiques est la même que celle des emoji de catégorie (types.ts du
 * calendrier), mais elle est dupliquée à dessein : `lib/` ne dépend pas d'un
 * module métier.
 */

/** Texte comparable : minuscules, sans accents. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Découpe une saisie en mots : « sortir poub » doit trouver la même chose. */
const tokensOf = (query: string): string[] =>
  foldSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);

/** Vrai quand chaque mot de la saisie apparaît dans le texte fourni. */
function matchesAllTokens(haystack: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Rang d'un espace : 0 = le libellé commence par la saisie, 1 = un de ses mots
 * commence par elle, 2 = elle apparaît dans le libellé, 3 = seulement dans
 * l'accroche. Plus le chiffre est petit, plus l'espace remonte.
 */
function moduleScore(entry: ModuleEntry, needle: string): number {
  const primary = foldSearchText([entry.label, entry.short, entry.navLabel ?? ''].join(' '));
  if (primary.startsWith(needle)) return 0;
  if (primary.split(' ').some((word) => word.startsWith(needle))) return 1;
  if (primary.includes(needle)) return 2;
  return 3;
}

export interface SearchModulesOptions {
  /** Rôle `enfant` : les cinq modules hors périmètre sortent des résultats. */
  isChild?: boolean;
}

/**
 * Espaces à proposer. Une saisie vide rend tout le catalogue (moins les
 * modules masqués au rôle), dans l'ordre de la navigation : ouvrir la palette
 * sans taper doit déjà être utile.
 */
export function searchModules(
  entries: readonly ModuleEntry[],
  query: string,
  { isChild = false }: SearchModulesOptions = {},
): ModuleEntry[] {
  const available = isChild ? entries.filter((entry) => !isChildHiddenModule(entry.key)) : [...entries];
  const tokens = tokensOf(query);
  if (tokens.length === 0) return available;

  const needle = foldSearchText(query).trim();
  return available
    .filter((entry) =>
      matchesAllTokens(
        foldSearchText([entry.label, entry.short, entry.navLabel ?? '', entry.detail, entry.kicker].join(' ')),
        tokens,
      ),
    )
    .sort((a, b) => moduleScore(a, needle) - moduleScore(b, needle));
}

/** Une entrée du foyer trouvée par la palette. */
export interface SearchRecord {
  /** Identifiant unique inter-tables (`tasks:task-1`). */
  id: string;
  /**
   * Identifiant de la LIGNE dans son module (`task-1`). C'est lui qui porte
   * le lien profond : la palette ouvre la fiche, pas seulement l'espace.
   */
  rowId: string;
  module: ModuleKey;
  label: string;
  /** Nature et détail : « Tâche · À faire · 24/10 ». */
  hint: string;
  /** Texte cherché en plus du libellé (description, contenu, ville…). */
  extra?: string | null;
}

function recordScore(record: SearchRecord, needle: string): number {
  const label = foldSearchText(record.label);
  if (label.startsWith(needle)) return 0;
  if (label.split(' ').some((word) => word.startsWith(needle))) return 1;
  if (label.includes(needle)) return 2;
  return 3;
}

export interface SearchRecordsResult {
  /** Résultats affichables, plafonnés par module et au total. */
  results: SearchRecord[];
  /** Nombre de correspondances avant plafonnement, pour le dire à l'écran. */
  matched: number;
}

/**
 * Entrées du foyer correspondant à la saisie.
 *
 * Le plafond par module (4) évite qu'une liste de courses de trente lignes
 * n'écrase tout le reste ; le plafond global (12) tient dans la hauteur du
 * dialogue sans faire défiler. `matched` garde la vérité du compte : masquer
 * des résultats sans le dire serait une absence affirmée (AGENTS.md §2.7 I).
 */
export function searchRecords(
  records: readonly SearchRecord[],
  query: string,
  { limit = 12, perModule = 4 }: { limit?: number; perModule?: number } = {},
): SearchRecordsResult {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { results: [], matched: 0 };

  const needle = foldSearchText(query).trim();
  const matching = records
    .filter((record) => matchesAllTokens(foldSearchText([record.label, record.extra ?? ''].join(' ')), tokens))
    .sort((a, b) => recordScore(a, needle) - recordScore(b, needle) || a.label.localeCompare(b.label, 'fr'));

  const perModuleCount = new Map<ModuleKey, number>();
  const results: SearchRecord[] = [];
  for (const record of matching) {
    if (results.length >= limit) break;
    const count = perModuleCount.get(record.module) ?? 0;
    if (count >= perModule) continue;
    perModuleCount.set(record.module, count + 1);
    results.push(record);
  }
  return { results, matched: matching.length };
}
