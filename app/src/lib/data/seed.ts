import { addDays, todayIso } from '@/lib/utils';
import type {
  BirthdayRow,
  ConversationMemberRow,
  ConversationRow,
  DashboardWidgetRow,
  EventReminderRow,
  EventRow,
  ExpenseParticipantRow,
  ExpenseRow,
  ExternalParticipantRow,
  GiftItemRow,
  GiftListRow,
  GiftListShareRow,
  HouseholdMemberRow,
  HouseholdRow,
  LoyaltyCardRow,
  MessageRow,
  NoteRow,
  PetRecordRow,
  PetRow,
  PlaceRow,
  PostCommentRow,
  PostMediaRow,
  PostReactionRow,
  PostRow,
  ProfileRow,
  ProviderRow,
  ProviderTypeRow,
  RecipeRow,
  RoutineAssigneeRow,
  RoutineCompletionRow,
  RoutineRow,
  ShoppingListItemRow,
  ShoppingListRow,
  TaskAssigneeRow,
  TaskReminderRow,
  TaskRow,
  TripRow,
} from '@/types';
import type { Row } from '@/types';

/**
 * Jeu de démonstration reprenant à l'identique le contenu de l'export de
 * design (mêmes libellés, mêmes montants, mêmes prénoms). Les dates sont
 * recalées sur la date du jour pour que le foyer reste « vivant ».
 */

const now = () => new Date().toISOString();
const day = (offset: number) => addDays(todayIso(), offset);

export const DEMO_USER_ID = 'user-camille';
export const DEMO_HOUSEHOLD_ID = 'household-martin';

const memberId = (slug: string) => `member-${slug}`;

export const DEMO_MEMBERS = {
  camille: memberId('camille'),
  thomas: memberId('thomas'),
  lina: memberId('lina'),
  noe: memberId('noe'),
  maya: memberId('maya'),
} as const;

const at = (time: string) => `${day(0)}T${time}:00`;

export const demoProfile: ProfileRow = {
  id: DEMO_USER_ID,
  email: 'camille.martin@example.fr',
  display_name: 'Camille Martin',
  avatar_url: null,
  provider: 'email',
  created_at: now(),
  updated_at: now(),
};

export const demoHousehold: HouseholdRow = {
  id: DEMO_HOUSEHOLD_ID,
  name: 'Foyer Martin',
  avatar_color: 'accent',
  created_by: DEMO_USER_ID,
  created_at: now(),
  updated_at: now(),
};

export const demoMembers: HouseholdMemberRow[] = [
  {
    id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    user_id: DEMO_USER_ID,
    display_name: 'Camille Martin',
    avatar_url: null,
    color_tag: 'accent',
    role: 'admin',
    created_at: now(),
  },
  {
    id: DEMO_MEMBERS.thomas,
    household_id: DEMO_HOUSEHOLD_ID,
    user_id: null,
    display_name: 'Thomas Martin',
    avatar_url: null,
    color_tag: 'ink',
    role: 'membre',
    created_at: now(),
  },
  {
    id: DEMO_MEMBERS.lina,
    household_id: DEMO_HOUSEHOLD_ID,
    user_id: null,
    display_name: 'Lina Martin',
    avatar_url: null,
    color_tag: 'coral',
    role: 'membre',
    created_at: now(),
  },
  {
    id: DEMO_MEMBERS.noe,
    household_id: DEMO_HOUSEHOLD_ID,
    user_id: null,
    display_name: 'Noé Martin',
    avatar_url: null,
    color_tag: 'amber',
    role: 'enfant',
    created_at: now(),
  },
  {
    id: DEMO_MEMBERS.maya,
    household_id: DEMO_HOUSEHOLD_ID,
    user_id: null,
    display_name: 'Maya Martin',
    avatar_url: null,
    color_tag: 'violet',
    role: 'membre',
    created_at: now(),
  },
];

