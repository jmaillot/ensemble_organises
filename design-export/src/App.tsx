import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';

const iconPaths = {
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  comment: '<path d="M20 11.5a7 7 0 0 1-7.5 7 8.7 8.7 0 0 1-3-.5L5 20l1.5-3.6A6.9 6.9 0 0 1 5 11.5a7 7 0 0 1 7.5-7 7 7 0 0 1 7.5 7Z"/>',
  drag: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  edit: '<path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  flag: '<path d="M5 21V4m0 0c4-3 7 3 14 0v10c-7 3-10-3-14 0"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  heart: '<path d="M20.8 8.7c0 5.2-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/>',
  home: '<path d="m4 10 8-6 8 6v9H4v-9Z"/><path d="M9 20v-6h6v6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1l-.8.8M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1l.8-.8"/>',
  message: '<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 7.5a3 3 0 0 1 0 5.8M17 14.5a5 5 0 0 1 3.5 4.5"/>',
  phone: '<path d="M6.5 4.5 9 4l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5-.5 2.5a2.5 2.5 0 0 1-2.7 1.9C10.5 18.4 5.6 13.5 4.6 6.2A2.5 2.5 0 0 1 6.5 4.5Z"/>',
  pin: '<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
  send: '<path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  trash: '<path d="M5 7h14M10 11v5M14 11v5M8 7l.7-3h6.6l.7 3M7 7l1 13h8l1-13"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 8h15M15 12h4"/>',
  wand: '<path d="m15 4 5 5M13 6l5 5M4 20l8.8-8.8M5 5l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6 11.5 3.5 3.5 0 0 0 7 18Z"/>',
} as const;

type IconName = keyof typeof iconPaths;
type ModuleKey = 'home' | 'tasks' | 'calendar' | 'notes' | 'courses' | 'routines' | 'board' | 'gifts' | 'birthdays' | 'pets' | 'providers' | 'loyalty' | 'places' | 'circle' | 'trips' | 'messages' | 'recipes';
type DialogKind = 'task' | 'event' | 'note' | 'course' | 'expense' | 'gift' | 'routine' | 'provider' | 'pet' | 'place' | 'profile' | 'invite' | 'giftShare' | 'birthday' | 'loyalty';

type Task = { id: number; title: string; desc: string; due: string; dueDate: string; assignee: string; priority: string; reminder: string; done: boolean };
type EventItem = { id: number; title: string; date: string; time: string; kind: string };
type Note = { id: number; title: string; category: string; body: string };
type Course = { id: number; name: string; done: boolean; list: string };
type Routine = { id: number; title: string; frequency: string; assignee: string; streak: number; done: boolean; history: string };
type Expense = { id: number; title: string; amount: number; payer: string; members: string[]; date: string };
type Gift = { id: number; title: string; price: number; comment: string; url: string; shared: boolean; sharedWith: string[]; image: string };
type Birthday = { id: number; name: string; date: string; iso: string; detail: string; initials: string };
type Provider = { id: number; name: string; type: string; email: string; phone: string; address: string; postalCode: string; city: string; notes: string };
type Place = { id: number; name: string; type: string; note: number; visited: boolean; image: string; address: string; noteText: string };
type Post = { id: number; author: string; initials: string; time: string; text: string; image: string; mediaType: string; reactions: number; comments: number; commentList: { author: string; text: string }[]; liked: boolean };
type MessageThread = { id: number; name: string; initials: string; text: string; time: string; unread: number };
type Pet = { id: number; name: string; type: string; breed: string; weight: string; birthDate: string; identification: string; nextReminder: string; image: string; notes: string };
type AppState = {
  profile: { name: string; city: string };
  tasks: Task[]; events: EventItem[]; notes: Note[]; courses: Course[]; routines: Routine[]; expenses: Expense[];
  gifts: Gift[]; birthdays: Birthday[]; providerTypes: string[]; providerTypeIcons: Record<string, IconName>;
  providers: Provider[]; loyalty: { id: number; name: string; kind: string; code: string; accent: boolean }[]; places: Place[];
  posts: Post[]; trips: { id: number; place: string; date: string; status: string; checklist: number; image: string }[];
  messages: MessageThread[]; chats: Record<number, { from: string; text: string; mine: boolean }[]>; pets: Pet[];
  invites: { id: number; name: string; email: string; access: string; status: string }[];
};

export type EnsembleOrganisesAppProps = {
  initialState?: Partial<AppState>;
  assetBase?: string;
  storageKey?: string;
};

const moduleLabels: Record<ModuleKey, string> = {
  home: 'Maison', tasks: 'À faire', calendar: 'Calendrier', notes: 'Notes', courses: 'Courses', routines: 'Routines', recipes: 'Recettes',
  board: 'Ardoise', gifts: 'Cadeaux', birthdays: 'Anniversaires', pets: 'Animaux', providers: 'Prestataires', loyalty: 'Fidélité',
  places: 'Adresses', circle: 'Cercle', trips: 'Voyages', messages: 'Messages',
};

const moduleCatalog: { key: ModuleKey; label: string; detail: string; kicker: string; image: string }[] = [
  { key: 'courses', label: 'Courses', detail: 'Listes partagées', kicker: 'À faire ensemble', image: 'courses.jpg' },
  { key: 'calendar', label: 'Calendrier', detail: 'Événements & rappels', kicker: 'Le temps du foyer', image: 'calendrier.jpg' },
  { key: 'notes', label: 'Notes', detail: 'Mémoires & idées', kicker: 'À garder près de soi', image: 'calendrier.jpg' },
  { key: 'tasks', label: 'Tâches', detail: 'Priorités & rappels', kicker: 'Tout avancer', image: 'taches.jpg' },
  { key: 'routines', label: 'Routines', detail: 'Habitudes du foyer', kicker: 'Le rythme juste', image: 'routines.jpg' },
  { key: 'board', label: 'Ardoise', detail: 'Dépenses & partage', kicker: 'Transparent par nature', image: 'ardoise.jpg' },
  { key: 'recipes', label: 'Recettes', detail: 'Bientôt disponible', kicker: 'La cuisine du foyer', image: 'courses.jpg' },
  { key: 'gifts', label: 'Cadeaux', detail: 'Idées à offrir', kicker: 'Pour dire merci', image: 'cadeaux.jpg' },
  { key: 'birthdays', label: 'Anniversaires', detail: 'Ne rien oublier', kicker: 'Les petits moments', image: 'calendrier.jpg' },
  { key: 'pets', label: 'Animaux', detail: 'Santé & historique', kicker: 'Toute la famille', image: 'animaux.jpg' },
  { key: 'providers', label: 'Prestataires', detail: 'Appels & contacts', kicker: 'Le bon relais', image: 'cercle.jpg' },
  { key: 'loyalty', label: 'Fidélité', detail: 'Cartes & codes', kicker: 'Toujours sous la main', image: 'adresses.jpg' },
  { key: 'places', label: 'Adresses', detail: 'Lieux à retrouver', kicker: 'Explorer & sauvegarder', image: 'adresses.jpg' },
  { key: 'circle', label: 'Cercle', detail: 'Photos & réactions', kicker: 'Le fil du foyer', image: 'cercle.jpg' },
  { key: 'trips', label: 'Voyages', detail: 'Projets à préparer', kicker: 'Partir ensemble', image: 'voyages.jpg' },
  { key: 'messages', label: 'Messages', detail: 'Échanges privés', kicker: 'Se retrouver', image: 'cercle.jpg' },
];

