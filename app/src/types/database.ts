/**
 * Lignes PostgreSQL telles qu'exposées par PostgREST : les clés sont en
 * `snake_case` pour correspondre exactement aux migrations de `supabase/`.
 * Les modules convertissent ces lignes en types métier (camelCase) dans
 * leur propre `types.ts`.
 */

export type Uuid = string;
export type IsoDate = string; // YYYY-MM-DD
export type IsoDateTime = string; // timestamptz

export type Role = 'admin' | 'membre' | 'enfant';
export type AuthProvider = 'google' | 'facebook' | 'email';
/** Cadence choisie pour les rappels. Aucun envoi n'en dépend encore : voir §13 du runbook. */
export type ReminderFrequency = 'immediat' | 'matin' | 'journée' | 'soir';

export interface ProfileRow {
  id: Uuid; // = auth.users.id
  email: string;
  display_name: string;
  avatar_url: string | null;
  provider: AuthProvider;
  reminder_frequency: ReminderFrequency;
  task_reminders_enabled: boolean;
  event_reminders_enabled: boolean;
  routine_reminders_enabled: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/**
 * Abonnement Web Push d'un appareil.
 *
 * Cette interface n'est PAS une ligne PostgREST : `push_subscriptions` est
 * dépourvue de politique RLS et de privilège client (migration 0018), et n'est
 * donc jamais lue depuis le navigateur. Elle décrit ce que renvoie l'Edge
 * Function `push-subscribe` pour le compte connecté — sans les clés de
 * chiffrement, que le client n'a aucun motif de connaître.
 */
export interface PushDevice {
  id: string;
  endpoint: string;
  device: string;
  created_at: IsoDateTime;
  last_success_at: IsoDateTime | null;
  failure_count: number;
}

export interface HouseholdRow {
  id: Uuid;
  name: string;
  avatar_color: string;
  created_by: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface HouseholdMemberRow {
  id: Uuid;
  household_id: Uuid;
  user_id: Uuid | null; // null pour un profil géré par un parent
  display_name: string;
  avatar_url: string | null;
  color_tag: MemberColorTag;
  role: Role;
  created_at: IsoDateTime;
}

export type MemberColorTag = 'accent' | 'ink' | 'coral' | 'amber' | 'violet';

export interface HouseholdInviteTokenRow {
  id: Uuid;
  household_id: Uuid;
  token_hash: string;
  created_by: Uuid;
  expires_at: IsoDateTime | null;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  created_at: IsoDateTime;
}

export interface InvitationRow {
  id: Uuid;
  household_id: Uuid;
  email: string | null;
  phone: string | null;
  role: Role;
  status: 'en_attente' | 'acceptee' | 'refusee' | 'expiree';
  created_at: IsoDateTime;
}

export interface ShoppingListRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  created_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface ShoppingListItemRow {
  id: Uuid;
  list_id: Uuid;
  household_id: Uuid;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  added_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface EventRow {
  id: Uuid;
  household_id: Uuid;
  title: string;
  description: string | null;
  start_at: IsoDateTime;
  end_at: IsoDateTime | null;
  all_day: boolean;
  location: string | null;
  color: string | null;
  created_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface EventReminderRow {
  id: Uuid;
  event_id: Uuid;
  remind_at: IsoDateTime;
}

export interface NoteRow {
  id: Uuid;
  household_id: Uuid;
  title: string;
  content: string;
  category: string;
  color: string | null;
  created_by: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export type TaskStatus = 'a_faire' | 'en_cours' | 'fait';
export type TaskPriority = 'haute' | 'normale' | 'basse';

export interface TaskRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  description: string | null;
  due_date: IsoDate | null;
  priority_order: number;
  status: TaskStatus;
  created_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface TaskAssigneeRow {
  task_id: Uuid;
  member_id: Uuid;
}

export interface TaskReminderRow {
  id: Uuid;
  task_id: Uuid;
  remind_at: IsoDateTime;
}

export interface RoutineRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  description: string | null;
  recurrence_rule: string; // RRULE
  created_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface RoutineAssigneeRow {
  routine_id: Uuid;
  member_id: Uuid;
}

export interface RoutineReminderRow {
  id: Uuid;
  routine_id: Uuid;
  remind_at: IsoDateTime;
}

export interface RoutineCompletionRow {
  id: Uuid;
  routine_id: Uuid;
  household_id: Uuid;
  occurrence_date: IsoDate;
  completed_by: Uuid | null;
  completed_at: IsoDateTime | null;
  status: 'fait' | 'en_retard' | 'manque';
}

export interface RecipeRow {
  id: Uuid;
  household_id: Uuid;
  title: string;
  created_at: IsoDateTime;
}

export interface ExpenseRow {
  id: Uuid;
  household_id: Uuid;
  title: string;
  amount: number;
  paid_by: Uuid; // household_members.id
  expense_date: IsoDate;
  split_type: 'egal' | 'personnalise';
  created_at: IsoDateTime;
}

export interface ExternalParticipantRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  contact: string | null;
}

export interface ExpenseParticipantRow {
  id: Uuid;
  expense_id: Uuid;
  participant_type: 'membre' | 'externe';
  member_id: Uuid | null;
  external_participant_id: Uuid | null;
  share_amount: number;
}

export interface GiftListRow {
  id: Uuid;
  household_id: Uuid;
  owner_member_id: Uuid;
  name: string;
  visibility: 'privee' | 'foyer' | 'partagee';
  created_at: IsoDateTime;
}

export interface GiftItemRow {
  id: Uuid;
  list_id: Uuid;
  household_id: Uuid;
  name: string;
  price: number | null;
  comment: string | null;
  photo_url: string | null;
  url: string | null;
  reserved_by: Uuid | null;
  purchased: boolean;
  created_at: IsoDateTime;
}

export interface GiftListShareRow {
  id: Uuid;
  list_id: Uuid;
  shared_with_member_id: Uuid | null;
  shared_with_email: string | null;
  permission: 'lecture' | 'reservation';
}

export interface BirthdayRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  birth_date: IsoDate;
  photo_url: string | null;
  linked_member_id: Uuid | null;
}

export interface PetRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  species: string;
  breed: string | null;
  weight_kg: number | null;
  birth_date: IsoDate | null;
  identification_number: string | null;
  photo_url: string | null;
  created_at: IsoDateTime;
}

export type PetRecordType = 'produit' | 'vaccin' | 'traitement' | 'info';

export interface PetRecordRow {
  id: Uuid;
  pet_id: Uuid;
  household_id: Uuid;
  type: PetRecordType;
  name: string;
  record_date: IsoDate;
  next_due_date: IsoDate | null;
  notes: string | null;
  attachment_url: string | null;
}

export interface ProviderTypeRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  icon: string | null;
  created_at: IsoDateTime;
}

export interface ProviderRow {
  id: Uuid;
  household_id: Uuid;
  provider_type_id: Uuid | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
  created_at: IsoDateTime;
}

export interface LoyaltyCardRow {
  id: Uuid;
  household_id: Uuid;
  member_id: Uuid | null;
  name: string;
  code_type: 'barcode' | 'qr';
  code_value: string;
  brand_color: string | null;
  created_at: IsoDateTime;
}

export type PlaceType =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'hotel'
  | 'boutique'
  | 'parc'
  | 'musee'
  | 'cinema'
  | 'theatre'
  | 'bien_etre'
  | 'lieu_phare'
  | 'tourisme'
  | 'autre';

export interface PlaceRow {
  id: Uuid;
  household_id: Uuid;
  type: PlaceType;
  photo_url: string | null;
  name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  rating: number | null;
  visited: boolean;
  note: string | null;
  created_at: IsoDateTime;
}

export interface PostRow {
  id: Uuid;
  household_id: Uuid;
  author_id: Uuid; // household_members.id
  text: string;
  created_at: IsoDateTime;
}

export interface PostMediaRow {
  id: Uuid;
  post_id: Uuid;
  household_id: Uuid;
  media_type: 'photo' | 'video';
  url: string;
}

export interface PostCommentRow {
  id: Uuid;
  post_id: Uuid;
  household_id: Uuid;
  author_id: Uuid;
  content: string;
  created_at: IsoDateTime;
}

export interface PostReactionRow {
  id: Uuid;
  post_id: Uuid;
  household_id: Uuid;
  author_id: Uuid;
  reaction_type: string;
  created_at: IsoDateTime;
}

export interface TripRow {
  id: Uuid;
  household_id: Uuid;
  name: string;
  destination: string;
  start_date: IsoDate;
  end_date: IsoDate;
  cover_photo: string | null;
  notes: string | null;
  created_at: IsoDateTime;
}

export interface ConversationRow {
  id: Uuid;
  household_id: Uuid;
  type: 'direct' | 'groupe';
  title: string | null;
  created_at: IsoDateTime;
}

export interface ConversationMemberRow {
  conversation_id: Uuid;
  member_id: Uuid;
}

export interface MessageRow {
  id: Uuid;
  conversation_id: Uuid;
  household_id: Uuid;
  sender_id: Uuid;
  content: string;
  media_url: string | null;
  created_at: IsoDateTime;
}

export type DashboardWidgetType = 'calendrier' | 'taches' | 'meteo' | 'anniversaires' | 'routines';

export interface DashboardWidgetRow {
  id: Uuid;
  member_id: Uuid;
  household_id: Uuid;
  widget_type: DashboardWidgetType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  settings: Record<string, unknown> | null;
}
