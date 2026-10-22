import { useQuery } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import { useCurrentMember } from '@/stores/household-store';
import { isChildHiddenModule, type ModuleKey } from '@/lib/modules';
import { formatShortDate } from '@/lib/utils';
import type { SearchRecord } from '@/lib/global-search';
import type {
  ContactRow,
  EventRow,
  LoyaltyCardRow,
  NoteRow,
  PetRow,
  PlaceRow,
  ProviderRow,
  RecipeRow,
  ShoppingListItemRow,
  TaskRow,
  TripRow,
} from '@/types';

/**
 * Chargement des entrées cherchables du foyer, pour la palette Ctrl/Cmd + K.
 *
 * Une seule requête, déclenchée seulement quand la palette est ouverte et que
 * la saisie atteint deux signes : le shell ne paie rien au démarrage. Les onze
 * tables sont petites à l'échelle d'un foyer, et la lecture reste bornée par
 * `household_id` — la RLS fait le reste.
 *
 * Les lectures sont indépendantes : un module en échec ne doit pas vider les
 * dix autres groupes. `Promise.allSettled` garde donc ce qui a répondu, et les
 * modules fautifs remontent séparément pour être dits à l'écran.
 */

const TASK_STATUS: Record<TaskRow['status'], string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  fait: 'Terminée',
};

const hintOf = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

interface SearchSource {
  module: ModuleKey;
  load: (householdId: string) => Promise<SearchRecord[]>;
}

const sources: SearchSource[] = [
  {
    module: 'taches',
    load: async (householdId) => {
      const rows = await data.list<TaskRow>('tasks', { household_id: householdId });
      return rows.map((row) => ({
        id: `tasks:${row.id}`,
        module: 'taches',
        label: row.name,
        hint: hintOf('Tâche', TASK_STATUS[row.status], row.due_date ? formatShortDate(row.due_date) : null),
        extra: row.description,
      }));
    },
  },
  {
    module: 'notes',
    load: async (householdId) => {
      const rows = await data.list<NoteRow>('notes', { household_id: householdId });
      return rows.map((row) => ({
        id: `notes:${row.id}`,
        module: 'notes',
        label: row.title,
        hint: hintOf('Note', row.category),
        extra: row.content,
      }));
    },
  },
  {
    module: 'calendrier',
    load: async (householdId) => {
      const rows = await data.list<EventRow>('events', { household_id: householdId });
      return rows.map((row) => ({
        id: `events:${row.id}`,
        module: 'calendrier',
        label: row.title,
        hint: hintOf('Événement', formatShortDate(row.start_at.slice(0, 10))),
        extra: [row.location, row.description].filter(Boolean).join(' '),
      }));
    },
  },
  {
    module: 'courses',
    load: async (householdId) => {
      const rows = await data.list<ShoppingListItemRow>('shopping_list_items', { household_id: householdId });
      return rows.map((row) => ({
        id: `shopping_list_items:${row.id}`,
        module: 'courses',
        label: row.name,
        hint: hintOf('Course', row.checked ? 'cochée' : 'à acheter'),
        extra: row.category,
      }));
    },
  },
  {
    module: 'contacts',
    load: async (householdId) => {
      const rows = await data.list<ContactRow>('contacts', { household_id: householdId });
      return rows.map((row) => ({
        id: `contacts:${row.id}`,
        module: 'contacts',
        label: row.name,
        hint: 'Contact',
      }));
    },
  },
  {
    module: 'recettes',
    load: async (householdId) => {
      const rows = await data.list<RecipeRow>('recipes', { household_id: householdId });
      return rows.map((row) => ({
        id: `recipes:${row.id}`,
        module: 'recettes',
        label: row.title,
        hint: 'Recette',
      }));
    },
  },
  {
    module: 'adresses',
    load: async (householdId) => {
      const rows = await data.list<PlaceRow>('places', { household_id: householdId });
      return rows.map((row) => ({
        id: `places:${row.id}`,
        module: 'adresses',
        label: row.name,
        hint: hintOf('Adresse', row.city),
        extra: [row.street, row.city, row.postal_code].filter(Boolean).join(' '),
      }));
    },
  },
  {
    module: 'prestataires',
    load: async (householdId) => {
      const rows = await data.list<ProviderRow>('providers', { household_id: householdId });
      return rows.map((row) => ({
        id: `providers:${row.id}`,
        module: 'prestataires',
        label: row.name,
        hint: hintOf('Prestataire', row.city),
        extra: [row.email, row.phone, row.address, row.notes].filter(Boolean).join(' '),
      }));
    },
  },
  {
    module: 'animaux',
    load: async (householdId) => {
      const rows = await data.list<PetRow>('pets', { household_id: householdId });
      return rows.map((row) => ({
        id: `pets:${row.id}`,
        module: 'animaux',
        label: row.name,
        hint: hintOf('Animal', row.species),
        extra: row.breed,
      }));
    },
  },
  {
    module: 'fidelite',
    load: async (householdId) => {
      const rows = await data.list<LoyaltyCardRow>('loyalty_cards', { household_id: householdId });
      return rows.map((row) => ({
        id: `loyalty_cards:${row.id}`,
        module: 'fidelite',
        label: row.name,
        hint: 'Carte de fidélité',
      }));
    },
  },
  {
    module: 'voyages',
    load: async (householdId) => {
      const rows = await data.list<TripRow>('trips', { household_id: householdId });
      return rows.map((row) => ({
        id: `trips:${row.id}`,
        module: 'voyages',
        label: row.name,
        hint: hintOf('Voyage', row.destination),
        extra: row.notes,
      }));
    },
  },
];

export interface GlobalSearchData {
  records: SearchRecord[];
  /** Modules dont la lecture a échoué — dits à l'écran, jamais tus. */
  failedModules: ModuleKey[];
}

export async function loadSearchRecords(householdId: string, isChild: boolean): Promise<GlobalSearchData> {
  const visible = isChild ? sources.filter((source) => !isChildHiddenModule(source.module)) : sources;
  const settled = await Promise.allSettled(visible.map((source) => source.load(householdId)));

  const records: SearchRecord[] = [];
  const failedModules: ModuleKey[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') records.push(...result.value);
    else failedModules.push(visible[index].module);
  });

  return { records, failedModules };
}

/**
 * Charge les entrées cherchables quand `enabled` est vrai. Le cache est porté
 * par le foyer et le rôle : changer de foyer ne mélange pas les résultats, et
 * un enfant ne déclenche même pas la lecture des espaces qui lui sont masqués.
 */
export function useGlobalSearch(enabled: boolean) {
  const householdId = useHouseholdStore((state) => state.householdId);
  const isChild = useCurrentMember()?.role === 'enfant';

  const query = useQuery({
    queryKey: ['global-search', householdId, isChild],
    queryFn: () => loadSearchRecords(householdId as string, isChild),
    enabled: enabled && Boolean(householdId),
    staleTime: 30_000,
  });

  return {
    records: query.data?.records ?? EMPTY_RECORDS,
    failedModules: query.data?.failedModules ?? EMPTY_MODULES,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// Constantes de module : un littéral sur place fabriquerait un tableau neuf à
// chaque rendu, et tout `useMemo` qui en dépend se recalculerait sans raison.
const EMPTY_RECORDS: SearchRecord[] = [];
const EMPTY_MODULES: ModuleKey[] = [];