const defaultState: AppState = {
  profile: { name: 'Camille Martin', city: 'Lyon' },
  tasks: [
    { id: 1, title: 'Valider les rendez-vous du carnet', desc: 'Appeler le cabinet puis mettre à jour le carnet.', due: 'Aujourd’hui', dueDate: '2026-09-25', assignee: 'Camille', priority: 'Haute', reminder: 'Dans 1 h', done: false },
    { id: 2, title: 'Ajouter le lait d’agne', desc: 'Pour la recette de samedi.', due: 'Demain', dueDate: '2026-09-26', assignee: 'Thomas', priority: 'Normale', reminder: '18:00', done: false },
    { id: 3, title: 'Ranger les photos de l’été', desc: '', due: 'Ce week-end', dueDate: '2026-09-27', assignee: 'Lina', priority: 'Basse', reminder: '', done: true },
  ],
  events: [
    { id: 1, title: 'Rendez-vous chez le médecin', date: '2026-09-25', time: '19:30', kind: 'Famille' },
    { id: 2, title: 'Anniversaire de Noé', date: '2026-09-29', time: '18:00', kind: 'Anniversaire' },
  ],
  notes: [
    { id: 1, title: 'Liste de rentrée', category: 'Maison', body: 'Cartables, crayons, gourdes et un goûter pour le premier jour.' },
    { id: 2, title: 'Idées de week-end', category: 'Loisirs', body: 'Une balade au bord du lac, puis un déjeuner dehors si le temps reste doux.' },
    { id: 3, title: 'À demander à Léa', category: 'Foyer', body: 'Son nouveau numéro pour le groupe des parents et les horaires de piscine.' },
  ],
  courses: [{ id: 1, name: 'Yaourts', done: false, list: 'Fresque' }, { id: 2, name: 'Fruits', done: false, list: 'Fresque' }, { id: 3, name: 'Papier toilette', done: true, list: 'Maison' }, { id: 4, name: 'Savon liquide', done: false, list: 'Maison' }],
  routines: [
    { id: 1, title: 'Sortie canine', frequency: 'Tous les jours', assignee: 'Camille', streak: 12, done: true, history: '12 jours d’affilée' },
    { id: 2, title: 'Penser aux anniversaires', frequency: 'Chaque semaine', assignee: 'Thomas', streak: 4, done: false, history: '4 semaines consécutives' },
    { id: 3, title: 'Mettre la poubelle', frequency: 'Chaque semaine', assignee: 'Lina', streak: 7, done: false, history: '7 semaines consécutives' },
  ],
  expenses: [
    { id: 1, title: 'Courses du samedi', amount: 84.5, payer: 'Camille', members: ['Camille', 'Thomas', 'Lina'], date: '25 sept.' },
    { id: 2, title: 'Essence — aller-retour', amount: 62.3, payer: 'Thomas', members: ['Thomas', 'Camille'], date: '23 sept.' },
    { id: 3, title: 'Café du marché', amount: 8.5, payer: 'Lina', members: ['Lina'], date: '20 sept.' },
  ],
  gifts: [
    { id: 1, title: 'Atelier céramique', price: 45, comment: 'Offrir avec un petit voucher.', url: '', shared: false, sharedWith: [], image: 'cadeaux.jpg' },
    { id: 2, title: 'Casque pour le vélo', price: 89, comment: 'Vérifier la taille avant de commander.', url: '', shared: true, sharedWith: ['Camille', 'Lina'], image: 'cercle.jpg' },
    { id: 3, title: 'Un livre sur les jardins', price: 24, comment: 'Le paperback illustré.', url: '', shared: false, sharedWith: [], image: 'adresses.jpg' },
  ],
  birthdays: [
    { id: 1, name: 'Maya Martin', date: '07 oct.', iso: '1992-10-07', detail: 'Dans 12 jours', initials: 'MM' },
    { id: 2, name: 'Paul Durand', date: '19 oct.', iso: '1988-10-19', detail: 'Dans 24 jours', initials: 'PD' },
    { id: 3, name: 'Nina Leroy', date: '03 nov.', iso: '1990-11-03', detail: 'Dans 39 jours', initials: 'NL' },
  ],
  providerTypes: ['Médecin', 'Artisan', 'École', 'Admin'],
  providerTypeIcons: { Médecin: 'heart', Artisan: 'settings', École: 'checkCircle', Admin: 'checkCircle' },
  providers: [
    { id: 1, name: 'Cabinet du Dr Morel', type: 'Médecin', email: 'secretariat@cabinet-morel.fr', phone: '04 72 00 00 00', address: '18 rue des Tilleuls', postalCode: '69006', city: 'Lyon', notes: 'Prendre rendez-vous avant 17 h.' },
    { id: 2, name: 'Atelier Bois & Co', type: 'Artisan', email: 'hello@bois-co.fr', phone: '06 00 00 00 00', address: '5 impasse du Moulin', postalCode: '69100', city: 'Villeurbanne', notes: 'Devis rapide pour les petites réparations.' },
  ],
  loyalty: [{ id: 1, name: 'Marché de proximité', kind: 'Code-barres', code: '6284 1190 3312', accent: true }, { id: 2, name: 'Librairie du parc', kind: 'QR Code', code: 'QR · 4821 076', accent: false }],
  places: [
    { id: 1, name: 'Le Café du Matin', type: 'Café', note: 4, visited: true, image: 'adresses.jpg', address: '12 rue des Tilleuls, 69006 Lyon', noteText: 'Terrasse calme le matin.' },
    { id: 2, name: 'Le Parc du Quartier', type: 'Parc', note: 5, visited: false, image: 'voyages.jpg', address: 'Entrée sud, Lyon', noteText: 'À découvrir avec le pique-nique.' },
  ],
  posts: [
    { id: 1, author: 'Lina', initials: 'LI', time: 'Il y a 18 min', text: 'Le soleil est enfin revenu. Proposition : balade au bord du lac après le goûter ?', image: 'cercle.jpg', mediaType: 'image', reactions: 4, comments: 2, commentList: [{ author: 'Thomas', text: 'Je suis partant pour 16 h.' }], liked: false },
    { id: 2, author: 'Thomas', initials: 'TH', time: 'Hier', text: 'J’ai retrouvé le numéro de la bibliothèque pour vous. Je le garde dans Prestataires.', image: '', mediaType: '', reactions: 2, comments: 1, commentList: [], liked: false },
  ],
  trips: [{ id: 1, place: 'Lisbonne', date: '12 — 18 avril 2027', status: 'À préparer', checklist: 3, image: 'lisbonne.jpg' }],
  messages: [{ id: 1, name: 'Lina', initials: 'LI', text: 'Tu as vu le nouveau parc ?', time: '10:42', unread: 2 }, { id: 2, name: 'Thomas', initials: 'TH', text: 'Je peux prendre le pain', time: '09:18', unread: 0 }, { id: 3, name: 'Maya Martin', initials: 'MM', text: 'Merci pour la liste !', time: 'Hier', unread: 0 }],
  chats: { 1: [{ from: 'Lina', text: 'Tu as vu le nouveau parc ?', mine: false }, { from: 'Moi', text: 'Pas encore, tu me donneras l’adresse ?', mine: true }, { from: 'Lina', text: 'Oui, je te l’envoie dans Adresses.', mine: false }], 2: [{ from: 'Thomas', text: 'Je peux prendre le pain.', mine: false }], 3: [{ from: 'Maya Martin', text: 'Merci pour la liste !', mine: false }] },
  pets: [{ id: 1, name: 'Nala', type: 'Chien', breed: 'Golden retriever', weight: '28,4', birthDate: '2021-03-12', identification: 'FR-483920', nextReminder: '2026-10-08', image: 'animaux.jpg', notes: 'Rappel antiparasitaire à planifier.' }],
  invites: [],
};

const iconFallbacks: Partial<Record<IconName, string>> = {
  calendar: 'M4 5h16v15H4zM8 3v4M16 3v4M4 9h16',
  checkCircle: 'M9 12l2.5 2.5L16 9',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
};

function Icon({ name, className = 'icon' }: { name: IconName; className?: string }) {
  const path = iconPaths[name].match(/d="([^"]+)"/)?.[1] ?? iconFallbacks[name] ?? 'M12 3v18M3 12h18';
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

