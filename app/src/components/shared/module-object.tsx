import type { ModuleKey } from '@/lib/modules';

/**
 * Objets d'illustration des espaces — le pendant SVG des emoji qu'ils
 * remplacent (24 octobre 2026, critique : « l'identité du catalogue dépend
 * de la police emoji de l'OS » ; DESIGN.md §5 proscrit l'emoji en objet de
 * tuile).
 *
 * Règles d'une maison :
 * - un objet par espace, dessiné ici, deux tons : encre `currentColor`
 *   (sapin sur son pastel de tuile) et un clair translucide pour les
 *   détails creusés — aucun autre ton, sinon chaque objet devient une
 *   illustration isolée plutôt qu'un catalogue ;
 * - un même viewBox paysage « objet posé » (100 × 76) : l'objet regarde en
 *   bas-droite de la tuile comme le caddie de melimelo, jamais dans le vide ;
 * - un élément secondaire posé sur le fond de tuile (pas sur une masse
 *   d'encre) hérite de la même encre atténuée en opacité, jamais du clair ;
 * - décoratif par construction : `aria-hidden` posé par le composant, le
 *   contrôle porte déjà son nom accessible.
 */
export type ModuleObjectKey = ModuleKey;

type ObjectProps = { module: ModuleObjectKey; className?: string };

const CLAIR = 'rgb(255 255 255 / 0.55)';

function Courses() {
  return (
    <>
      {/* Panier quadrillé : corps en trapèze, anneau au-dessus. */}
      <path d="M20 30h60l-9 32a8 8 0 0 1-8 6H37a8 8 0 0 1-8-6Z" />
      <path d="M18 30a32 22 0 0 1 64 0" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      {/* Marches du panier creusées en clair. */}
      <path d="M30 40h40l-1.6 6H31.6Z" fill={CLAIR} />
      <path d="M33 52h34l-1.8 6H34.8Z" fill={CLAIR} />
    </>
  );
}

function Calendrier() {
  return (
    <>
      <rect x="14" y="20" width="72" height="56" rx="10" />
      {/* Bandeau du mois creusé, puis les anneaux par-dessus. */}
      <rect x="14" y="20" width="72" height="16" rx="10" fill={CLAIR} />
      <rect x="30" y="10" width="7" height="18" rx="3.5" />
      <rect x="63" y="10" width="7" height="18" rx="3.5" />
      {/* Grille des jours creusée sous le bandeau. */}
      <rect x="26" y="48" width="14" height="10" rx="4" fill={CLAIR} />
      <rect x="46" y="48" width="14" height="10" rx="4" fill={CLAIR} />
      <rect x="66" y="48" width="10" height="10" rx="4" fill={CLAIR} />
    </>
  );
}

function Notes() {
  return (
    <>
      {/* Feuille au coin plié vers le lecteur. */}
      <path d="M22 16h44l16 16v36a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8Z" />
      <path d="M66 16 82 32 74 32a8 8 0 0 1-8-8Z" fill={CLAIR} />
      <path d="M30 44h40v6H30Z" fill={CLAIR} />
      <path d="M30 58h28v6H30Z" fill={CLAIR} />
    </>
  );
}