export const demoShoppingLists: ShoppingListRow[] = [
  { id: 'list-fresque', household_id: DEMO_HOUSEHOLD_ID, name: 'Fresque', created_by: DEMO_MEMBERS.camille, created_at: now() },
  { id: 'list-maison', household_id: DEMO_HOUSEHOLD_ID, name: 'Maison', created_by: DEMO_MEMBERS.camille, created_at: now() },
];

export const demoShoppingItems: ShoppingListItemRow[] = [
  { id: 'item-1', list_id: 'list-fresque', household_id: DEMO_HOUSEHOLD_ID, name: 'Yaourts', quantity: 8, unit: 'pots', category: 'Frais', checked: false, added_by: DEMO_MEMBERS.camille, created_at: now() },
  { id: 'item-2', list_id: 'list-fresque', household_id: DEMO_HOUSEHOLD_ID, name: 'Fruits', quantity: 1, unit: 'sachet', category: 'Frais', checked: false, added_by: DEMO_MEMBERS.lina, created_at: now() },
  { id: 'item-3', list_id: 'list-fresque', household_id: DEMO_HOUSEHOLD_ID, name: 'Lait d’agne', quantity: 3, unit: 'briques', category: 'Frais', checked: false, added_by: DEMO_MEMBERS.thomas, created_at: now() },
  { id: 'item-4', list_id: 'list-maison', household_id: DEMO_HOUSEHOLD_ID, name: 'Papier toilette', quantity: 2, unit: 'paquets', category: 'Hygiène', checked: true, added_by: DEMO_MEMBERS.camille, created_at: now() },
  { id: 'item-5', list_id: 'list-maison', household_id: DEMO_HOUSEHOLD_ID, name: 'Savon liquide', quantity: 1, unit: 'flacon', category: 'Hygiène', checked: false, added_by: DEMO_MEMBERS.lina, created_at: now() },
];

export const demoEvents: EventRow[] = [
  {
    id: 'event-1',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Rendez-vous chez le médecin',
    description: 'Cabinet du Dr Morel, prendre la carte vitale.',
    start_at: at('19:30'),
    end_at: at('20:15'),
    all_day: false,
    location: 'Cabinet du Dr Morel',
    color: 'coral',
    created_by: DEMO_MEMBERS.camille,
    created_at: now(),
  },
  {
    id: 'event-2',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Anniversaire de Noé',
    description: null,
    start_at: at('18:00'),
    end_at: at('22:00'),
    all_day: false,
    location: 'Maison',
    color: 'accent',
    created_by: DEMO_MEMBERS.camille,
    created_at: now(),
  },
  {
    id: 'event-3',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Réunion de rentrée — école',
    description: 'Inscription aux activités.',
    start_at: `${day(4)}T18:30:00`,
    end_at: `${day(4)}T19:30:00`,
    all_day: false,
    location: 'École Jean Moulin',
    color: 'accent',
    created_by: DEMO_MEMBERS.thomas,
    created_at: now(),
  },
  {
    id: 'event-4',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Courses du samedi',
    description: null,
    start_at: `${day(2)}T10:00:00`,
    end_at: `${day(2)}T11:00:00`,
    all_day: false,
    location: 'Marché de proximité',
    color: 'amber',
    created_by: DEMO_MEMBERS.camille,
    created_at: now(),
  },
];

export const demoEventReminders: EventReminderRow[] = [
  { id: 'event-reminder-1', event_id: 'event-1', remind_at: at('18:30') },
  { id: 'event-reminder-2', event_id: 'event-2', remind_at: at('17:00') },
];