const euro = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatMonth = (date: Date) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
const formatLongDate = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const priorityClass = (priority: string) => priority === 'Haute' ? 'high' : priority === 'Normale' ? 'normal' : 'low';
const initialsFor = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function easterDate(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function frenchHolidays(year: number) {
  const easter = new Date(`${easterDate(year)}T12:00:00`);
  const shift = (days: number) => { const date = new Date(easter); date.setDate(date.getDate() + days); return toIsoDate(date); };
  return [
    [`${year}-01-01`, 'Jour de l’an'], [shift(-2), 'Vendredi saint'], [shift(1), 'Lundi de Pâques'], [`${year}-05-01`, 'Fête du Travail'],
    [`${year}-05-08`, 'Victoire 1945'], [`${year}-07-14`, 'Fête nationale'], [`${year}-08-15`, 'Assomption'], [`${year}-11-01`, 'Toussaint'],
    [`${year}-11-11`, 'Armistice 1918'], [`${year}-12-25`, 'Noël'],
  ].map(([date, title]) => ({ date, title, time: 'Toute la journée', kind: 'Jour férié', id: 0 }));
}

function birthdayOnDate(birthday: Birthday, iso: string) {
  if (!birthday.iso) return false;
  const source = new Date(`${birthday.iso}T12:00:00`), target = new Date(`${iso}T12:00:00`);
  return source.getMonth() === target.getMonth() && source.getDate() === target.getDate();
}

function Button({ children, variant = 'primary', icon, onClick, type = 'button', className = '', ...rest }: { children?: ReactNode; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; icon?: IconName; onClick?: () => void; type?: 'button' | 'submit'; className?: string; [key: string]: unknown }) {
  return <button {...rest} type={type} className={`button button-${variant} ${className}`} onClick={onClick}>{icon && <Icon name={icon} className="icon-sm" />}{children}</button>;
}

const NavigationContext = createContext<(module: ModuleKey) => void>(() => {});

function ModuleShell({ module, children, action, onBack, onOpen }: { module: ModuleKey; children: ReactNode; action?: ReactNode; onBack?: () => void; onOpen: (kind: DialogKind) => void }) {
  const item = moduleCatalog.find((entry) => entry.key === module);
  const navigate = useContext(NavigationContext);
  const goBack = onBack ?? (() => navigate('home'));
  return <section className="module-view" data-od-id={`module-view-${module}`}>
    <div className="module-header"><div>
      <Button variant="quiet" icon="arrowLeft" onClick={goBack} className="button-sm">Retour à la maison</Button>
      <p className="eyebrow">{item?.kicker ?? 'Espace du foyer'}</p>
      <h1>{moduleLabels[module]}</h1>
      <p className="lede">{item?.detail ?? 'Tout ce qu’il faut, au même endroit.'}</p>
    </div><div className="module-actions">{action ?? (module === 'recipes' ? undefined : <Button icon="plus" onClick={() => onOpen(module === 'board' ? 'expense' : module === 'courses' ? 'course' : module === 'gifts' ? 'gift' : module === 'routines' ? 'routine' : module === 'providers' ? 'provider' : module === 'pets' ? 'pet' : module === 'places' ? 'place' : module === 'loyalty' ? 'loyalty' as DialogKind : module === 'tasks' ? 'task' : module === 'calendar' ? 'event' : 'note')}>Ajouter</Button>)}</div></div>
    {children}
  </section>;
}

function MetricRow({ items }: { items: { label: string; value: string | number; caption: string }[] }) {
  return <div className="metric-row">{items.map((item) => <div className="metric-card" key={item.label}><p className="eyebrow">{item.label}</p><strong>{item.value}</strong><small>{item.caption}</small></div>)}</div>;
}

function Panel({ title, description, action, children, id }: { title: string; description?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return <section className="panel" data-od-id={id}><div className="panel-header"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function EnsembleOrganisesApp({ initialState, assetBase = '/assets', storageKey = 'ensemble-organises-react-v1' }: EnsembleOrganisesAppProps) {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as Partial<AppState> | null;
      return { ...defaultState, ...(saved ?? {}), profile: { ...defaultState.profile, ...(saved?.profile ?? {}) } };
    } catch { return defaultState; }
  });
  const [currentModule, setCurrentModule] = useState<ModuleKey>('home');
  const [dialog, setDialog] = useState<{ kind: DialogKind; id?: number } | null>(null);
  const [toast, setToast] = useState('');
  const [taskFilter, setTaskFilter] = useState<'open' | 'all' | 'done'>('open');
  const [calendarCursor, setCalendarCursor] = useState(new Date(2026, 8, 1));
  const [selectedDate, setSelectedDate] = useState('2026-09-25');
  const [activeConversationId, setActiveConversationId] = useState(state.messages[0]?.id ?? 1);
  const [activePostId, setActivePostId] = useState(state.posts[0]?.id ?? 1);
  const [widgetOrder, setWidgetOrder] = useState<WidgetKey[]>(['calendar', 'tasks', 'weather', 'birthdays', 'routines']);
  const [draggedWidget, setDraggedWidget] = useState<WidgetKey | null>(null);

  const asset = (file: string) => `${assetBase}/${file}`;
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  const go = (module: ModuleKey) => { setCurrentModule(module); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const open = (kind: DialogKind, id?: number) => setDialog({ kind, id });
  const update = (recipe: (current: AppState) => AppState) => setState((current) => recipe(current));
  const close = () => setDialog(null);

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { showToast('Stockage local plein : allégez les médias importés.'); } }, [state, storageKey]);

  const balance = useMemo(() => {
    const result: Record<string, number> = { Camille: 0, Thomas: 0, Lina: 0 };
    state.expenses.forEach((expense) => { const participants = expense.members.length ? expense.members : Object.keys(result); const share = expense.amount / participants.length; result[expense.payer] = (result[expense.payer] ?? 0) + expense.amount; participants.forEach((member) => { result[member] = (result[member] ?? 0) - share; }); });
    return result;
  }, [state.expenses]);

  const visibleTasks = state.tasks.filter((task) => taskFilter === 'all' || (taskFilter === 'open' && !task.done) || (taskFilter === 'done' && task.done)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const editId = dialog.id;
    if (dialog.kind === 'task') update((current) => { const next: Task = { id: editId ?? Date.now(), title: value('title'), desc: value('description'), due: value('dueDate') === '2026-09-25' ? 'Aujourd’hui' : formatMonth(new Date(`${value('dueDate')}T12:00:00`)), dueDate: value('dueDate'), assignee: value('assignee'), priority: value('priority'), reminder: value('reminder'), done: current.tasks.find((task) => task.id === editId)?.done ?? false }; return { ...current, tasks: editId ? current.tasks.map((task) => task.id === editId ? next : task) : [next, ...current.tasks] }; });
    if (dialog.kind === 'event') update((current) => { const next: EventItem = { id: editId ?? Date.now(), title: value('title'), date: value('date'), time: value('time'), kind: value('kind') }; return { ...current, events: editId ? current.events.map((event) => event.id === editId ? next : event) : [...current.events, next] }; });
    if (dialog.kind === 'note') update((current) => { const next: Note = { id: editId ?? Date.now(), title: value('title'), category: value('category'), body: value('body') }; return { ...current, notes: editId ? current.notes.map((note) => note.id === editId ? next : note) : [next, ...current.notes] }; });
    if (dialog.kind === 'course') update((current) => ({ ...current, courses: [...current.courses, { id: Date.now(), name: value('name'), list: value('list'), done: false }] }));
    if (dialog.kind === 'expense') update((current) => ({ ...current, expenses: [{ id: Date.now(), title: value('title'), amount: Number(value('amount').replace(',', '.')), payer: value('payer'), members: ['Camille', 'Thomas', 'Lina'], date: 'aujourd’hui' }, ...current.expenses] }));
    if (dialog.kind === 'gift') update((current) => ({ ...current, gifts: [{ id: Date.now(), title: value('title'), price: Number(value('price') || 0), comment: value('comment'), url: value('url'), shared: form.get('shared') === 'on', sharedWith: [], image: 'cadeaux.jpg' }, ...current.gifts] }));
    if (dialog.kind === 'giftShare') update((current) => ({ ...current, gifts: current.gifts.map((gift) => gift.id === editId ? { ...gift, shared: true, sharedWith: ['Camille', 'Thomas', 'Lina'], externalEmail: value('externalEmail') } as Gift & { externalEmail: string } : gift) }));
    if (dialog.kind === 'routine') update((current) => ({ ...current, routines: [...current.routines, { id: Date.now(), title: value('title'), frequency: value('frequency'), assignee: value('assignee'), streak: 0, done: false, history: 'Nouvelle routine' }] }));
    if (dialog.kind === 'provider') update((current) => { const next: Provider = { id: editId ?? Date.now(), name: value('name'), type: value('type'), email: value('email'), phone: value('phone'), address: value('address'), postalCode: value('postalCode'), city: value('city'), notes: value('notes') }; return { ...current, providers: editId ? current.providers.map((provider) => provider.id === editId ? next : provider) : [...current.providers, next] }; });
    if (dialog.kind === 'pet') update((current) => ({ ...current, pets: [{ id: Date.now(), name: value('name'), type: value('type'), breed: value('breed'), weight: value('weight'), birthDate: value('birthDate'), identification: value('identification'), nextReminder: value('nextReminder'), image: 'animaux.jpg', notes: value('notes') }, ...current.pets] }));
    if (dialog.kind === 'place') update((current) => ({ ...current, places: [...current.places, { id: Date.now(), name: value('name'), type: value('type'), note: Number(value('note') || 3), visited: form.get('visited') === 'on', image: 'adresses.jpg', address: value('address'), noteText: value('noteText') }] }));
    if (dialog.kind === 'birthday') update((current) => ({ ...current, birthdays: [...current.birthdays, { id: Date.now(), name: value('name'), date: formatLongDate(value('iso')).replace(' 2026', ''), iso: value('iso'), detail: 'Nouvel anniversaire', initials: initialsFor(value('name')) }] }));
    if (dialog.kind === 'loyalty') update((current) => ({ ...current, loyalty: [{ id: Date.now(), name: value('name'), kind: value('kind'), code: value('code'), accent: form.get('accent') === 'on' }, ...current.loyalty] }));
    if (dialog.kind === 'profile') update((current) => ({ ...current, profile: { name: value('name'), city: value('city') } }));
    if (dialog.kind === 'invite') update((current) => ({ ...current, invites: [{ id: Date.now(), name: value('name'), email: value('email'), access: value('access'), status: 'En attente' }, ...current.invites] }));
    close();
    showToast(editId ? 'Modification enregistrée.' : 'Ajouté au foyer.');
  }

  const renderModule = () => {
    switch (currentModule) {
      case 'tasks': return <TasksView tasks={visibleTasks} total={state.tasks.length} filter={taskFilter} onFilter={setTaskFilter} onToggle={(id) => update((c) => ({ ...c, tasks: c.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }))} onDelete={(id) => update((c) => ({ ...c, tasks: c.tasks.filter((task) => task.id !== id) }))} onAdd={() => open('task')} onEdit={(id) => open('task', id)} />;
      case 'calendar': return <CalendarView state={state} cursor={calendarCursor} selectedDate={selectedDate} onSelectDate={setSelectedDate} onShift={(delta) => { const next = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1); setCalendarCursor(next); setSelectedDate(toIsoDate(next)); }} onAdd={() => open('event')} onEdit={(id) => open('event', id)} onDelete={(id) => update((c) => ({ ...c, events: c.events.filter((event) => event.id !== id) }))} />;
      case 'notes': return <NotesView notes={state.notes} onAdd={() => open('note')} onEdit={(id) => open('note', id)} />;
      case 'courses': return <CoursesView courses={state.courses} onToggle={(id) => update((c) => ({ ...c, courses: c.courses.map((item) => item.id === id ? { ...item, done: !item.done } : item) }))} onAdd={() => open('course')} />;
      case 'routines': return <RoutinesView routines={state.routines} onToggle={(id) => update((c) => ({ ...c, routines: c.routines.map((item) => item.id === id ? { ...item, done: !item.done, streak: Math.max(0, item.streak + (item.done ? -1 : 1)) } : item) }))} onAdd={() => open('routine')} />;
      case 'board': return <BoardView state={state} balance={balance} onAdd={() => open('expense')} onInvite={() => open('invite')} />;
      case 'gifts': return <GiftsView gifts={state.gifts} asset={asset} onAdd={() => open('gift')} onShare={(id) => open('giftShare', id)} />;
      case 'birthdays': return <BirthdaysView birthdays={state.birthdays} onAdd={() => open('birthday')} />;
      case 'pets': return <PetsView pets={state.pets} onAdd={() => open('pet')} />;
      case 'providers': return <ProvidersView providers={state.providers} icons={state.providerTypeIcons} onAdd={() => open('provider')} onEdit={(id) => open('provider', id)} />;
      case 'loyalty': return <LoyaltyView cards={state.loyalty} onAdd={() => open('loyalty' as DialogKind)} />;
      case 'places': return <PlacesView places={state.places} asset={asset} onToggle={(id) => update((c) => ({ ...c, places: c.places.map((place) => place.id === id ? { ...place, visited: !place.visited } : place) }))} onAdd={() => open('place')} />;
      case 'circle': return <CircleView posts={state.posts} activePostId={activePostId} asset={asset} onReact={(id) => update((c) => ({ ...c, posts: c.posts.map((post) => post.id === id ? { ...post, liked: !post.liked, reactions: post.reactions + (post.liked ? -1 : 1) } : post) }))} onComment={(text) => update((c) => ({ ...c, posts: c.posts.map((post) => post.id === activePostId ? { ...post, comments: post.comments + 1, commentList: [...post.commentList, { author: 'Camille', text }] } : post) }))} onFocus={(id) => setActivePostId(id)} />;
      case 'trips': return <TripsView trip={state.trips[0]} asset={asset} />;
      case 'messages': return <MessagesView messages={state.messages} chats={state.chats} activeId={activeConversationId} onSelect={(id) => { setActiveConversationId(id); update((c) => ({ ...c, messages: c.messages.map((message) => message.id === id ? { ...message, unread: 0 } : message) })); }} onSend={(text) => update((c) => { const thread = [...(c.chats[activeConversationId] ?? []), { from: 'Moi', text, mine: true }]; return { ...c, chats: { ...c.chats, [activeConversationId]: thread }, messages: c.messages.map((message) => message.id === activeConversationId ? { ...message, text, time: 'à l’instant' } : message) }; })} />;
      case 'recipes': return <ComingSoon module="recipes" onNotify={() => showToast('C’est noté, nous vous tiendrons informée.')} />;
      default: return <HomeView state={state} asset={asset} widgetOrder={widgetOrder} onWidgetOrder={setWidgetOrder} onGo={go} onAdd={() => open('task')} balance={balance} />;
    }
  };

  return <NavigationContext.Provider value={go}><div className="app-shell">
    <Sidebar current={currentModule} onGo={go} />
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>Ensemble &amp; Organisés</span><span aria-hidden="true">/</span><strong>{moduleLabels[currentModule]}</strong></div><div className="topbar-actions"><Button variant="secondary" icon="grid" onClick={() => showToast('Les widgets sont déjà présentés sur l’accueil.')} className="button-sm">Installer l’app</Button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => showToast('2 nouvelles notifications du Cercle.')}><Icon name="message" /></button><div className="user-chip"><span>{state.profile.name}</span><button className="avatar-button" aria-label="Modifier le profil" onClick={() => open('profile')}>{initialsFor(state.profile.name)}</button></div></div></header>
      <main className="content">{renderModule()}</main>
    </div>
    <nav className="mobile-nav" aria-label="Navigation mobile">{(['home', 'tasks', 'calendar', 'circle'] as ModuleKey[]).map((key) => <button key={key} className={currentModule === key ? 'active' : ''} onClick={() => go(key)}><Icon name={key === 'home' ? 'home' : key === 'tasks' ? 'check' : key === 'calendar' ? 'calendar' : 'people'} /><span>{key === 'home' ? 'Maison' : key === 'tasks' ? 'À faire' : key === 'calendar' ? 'Agenda' : 'Cercle'}</span></button>)}</nav>
    {dialog && <Dialog kind={dialog.kind} id={dialog.id} state={state} onClose={close} onSubmit={handleDialogSubmit} />}
    <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
  </div></NavigationContext.Provider>;
}

