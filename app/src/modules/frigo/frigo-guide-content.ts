import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de l'espace Frigo : le contenu suit le contrat du test
 * `module-guides.test.ts` (cartes complètes, questions honnêtes).
 */

export const FRIGO_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'archive',
    title: 'Ce que le frigo fait pour vous',
    intro: 'Le frigo liste ce que le foyer possède dans le réfrigérateur, le congélateur et le garde-manger, et signale ce qui va périmer.',
    features: [
      {
        icon: 'grid',
        title: 'Trois emplacements',
        text: 'Chaque article est rangé dans le réfrigérateur, le congélateur ou le garde-manger. L’onglet « Tout » réunit les trois emplacements dans une seule liste.',
      },
      {
        icon: 'clock',
        title: 'Péremption sous les yeux',
        text: 'Chaque article porte une pastille de péremption : rouge pour périmé, ambre pour bientôt périmé, verte pour bon. Les articles sans date restent listés sans alerte.',
      },
      {
        icon: 'filter',
        title: 'Tri par urgence',
        text: 'Dans chaque emplacement, les articles se classent d’eux-mêmes : ce qui est périmé remonte en tête, suivi de ce qui expire sous deux jours, puis du reste par date.',
      },
      {
        icon: 'receipt',
        title: 'Quantités lisibles',
        text: 'Chaque ligne affiche la quantité et son unité — « 8 pots », « 1,5 kg » — pour comparer d’un coup d’œil ce qui reste avant les prochaines courses.',
      },
    ],
  },
  {
    icon: 'edit',
    title: 'Ajouter et entretenir',
    intro: 'Tenir le frigo à jour ne coûte qu’un geste : l’article s’ajoute en quelques champs, se corrige d’un tap et sort de la liste quand il est consommé.',
    features: [
      {
        icon: 'plus',
        title: 'Ajout rapide',
        text: 'Le bouton « Ajouter un article » ouvre un formulaire court : nom, catégorie, emplacement, quantité et, si vous la connaissez, la date de péremption.',
      },
      {
        icon: 'calendar',
        title: 'Dates optionnelles',
        text: 'La péremption et la date d’ouverture sont optionnelles : un article sans date reste listé, il ne déclenche simplement aucune alerte.',
      },
      {
        icon: 'edit',
        title: 'Édition en un tap',
        text: 'Le bouton d’édition de chaque ligne rouvre le formulaire prérempli : ajustez la quantité après les courses ou notez l’ouverture d’un produit.',
      },
      {
        icon: 'trash',
        title: 'Retrait confirmé',
        text: 'Retirer un article demande une confirmation : le geste définitif (yaourt mangé, sauce jetée) ne se fait jamais par accident.',
      },
    ],
  },
  {
    icon: 'people',
    title: 'Un frigo partagé',
    intro: 'Le frigo partage la configuration du foyer : tout le monde voit le même contenu, et les profils enfant le consultent sans le modifier.',
    features: [
      {
        icon: 'users',
        title: 'Un contenu par foyer',
        text: 'Tous les membres voient le même frigo : ce que l’un ajoute, l’autre le voit aussitôt, en ligne comme sur mobile.',
      },
      {
        icon: 'lock',
        title: 'Lecture pour les enfants',
        text: 'Les profils enfant consultent le frigo sans pouvoir y écrire : les boutons d’ajout et d’édition leur sont masqués.',
      },
      {
        icon: 'heart',
        title: 'Données conservées',
        text: 'Si un administrateur désactive l’espace Frigo dans les paramètres, les articles sont conservés et réapparaissent à la réactivation.',
      },
    ],
  },
];

export const FRIGO_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut ajouter ou retirer des articles ?',
    answer: 'Les administrateurs et les membres du foyer. Les profils enfant voient le frigo mais n’y écrivent pas.',
  },
  {
    question: 'Que signifie la pastille « Bientôt périmé » ?',
    answer: 'L’article expire aujourd’hui, demain ou après-demain. Consommez-le vite, ou notez-le sur la liste de courses.',
  },
  {
    question: 'Un article peut-il exister sans date de péremption ?',
    answer: 'Oui. La date est optionnelle : l’article reste listé dans son emplacement, sans alerte.',
  },
  {
    question: 'Puis-je déplacer un article vers le congélateur ?',
    answer: 'Oui : modifiez l’article et choisissez son nouvel emplacement dans la liste du formulaire.',
  },
  {
    question: 'Que deviennent les articles si l’espace est désactivé ?',
    answer: 'Ils sont conservés en base. L’espace disparaît de la navigation et réapparaît intact à la réactivation.',
  },
  {
    question: 'Le frigo remplace-t-il la liste de courses ?',
    answer: 'Non : le frigo dit ce que vous avez, la liste de courses dit ce qu’il vous manque. Les deux se complètent.',
  },
];
