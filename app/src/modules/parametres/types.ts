import type { Role } from '@/types';

/** Onglets des préférences : la page n'a pas d'équivalent dans l'export. */
export type SettingsTab = 'profil' | 'foyer' | 'invitations' | 'notifications' | 'application';

export const settingsTabs: { value: SettingsTab; label: string }[] = [
  { value: 'profil', label: 'Profil' },
  { value: 'foyer', label: 'Foyer' },
  { value: 'invitations', label: 'Invitations' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'application', label: 'Application' },
];

/** Couleurs proposées pour un foyer, alignées sur la création de foyer. */
export const householdColors = ['accent', 'coral', 'amber', 'ink'] as const;
export type HouseholdColor = (typeof householdColors)[number];

export const householdColorLabels: Record<HouseholdColor, string> = {
  accent: 'Pétrole',
  coral: 'Corail',
  amber: 'Ambre',
  ink: 'Encre',
};

export const householdColorClass: Record<HouseholdColor, string> = {
  accent: 'bg-accent',
  coral: 'bg-coral',
  amber: 'bg-amber',
  ink: 'bg-fg',
};

/** Libellés français des rôles : jamais de valeur SQL dans l'interface. */
export const roleLabels: Record<Role, string> = {
  admin: 'Administrateur',
  membre: 'Membre',
  enfant: 'Enfant',
};

export const roleToneClass: Record<Role, string> = {
  admin: 'bg-accent-soft text-accent-strong',
  membre: 'bg-bg text-muted',
  enfant: 'bg-amber-soft text-[oklch(52%_0.11_78)]',
};

/** Regroupement des rôles pour les listes denses. */
export const roleOrder: Role[] = ['admin', 'membre', 'enfant'];

/** Fréquence des rappels push (stockée localement, cf. `lib/push.ts`). */
export type ReminderFrequency = 'immediat' | 'matin' | 'journée' | 'soir';

export const reminderFrequencies: { value: ReminderFrequency; label: string }[] = [
  { value: 'immediat', label: 'Immédiat' },
  { value: 'matin', label: 'Le matin (8 h)' },
  { value: 'journée', label: 'Toutes les 3 heures' },
  { value: 'soir', label: 'Le soir (19 h)' },
];

export const reminderFrequencyLabel = (value: ReminderFrequency) =>
  reminderFrequencies.find((entry) => entry.value === value)?.label ?? 'Immédiat';

export const providerLabels = {
  google: 'Google',
  facebook: 'Facebook',
  email: 'E-mail et mot de passe',
} as const;

/** Réglages de l'application tels qu'ils sont présentés à l'utilisateur. */
export const dataModeLabel = (isLocal: boolean) => (isLocal ? 'Mode local (démonstration)' : 'Connecté à Supabase');