function Sidebar({ current, onGo }: { current: ModuleKey; onGo: (module: ModuleKey) => void }) {
  const primary: ModuleKey[] = ['home', 'tasks', 'calendar', 'circle'];
  return <aside className="sidebar"><div className="brand"><div className="brand-mark" aria-hidden="true"><Icon name="home" /></div><div className="brand-copy"><div className="brand-name">Ensemble &amp; Organisés</div><div className="brand-subtitle">Votre foyer, en mouvement</div></div></div><div><p className="section-kicker">Navigation</p><nav className="nav-list" aria-label="Navigation principale">{primary.map((key) => <button key={key} className={`nav-item ${current === key ? 'active' : ''}`} onClick={() => onGo(key)}><Icon name={key === 'home' ? 'home' : key === 'tasks' ? 'check' : key === 'calendar' ? 'calendar' : 'people'} /><span>{moduleLabels[key]}</span>{key === 'tasks' && <span className="nav-count">3</span>}{key === 'circle' && <span className="nav-count">2</span>}</button>)}</nav></div><div className="sidebar-spacer" /><div><p className="section-kicker">Votre espace</p><div className="family-card"><div className="family-card-head"><div className="family-avatar">FM</div><div><strong>Foyer Martin</strong><div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>4 membres</div></div></div><p>Tout le monde peut contribuer.</p></div></div><div className="sidebar-footer"><Icon name="settings" className="icon-sm" /><span>Préférences</span></div></aside>;
}

type WidgetKey = 'calendar' | 'tasks' | 'weather' | 'birthdays' | 'routines';
function HomeView({ state, asset, widgetOrder, onWidgetOrder, onGo, onAdd, balance }: { state: AppState; asset: (file: string) => string; widgetOrder: WidgetKey[]; onWidgetOrder: (order: WidgetKey[]) => void; onGo: (module: ModuleKey) => void; onAdd: () => void; balance: Record<string, number> }) {
  const widgetNames: Record<WidgetKey, { label: string; icon: IconName }> = { calendar: { label: 'Calendrier', icon: 'calendar' }, tasks: { label: 'Tâches', icon: 'checkCircle' }, weather: { label: `Météo · ${state.profile.city}`, icon: 'sun' }, birthdays: { label: 'Anniversaires', icon: 'heart' }, routines: { label: 'Routines', icon: 'wand' } };
  return <section className="page-view" data-od-id="home-dashboard"><div className="page-header"><div><p className="eyebrow">Jeudi 25 septembre 2026 · Foyer Martin</p><h1>Bonjour {state.profile.name.split(' ')[0]}<span style={{ color: 'var(--coral)' }}>.</span></h1><p className="lede">Voici ce qui mérite votre attention aujourd’hui, sans perdre de vue ce qui compte.</p></div><div className="header-actions"><Button variant="secondary" icon="grid" onClick={() => onGo('home')}>Personnaliser l’accueil</Button><Button icon="plus" onClick={onAdd}>Ajouter une tâche</Button></div></div><section className="pulse-banner"><div className="pulse-copy"><p className="eyebrow">Le point du jour</p><h2>Deux échéances à garder en tête.</h2><p>Le rendez-vous de 19 h 30 arrive bientôt. Les courses, elles, sont presque prêtes.</p></div><div className="pulse-next"><span>Prochain rendez-vous</span><strong>19:30</strong><small>Rendez-vous · Maison</small></div></section><div className="dashboard-grid"><div className="primary-column"><div className="section-heading"><div><h2>Les essentiels du jour</h2><p>Glissez les widgets pour les réorganiser.</p></div><span className="count-badge">5 widgets</span></div><div className="widgets-grid" data-od-id="widget-grid">{widgetOrder.map((key) => <WidgetCard key={key} kind={key} state={state} asset={asset} onDrop={(target) => { const from = widgetOrder.indexOf(key); const to = widgetOrder.indexOf(target); if (from >= 0 && to >= 0) { const next = [...widgetOrder]; next.splice(to, 0, next.splice(from, 1)[0]); onWidgetOrder(next); } }} />)}</div><section className="modules-section"><div className="section-heading"><div><h2>Tout le foyer</h2><p>Un espace pour chaque petite et grande organisation.</p></div><span className="count-badge">{moduleCatalog.length} espaces</span></div><div className="module-grid">{moduleCatalog.map((item) => <button key={item.key} className="module-tile" onClick={() => onGo(item.key)} style={{ '--tile-image': `url(${asset(item.image)})` } as CSSProperties} aria-label={`Ouvrir ${item.label}`}><span className="tile-photo" aria-hidden="true" /><span className="tile-overlay" aria-hidden="true" /><span className="tile-content"><span className="tile-kicker">{item.kicker}</span><strong>{item.label}</strong><span>{item.detail}</span></span><span className="tile-arrow"><Icon name="arrow" className="icon-sm" /></span></button>)}</div></section></div><aside className="secondary-column"><div className="side-stack"><section className="side-card" data-od-id="balance-summary"><div className="side-card-header"><div><p className="eyebrow">Ardoise du mois</p><h3>Le compte est clair</h3></div><Icon name="wallet" className="icon icon-sm" /></div><div className="amount">{euro(state.expenses.reduce((sum, expense) => sum + expense.amount, 0))}</div><div className="amount-caption">répartis automatiquement entre 3 membres</div><div className="split-bar"><span style={{ width: '48%' }} /><span style={{ width: '32%' }} /><span style={{ width: '20%' }} /></div>{['Camille', 'Thomas', 'Lina'].map((member) => <div className="member-row" key={member}><span className="member-name"><i className={`member-dot ${member === 'Thomas' ? 'dark' : member === 'Lina' ? 'coral' : ''}`} />{member}</span><strong>{euro(balance[member])}</strong></div>)}</section><section className="side-card"><div className="side-card-header"><div><p className="eyebrow">À venir</p><h3>Anniversaires</h3></div><Icon name="heart" className="icon icon-sm" /></div>{state.birthdays.map((birthday) => <div className="birthday-row" key={birthday.id}><span className="birthday-avatar">{birthday.initials}</span><div><strong>{birthday.name}</strong><small>{birthday.date} · {birthday.detail}</small></div></div>)}</section></div></aside></div><p className="demo-note">Prototype PWA · Les données affichées sont des données de démonstration.</p></section>;
}

function WidgetCard({ kind, state, asset, onDrop }: { kind: WidgetKey; state: AppState; asset: (file: string) => string; onDrop: (target: WidgetKey) => void }) {
  const names: Record<WidgetKey, { label: string; icon: IconName }> = { calendar: { label: 'Calendrier', icon: 'calendar' }, tasks: { label: 'Tâches', icon: 'checkCircle' }, weather: { label: `Météo · ${state.profile.city}`, icon: 'sun' }, birthdays: { label: 'Anniversaires', icon: 'heart' }, routines: { label: 'Routines', icon: 'wand' } };
  const { icon, label } = names[kind];
  let body: ReactNode = null;
  if (kind === 'calendar') body = <div className="mini-calendar">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <span className="day-name" key={`${day}-${index}`}>{day}</span>)}{[21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 1, 2].map((day) => <span className={day === 25 ? 'today' : [26, 29].includes(day) ? 'has-event' : ''} key={day}>{day}</span>)}</div>;
  if (kind === 'tasks') body = <div className="task-preview">{state.tasks.slice(0, 3).map((task) => <div className="task-preview-row" key={task.id}><button className={`check-button ${task.done ? 'checked' : ''}`} aria-label={`Terminer ${task.title}`}><Icon name="check" className="icon-sm" /></button><div><strong>{task.title}</strong><small>{task.due} · {task.assignee}</small></div><span className={`priority ${priorityClass(task.priority)}`}>{task.priority === 'Haute' ? 'Haute' : ''}</span></div>)}</div>;
  if (kind === 'weather') body = <><div className="weather-state"><div className="weather-icon"><Icon name="sun" className="icon-lg" /></div><div><strong>18°</strong><span>Ensoleillé · Lyon</span></div></div><div className="widget-sub">Ville du profil · {state.profile.city}</div></>;
  if (kind === 'birthdays') body = <>{state.birthdays.slice(0, 2).map((birthday) => <div className="birthday-row" key={birthday.id}><span className="birthday-avatar">{birthday.initials}</span><div><strong>{birthday.name}</strong><small>{birthday.date} · {birthday.detail}</small></div></div>)}<div className="progress-label"><span>Prochain dans 12 jours</span><strong>07 oct.</strong></div></>;
  if (kind === 'routines') body = <><div className="widget-big">3 / 5</div><div className="widget-sub">rituels suivis aujourd’hui</div><div className="progress-track"><div className="progress-value" style={{ width: '60%' }} /></div><div className="progress-label"><span>Prochain : sortie canine</span><strong>18:45</strong></div></>;
  return <article className="widget-card" draggable onDragStart={(event) => event.dataTransfer.setData('widget', kind)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const target = event.dataTransfer.getData('widget') as WidgetKey; if (target) onDrop(target); }}><div className="widget-head"><span className="widget-label"><Icon name={icon} className="icon-sm" /> {label}</span><button className="widget-menu" aria-label={`Options du widget ${label}`}><Icon name="more" className="icon-sm" /></button></div>{body}</article>;
}