export const demoNotes: NoteRow[] = [
  {
    id: 'note-1',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Liste de rentrée',
    content: 'Cartables, crayons, gourdes et un goûter pour le premier jour.',
    category: 'Maison',
    color: 'accent',
    created_by: DEMO_MEMBERS.camille,
    created_at: `${day(-2)}T18:45:00`,
    updated_at: `${day(0)}T18:45:00`,
  },
  {
    id: 'note-2',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Idées de week-end',
    content: 'Une balade au bord du lac, puis un déjeuner dehors si le temps reste doux.',
    category: 'Loisirs',
    color: null,
    created_by: DEMO_MEMBERS.lina,
    created_at: `${day(-3)}T10:12:00`,
    updated_at: `${day(-2)}T09:20:00`,
  },
  {
    id: 'note-3',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'À demander à Léa',
    content: 'Son nouveau numéro pour le groupe des parents et les horaires de piscine.',
    category: 'Foyer',
    color: null,
    created_by: DEMO_MEMBERS.camille,
    created_at: `${day(-4)}T21:02:00`,
    updated_at: `${day(-4)}T21:02:00`,
  },
];

export const demoTasks: TaskRow[] = [
  {
    id: 'task-1',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Valider les rendez-vous du carnet',
    description: 'Appeler le cabinet puis mettre à jour le carnet.',
    due_date: day(0),
    priority_order: 0,
    status: 'a_faire',
    created_by: DEMO_MEMBERS.camille,
    created_at: now(),
  },
  {
    id: 'task-2',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Ajouter le lait d’agne',
    description: 'Pour la recette de samedi.',
    due_date: day(1),
    priority_order: 1,
    status: 'a_faire',
    created_by: DEMO_MEMBERS.thomas,
    created_at: now(),
  },
  {
    id: 'task-3',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Ranger les photos de l’été',
    description: null,
    due_date: day(2),
    priority_order: 2,
    status: 'fait',
    created_by: DEMO_MEMBERS.lina,
    created_at: now(),
  },
  {
    id: 'task-4',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Choisir le menu du week-end',
    description: null,
    due_date: day(-1),
    priority_order: 3,
    status: 'a_faire',
    created_by: DEMO_MEMBERS.thomas,
    created_at: now(),
  },
];

export const demoTaskAssignees: TaskAssigneeRow[] = [
  { task_id: 'task-1', member_id: DEMO_MEMBERS.camille },
  { task_id: 'task-2', member_id: DEMO_MEMBERS.thomas },
  { task_id: 'task-3', member_id: DEMO_MEMBERS.lina },
  { task_id: 'task-4', member_id: DEMO_MEMBERS.thomas },
];

export const demoTaskReminders: TaskReminderRow[] = [
  { id: 'task-reminder-1', task_id: 'task-1', remind_at: at('18:30') },
  { id: 'task-reminder-2', task_id: 'task-2', remind_at: `${day(1)}T18:00:00` },
];

export const demoRoutines: RoutineRow[] = [
  {
    id: 'routine-1',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Sortie canine',
    description: 'Promenade du soir, avant la nuit.',
    recurrence_rule: 'FREQ=DAILY',
    created_by: DEMO_MEMBERS.camille,
    created_at: now(),
  },
  {
    id: 'routine-2',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Penser aux anniversaires',
    description: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    created_by: DEMO_MEMBERS.thomas,
    created_at: now(),
  },
  {
    id: 'routine-3',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Mettre la poubelle',
    description: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=WE',
    created_by: DEMO_MEMBERS.lina,
    created_at: now(),
  },
];

export const demoRoutineAssignees: RoutineAssigneeRow[] = [
  { routine_id: 'routine-1', member_id: DEMO_MEMBERS.camille },
  { routine_id: 'routine-2', member_id: DEMO_MEMBERS.thomas },
  { routine_id: 'routine-3', member_id: DEMO_MEMBERS.lina },
];

