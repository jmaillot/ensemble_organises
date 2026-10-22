import { useQuery } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useHouseholdStore, useCurrentMember } from '@/stores/household-store';
import { isChildHiddenModule, type ModuleKey } from '@/lib/modules';
import { formatEuro, formatLongDate, formatShortDate, relativeDayLabel, truncateText } from '@/lib/utils';
import { describeRecurrence } from '@/modules/routines/types';
import type { SearchRecord } from '@/lib/global-search';
import type {
  BirthdayRow,
  ContactRow,
  ConversationMemberRow,
  EventRow,
  ExpenseRow,
  GiftIdeaRow,
  LoyaltyCardRow,
  MessageRow,
  NoteRow,
  PetRow,
  PlaceRow,
  PostRow,
  ProviderRow,
  RecipeRow,
  RoutineRow,
  ShoppingListItemRow,
  TaskRow,
  TripRow,
} from '@/types';

/**
 * Chargement des entrées cherchables du foyer, pour la palette Ctrl/Cmd + K.
 *
 * Une lecture par espace, déclenchée seulement quand la palette est ouverte et
 * que la saisie atteint deux signes : le shell ne paie rien au démarrage. Les
 * tables sont petites à l'échelle d'un foyer, et chaque lecture reste bornée
 * par `household_id` — la RLS fait le reste.
 *
 * Les lectures sont indépendantes : un module en échec ne doit pas vider les
 * seize autres groupes. `Promise.allSettled` garde donc ce qui a répondu, et
 * les modules fautifs remontent séparément pour être dits à l'écran.
 *
 * CE QUE LE CLIENT NE FAIT PAS : il ne filtre pas pour protéger. Une liste de
 * cadeaux privée, un fil de messages, une idée offerte à quelqu'un : la RLS
 * décide de ce qui est lisible, et le client ne refait pas ce jugement. Là où
 * la démo n'a pas de RLS (hors ligne), le client applique le MÊME filtre que
 * l'écran du module — jamais l'inverse, et jamais une version plus large.
 */

/** Longueur d'un libellé affiché : au-delà, la ligne déborde et le nom
 * accessible devient un paragraphe. Le texte entier reste dans `extra`, donc
 * cherchable : c'est la ligne qu'on tronque, pas la matière. */
const LABEL_MAX_LENGTH = 80;

const TASK_STATUS: Record<TaskRow['status'], string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  fait: 'Terminée',
};

const hintOf = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/**
 * Ce que les sources partagent : le foyer, le membre courant, et les lectures
 * communes. Un contexte, pas des paramètres en vrac : une source qui a besoin
 * d'une lecture partagée la demande par son NOM, et la requête part une fois.
 */
interface SearchContext {
  householdId: string;
  /**
   * Membre courant. Sert au masque de surprise des idées cadeaux : une idée
   * destinée à un contact lié au membre courant ne lui est pas montrée.
   */
  currentMemberId: string | null;
  shared: {
    /** Contacts du foyer : servent aux résultats « contacts » ET au masque des idées. */
    contacts: () => Promise<ContactRow[]>;
    /** Appartenances aux fils : servent à ne montrer que les messages de mes fils. */
    conversationMemberships: () => Promise<ConversationMemberRow[]>;
  };
}