function TasksView({ tasks, total, filter, onFilter, onToggle, onDelete, onAdd, onEdit }: { tasks: Task[]; total: number; filter: 'open' | 'all' | 'done'; onFilter: (filter: 'open' | 'all' | 'done') => void; onToggle: (id: number) => void; onDelete: (id: number) => void; onAdd: () => void; onEdit: (id: number) => void }) {
  return <ModuleShell module="tasks"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une tâche</Button>}><MetricRow items={[{ label: 'À faire', value: tasks.filter((task) => !task.done).length, caption: 'tâches ouvertes' }, { label: 'Total', value: total, caption: 'dans la liste' }, { label: 'Priorité haute', value: tasks.filter((task) => task.priority === 'Haute' && !task.done).length, caption: 'à regarder aujourd’hui' }, { label: 'Membres', value: 3, caption: 'participants actifs' }]} /><div className="content-split"><Panel id="task-list-panel" title="Vos prochaines tâches" description="Glissez les lignes pour réordonner, ou changez la priorité." action={<select className="select" style={{ width: 'auto', minWidth: 180 }} value={filter} onChange={(event) => onFilter(event.target.value as 'open' | 'all' | 'done')} aria-label="Filtrer les tâches"><option value="open">À faire par échéance</option><option value="all">Toutes les tâches</option><option value="done">Terminées</option></select>}><div className="task-list">{tasks.map((task) => <div className={`task-row ${task.done ? 'done' : ''}`} key={task.id}><span className="task-drag-handle"><Icon name="drag" className="icon-sm" /></span><button className={`check-button ${task.done ? 'checked' : ''}`} onClick={() => onToggle(task.id)} aria-label={`${task.done ? 'Rouvrir' : 'Terminer'} ${task.title}`}><Icon name="check" className="icon-sm" /></button><div className="task-copy"><div className="task-title">{task.title}</div>{task.desc && <div className="task-description">{task.desc}</div>}<div className="task-meta"><span><Icon name="clock" className="icon-sm" /> {task.due}</span><span>·</span><span>{task.assignee}</span>{task.reminder && <><span>·</span><span>Rappel {task.reminder}</span></>}</div></div><div className="task-actions"><span className={`priority ${priorityClass(task.priority)}`}>{task.priority}</span><button className="row-action" onClick={() => onEdit(task.id)} aria-label={`Modifier ${task.title}`}><Icon name="edit" className="icon-sm" /></button><button className="row-action delete" onClick={() => onDelete(task.id)} aria-label={`Supprimer ${task.title}`}><Icon name="trash" className="icon-sm" /></button></div></div>)}</div></Panel><Panel id="task-reminders-panel" title="Rappels du jour" description="Ce qui mérite un petit rappel."><div className="reminder-list">{tasks.filter((task) => task.reminder).slice(0, 3).map((task) => <div className="reminder-item" key={task.id}><span className="reminder-time">{task.reminder}</span><div className="reminder-copy"><strong>{task.title}</strong><small>{task.assignee}</small></div></div>)}</div></Panel></div></ModuleShell>;
}

function CalendarView({ state, cursor, selectedDate, onSelectDate, onShift, onAdd, onEdit, onDelete }: { state: AppState; cursor: Date; selectedDate: string; onSelectDate: (date: string) => void; onShift: (delta: number) => void; onAdd: () => void; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  const year = cursor.getFullYear(), month = cursor.getMonth(), firstWeekday = (cursor.getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate(), cells = Math.ceil((firstWeekday + days) / 7) * 7;
  const holidays = frenchHolidays(year);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const eventDates = new Set(state.events.map((event) => event.date));
  const birthdayDates = new Set(state.birthdays.map((birthday) => `${year}-${birthday.iso.slice(5)}`));
  const agenda = [...state.events.filter((event) => event.date === selectedDate), ...holidays.filter((holiday) => holiday.date === selectedDate), ...state.birthdays.filter((birthday) => birthdayOnDate(birthday, selectedDate)).map((birthday) => ({ id: birthday.id, title: `Anniversaire de ${birthday.name}`, time: birthday.date, kind: 'Anniversaire' }))];
  return <ModuleShell module="calendar"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter un événement</Button>}><MetricRow items={[{ label: 'Ce mois', value: state.events.length, caption: 'événements prévus' }, { label: 'Sélection', value: `${selectedDate.slice(8)}/${selectedDate.slice(5, 7)}`, caption: 'jour affiché' }, { label: 'Anniversaires', value: state.birthdays.length, caption: 'dans le calendrier' }, { label: 'Jours fériés', value: holidays.length, caption: 'pour cette année' }]} /><div className="calendar-layout"><section className="calendar-panel"><div className="calendar-toolbar"><h3>{formatMonth(cursor)}</h3><div className="calendar-nav"><button onClick={() => onShift(-1)} aria-label="Mois précédent"><Icon name="arrowLeft" className="icon-sm" /></button><button onClick={() => onShift(1)} aria-label="Mois suivant"><Icon name="arrow" className="icon-sm" /></button></div></div><div className="calendar-grid">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <div className="day-name" key={`${day}-${index}`}>{day}</div>)}{Array.from({ length: cells }, (_, index) => { const dayNumber = index - firstWeekday + 1, date = new Date(year, month, dayNumber), iso = toIsoDate(date), classes = [dayNumber < 1 || dayNumber > days ? 'muted' : '', iso === '2026-09-25' ? 'today' : '', iso === selectedDate ? 'selected' : '', eventDates.has(iso) || birthdayDates.has(iso) ? 'has-event' : ''].filter(Boolean).join(' '); return <button className={`calendar-day ${classes}`} key={iso} onClick={() => onSelectDate(iso)}>{date.getDate()}</button>; })}</div></section><Panel id="calendar-agenda-panel" title={formatLongDate(selectedDate)} description="Les événements de cette journée." action={<span className="count-badge">{agenda.length}</span>}><div className="agenda-list">{agenda.length ? agenda.map((item) => <div className="agenda-item" key={`${item.id}-${item.title}`}><span className="agenda-time">{item.time}</span><div><strong>{item.title}</strong><small>{formatLongDate(selectedDate)}</small><span className="event-chip">{item.kind}</span></div>{item.kind === 'Jour férié' ? null : <div className="task-actions"><button className="row-action" onClick={() => onEdit(item.id)} aria-label={`Modifier ${item.title}`}><Icon name="edit" className="icon-sm" /></button><button className="row-action delete" onClick={() => onDelete(item.id)} aria-label={`Supprimer ${item.title}`}><Icon name="trash" className="icon-sm" /></button></div>}</div>) : <div className="empty-agenda"><strong>Rien de prévu</strong><span>Profitez de cette journée ou ajoutez un événement.</span></div>}</div><Button variant="secondary" icon="plus" onClick={onAdd} className="button-full" >Ajouter pour cette date</Button></Panel></div></ModuleShell>;
}

function NotesView({ notes, onAdd, onEdit }: { notes: Note[]; onAdd: () => void; onEdit: (id: number) => void }) {
  const [query, setQuery] = useState('');
  return <ModuleShell module="notes"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Créer une note</Button>}><MetricRow items={[{ label: 'Notes', value: notes.length, caption: 'dans votre espace' }, { label: 'Catégories', value: 3, caption: 'pour les ranger facilement' }, { label: 'Partagées', value: 2, caption: 'avec le foyer' }, { label: 'Dernière mise à jour', value: '18:45', caption: 'par Lina' }]} /><div className="section-heading"><div><h2>Vos pensées, au même endroit</h2><p>Une note peut rester privée ou devenir un point de repère partagé.</p></div><div className="search-box" style={{ width: 220 }}><Icon name="search" className="icon-sm" /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une note" aria-label="Rechercher une note" /></div></div><div className="note-grid">{notes.filter((note) => `${note.title} ${note.body} ${note.category}`.toLowerCase().includes(query.toLowerCase())).map((note, index) => <article className={`note-card ${index === 0 ? 'featured' : ''}`} key={note.id}><div className="note-meta"><span>{note.category}</span><span>{index === 0 ? 'Épinglée' : 'Il y a 2 j'}</span></div><h3>{note.title}</h3><p>{note.body}</p><div className="note-card-footer"><span>{index === 0 ? 'Partagée avec le foyer' : 'Privée'}</span><button className="text-link" onClick={() => onEdit(note.id)}>Modifier <Icon name="arrow" className="icon-sm" /></button></div></article>)}</div></ModuleShell>;
}

