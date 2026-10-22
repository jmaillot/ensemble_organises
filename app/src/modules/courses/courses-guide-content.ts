import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des listes de courses.
 *
 * CE QUE CE TEXTE DOIT ÊTRE : la description de ce que le code fait. Chaque
 * phrase a été relue sur la source, pas sur un autre produit — les fonctions
 * Premium d'ailleurs (frigo, export PDF en fichier, suggestions de
 * l'assistant) n'existent pas ici, donc la page n'en parle pas. Le prix de
 * l'honnêteté : la page décrit MOINS de choses que la référence, et c'est
 * voulu. Une page d'aide qui promet ce que l'application ne fait pas est
 * pire qu'une page d'aide absente (AGENTS.md §2.7 I).
 *
 * Les différences assumées avec la référence sont notées ici : chez nous, un
 * article coché RESTE dans son rayon (barré) au lieu de descendre en bas de
 * la liste, et la liste s'imprime au lieu de s'exporter en PDF.
 */

export const COURSES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'receipt',
    title: 'La liste de courses, partagée par le foyer',
    intro:
      'Tout le foyer partage les mêmes listes. Chacun ajoute ce qui manque quand il y pense, et celui qui passe au magasin coche au fur et à mesure : les changements apparaissent en temps réel, et la prochaine course se lit dans le calendrier.',
    features: [
      {
        icon: 'plus',
        title: 'Ajout en quelques secondes',
        text: "Tapez le nom de l'article et validez. Les produits déjà enregistrés au catalogue vous sont proposés pendant la saisie, avec leur photo et leur rayon. Si l'article n'y est pas, on vous demande son rayon et sa quantité.",
      },
      {
        icon: 'check',
        title: 'Pas de doublon',
        text: "Un article déjà présent dans la liste ne s'ajoute pas une deuxième fois : l'application propose de modifier sa quantité, et la ligne reste unique.",
      },
      {
        icon: 'grid',
        title: 'Regroupement par rayon',
        text: "Un sélecteur range la liste par rayon, ou dans l'ordre d'ajout. Vous voyez d'un coup d'œil ce qu'il reste à prendre au frais ou en épicerie.",
      },
      {
        icon: 'receipt',
        title: 'Quantité et unité',
        text: "Notez 2 kg de pommes, 1 L de lait ou 3 paquets. La quantité se corrige sur la ligne, sans rouvrir la liste.",
      },
      {
        icon: 'copy',
        title: 'Plusieurs listes en parallèle',
        text: "Séparez les courses du jour, le barbecue et la pharmacie. Chaque liste a son onglet, et ce que vous ajoutez part dans la liste ouverte.",
      },
      {
        icon: 'download',
        title: 'Imprimer la liste',
        text: "La liste s'imprime, rangée par rayon, cochée ou pas : pour l'imprimer ou l'envoyer à celui qui passe au magasin.",
      },
      {
        icon: 'calendar',
        title: 'La prochaine course vient du calendrier',
        text: "Ajoutez un événement « Courses » au calendrier : il apparaît ici, avec son jour et son heure.",
      },
    ],
  },
  {
    icon: 'grid',
    title: 'Le catalogue de produits',
    intro:
      "Un produit, c'est ce que le foyer rachète souvent. Enregistrez-le une fois avec sa photo et son rayon, puis retrouvez-le en un geste dans toutes vos listes. Le catalogue est partagé par tout le foyer.",
    features: [
      {
        icon: 'search',
        title: 'Rechercher en ligne',
        text: "Tapez le nom d'un produit : l'application le cherche dans sa base et sur Open Food Facts, puis remplit la fiche avec son nom, sa photo et son rayon. Vous n'avez plus qu'à l'ajuster.",
      },
      {
        icon: 'scan',
        title: 'Scanner un code-barres',
        text: "Sur mobile, pointez l'appareil photo sur un code-barres et la fiche se crée toute seule. Idéal pour constituer le catalogue en rangeant ses courses.",
      },
      {
        icon: 'grid',
        title: 'Filtrer par rayon',
        text: 'Les rayons s’affichent en onglets au-dessus du catalogue. Cliquez sur un rayon pour ne voir que ses produits.',
      },
      {
        icon: 'edit',
        title: 'Une fiche que l’on corrige',
        text: "Photo, marque, rayon et code-barres se corrigent à la main : un rayon déduit n’est jamais tout à fait le bon.",
      },
      {
        icon: 'plus',
        title: 'Ajout en un geste',
        text: "Depuis la fiche d'un produit, un bouton l'envoie dans la liste de votre choix.",
      },
      {
        icon: 'star',
        title: 'Vos habitudes en un clic',
        text: "Les articles que le foyer rachète reviennent en suggestions sous le champ d'ajout : un clic les remet dans la liste.",
      },
    ],
  },
];

export const COURSES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'La liste est-elle partagée avec tout le foyer ?',
    answer:
      "Oui. Toutes les listes du foyer sont visibles par ses membres, et les changements apparaissent en temps réel, sans recharger la page.",
  },
  {
    question: 'Que deviennent les articles que je coche ?',
    answer:
      "Ils restent à leur place, barrés, et le compteur « dans le panier » monte. Rien n’est supprimé : un article coché se rouvre d’un clic.",
  },
  {
    question: 'Quelle différence entre un article et un produit ?',
    answer:
      "Un article est une occurrence dans UNE liste (« 2 kg de pommes »). Un produit est la référence du catalogue, partagée par toutes les listes du foyer.",
  },
  {
    question: 'À quoi sert le regroupement par rayon ?',
    answer:
      "À retrouver l’article au bon endroit du magasin. Le rayon est proposé à l’ajout — déduit du nom, ou choisi à la main — et reste modifiable ensuite.",
  },
  {
    question: 'D’où viennent les photos et les rayons des produits ?',
    answer:
      "Du code-barres lu par l’appareil photo, et d’Open Food Facts pour les produits introuvables. Le rayon déduit est une proposition : la fiche se corrige.",
  },
  {
    question: 'Un article déjà dans la liste peut-il être ajouté deux fois ?',
    answer:
      "Non. L’ajout d’un article déjà présent propose de modifier sa quantité, et la ligne reste unique.",
  },
  {
    question: 'Comment modifier le nom, la quantité ou le rayon d’un article ?',
    answer:
      "Le crayon, au survol de la ligne, ouvre sa fiche : nom, quantité, unité et rayon. Sur téléphone, les boutons sont toujours visibles.",
  },
  {
    question: 'Comment créer une liste supplémentaire ?',
    answer:
      "« Nouvelle liste », en haut de l’espace Courses. Elle apparaît en onglet, et les articles ajoutés vont dans la liste ouverte.",
  },
  {
    question: 'Les quantités sont-elles obligatoires ?',
    answer:
      "Non. Un article s’ajoute avec son seul nom, et la quantité se complète plus tard, sur la ligne.",
  },
  {
    question: 'Que se passe-t-il si je supprime une liste ?',
    answer:
      "La liste et ses articles sont supprimés pour tout le foyer. La suppression est confirmée avant.",
  },
];
