/**
 * Types métier des Voyages : normalisation des lignes `trips` en dates ISO
 * simples, libellés français du statut et calcul des indicateurs du héros.
 */

import { assetUrl } from '@/lib/modules';
import { daysBetween, formatMediumDate, toLocalDate, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, IsoDate, TripRow } from '@/types';

/**
 * Statuts d'avancement. La table `trips` ne possède pas de colonne `status` :
 * le statut est donc **dérivé des dates** (voir `deriveTripStatus`), et le
 * formulaire propose une période cohérente avec le statut choisi.
 */
export type TripStatus = 'a_preparer' | 'confirme' | 'en_cours' | 'termine';

export const TRIP_STATUSES = ['a_preparer', 'confirme', 'en_cours', 'termine'] as const satisfies readonly TripStatus[];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  a_preparer: 'À préparer',
  confirme: 'Confirmé',
  en_cours: 'En cours',
  termine: 'Terminé',
};

/** Photo de couverture utilisée quand le voyage n’en a pas. */
export const DEFAULT_TRIP_COVER = assetUrl('lisbonne.jpg');

/** Covers proposés par le formulaire, issus des photos de l’export. */
export const TRIP_COVER_PRESETS = [
  { label: 'Lisbonne', url: assetUrl('lisbonne.jpg') },
  { label: 'Voyage', url: assetUrl('voyages.jpg') },
  { label: 'Cercle', url: assetUrl('cercle.jpg') },
  { label: 'Adresses', url: assetUrl('adresses.jpg') },
] as const;

export interface Trip {
  id: string;
  householdId: string;
  name: string;
  destination: string;
  startDate: IsoDate;
  endDate: IsoDate;
  coverPhoto: string;
  notes: string;
  createdAt: string;
  status: TripStatus;
  statusLabel: string;
  /** Nombre de jours sur place (écart entre les deux dates). */
  days: number;
  dateLabel: string;
  /** Voyage à venir ou en cours (exclut les voyages terminés). */
  upcoming: boolean;
  /** Membre créateur (modération, phase 15) ; null en démo héritée. */
  createdBy: string | null;
  /** Onglets de la fiche : désactivé = masqué, jamais supprimé (D-05). */
  tabState: TabState;
  /** Fermeture douce (D-08) : figé, réouvrable admin, jamais supprimé. */
  closed: boolean;
}

/**
 * Onglets de la fiche voyage (phase 15, D-05). `infos` et `parametres` sont
 * structurels (toujours affichés) ; les cinq autres se basculent depuis
 * Paramètres — masqués, jamais supprimés.
 */
export type TripTabKey = 'infos' | 'courses' | 'notes' | 'taches' | 'adresses' | 'budget' | 'parametres';

export const TRIP_TABS: readonly { key: TripTabKey; label: string }[] = [
  { key: 'infos', label: 'Infos' },
  { key: 'courses', label: 'Courses' },
  { key: 'notes', label: 'Notes' },
  { key: 'taches', label: 'Tâches' },
  { key: 'adresses', label: 'Adresses' },
  { key: 'budget', label: 'Budget' },
  { key: 'parametres', label: 'Paramètres' },
];

/** Onglets basculables depuis la création et Paramètres (infos/parametres exclus). */
export const TRIP_TOGGLABLE_TABS: readonly TripTabKey[] = ['courses', 'notes', 'taches', 'adresses', 'budget'];

export type TabState = Record<TripTabKey, boolean>;

export const DEFAULT_TAB_STATE: TabState = {
  infos: true,
  courses: true,
  notes: true,
  taches: true,
  adresses: true,
  budget: true,
  parametres: true,
};

/**
 * Coercition défensive du `tab_state` servi (jsonb, lignes démo héritées sans
 * la colonne) : clés inconnues ignorées, clés absentes à `true` (jamais de
 * masquage silencieux par une valeur manquante).
 */
export function parseTabState(value: unknown): TabState {
  const record = (value ?? {}) as Partial<Record<TripTabKey, unknown>>;
  const read = (key: TripTabKey): boolean => (record[key] === false ? false : true);
  return {
    infos: true,
    courses: read('courses'),
    notes: read('notes'),
    taches: read('taches'),
    adresses: read('adresses'),
    budget: read('budget'),
    parametres: true,
  };
}

/** Onglets visibles de la fiche : structurels + bascules activées. */
export function visibleTripTabs(tabState: TabState): Array<{ key: TripTabKey; label: string }> {
  return TRIP_TABS.filter((tab) => tabState[tab.key]);
}