export const demoRoutineCompletions: RoutineCompletionRow[] = [
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `routine-1-completion-${index}`,
    routine_id: 'routine-1',
    household_id: DEMO_HOUSEHOLD_ID,
    occurrence_date: day(-index),
    completed_by: DEMO_MEMBERS.camille,
    completed_at: `${day(-index)}T18:42:00`,
    status: 'fait' as const,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `routine-2-completion-${index}`,
    routine_id: 'routine-2',
    household_id: DEMO_HOUSEHOLD_ID,
    occurrence_date: day(-7 * index),
    completed_by: DEMO_MEMBERS.thomas,
    completed_at: `${day(-7 * index)}T09:00:00`,
    status: 'fait' as const,
  })),
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `routine-3-completion-${index}`,
    routine_id: 'routine-3',
    household_id: DEMO_HOUSEHOLD_ID,
    occurrence_date: day(-7 * index),
    completed_by: DEMO_MEMBERS.lina,
    completed_at: `${day(-7 * index)}T20:15:00`,
    status: 'fait' as const,
  })),
];

export const demoRecipes: RecipeRow[] = [
  { id: 'recipe-1', household_id: DEMO_HOUSEHOLD_ID, title: 'Tartiflette de saison', created_at: now() },
];

export const demoExpenses: ExpenseRow[] = [
  {
    id: 'expense-1',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Courses du samedi',
    amount: 84.5,
    paid_by: DEMO_MEMBERS.camille,
    expense_date: day(0),
    split_type: 'egal',
    created_at: now(),
  },
  {
    id: 'expense-2',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Essence — aller-retour',
    amount: 62.3,
    paid_by: DEMO_MEMBERS.thomas,
    expense_date: day(-2),
    split_type: 'egal',
    created_at: now(),
  },
  {
    id: 'expense-3',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Café du marché',
    amount: 8.5,
    paid_by: DEMO_MEMBERS.lina,
    expense_date: day(-5),
    split_type: 'egal',
    created_at: now(),
  },
  {
    id: 'expense-4',
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Cinema — séance du mercredi',
    amount: 34,
    paid_by: DEMO_MEMBERS.thomas,
    expense_date: day(-9),
    split_type: 'personnalise',
    created_at: now(),
  },
];

export const demoExternalParticipants: ExternalParticipantRow[] = [
  { id: 'external-1', household_id: DEMO_HOUSEHOLD_ID, name: 'Julie (voisine)', contact: '06 12 34 56 78' },
];

export const demoExpenseParticipants: ExpenseParticipantRow[] = [
  { id: 'ep-1', expense_id: 'expense-1', participant_type: 'membre', member_id: DEMO_MEMBERS.camille, external_participant_id: null, share_amount: 28.17 },
  { id: 'ep-2', expense_id: 'expense-1', participant_type: 'membre', member_id: DEMO_MEMBERS.thomas, external_participant_id: null, share_amount: 28.17 },
  { id: 'ep-3', expense_id: 'expense-1', participant_type: 'membre', member_id: DEMO_MEMBERS.lina, external_participant_id: null, share_amount: 28.16 },
  { id: 'ep-4', expense_id: 'expense-2', participant_type: 'membre', member_id: DEMO_MEMBERS.thomas, external_participant_id: null, share_amount: 31.15 },
  { id: 'ep-5', expense_id: 'expense-2', participant_type: 'membre', member_id: DEMO_MEMBERS.camille, external_participant_id: null, share_amount: 31.15 },
  { id: 'ep-6', expense_id: 'expense-3', participant_type: 'membre', member_id: DEMO_MEMBERS.lina, external_participant_id: null, share_amount: 8.5 },
  { id: 'ep-7', expense_id: 'expense-4', participant_type: 'membre', member_id: DEMO_MEMBERS.thomas, external_participant_id: null, share_amount: 17 },
  { id: 'ep-8', expense_id: 'expense-4', participant_type: 'externe', member_id: null, external_participant_id: 'external-1', share_amount: 17 },
];

export const demoGiftLists: GiftListRow[] = [
  { id: 'gift-list-maya', household_id: DEMO_HOUSEHOLD_ID, owner_member_id: DEMO_MEMBERS.camille, name: 'Idées pour Maya', visibility: 'privee', created_at: now() },
  { id: 'gift-list-noe', household_id: DEMO_HOUSEHOLD_ID, owner_member_id: DEMO_MEMBERS.camille, name: 'Anniversaire de Noé', visibility: 'foyer', created_at: now() },
];