function CoursesView({ courses, onToggle, onAdd }: { courses: Course[]; onToggle: (id: number) => void; onAdd: () => void }) {
  return <ModuleShell module="courses"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter un article</Button>}><MetricRow items={[{ label: 'Listes', value: 2, caption: 'listes actives' }, { label: 'Articles', value: courses.length, caption: 'à acheter' }, { label: 'Dans le panier', value: courses.filter((item) => item.done).length, caption: 'articles cochés' }, { label: 'Prochaine course', value: 'SAM', caption: 'matin · 10:00' }]} /><div className="shopping-layout"><Panel id="shopping-list-panel" title="Listes de courses" description="Cochez, partagez, et laissez le reste au foyer."><div className="shopping-list">{['Fresque', 'Maison'].map((group) => { const items = courses.filter((item) => item.list === group); return <section className="shopping-group" key={group}><h3><span>{group}</span><span className="count-badge">{items.filter((item) => item.done).length}/{items.length}</span></h3>{items.map((item) => <div className={`shopping-item ${item.done ? 'done' : ''}`} key={item.id}><button className={`check-button ${item.done ? 'checked' : ''}`} onClick={() => onToggle(item.id)} aria-label={`${item.done ? 'Rouvrir' : 'Terminer'} ${item.name}`}><Icon name="check" className="icon-sm" /></button><span>{item.name}</span><small>{item.done ? 'dans le panier' : 'à acheter'}</small></div>)}</section>; })}</div></Panel><aside><div className="coupon-card"><p>Liste partagée · Foyer Martin</p><strong>2 listes</strong><small>Tout le monde voit les changements en temps réel.</small></div><div className="panel" style={{ marginTop: 18 }}><Button variant="secondary" icon="plus" onClick={onAdd} className="button-full">Ajouter à une liste</Button></div></aside></div></ModuleShell>;
}

function RoutinesView({ routines, onToggle, onAdd }: { routines: Routine[]; onToggle: (id: number) => void; onAdd: () => void }) {
  return <ModuleShell module="routines"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Nouvelle routine</Button>}><MetricRow items={[{ label: 'Routines', value: routines.length, caption: 'rituels suivis' }, { label: 'Aujourd’hui', value: `${routines.filter((item) => item.done).length}/${routines.length}`, caption: 'déjà cochées' }, { label: 'Meilleure série', value: 12, caption: 'jours d’affilée' }, { label: 'En retard', value: 0, caption: 'rien à rattraper' }]} /><div className="content-split"><section><div className="section-heading"><div><h2>Le rythme du foyer</h2><p>Les séries se construisent avec les petits gestes répétés.</p></div></div><div className="routine-grid">{routines.map((routine) => <article className={`routine-card ${routine.done ? 'done' : ''}`} key={routine.id}><div className="routine-head"><button className={`check-button ${routine.done ? 'checked' : ''}`} onClick={() => onToggle(routine.id)} aria-label={`${routine.done ? 'Rouvrir' : 'Terminer'} ${routine.title}`}><Icon name="check" className="icon-sm" /></button><div><h3>{routine.title}</h3><p>{routine.frequency}</p></div><span className={`priority ${routine.done ? 'low' : 'normal'}`}>{routine.done ? 'Fait' : 'À faire'}</span></div><div className="routine-footer"><span className="routine-person"><span className="mini-avatar">{routine.assignee.slice(0, 2).toUpperCase()}</span>{routine.assignee}</span><small style={{ color: 'var(--muted)', fontSize: 11 }}>{routine.history}</small></div></article>)}</div></section><Panel title="Historique" description="Les traces du foyer.">{['Sortie canine', 'Mettre la poubelle', 'Anniversaires'].map((item, index) => <div className="history-row" key={item}><div><strong>{item}</strong><small style={{ display: 'block' }}>{index === 0 ? 'hier à 18:42' : index === 1 ? 'lundi par Lina' : 'dimanche prochain'}</small></div><span className={`priority ${index === 2 ? 'normal' : 'low'}`}>{index === 2 ? 'À venir' : 'Terminée'}</span></div>)}</Panel></div></ModuleShell>;
}

function BoardView({ state, balance, onAdd, onInvite }: { state: AppState; balance: Record<string, number>; onAdd: () => void; onInvite: () => void }) {
  const total = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return <ModuleShell module="board"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une dépense</Button>}><div className="balance-card"><p className="eyebrow">Ardoise · septembre 2026</p><div className="amount">{euro(total)}</div><p>Répartis automatiquement, selon les membres choisis pour chaque dépense.</p><div className="balance-actions"><Button onClick={onAdd} icon="plus">Ajouter une dépense</Button><Button variant="secondary" icon="people" onClick={onInvite}>Inviter un membre</Button></div></div><div className="content-split"><Panel title="Dernières dépenses" description="Chaque ligne sait qui doit quoi à qui." action={<span className="count-badge">{state.expenses.length}</span>}><div className="table-wrap"><table className="expense-table"><thead><tr><th>Dépense</th><th>Payé par</th><th>Partage</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead><tbody>{state.expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.title}</strong><small style={{ display: 'block', color: 'var(--muted)', fontSize: 10 }}>{expense.date}</small></td><td>{expense.payer}</td><td><div className="expense-members">{expense.members.map((member) => <span className="mini-avatar" key={member}>{member.slice(0, 2).toUpperCase()}</span>)}</div></td><td style={{ textAlign: 'right' }}><strong>{euro(expense.amount)}</strong></td></tr>)}</tbody></table></div></Panel><Panel title="Qui doit quoi ?" description="Calcul automatique à chaque ajout.">{['Camille', 'Thomas', 'Lina'].map((member) => <div className="member-row" key={member}><span className="member-name"><i className={`member-dot ${member === 'Thomas' ? 'dark' : member === 'Lina' ? 'coral' : ''}`} />{member}</span><strong>{euro(balance[member])}</strong></div>)}</Panel></div></ModuleShell>;
}

function GiftsView({ gifts, asset, onAdd, onShare }: { gifts: Gift[]; asset: (file: string) => string; onAdd: () => void; onShare: (id: number) => void }) {
  return <ModuleShell module="gifts"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une idée</Button>}><MetricRow items={[{ label: 'Idées', value: gifts.length, caption: 'dans la liste' }, { label: 'Partagées', value: gifts.filter((gift) => gift.shared).length, caption: 'avec un membre' }, { label: 'Budget moyen', value: euro(gifts.reduce((sum, gift) => sum + gift.price, 0) / gifts.length), caption: 'par idée' }, { label: 'Prochaine occasion', value: 'Noé', caption: 'anniversaire · 29 sept.' }]} /><div className="section-heading"><div><h2>Les idées à offrir</h2><p>Partagez une liste précise avec le foyer ou un proche.</p></div></div><div className="gift-grid">{gifts.map((gift) => <article className="gift-card" key={gift.id}><div className="gift-image" style={{ backgroundImage: `url(${asset(gift.image)})` }} /><div className="gift-body"><h3>{gift.title}</h3><p>{gift.comment}</p><div className="gift-footer"><strong className="gift-price">{euro(gift.price)}</strong><button className={`share-button ${gift.shared ? 'shared' : ''}`} onClick={() => onShare(gift.id)}><Icon name="share" className="icon-sm" />{gift.shared ? 'Gérer' : 'Partager'}</button></div></div></article>)}</div></ModuleShell>;
}

function BirthdaysView({ birthdays, onAdd }: { birthdays: Birthday[]; onAdd: () => void }) {
  const [query, setQuery] = useState('');
  return <ModuleShell module="birthdays"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter un anniversaire</Button>}><MetricRow items={[{ label: 'Cette année', value: birthdays.length, caption: 'anniversaires suivis' }, { label: 'Le prochain', value: '12 j', caption: 'Maya · 7 octobre' }, { label: 'Ce mois', value: 2, caption: 'à préparer' }, { label: 'Recherche', value: 'Active', caption: 'liste + calendrier' }]} /><div className="birthday-layout"><Panel title="Liste des anniversaires" description="Une recherche simple, une date jamais oubliée." action={<div className="search-box" style={{ width: 200 }}><Icon name="search" className="icon-sm" /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un prénom" aria-label="Rechercher un anniversaire" /></div>}><div className="birthday-list">{birthdays.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).map((item) => <div className="birthday-row-large" key={item.id}><span className="birthday-avatar">{item.initials}</span><div className="birthday-copy"><strong>{item.name}</strong><small>{item.detail}</small></div><span className="birthday-date">{item.date}</span></div>)}</div></Panel><aside className="calendar-preview"><h3>Dans le calendrier</h3><p>Les anniversaires apparaissent automatiquement à côté des événements.</p>{birthdays.map((item) => <div className="preview-day" key={item.id}><span>{item.date}</span><strong>{item.name}</strong></div>)}<Button variant="secondary" onClick={onAdd} className="button-full" >Ajouter un anniversaire</Button></aside></div></ModuleShell>;
}

function PetsView({ pets, onAdd }: { pets: Pet[]; onAdd: () => void }) {
  const pet = pets[0];
  return <ModuleShell module="pets"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une fiche</Button>}><div className="pet-hero"><img className="pet-photo" src={`/assets/${pet?.image ?? 'animaux.jpg'}`} width="900" height="1193" alt={`Portrait de ${pet?.name ?? 'votre animal'}`} /><div className="pet-info"><p className="eyebrow">Fiche animal</p><h2>{pet?.name}</h2><p>Une fiche complète pour prendre soin de sa santé et de son histoire.</p><div className="pet-facts"><div className="pet-fact"><span>Type</span><strong>{pet?.type}</strong></div><div className="pet-fact"><span>Race</span><strong>{pet?.breed}</strong></div><div className="pet-fact"><span>Poids</span><strong>{pet?.weight} kg</strong></div><div className="pet-fact"><span>Naissance</span><strong>{formatLongDate(pet?.birthDate ?? '2021-03-12')}</strong></div><div className="pet-fact"><span>Identifiant</span><strong>{pet?.identification}</strong></div><div className="pet-fact"><span>Prochain rappel</span><strong>{formatLongDate(pet?.nextReminder ?? '2026-10-08')}</strong></div></div></div></div><Panel title="Suivi de santé" description="Produits, vaccins et traitements."><div className="tabs"><button className="tab active">Produits</button><button className="tab">Vaccins</button><button className="tab">Traitements</button><button className="tab">Informations</button></div><div className="info-list"><div className="info-row"><span>Alimentation</span><strong>Gamelles · 12 jours restants</strong></div><div className="info-row"><span>Dernier passage chez le vétérinaire</span><strong>14 juin 2026</strong></div><div className="info-row"><span>Prochain rappel</span><strong>Rappel antiparasitaire · 08 oct.</strong></div></div></Panel></ModuleShell>;
}