export interface TripInput {
  name: string;
  destination: string;
  startDate: IsoDate;
  endDate: IsoDate;
  coverPhoto: string;
  /**
   * Fichier téléversé à l'enregistrement (D-11) : déposé sous
   * `trips/<id>/` via le helper partagé, il GAGNE sur `coverPhoto` quand les
   * deux sont fournis (précédence documentée côté dialogue).
   */
  coverFile?: File | null;
  notes: string;
  /**
   * Participants sélectionnés (phase 15, D-01) : identifiants de membres
   * admin/membre du foyer — les enfants ne sont jamais proposés, et le
   * serveur ré-valide (Edge + RPC). Vide = régime historique (création
   * simple sans participants, liste du foyer).
   */
  participantIds?: string[];
  /**
   * Onglets activés à la création (phase 15, D-05) : les clés absentes
   * restent affichées. `infos`/`parametres` sont structurels.
   */
  enabledTabs?: TripTabKey[];
}

export const EMPTY_TRIP_INPUT: TripInput = {
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  coverPhoto: DEFAULT_TRIP_COVER,
  notes: '',
};

const isoOrEmpty = (value: string | null | undefined): IsoDate => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

/** Statut dérivé des dates : sans dates fixes, le voyage reste « à préparer ». */
export function deriveTripStatus(startDate: IsoDate, endDate: IsoDate, today: IsoDate = todayIso()): TripStatus {
  if (!startDate || !endDate) return 'a_preparer';
  if (endDate < today) return 'termine';
  if (startDate <= today) return 'en_cours';
  return 'confirme';
}

/** « 12 — 18 avril 2027 », puis les dates détaillées si les mois diffèrent. */
export function formatTripRange(startDate: IsoDate, endDate: IsoDate): string {
  if (!startDate && !endDate) return 'Dates à définir';
  if (!startDate || !endDate) return formatMediumDate(startDate || endDate);
  const from = toLocalDate(startDate);
  const to = toLocalDate(endDate);
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  const day = (date: Date) => String(date.getDate());
  const month = (date: Date) => new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(date);
  if (sameMonth) return `${day(from)} — ${day(to)} ${month(to)} ${to.getFullYear()}`;
  if (sameYear) return `${day(from)} ${month(from)} — ${day(to)} ${month(to)} ${to.getFullYear()}`;
  return `${formatMediumDate(startDate)} — ${formatMediumDate(endDate)}`;
}

export function toTrip(row: TripRow, today: IsoDate = todayIso()): Trip {
  const startDate = isoOrEmpty(row.start_date);
  const endDate = isoOrEmpty(row.end_date);
  const status = deriveTripStatus(startDate, endDate, today);
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    destination: row.destination || row.name,
    startDate,
    endDate,
    coverPhoto: row.cover_photo || DEFAULT_TRIP_COVER,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    status,
    statusLabel: TRIP_STATUS_LABELS[status],
    days: startDate && endDate ? Math.max(1, daysBetween(startDate, endDate)) : 0,
    dateLabel: formatTripRange(startDate, endDate),
    upcoming: status === 'confirme' || status === 'en_cours',
    createdBy: row.created_by ?? null,
    tabState: parseTabState(row.tab_state),
    closed: row.is_closed === true,
  };
}

/**
 * Construit le `tab_state` à envoyer au serveur depuis les onglets cochés :
 * `infos`/`parametres` structurels, toujours à `true`.
 */
export function tabStateFromEnabled(enabled: TripTabKey[]): TabState {
  const kept = new Set(enabled);
  const read = (key: TripTabKey): boolean => kept.has(key);
  return {
    infos: true,
    courses: read('courses'),
    notes: read('notes'),
    taches: read('taches'),
    adresses: read('adresses'),
    budget: read('budget'),
    parametres: true,
  };
}

/** Prochain voyage : le plus proche non terminé, sinon le premier de la liste. */
export function nextTrip(trips: Trip[]): Trip | null {
  const upcoming = trips.filter((trip) => trip.upcoming).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming[0]) return upcoming[0];
  const sorted = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sorted[0] ?? null;
}

export interface TripPrepStats {
  /** Tâches du foyer encore ouvertes : les éléments à préparer. */
  openTasks: number;
  /** Part des tâches déjà traitées, en pourcentage. */
  progress: number;
}

/**
 * « Éléments à prepares » : le schéma n'a pas de liste dePreparation
 * dédiée, la mesure s'appuie donc sur les tâches du foyer — un vrai compte
 * plutôt qu'une valeur décorative.
 */
export function computeTripPrepStats(tasks: Array<{ status: string }>): TripPrepStats {
  const total = tasks.length;
  const open = tasks.filter((task) => task.status !== 'fait').length;
  return {
    openTasks: open,
    progress: total === 0 ? 0 : Math.round(((total - open) / total) * 100),
  };
}

export interface MemberStack {
  shown: HouseholdMemberRow[];
  overflow: number;
}

export function memberStack(members: HouseholdMemberRow[], max = 3): MemberStack {
  return { shown: members.slice(0, max), overflow: Math.max(0, members.length - max) };
}