/**
 * Une requête par table, même quand deux sources la demandent. La fiche
 * « contacts » alimente à la fois les résultats « contacts » et le masque de
 * surprise des idées cadeaux : une seconde requête pour la même table serait
 * du travail jeté, et deux résultats qui ne concordent pas seraient un bug.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load());
}

interface SearchSource {
  module: ModuleKey;
  load: (context: SearchContext) => Promise<SearchRecord[]>;
}

const sources: SearchSource[] = [
  {
    module: 'taches',
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ shared }) => {
      const rows = await shared.contacts();
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
    load: async ({ householdId }) => {
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
  {
    module: 'routines',
    load: async ({ householdId }) => {
      const rows = await data.list<RoutineRow>('routines', { household_id: householdId });
      return rows.map((row) => ({
        id: `routines:${row.id}`,
        module: 'routines',
        label: row.name,
        // La RRULE est une règle iCalendar : c'est l'écran des routines qui la
        // traduit en français, et la palette dit la même chose que lui.
        hint: hintOf('Routine', describeRecurrence(row.recurrence_rule)),
        extra: row.description,
      }));
    },
  },
  {
    module: 'anniversaires',
    load: async ({ householdId }) => {
      const rows = await data.list<BirthdayRow>('birthdays', { household_id: householdId });
      return rows.map((row) => ({
        id: `birthdays:${row.id}`,
        module: 'anniversaires',
        label: row.name,
        // La date de naissance, pas le compte à rebours : c'est elle qui
        // distingue deux homonymes, et elle ne bouge pas d'une année sur
        // l'autre.
        hint: hintOf('Anniversaire', formatLongDate(row.birth_date)),
      }));
    },
  },
  {
    module: 'ardoise',
    load: async ({ householdId }) => {
      const rows = await data.list<ExpenseRow>('expenses', { household_id: householdId });
      return rows.map((row) => ({
        id: `expenses:${row.id}`,
        module: 'ardoise',
        label: row.title,
        hint: hintOf('Dépense', formatEuro(row.amount), formatShortDate(row.expense_date)),
      }));
    },
  },
  {
    module: 'cadeaux',
    load: async ({ householdId, currentMemberId, shared }) => {
      const [rows, contacts] = await Promise.all([
        data.list<GiftIdeaRow>('gift_ideas', { household_id: householdId }),
        shared.contacts(),
      ]);
      // Le masque de surprise : une idée offerte à un contact lié AU MEMBRE
      // COURANT ne lui est pas montrée. C'est la règle de l'onglet « Idées »
      // (`use-cadeaux.ts`), reprise ici pour que la palette ne divulgue pas
      // ce que l'écran de Cadeaux cache. En ligne, la RLS
      // (`can_read_gift_idea`) filtre déjà ; ce filtre ne peut qu'en retirer
      // davantage, jamais en ajouter.
      const ownContactIds = new Set(
        contacts
          .filter((contact) => contact.linked_member_id && contact.linked_member_id === currentMemberId)
          .map((contact) => contact.id),
      );
      return rows
        .filter((row) => !(row.giftee_contact_id && ownContactIds.has(row.giftee_contact_id)))
        .map((row) => ({
          id: `gift_ideas:${row.id}`,
          module: 'cadeaux',
          label: row.name,
          hint: hintOf('Idée cadeau', row.price != null ? formatEuro(row.price) : null, row.status === 'offert' ? 'offert' : 'à offrir'),
          extra: [row.comment, row.giftee_text].filter(Boolean).join(' '),
        }));
    },
  },
  {
    module: 'cercle',
    load: async ({ householdId }) => {
      const rows = await data.list<PostRow>('posts', { household_id: householdId });
      return rows.map((row) => ({
        id: `posts:${row.id}`,
        module: 'cercle',
        // Le texte entier reste dans `extra` : c'est lui qu'on cherche, et la
        // ligne affichée, elle, est coupée.
        label: truncateText(row.text, LABEL_MAX_LENGTH),
        hint: hintOf('Publication', relativeDayLabel(row.created_at)),
        extra: row.text,
      }));
    },
  },
  {
    module: 'messages',
    load: async ({ householdId, currentMemberId, shared }) => {
      const [rows, memberships] = await Promise.all([
        data.list<MessageRow>('messages', { household_id: householdId }),
        shared.conversationMemberships(),
      ]);
      // Un message d'un fil où l'on n'est pas ne se montre pas. En ligne, la
      // RLS (`messages_select` → `is_conversation_member`) le fait déjà ; hors
      // ligne il n'y a pas de RLS, donc le même filtre est appliqué ici, sur
      // la MÊME règle que l'écran Messages (une appartenance, même tombée :
      // l'historique reste lisible).
      const myConversations = new Set(
        memberships.filter((row) => row.member_id === currentMemberId).map((row) => row.conversation_id),
      );
      return rows
        .filter((row) => myConversations.has(row.conversation_id))
        .map((row) => ({
          id: `messages:${row.id}`,
          module: 'messages',
          label: truncateText(row.content, LABEL_MAX_LENGTH),
          hint: hintOf('Message', relativeDayLabel(row.created_at)),
          extra: row.content,
        }));
    },
  },
];

export interface GlobalSearchData {
  records: SearchRecord[];
  /** Modules dont la lecture a échoué — dits à l'écran, jamais tus. */
  failedModules: ModuleKey[];
}

export async function loadSearchRecords(
  householdId: string,
  isChild: boolean,
  currentMemberId: string | null,
): Promise<GlobalSearchData> {
  const visible = isChild ? sources.filter((source) => !isChildHiddenModule(source.module)) : sources;

  const context: SearchContext = {
    householdId,
    currentMemberId,
    shared: {
      contacts: once(() => data.list<ContactRow>('contacts', { household_id: householdId })),
      conversationMemberships: once(() => data.list<ConversationMemberRow>('conversation_members')),
    },
  };

  const settled = await Promise.allSettled(visible.map((source) => source.load(context)));

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
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  // Le rôle vient du membre courant, comme partout ailleurs dans l'application
  // — jamais d'une source d'identité neuve.
  const isChild = useCurrentMember()?.role === 'enfant';

  const query = useQuery({
    queryKey: ['global-search', householdId, isChild, currentMemberId],
    queryFn: () => loadSearchRecords(householdId as string, isChild, currentMemberId),
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