function ProvidersView({ providers, icons, onAdd, onEdit }: { providers: Provider[]; icons: Record<string, IconName>; onAdd: () => void; onEdit: (id: number) => void }) {
  return <ModuleShell module="providers"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter un prestataire</Button>}><MetricRow items={[{ label: 'Prestataires', value: providers.length, caption: 'contacts enregistrés' }, { label: 'Types', value: Object.keys(icons).length, caption: 'types personnalisés' }, { label: 'Cette semaine', value: 1, caption: 'rappel à faire' }, { label: 'Partagés', value: 2, caption: 'avec le foyer' }]} /><div className="provider-grid">{providers.map((provider) => <article className="provider-card" key={provider.id}><div className="provider-head"><div className="provider-icon"><Icon name={icons[provider.type] ?? 'people'} className="icon-sm" /></div><div className="provider-copy"><h3>{provider.name}</h3><p>{provider.type}</p></div><button className="row-action" onClick={() => onEdit(provider.id)} aria-label={`Modifier ${provider.name}`}><Icon name="edit" className="icon-sm" /></button></div><div className="provider-meta"><span><Icon name="message" className="icon-sm" />{provider.email}</span><span><Icon name="phone" className="icon-sm" />{provider.phone}</span><span><Icon name="pin" className="icon-sm" />{[provider.address, provider.postalCode, provider.city].filter(Boolean).join(', ')}</span></div></article>)}</div></ModuleShell>;
}

function LoyaltyView({ cards, onAdd }: { cards: AppState['loyalty']; onAdd: () => void }) {
  return <ModuleShell module="loyalty"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une carte</Button>}><MetricRow items={[{ label: 'Cartes', value: cards.length, caption: 'fidélités sauvegardées' }, { label: 'Code-barres', value: cards.filter((card) => card.kind === 'Code-barres').length, caption: 'scannables' }, { label: 'QR Codes', value: cards.filter((card) => card.kind === 'QR Code').length, caption: 'prêts à scanner' }, { label: 'Synchronisation', value: 'Auto', caption: 'sur cet appareil' }]} /><div className="loyalty-grid">{cards.map((card) => <article className={`loyalty-card ${card.accent ? 'accent-card' : ''}`} key={card.id}><div className="loyalty-head"><div className="loyalty-icon"><Icon name="wallet" className="icon-sm" /></div><div className="loyalty-copy"><h3>{card.name}</h3><p>{card.kind}</p></div></div><div className="barcode" /><div className="barcode-code">{card.code}</div></article>)}</div></ModuleShell>;
}

function PlacesView({ places, asset, onToggle, onAdd }: { places: Place[]; asset: (file: string) => string; onToggle: (id: number) => void; onAdd: () => void }) {
  return <ModuleShell module="places"  onOpen={onAdd as never} action={<Button icon="plus" onClick={onAdd}>Ajouter une adresse</Button>}><MetricRow items={[{ label: 'Lieux', value: places.length, caption: 'adresses sauvegardées' }, { label: 'Déjà visités', value: places.filter((place) => place.visited).length, caption: 'dans vos souvenirs' }, { label: 'À découvrir', value: places.filter((place) => !place.visited).length, caption: 'encore à tester' }, { label: 'Note moyenne', value: (places.reduce((sum, place) => sum + place.note, 0) / places.length).toFixed(1), caption: 'sur 5 étoiles' }]} /><div className="place-grid">{places.map((place) => <article className="place-card" key={place.id}><div className="place-photo" style={{ backgroundImage: `url(${asset(place.image)})` }} /><div className="place-body"><h3>{place.name}</h3><p>{place.type} · {place.note}/5</p><p>{place.address}</p><div className="place-footer"><span className="rating">{'★'.repeat(place.note)}{'☆'.repeat(5 - place.note)}</span><button className={`switch ${place.visited ? 'on' : ''}`} onClick={() => onToggle(place.id)} aria-label={`${place.visited ? 'Marquer comme non visité' : 'Marquer comme visité'}`} /></div></div></article>)}</div></ModuleShell>;
}

function CircleView({ posts, activePostId, asset, onReact, onComment, onFocus }: { posts: Post[]; activePostId: number; asset: (file: string) => string; onReact: (id: number) => void; onComment: (text: string) => void; onFocus: (id: number) => void }) {
  const [comment, setComment] = useState('');
  return <ModuleShell module="circle"  onOpen={() => undefined} action={<Button icon="plus" onClick={() => document.getElementById('circle-comment')?.focus()}>Publier un moment</Button>}><MetricRow items={[{ label: 'Membres', value: 4, caption: 'dans le cercle' }, { label: 'Publications', value: posts.length, caption: 'ce mois-ci' }, { label: 'Réactions', value: posts.reduce((sum, post) => sum + post.reactions, 0), caption: 'ce mois-ci' }, { label: 'Notifications', value: 2, caption: 'nouvelles' }]} /><div className="feed-layout"><section>{posts.map((post) => <article className={`post ${activePostId === post.id ? 'active' : ''}`} key={post.id}><div className="post-head"><span className="birthday-avatar">{post.initials}</span><div className="post-author"><strong>{post.author}</strong><small>{post.time}</small></div></div><p className="post-text">{post.text}</p>{post.image && <img className="post-image" src={asset(post.image)} alt={`Publication de ${post.author}`} />}{post.commentList.length > 0 && <div className="comment-preview">{post.commentList.slice(-2).map((item, index) => <div key={`${item.author}-${index}`}><strong>{item.author}</strong><span>{item.text}</span></div>)}</div>}<div className="post-actions"><button className={`reaction-button ${post.liked ? 'liked' : ''}`} onClick={() => onReact(post.id)}><Icon name="heart" className="icon-sm" />{post.reactions} réactions</button><button className="reaction-button" onClick={() => onFocus(post.id)}><Icon name="comment" className="icon-sm" />{post.comments} commentaires</button></div></article>)}<form className="panel" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) { onComment(comment.trim()); setComment(''); } }}><div className="panel-header"><div><h3>Partager un moment</h3><p>Une photo, une vidéo ou simplement une pensée.</p></div><Icon name="heart" className="icon-sm" /></div><div className="form-grid"><div className="field"><label htmlFor="circle-comment">Votre commentaire</label><textarea className="textarea" id="circle-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Écrire au foyer…" required /></div><div className="form-actions" style={{ marginTop: 0 }}><Button type="submit" icon="send">Publier</Button></div></div></form></section><aside className="feed-side"><Panel title="Votre cercle" description="Les membres qui partagent le fil."><div className="member-stack"><span className="mini-avatar">CM</span><span className="mini-avatar">TH</span><span className="mini-avatar">LI</span><span className="mini-avatar">+1</span></div></Panel></aside></div></ModuleShell>;
}

function TripsView({ trip, asset }: { trip?: AppState['trips'][number]; asset: (file: string) => string }) {
  return <ModuleShell module="trips"  onOpen={() => undefined} action={<Button icon="plus">Créer un voyage</Button>}><section className="trip-hero" style={{ backgroundImage: `url(${asset(trip?.image ?? 'voyages.jpg')})` }}><div className="trip-hero-copy"><p className="eyebrow">Prochain voyage · {trip?.status}</p><h2>{trip?.place}</h2><p>{trip?.date} · Un voyage à préparer tranquillement.</p></div></section><div className="trip-grid"><div className="trip-stat"><strong>{trip?.checklist ?? 0}</strong><span>éléments à préparer</span><div className="progress-track"><div className="progress-value" style={{ width: '40%' }} /></div></div><div className="trip-stat"><strong>6</strong><span>jours sur place</span><div className="widget-sub">12 — 18 avril 2027</div></div><div className="trip-stat"><strong>4</strong><span>membres invités</span><div className="member-stack" style={{ marginTop: 13 }}><span className="mini-avatar">CM</span><span className="mini-avatar">TH</span><span className="mini-avatar">LI</span><span className="mini-avatar">+1</span></div></div></div></ModuleShell>;
}

function MessagesView({ messages, chats, activeId, onSelect, onSend }: { messages: MessageThread[]; chats: Record<number, { from: string; text: string; mine: boolean }[]>; activeId: number; onSelect: (id: number) => void; onSend: (text: string) => void }) {
  const active = messages.find((message) => message.id === activeId) ?? messages[0];
  const [text, setText] = useState('');
  if (!active) return <ModuleShell module="messages"  onOpen={() => undefined}><div className="empty-state"><h3>Aucune conversation</h3></div></ModuleShell>;
  return <ModuleShell module="messages"  onOpen={() => undefined} action={<Button icon="edit">Nouveau message</Button>}><MetricRow items={[{ label: 'Messages', value: messages.length, caption: 'échanges récents' }, { label: 'Non lus', value: messages.reduce((sum, message) => sum + message.unread, 0), caption: 'dans vos conversations' }, { label: 'Membres', value: 3, caption: 'dans le foyer' }, { label: 'Synchronisation', value: 'Direct', caption: 'temps réel' }]} /><div className="message-layout"><aside className="message-list"><div className="message-list-head"><h3>Conversations</h3></div>{messages.map((message) => <button className={`conversation-button ${message.id === active.id ? 'active' : ''}`} key={message.id} onClick={() => onSelect(message.id)}><span className="mini-avatar">{message.initials}</span><span className="conversation-copy"><strong>{message.name}</strong><span>{message.text}</span></span>{message.unread ? <i className="unread-dot" /> : <small style={{ color: 'var(--muted)', fontSize: 10 }}>{message.time}</small>}</button>)}</aside><section className="chat-panel"><div className="chat-head"><span className="mini-avatar">{active.initials}</span><div><strong>{active.name}</strong><small>En ligne · foyer</small></div></div><div className="chat-body">{(chats[active.id] ?? []).map((message, index) => <div className={`bubble ${message.mine ? 'mine' : ''}`} key={`${message.from}-${index}`}>{message.text}</div>)}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); } }}><input className="input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Écrire un message…" aria-label="Écrire un message" /><Button type="submit" icon="send" aria-label="Envoyer" /></form></section></div></ModuleShell>;
}

