/**
 * Catalogue des espaces du foyer : libellés, accroches, photos et route de
 * chaque module. Source de vérité partagée par la navigation, l'accueil et
 * les routes.
 */
export type ModuleKey =
  | 'accueil'
  | 'taches'
  | 'calendrier'
  | 'notes'
  | 'courses'
  | 'routines'
  | 'recettes'
  | 'ardoise'
  | 'cadeaux'
  | 'anniversaires'
  | 'animaux'
  | 'prestataires'
  | 'fidelite'
  | 'adresses'
  | 'cercle'
  | 'voyages'
  | 'messages'
  | 'parametres';

export interface ModuleEntry {
  key: ModuleKey;
  label: string;
  /** Accroche utilisée dans l'en-tête du module. */
  detail: string;
  /** Sur-titre de l'en-tête. */
  kicker: string;
  image: string;
  icon: import('@/components/shared/icon').IconName;
  /** Libellé court pour la navigation mobile. */
  short: string;
  /** Libellé dans la barre latérale (« À faire » pour les tâches, comme dans l'export). */
  navLabel?: string;
  /** Présent dans la grille de l'accueil. */
  tile: boolean;
  /**
   * Épinglé en haut de la barre latérale comme accès rapide. `false` ne veut
   * pas dire « absent de la navigation » : le module reste listé par
   * `catalogueModules`, dans la section « Tous les espaces ».
   */
  nav: boolean;
}

export const modules: ModuleEntry[] = [
  { key: 'courses', label: 'Courses', detail: 'Listes partagées', kicker: 'À faire ensemble', image: 'courses.jpg', icon: 'receipt', short: 'Courses', tile: true, nav: false },
  { key: 'calendrier', label: 'Calendrier', detail: 'Événements & rappels', kicker: 'Le temps du foyer', image: 'calendrier.jpg', icon: 'calendar', short: 'Agenda', navLabel: 'Calendrier', tile: true, nav: true },
  { key: 'notes', label: 'Notes', detail: 'Mémoires & idées', kicker: 'À garder près de soi', image: 'calendrier.jpg', icon: 'edit', short: 'Notes', tile: true, nav: false },
  { key: 'taches', label: 'Tâches', detail: 'Priorités & rappels', kicker: 'Tout avancer', image: 'taches.jpg', icon: 'checkCircle', short: 'À faire', navLabel: 'À faire', tile: true, nav: true },
  { key: 'routines', label: 'Routines', detail: 'Habitudes du foyer', kicker: 'Le rythme juste', image: 'routines.jpg', icon: 'wand', short: 'Routines', tile: true, nav: false },
  { key: 'ardoise', label: 'Ardoise', detail: 'Dépenses & partage', kicker: 'Transparent par nature', image: 'ardoise.jpg', icon: 'wallet', short: 'Ardoise', tile: true, nav: false },
  { key: 'recettes', label: 'Recettes', detail: 'Bientôt disponible', kicker: 'La cuisine du foyer', image: 'courses.jpg', icon: 'utensils', short: 'Recettes', tile: true, nav: false },
  { key: 'cadeaux', label: 'Cadeaux', detail: 'Idées à offrir', kicker: 'Pour dire merci', image: 'cadeaux.jpg', icon: 'gift', short: 'Cadeaux', tile: true, nav: false },
  { key: 'anniversaires', label: 'Anniversaires', detail: 'Ne rien oublier', kicker: 'Les petits moments', image: 'calendrier.jpg', icon: 'heart', short: 'Anniversaires', tile: true, nav: false },
  { key: 'animaux', label: 'Animaux', detail: 'Santé & historique', kicker: 'Toute la famille', image: 'animaux.jpg', icon: 'heart', short: 'Animaux', tile: true, nav: false },
  { key: 'prestataires', label: 'Prestataires', detail: 'Appels & contacts', kicker: 'Le bon relais', image: 'cercle.jpg', icon: 'settings', short: 'Prestataires', tile: true, nav: false },
  { key: 'fidelite', label: 'Fidélité', detail: 'Cartes & codes', kicker: 'Toujours sous la main', image: 'adresses.jpg', icon: 'wallet', short: 'Fidélité', tile: true, nav: false },
  { key: 'adresses', label: 'Adresses', detail: 'Lieux à retrouver', kicker: 'Explorer & sauvegarder', image: 'adresses.jpg', icon: 'pin', short: 'Adresses', tile: true, nav: false },
  { key: 'cercle', label: 'Cercle', detail: 'Photos & réactions', kicker: 'Le fil du foyer', image: 'cercle.jpg', icon: 'people', short: 'Cercle', tile: true, nav: true },
  { key: 'voyages', label: 'Voyages', detail: 'Projets à préparer', kicker: 'Partir ensemble', image: 'voyages.jpg', icon: 'map', short: 'Voyages', tile: true, nav: false },
  { key: 'messages', label: 'Messages', detail: 'Échanges privés', kicker: 'Se retrouver', image: 'cercle.jpg', icon: 'message', short: 'Messages', tile: true, nav: false },
];

export const moduleMap: Record<ModuleKey, ModuleEntry> = Object.fromEntries(
  modules.map((entry) => [entry.key, entry]),
) as Record<ModuleKey, ModuleEntry>;

export const navModules: ModuleKey[] = modules.filter((entry) => entry.nav).map((entry) => entry.key);

/**
 * Catalogue complet des espaces du foyer.
 *
 * C'est la liste qui garantit qu'aucune catégorie n'est inatteignable : elle
 * alimente la section « Tous les espaces » de la barre latérale, le dialogue
 * mobile et la grille de l'accueil. `navModules` n'en retient que quelques
 * entrées comme accès rapides, et ne doit jamais devenir le seul endroit où
 * un module est référencé.
 */
export const catalogueModules: ModuleEntry[] = modules;

export const modulePath = (key: ModuleKey) => `/${key}`;

export const mobileNavModules: ModuleKey[] = ['accueil', 'taches', 'calendrier', 'cercle'];

export const assetUrl = (file: string) => `/assets/${file}`;

/** Libellé affiché dans la barre latérale et le fil d'Ariane. */
export const navLabelOf = (entry: ModuleEntry) => entry.navLabel ?? entry.label;