export const demoGiftItems: GiftItemRow[] = [
  {
    id: 'gift-1',
    list_id: 'gift-list-maya',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Atelier céramique',
    price: 45,
    comment: 'Offrir avec un petit voucher.',
    photo_url: '/assets/cadeaux.jpg',
    url: null,
    reserved_by: null,
    purchased: false,
    created_at: now(),
  },
  {
    id: 'gift-2',
    list_id: 'gift-list-noe',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Casque pour le vélo',
    price: 89,
    comment: 'Vérifier la taille avant de commander.',
    photo_url: '/assets/cercle.jpg',
    url: null,
    reserved_by: DEMO_MEMBERS.thomas,
    purchased: false,
    created_at: now(),
  },
  {
    id: 'gift-3',
    list_id: 'gift-list-maya',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Un livre sur les jardins',
    price: 24,
    comment: 'Le paperback illustré.',
    photo_url: '/assets/adresses.jpg',
    url: 'https://exemple.fr/livre-jardins',
    reserved_by: null,
    purchased: false,
    created_at: now(),
  },
];

export const demoGiftShares: GiftListShareRow[] = [
  { id: 'gift-share-1', list_id: 'gift-list-noe', shared_with_member_id: DEMO_MEMBERS.lina, shared_with_email: null, permission: 'lecture' },
];

export const demoBirthdays: BirthdayRow[] = [
  { id: 'birthday-1', household_id: DEMO_HOUSEHOLD_ID, name: 'Maya Martin', birth_date: '1992-10-07', photo_url: null, linked_member_id: null },
  { id: 'birthday-2', household_id: DEMO_HOUSEHOLD_ID, name: 'Paul Durand', birth_date: '1988-10-19', photo_url: null, linked_member_id: null },
  { id: 'birthday-3', household_id: DEMO_HOUSEHOLD_ID, name: 'Nina Leroy', birth_date: '1990-11-03', photo_url: null, linked_member_id: null },
  { id: 'birthday-4', household_id: DEMO_HOUSEHOLD_ID, name: 'Noé Martin', birth_date: '2016-09-29', photo_url: null, linked_member_id: DEMO_MEMBERS.noe },
];

export const demoPets: PetRow[] = [
  {
    id: 'pet-1',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Nala',
    species: 'Chien',
    breed: 'Golden retriever',
    weight_kg: 28.4,
    birth_date: '2021-03-12',
    identification_number: 'FR-483920',
    photo_url: '/assets/animaux.jpg',
    created_at: now(),
  },
];

export const demoPetRecords: PetRecordRow[] = [
  {
    id: 'pet-record-1',
    pet_id: 'pet-1',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'vaccin',
    name: 'Rappel annuel — rage',
    record_date: '2025-10-08',
    next_due_date: day(13),
    notes: 'À faire chez le vétérinaire habituel.',
    attachment_url: null,
  },
  {
    id: 'pet-record-2',
    pet_id: 'pet-1',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'produit',
    name: 'Alimentation — croquettes XL',
    record_date: day(-1),
    next_due_date: day(11),
    notes: 'Un sac pour 12 jours.',
    attachment_url: null,
  },
  {
    id: 'pet-record-3',
    pet_id: 'pet-1',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'traitement',
    name: 'Antiparasitaire',
    record_date: day(-40),
    next_due_date: day(13),
    notes: 'Gouttes en spot-on.',
    attachment_url: null,
  },
  {
    id: 'pet-record-4',
    pet_id: 'pet-1',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'info',
    name: 'Dernière consultation',
    record_date: '2026-06-14',
    next_due_date: null,
    notes: 'Poids stable, dents à surveiller.',
    attachment_url: null,
  },
];