function Taches() {
  return (
    <>
      <rect x="16" y="16" width="68" height="58" rx="14" />
      {/* La coche creusée : même geste que le vrai check posé plus tard. */}
      <path
        d="M32 46l12 12 24-26"
        fill="none"
        stroke={CLAIR}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Routines() {
  return (
    <>
      {/* Boucle du quotidien : deux flèches qui se poursuivent. */}
      <path d="M76 40a26 24 0 0 0-52 0" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M24 40a26 24 0 0 0 52 0" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M17 40h14l-7 12Z" />
      <path d="M69 40h14l-7-12Z" />
    </>
  );
}

function Ardoise() {
  return (
    <>
      {/* Pile de pièces du budget partagé, fente sur la pièce du dessus. */}
      <ellipse cx="50" cy="63" rx="30" ry="9" />
      <ellipse cx="50" cy="42" rx="30" ry="9" />
      <ellipse cx="50" cy="22" rx="26" ry="8" />
      <rect x="48" y="18" width="4" height="8" rx="2" fill={CLAIR} />
    </>
  );
}

function Recettes() {
  return (
    <>
      <path d="M16 36h68v22a12 12 0 0 1-12 12H28a12 12 0 0 1-12-12Z" />
      <rect x="10" y="30" width="80" height="12" rx="6" />
      {/* Vapeur au-dessus du couvercle. */}
      <path d="M38 22c0-6 8-6 8-12M58 22c0-6 8-6 8-12" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
    </>
  );
}

function Cadeaux() {
  return (
    <>
      <rect x="18" y="34" width="64" height="42" rx="8" />
      <rect x="24" y="22" width="52" height="14" rx="5" />
      {/* Ruban vertical creusé ; les boucles du nœud émergent en encre. */}
      <rect x="45" y="22" width="10" height="54" fill={CLAIR} />
      <path d="M50 22C42 12 30 14 34 22ZM50 22c8-10 20-8 16 0Z" />
    </>
  );
}

function Anniversaires() {
  return (
    <>
      {/* Gâteau à deux étages, bougie posée et flamme atténuée. */}
      <rect x="20" y="40" width="60" height="34" rx="8" />
      <rect x="32" y="30" width="36" height="12" rx="5" />
      <rect x="47" y="14" width="6" height="16" />
      <circle cx="50" cy="10" r="4" opacity="0.75" />
    </>
  );
}

function Contacts() {
  return (
    <>
      {/* Deux visages : la silhouette du fond d'abord, atténuée. */}
      <g opacity="0.4">
        <circle cx="72" cy="32" r="11" />
        <path d="M50 70a22 21 0 0 1 44 0Z" />
      </g>
      <circle cx="38" cy="30" r="14" />
      <path d="M12 70a26 20 0 0 1 52 0Z" />
    </>
  );
}

function Animaux() {
  return (
    <>
      {/* Trace de patte : coussinet + trois doigts. */}
      <ellipse cx="50" cy="52" rx="18" ry="14" />
      <circle cx="32" cy="26" r="8" />
      <circle cx="50" cy="20" r="8" />
      <circle cx="68" cy="26" r="8" />
    </>
  );
}

function Prestataires() {
  return (
    <>
      {/* Clé : anneau percé + tige à 45°. */}
      <path d="M36 40a20 20 0 1 1 26 19l-8-8a10 10 0 1 0-4-4Z" />
      <path d="M58 53l14 14" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
    </>
  );
}

function Fidelite() {
  return (
    <>
      <rect x="12" y="24" width="76" height="46" rx="9" />
      {/* Bande de la carte + points de tampons creusés. */}
      <rect x="20" y="46" width="60" height="6" rx="3" fill={CLAIR} />
      <circle cx="28" cy="60" r="4" fill={CLAIR} />
      <circle cx="44" cy="60" r="4" fill={CLAIR} />
      <circle cx="60" cy="60" r="4" fill={CLAIR} />
    </>
  );
}

function Adresses() {
  return (
    <>
      {/* Repère de carte : goutte la pointe en bas, trou creusé. */}
      <path d="M50 74C34 56 22 44 22 30a28 28 0 0 1 56 0c0 14-12 26-28 44Z" />
      <circle cx="50" cy="17" r="10" fill={CLAIR} />
    </>
  );
}

function Cercle() {
  return (
    <>
      {/* Appareil photo : boîtier et viseur ; objectif et flash creusés. */}
      <rect x="10" y="24" width="80" height="50" rx="10" />
      <rect x="38" y="16" width="24" height="12" rx="4" />
      <circle cx="50" cy="49" r="15" fill={CLAIR} />
      <circle cx="76" cy="35" r="3.5" fill={CLAIR} />
    </>
  );
}

function Voyages() {
  return (
    <>
      {/* Avion en papier : silhouette du pli, encoche incluse. */}
      <path d="M14 12L90 38L14 64L14 50L58 38L14 26Z" />
    </>
  );
}

function Messages() {
  return (
    <>
      {/* Bulle à queue bas-gauche, trois points creusés. */}
      <path d="M14 16h72a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H36l-16 14v-14h-6a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8Z" />
      <circle cx="34" cy="36" r="4.5" fill={CLAIR} />
      <circle cx="50" cy="36" r="4.5" fill={CLAIR} />
      <circle cx="66" cy="36" r="4.5" fill={CLAIR} />
    </>
  );
}

function Frigo() {
  return (
    <>
      {/* Frigo : caisson haut, séparation des portes + poignées creusées. */}
      <rect x="26" y="12" width="48" height="62" rx="10" />
      <rect x="30" y="40" width="40" height="5" fill={CLAIR} />
      <rect x="32" y="20" width="4" height="12" rx="2" fill={CLAIR} />
      <rect x="32" y="48" width="4" height="12" rx="2" fill={CLAIR} />
    </>
  );
}

function Menu() {
  return (
    <>
      {/* Assiette posée, rebord creusé, fourchette dressée à droite. */}
      <circle cx="40" cy="46" r="28" />
      <circle cx="40" cy="46" r="18" fill={CLAIR} />
      <path d="M80 18v9M86 18v9M92 18v9M86 27v43" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </>
  );
}

function Documents() {
  return (
    <>
      {/* Boîte à papiers : feuille au coin plié. */}
      <path d="M22 14h40l18 18v36a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z" />
      <path d="M62 14 80 32 70 32a8 8 0 0 1-8-8Z" fill={CLAIR} />
      <path d="M26 46h48v6H26Z" fill={CLAIR} />
      <path d="M26 62h30v6H26Z" fill={CLAIR} />
    </>
  );
}

function Accueil() {
  return (
    <>
      {/* La maison : toit en gouttière, porte creusée. */}
      <path d="M50 12 88 44H78v18a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8V44H12Z" />
      <rect x="42" y="50" width="16" height="20" rx="5" fill={CLAIR} />
    </>
  );
}

export const OBJECTS: Record<ModuleObjectKey, () => React.JSX.Element> = {
  accueil: Accueil,
  taches: Taches,
  calendrier: Calendrier,
  notes: Notes,
  courses: Courses,
  routines: Routines,
  recettes: Recettes,
  ardoise: Ardoise,
  cadeaux: Cadeaux,
  anniversaires: Anniversaires,
  contacts: Contacts,
  animaux: Animaux,
  prestataires: Prestataires,
  fidelite: Fidelite,
  adresses: Adresses,
  cercle: Cercle,
  voyages: Voyages,
  messages: Messages,
  frigo: Frigo,
  menu: Menu,
  documents: Documents,
  parametres: Accueil,
};

/**
 * L'objet de l'espace, en héritant de `currentColor` : la tuile passe
 * `text-fg` (sapin sur son pastel), les surfaces sombres échangent leur
 * propre encre claire.
 */
export function ModuleObject({ module, className }: ObjectProps) {
  const Draw = OBJECTS[module] ?? Accueil;
  return (
    <svg
      viewBox="0 0 100 76"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <Draw />
    </svg>
  );
}