function ComingSoon({ module, onNotify }: { module: ModuleKey; onNotify: () => void }) {
  return <ModuleShell module={module}  onOpen={onNotify} action={<Button icon="bell" onClick={onNotify}>Me tenir informée</Button>}><section className="empty-state"><div className="empty-icon"><Icon name="heart" className="icon-lg" /></div><h3>Les recettes arrivent bientôt.</h3><p>Vous pourrez bientôt enregistrer vos recettes, les ingrédients et les préférences de chaque membre.</p><Button icon="bell" onClick={onNotify}>Me tenir informée</Button></section></ModuleShell>;
}

type FieldDef = { name: string; label: string; type?: string; placeholder?: string; required?: boolean; options?: string[]; defaultValue?: string };
const dialogFields: Record<DialogKind, { title: string; eyebrow: string; intro: string; submit: string; fields: FieldDef[] }> = {
  task: { title: 'Ajouter une tâche', eyebrow: 'À faire', intro: 'Une échéance claire, un responsable, et c’est tout.', submit: 'Ajouter la tâche', fields: [{ name: 'title', label: 'Nom de la tâche', required: true, placeholder: 'Ex. Choisir le menu du week-end' }, { name: 'dueDate', label: 'Échéance', type: 'date', required: true, defaultValue: '2026-09-25' }, { name: 'assignee', label: 'Assigner à', type: 'select', options: ['Camille', 'Thomas', 'Lina'], required: true }, { name: 'priority', label: 'Priorité', type: 'select', options: ['Haute', 'Normale', 'Basse'], required: true }, { name: 'reminder', label: 'Rappel', placeholder: 'Ex. 30 min avant' }, { name: 'description', label: 'Description (optionnel)', type: 'textarea' }] },
  event: { title: 'Ajouter un événement', eyebrow: 'Calendrier', intro: 'Rendez-vous, sortie ou échéance à ne pas manquer.', submit: 'Ajouter l’événement', fields: [{ name: 'title', label: 'Titre', required: true }, { name: 'date', label: 'Date', type: 'date', required: true, defaultValue: '2026-09-25' }, { name: 'time', label: 'Heure', type: 'time', required: true, defaultValue: '19:30' }, { name: 'kind', label: 'Type', type: 'select', options: ['Famille', 'Rendez-vous', 'École', 'Anniversaire'], required: true }] },
  note: { title: 'Créer une note', eyebrow: 'Notes', intro: 'Une idée, une information ou une mémoire à garder.', submit: 'Créer la note', fields: [{ name: 'title', label: 'Titre', required: true }, { name: 'category', label: 'Catégorie', type: 'select', options: ['Maison', 'Foyer', 'Loisirs', 'À faire'], required: true }, { name: 'body', label: 'Contenu', type: 'textarea', required: true }] },
  course: { title: 'Ajouter un article', eyebrow: 'Courses', intro: 'Ajoutez-le à une liste partagée par le foyer.', submit: 'Ajouter l’article', fields: [{ name: 'name', label: 'Article', required: true }, { name: 'list', label: 'Liste', type: 'select', options: ['Fresque', 'Maison'], required: true }] },
  expense: { title: 'Ajouter une dépense', eyebrow: 'Ardoise', intro: 'Le partage se calcule automatiquement pour les membres choisis.', submit: 'Ajouter la dépense', fields: [{ name: 'title', label: 'Libellé', required: true }, { name: 'amount', label: 'Montant', type: 'number', required: true, defaultValue: '24,90' }, { name: 'payer', label: 'Payé par', type: 'select', options: ['Camille', 'Thomas', 'Lina'], required: true }] },
  gift: { title: 'Ajouter une idée cadeau', eyebrow: 'Cadeaux', intro: 'Une idée, un prix, un lien… et le partage reste sous contrôle.', submit: 'Ajouter l’idée', fields: [{ name: 'title', label: 'Nom du cadeau', required: true }, { name: 'price', label: 'Prix', type: 'number', required: true, defaultValue: '45' }, { name: 'url', label: 'URL (optionnel)', type: 'url', placeholder: 'https://…' }, { name: 'comment', label: 'Commentaire', type: 'textarea' }] },
  routine: { title: 'Créer une routine', eyebrow: 'Routines', intro: 'Un rituel récurrent, un responsable, une série qui se construit.', submit: 'Créer la routine', fields: [{ name: 'title', label: 'Nom de la routine', required: true }, { name: 'frequency', label: 'Récurrence', type: 'select', options: ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Annuel'], required: true }, { name: 'assignee', label: 'Assigner à', type: 'select', options: ['Camille', 'Thomas', 'Lina'], required: true }] },
  provider: { title: 'Ajouter un prestataire', eyebrow: 'Prestataires', intro: 'Un contact complet, prêt à être retrouvé par toute la famille.', submit: 'Ajouter le contact', fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['Médecin', 'Artisan', 'École', 'Admin'], required: true }, { name: 'phone', label: 'Téléphone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Adresse' }, { name: 'postalCode', label: 'Code postal' }, { name: 'city', label: 'Ville' }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
  pet: { title: 'Ajouter une fiche animal', eyebrow: 'Animaux', intro: 'Les informations de santé et de suivi restent accessibles au foyer.', submit: 'Créer la fiche', fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['Chien', 'Chat', 'Lapin', 'Oiseau', 'Autre'], required: true }, { name: 'breed', label: 'Race' }, { name: 'weight', label: 'Poids (kg)', type: 'number', required: true, defaultValue: '10' }, { name: 'birthDate', label: 'Date de naissance', type: 'date', required: true }, { name: 'identification', label: 'Numéro d’identification', required: true }, { name: 'nextReminder', label: 'Prochain rappel', type: 'date' }, { name: 'notes', label: 'Informations', type: 'textarea' }] },
  place: { title: 'Ajouter une adresse', eyebrow: 'Adresses', intro: 'Un lieu à retrouver, avec sa photo et votre avis.', submit: 'Enregistrer le lieu', fields: [{ name: 'name', label: 'Nom du lieu', required: true }, { name: 'type', label: 'Type de lieu', type: 'select', options: ['Restaurant', 'Café', 'Bar', 'Hôtel', 'Boutique', 'Parc', 'Musée', 'Cinéma', 'Théâtre', 'Bien-être', 'Autre'], required: true }, { name: 'note', label: 'Note', type: 'number', required: true, defaultValue: '4' }, { name: 'address', label: 'Adresse' }, { name: 'noteText', label: 'Note personnelle', type: 'textarea' }] },
  birthday: { title: 'Ajouter un anniversaire', eyebrow: 'Anniversaires', intro: 'Une date, un prénom, et le calendrier s’occupe du reste.', submit: 'Ajouter l’anniversaire', fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'iso', label: 'Date de naissance', type: 'date', required: true, defaultValue: '1992-10-07' }] },
  loyalty: { title: 'Ajouter une carte', eyebrow: 'Fidélité', intro: 'Scannez le code ou saisissez-le manuellement pour le retrouver au moment de passer en caisse.', submit: 'Enregistrer la carte', fields: [{ name: 'name', label: 'Nom de la carte', required: true }, { name: 'kind', label: 'Type de code', type: 'select', options: ['Code-barres', 'QR Code'], required: true }, { name: 'code', label: 'Code', required: true, defaultValue: '6284 1190 3312' }] },
  profile: { title: 'Modifier mon profil', eyebrow: 'Profil', intro: 'La ville utilisée ici pilote le widget météo de votre accueil.', submit: 'Enregistrer le profil', fields: [{ name: 'name', label: 'Prénom et nom', required: true }, { name: 'city', label: 'Ville', required: true }] },
  invite: { title: 'Inviter un membre', eyebrow: 'Ardoise', intro: 'Une invitation peut rester locale dans cette démonstration.', submit: 'Envoyer l’invitation', fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'access', label: 'Accès', type: 'select', options: ['Foyer', 'Cercle', 'Ardoise uniquement'], required: true }] },
  giftShare: { title: 'Partager cette idée', eyebrow: 'Cadeaux', intro: 'Choisissez les personnes du foyer ou un proche externe.', submit: 'Enregistrer le partage', fields: [{ name: 'externalEmail', label: 'Inviter un proche (optionnel)', type: 'email' }] },
};

function Dialog({ kind, id, state, onClose, onSubmit }: { kind: DialogKind; id?: number; state: AppState; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const definition = dialogFields[kind];
  const target = kind === 'task' ? state.tasks.find((task) => task.id === id) : kind === 'event' ? state.events.find((event) => event.id === id) : kind === 'note' ? state.notes.find((note) => note.id === id) : kind === 'provider' ? state.providers.find((provider) => provider.id === id) : undefined;
  const initial = target as Record<string, unknown> | undefined;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="icon-button modal-close" onClick={onClose} aria-label="Fermer"><Icon name="close" className="icon-sm" /></button><p className="eyebrow">{definition.eyebrow}</p><h2 id="modal-title">{definition.title}</h2><p className="modal-intro">{definition.intro}</p><form className="form-grid" onSubmit={onSubmit}>{definition.fields.map((field) => <Field key={field.name} field={field} value={initial?.[field.name] ?? field.defaultValue ?? ''} />)}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" icon="arrow">{definition.submit}</Button></div></form></div></div>;
}

function Field({ field, value }: { field: FieldDef; value: unknown }) {
  const common = { id: `field-${field.name}`, name: field.name, required: field.required, 'aria-label': field.label };
  return <div className="field"><label htmlFor={`field-${field.name}`}>{field.label}{field.required ? ' *' : ''}</label>{field.type === 'textarea' ? <textarea className="textarea" {...common} defaultValue={String(value)} placeholder={field.placeholder} /> : field.type === 'select' ? <select className="select" {...common} defaultValue={String(value)}>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input className="input" {...common} type={field.type ?? 'text'} defaultValue={String(value)} placeholder={field.placeholder} />}</div>;
}
