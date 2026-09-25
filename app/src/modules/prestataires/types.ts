import type { IconName } from '@/components/shared/icon';
import type { ProviderRow, ProviderTypeRow } from '@/types';

/**
 * Icônes proposés pour un type de prestataire. Le catalogue est volontairement
 * restreint au jeu d'icônes de l'export, et `provider_types.icon` reste une
 * chaîne libre en base.
 */
export const PROVIDER_TYPE_ICONS: readonly IconName[] = [
  'people',
  'user',
  'heart',
  'settings',
  'checkCircle',
  'phone',
  'message',
  'home',
  'pin',
  'map',
  'key',
  'wallet',
  'receipt',
  'utensils',
  'calendar',
  'clock',
  'star',
  'wand',
  'grid',
  'info',
];

export const PROVIDER_TYPE_ICON_LABELS: Record<string, string> = {
  people: 'Groupe',
  user: 'Personne',
  heart: 'Santé',
  settings: 'Artisanat',
  checkCircle: 'École',
  phone: 'Téléphone',
  message: 'Messagerie',
  home: 'Maison',
  pin: 'Adresse',
  map: 'Carte',
  key: 'Clé',
  wallet: 'Argent',
  receipt: 'Facture',
  utensils: 'Restauration',
  calendar: 'Rendez-vous',
  clock: 'Horaires',
  star: 'Prestige',
  wand: 'Service',
  grid: 'Autre',
  info: 'Information',
};

const iconLookup = new Map(PROVIDER_TYPE_ICONS.map((icon) => [icon.toLowerCase(), icon] as const));

/** Mots-clés tolérés en plus des noms d'icônes, pour les saisies libres. */
const iconKeywords: Record<string, IconName> = {
  medecin: 'heart',
  sante: 'heart',
  medical: 'heart',
  veterinaire: 'heart',
  artisan: 'settings',
  bricolage: 'settings',
  tools: 'settings',
  ecole: 'checkCircle',
  school: 'checkCircle',
  admin: 'key',
  administratif: 'key',
  syndic: 'key',
  telephone: 'phone',
  appel: 'phone',
  famille: 'people',
  baby: 'people',
  maison: 'home',
  immobilier: 'home',
  transport: 'map',
  taxi: 'map',
  sport: 'star',
  loisirs: 'star',
  cuisine: 'utensils',
  restaurant: 'utensils',
  argent: 'wallet',
  banque: 'wallet',
  comptabilite: 'wallet',
  facture: 'receipt',
  compta: 'receipt',
  rendezvous: 'calendar',
  rdv: 'calendar',
  horaire: 'clock',
  adresse: 'pin',
  autre: 'grid',
  divers: 'grid',
};

const stripDiacritics = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Résout `provider_types.icon` vers une icône du catalogue, jamais de crash. */
export function resolveProviderIcon(value: string | null | undefined): IconName {
  const raw = (value ?? '').trim();
  if (raw === '') return 'people';
  const direct = iconLookup.get(raw.toLowerCase());
  if (direct) return direct;
  return iconKeywords[stripDiacritics(raw)] ?? 'people';
}

export interface ProviderType {
  id: string;
  name: string;
  /** Icône résolue, toujours affichable. */
  icon: IconName;
  /** Valeur brute conservée en base. */
  iconKey: string | null;
  createdAt: string;
}

export function toProviderType(row: ProviderTypeRow): ProviderType {
  return {
    id: row.id,
    name: row.name,
    icon: resolveProviderIcon(row.icon),
    iconKey: row.icon,
    createdAt: row.created_at,
  };
}

export const UNASSIGNED_TYPE_LABEL = 'Sans type';

export interface Provider {
  id: string;
  typeId: string | null;
  typeName: string;
  typeIcon: IconName;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
  fullAddress: string;
  createdAt: string;
}

export interface ProviderDraft {
  typeId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
}

export function toProvider(row: ProviderRow, types: ProviderType[]): Provider {
  const type = row.provider_type_id ? types.find((entry) => entry.id === row.provider_type_id) : undefined;
  return {
    id: row.id,
    typeId: row.provider_type_id,
    typeName: type?.name ?? UNASSIGNED_TYPE_LABEL,
    typeIcon: type?.icon ?? 'people',
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    notes: row.notes,
    fullAddress: [row.address, row.postal_code, row.city].filter(Boolean).join(', '),
    createdAt: row.created_at,
  };
}

/** Un contact est partageable dès qu'un e-mail est renseigné. */
export const isShared = (provider: Provider) => Boolean(provider.email);

/** Un appel direct n'a de sens que si un numéro est disponible. */
export const isCallable = (provider: Provider) => Boolean(provider.phone);

/** Un itinéraire n'a de sens que si une adresse est disponible. */
export const hasAddress = (provider: Provider) => provider.fullAddress !== '';

export function matchesProviderQuery(provider: Provider, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [provider.name, provider.typeName, provider.city, provider.email, provider.phone, provider.notes]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}