export const demoProviderTypes: ProviderTypeRow[] = [
  { id: 'provider-type-1', household_id: DEMO_HOUSEHOLD_ID, name: 'Médecin', icon: 'heart', created_at: now() },
  { id: 'provider-type-2', household_id: DEMO_HOUSEHOLD_ID, name: 'Artisan', icon: 'settings', created_at: now() },
  { id: 'provider-type-3', household_id: DEMO_HOUSEHOLD_ID, name: 'École', icon: 'checkCircle', created_at: now() },
  { id: 'provider-type-4', household_id: DEMO_HOUSEHOLD_ID, name: 'Admin', icon: 'checkCircle', created_at: now() },
];

export const demoProviders: ProviderRow[] = [
  {
    id: 'provider-1',
    household_id: DEMO_HOUSEHOLD_ID,
    provider_type_id: 'provider-type-1',
    name: 'Cabinet du Dr Morel',
    email: 'secretariat@cabinet-morel.fr',
    phone: '04 72 00 00 00',
    address: '18 rue des Tilleuls',
    postal_code: '69006',
    city: 'Lyon',
    notes: 'Prendre rendez-vous avant 17 h.',
    created_at: now(),
  },
  {
    id: 'provider-2',
    household_id: DEMO_HOUSEHOLD_ID,
    provider_type_id: 'provider-type-2',
    name: 'Atelier Bois & Co',
    email: 'hello@bois-co.fr',
    phone: '06 00 00 00 00',
    address: '5 impasse du Moulin',
    postal_code: '69100',
    city: 'Villeurbanne',
    notes: 'Devis rapide pour les petites réparations.',
    created_at: now(),
  },
];

export const demoLoyaltyCards: LoyaltyCardRow[] = [
  {
    id: 'loyalty-1',
    household_id: DEMO_HOUSEHOLD_ID,
    member_id: DEMO_MEMBERS.camille,
    name: 'Marché de proximité',
    code_type: 'barcode',
    code_value: '628411903312',
    brand_color: 'accent',
    created_at: now(),
  },
  {
    id: 'loyalty-2',
    household_id: DEMO_HOUSEHOLD_ID,
    member_id: null,
    name: 'Librairie du parc',
    code_type: 'qr',
    code_value: 'LIB-4821-076',
    brand_color: 'coral',
    created_at: now(),
  },
];

export const demoPlaces: PlaceRow[] = [
  {
    id: 'place-1',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'cafe',
    photo_url: '/assets/adresses.jpg',
    name: 'Le Café du Matin',
    street: '12 rue des Tilleuls',
    postal_code: '69006',
    city: 'Lyon',
    phone: null,
    rating: 4,
    visited: true,
    note: 'Terrasse calme le matin.',
    created_at: now(),
  },
  {
    id: 'place-2',
    household_id: DEMO_HOUSEHOLD_ID,
    type: 'parc',
    photo_url: '/assets/voyages.jpg',
    name: 'Le Parc du Quartier',
    street: null,
    postal_code: null,
    city: 'Lyon',
    phone: null,
    rating: 5,
    visited: false,
    note: 'À découvrir avec le pique-nique.',
    created_at: now(),
  },
];

export const demoPosts: PostRow[] = [
  {
    id: 'post-1',
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: DEMO_MEMBERS.lina,
    text: 'Le soleil est enfin revenu. Proposition : balade au bord du lac après le goûter ?',
    created_at: `${new Date(Date.now() - 18 * 60_000).toISOString()}`,
  },
  {
    id: 'post-2',
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: DEMO_MEMBERS.thomas,
    text: 'J’ai retrouvé le numéro de la bibliothèque pour vous. Je le garde dans Prestataires.',
    created_at: `${new Date(Date.now() - 26 * 3_600_000).toISOString()}`,
  },
];

export const demoPostMedia: PostMediaRow[] = [
  { id: 'post-media-1', post_id: 'post-1', household_id: DEMO_HOUSEHOLD_ID, media_type: 'photo', url: '/assets/cercle.jpg' },
];

