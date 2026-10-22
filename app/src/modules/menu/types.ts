import { z } from 'zod';
import type { MealEntryRow } from '@/types';

/**
 * Menu de la semaine (vague 3.1) : un repas par date et par moment de la
 * journée, recette ou texte libre. La « semaine » est un regroupement dérivé
 * de `entry_date` (lundi → dimanche), jamais stockée.
 */

export type MealSlot = 'matin' | 'midi' | 'soir';

export const mealSlots: MealSlot[] = ['matin', 'midi', 'soir'];

export const mealSlotLabels: Record<MealSlot, string> = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
};

export interface MealEntry {
  id: string;
  householdId: string;
  /** Date du repas, ISO « YYYY-MM-DD ». */
  date: string;
  slot: MealSlot;
  recipeId: string | null;
  freeText: string | null;
  servings: number;
  /** « Qui mange » : identifiants de household_members. */
  memberIds: string[];
  createdById: string | null;
}

export function toMealEntry(row: MealEntryRow): MealEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    date: row.entry_date,
    slot: row.slot,
    recipeId: row.recipe_id,
    freeText: row.free_text,
    servings: row.servings,
    memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
    createdById: row.created_by,
  };
}

/** Contenu affiché d'un repas : le titre de la recette ou le texte libre. */
export function mealLabel(entry: MealEntry, recipeTitleOf: (recipeId: string) => string | null): string {
  if (entry.recipeId) return recipeTitleOf(entry.recipeId) ?? 'Recette indisponible';
  return entry.freeText?.trim() || 'Repas';
}

// ---------------------------------------------------------------------------
// Semaines : lundi → dimanche, tout en dates ISO et arithmétique UTC (aucune
// surprise de fuseau).
// ---------------------------------------------------------------------------

const toUtcDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};

const isoOfUtc = (date: Date): string => date.toISOString().slice(0, 10);

/** Lundi de la semaine contenant la date ISO donnée. */
export function weekStartOf(isoDate: string): string {
  const date = toUtcDate(isoDate);
  const offset = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - offset);
  return isoOfUtc(date);
}

/** Les sept dates de la semaine commençant au lundi donné. */
export function weekDatesOf(weekStartIso: string): string[] {
  const start = toUtcDate(weekStartIso);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return isoOfUtc(date);
  });
}

/** Décale le début de semaine d'un nombre de semaines (négatif = passé). */
export function shiftWeek(weekStartIso: string, weeks: number): string {
  const date = toUtcDate(weekStartIso);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return isoOfUtc(date);
}

/** Libellé d'un jour de semaine : « lun. 24 » (fuseau UTC, date pure). */
export function formatDayLabel(iso: string): string {
  return toUtcDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Intitulé de semaine : « Semaine du 20 au 26 octobre ». */
export function formatWeekLabel(weekStartIso: string): string {
  const dates = weekDatesOf(weekStartIso);
  const start = toUtcDate(dates[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const end = toUtcDate(dates[6]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `Semaine du ${start} au ${end}`;
}

/** Vrai si la semaine donnée contient la date du jour. */
export function isCurrentWeek(weekStartIso: string, todayIso: string): boolean {
  return weekStartOf(todayIso) === weekStartIso;
}

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------

export const mealFormSchema = z
  .object({
    kind: z.enum(['recette', 'texte']),
    recipeId: z.string(),
    freeText: z.string().trim().max(200, '200 caractères maximum.'),
    servings: z
      .string()
      .trim()
      .refine((value) => {
        const parsed = Number(value.replace(',', '.'));
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50;
      }, 'Portions : un nombre entier entre 1 et 50.'),
    memberIds: z.array(z.string()),
    /** Jour de la semaine affichée (ISO) et moment de la journée. */
    day: z.string(),
    slot: z.enum(mealSlots),
  })
  .superRefine((values, ctx) => {
    if (values.kind === 'recette' && values.recipeId === '') {
      ctx.addIssue({ code: 'custom', message: 'Choisissez une recette.', path: ['recipeId'] });
    }
    if (values.kind === 'texte' && values.freeText === '') {
      ctx.addIssue({ code: 'custom', message: 'Décrivez le repas.', path: ['freeText'] });
    }
  });

export type MealFormValues = z.infer<typeof mealFormSchema>;

export function formValuesToRow(values: MealFormValues) {
  return {
    entry_date: values.day,
    slot: values.slot,
    recipe_id: values.kind === 'recette' ? values.recipeId : null,
    free_text: values.kind === 'texte' ? values.freeText : null,
    servings: Number(values.servings),
    member_ids: values.memberIds,
  };
}