export const demoPostComments: PostCommentRow[] = [
  {
    id: 'post-comment-1',
    post_id: 'post-1',
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: DEMO_MEMBERS.thomas,
    content: 'Je suis partant pour 16 h.',
    created_at: `${new Date(Date.now() - 12 * 60_000).toISOString()}`,
  },
  {
    id: 'post-comment-2',
    post_id: 'post-1',
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: DEMO_MEMBERS.camille,
    content: 'Parfait, je prépare le sac.',
    created_at: `${new Date(Date.now() - 6 * 60_000).toISOString()}`,
  },
];

export const demoPostReactions: PostReactionRow[] = [
  { id: 'post-reaction-1', post_id: 'post-1', household_id: DEMO_HOUSEHOLD_ID, author_id: DEMO_MEMBERS.camille, reaction_type: 'coeur', created_at: now() },
  { id: 'post-reaction-2', post_id: 'post-1', household_id: DEMO_HOUSEHOLD_ID, author_id: DEMO_MEMBERS.thomas, reaction_type: 'coeur', created_at: now() },
  { id: 'post-reaction-3', post_id: 'post-1', household_id: DEMO_HOUSEHOLD_ID, author_id: DEMO_MEMBERS.noe, reaction_type: 'coeur', created_at: now() },
  { id: 'post-reaction-4', post_id: 'post-2', household_id: DEMO_HOUSEHOLD_ID, author_id: DEMO_MEMBERS.lina, reaction_type: 'coeur', created_at: now() },
];

export const demoTrips: TripRow[] = [
  {
    id: 'trip-1',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Week-end à Lisbonne',
    destination: 'Lisbonne',
    start_date: '2027-04-12',
    end_date: '2027-04-18',
    cover_photo: '/assets/lisbonne.jpg',
    notes: 'Un voyage à préparer tranquillement.',
    created_at: now(),
  },
];

export const demoConversations: ConversationRow[] = [
  { id: 'conversation-1', household_id: DEMO_HOUSEHOLD_ID, type: 'direct', title: null, created_at: now() },
  { id: 'conversation-2', household_id: DEMO_HOUSEHOLD_ID, type: 'direct', title: null, created_at: now() },
  { id: 'conversation-3', household_id: DEMO_HOUSEHOLD_ID, type: 'direct', title: 'Maya Martin', created_at: now() },
];

export const demoConversationMembers: ConversationMemberRow[] = [
  { conversation_id: 'conversation-1', member_id: DEMO_MEMBERS.camille },
  { conversation_id: 'conversation-1', member_id: DEMO_MEMBERS.lina },
  { conversation_id: 'conversation-2', member_id: DEMO_MEMBERS.camille },
  { conversation_id: 'conversation-2', member_id: DEMO_MEMBERS.thomas },
  { conversation_id: 'conversation-3', member_id: DEMO_MEMBERS.camille },
];

export const demoMessages: MessageRow[] = [
  {
    id: 'message-1',
    conversation_id: 'conversation-1',
    household_id: DEMO_HOUSEHOLD_ID,
    sender_id: DEMO_MEMBERS.lina,
    content: 'Tu as vu le nouveau parc ?',
    media_url: null,
    created_at: `${at('10:42')}`,
  },
  {
    id: 'message-2',
    conversation_id: 'conversation-1',
    household_id: DEMO_HOUSEHOLD_ID,
    sender_id: DEMO_MEMBERS.camille,
    content: 'Pas encore, tu me donneras l’adresse ?',
    media_url: null,
    created_at: `${at('10:44')}`,
  },
  {
    id: 'message-3',
    conversation_id: 'conversation-1',
    household_id: DEMO_HOUSEHOLD_ID,
    sender_id: DEMO_MEMBERS.lina,
    content: 'Oui, je te l’envoie dans Adresses.',
    media_url: null,
    created_at: `${at('10:45')}`,
  },
  {
    id: 'message-4',
    conversation_id: 'conversation-2',
    household_id: DEMO_HOUSEHOLD_ID,
    sender_id: DEMO_MEMBERS.thomas,
    content: 'Je peux prendre le pain.',
    media_url: null,
    created_at: `${at('09:18')}`,
  },
  {
    id: 'message-5',
    conversation_id: 'conversation-3',
    household_id: DEMO_HOUSEHOLD_ID,
    sender_id: DEMO_MEMBERS.maya,
    content: 'Merci pour la liste !',
    media_url: null,
    created_at: `${at('18:10')}`,
  },
];

export const demoWidgets: DashboardWidgetRow[] = [
  {
    id: 'widget-1',
    member_id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    widget_type: 'calendrier',
    position_x: 0,
    position_y: 0,
    width: 1,
    height: 1,
    settings: null,
  },
  {
    id: 'widget-2',
    member_id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    widget_type: 'taches',
    position_x: 1,
    position_y: 0,
    width: 1,
    height: 1,
    settings: null,
  },
  {
    id: 'widget-3',
    member_id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    widget_type: 'meteo',
    position_x: 0,
    position_y: 1,
    width: 1,
    height: 1,
    settings: null,
  },
  {
    id: 'widget-4',
    member_id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    widget_type: 'anniversaires',
    position_x: 1,
    position_y: 1,
    width: 1,
    height: 1,
    settings: null,
  },
  {
    id: 'widget-5',
    member_id: DEMO_MEMBERS.camille,
    household_id: DEMO_HOUSEHOLD_ID,
    widget_type: 'routines',
    position_x: 0,
    position_y: 2,
    width: 2,
    height: 1,
    settings: null,
  },
];

/** Clé de la copie locale (`table` dans `src/lib/data/local-adapter.ts`). */
const seedTables: Record<string, Row[]> = {
  profiles: [demoProfile as unknown as Row],
  households: [demoHousehold as unknown as Row],
  household_members: demoMembers as unknown as Row[],
  shopping_lists: demoShoppingLists as unknown as Row[],
  shopping_list_items: demoShoppingItems as unknown as Row[],
  events: demoEvents as unknown as Row[],
  event_reminders: demoEventReminders as unknown as Row[],
  notes: demoNotes as unknown as Row[],
  tasks: demoTasks as unknown as Row[],
  task_assignees: demoTaskAssignees as unknown as Row[],
  task_reminders: demoTaskReminders as unknown as Row[],
  routines: demoRoutines as unknown as Row[],
  routine_assignees: demoRoutineAssignees as unknown as Row[],
  routine_completions: demoRoutineCompletions as unknown as Row[],
  recipes: demoRecipes as unknown as Row[],
  expenses: demoExpenses as unknown as Row[],
  external_participants: demoExternalParticipants as unknown as Row[],
  expense_participants: demoExpenseParticipants as unknown as Row[],
  gift_lists: demoGiftLists as unknown as Row[],
  gift_items: demoGiftItems as unknown as Row[],
  gift_list_shares: demoGiftShares as unknown as Row[],
  birthdays: demoBirthdays as unknown as Row[],
  pets: demoPets as unknown as Row[],
  pet_records: demoPetRecords as unknown as Row[],
  provider_types: demoProviderTypes as unknown as Row[],
  providers: demoProviders as unknown as Row[],
  loyalty_cards: demoLoyaltyCards as unknown as Row[],
  places: demoPlaces as unknown as Row[],
  posts: demoPosts as unknown as Row[],
  post_media: demoPostMedia as unknown as Row[],
  post_comments: demoPostComments as unknown as Row[],
  post_reactions: demoPostReactions as unknown as Row[],
  trips: demoTrips as unknown as Row[],
  conversations: demoConversations as unknown as Row[],
  conversation_members: demoConversationMembers as unknown as Row[],
  messages: demoMessages as unknown as Row[],
  dashboard_widgets: demoWidgets as unknown as Row[],
};

export function seedRows() {
  return seedTables;
}
