import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de l'espace Menu : le contenu suit le contrat du test
 * `module-guides.test.ts` (cartes complètes, questions honnêtes).
 */

export const MENU_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'utensils',
    title: 'La semaine, case par case',
    intro: 'Le menu pose un repas dans chaque case de la semaine : sept jours, trois moments — matin, midi et soir — et la semaine se feuillette d’un bout à l’autre.',
    features: [
      {
        icon: 'calendar',
        title: 'Semaine après semaine',
        text: 'Les flèches passent à la semaine précédente ou suivante, et le bouton « Cette semaine » ramène au présent. Le jour en cours est mis en évidence.',
      },
      {
        icon: 'utensils',
        title: 'Recette ou texte libre',
        text: 'Chaque repas est une recette du foyer — les courses en tireront les ingrédients — ou un simple texte : « restes du frigo », « pique-nique chez mamie ».',
      },
      {
        icon: 'users',
        title: 'Qui mange',
        text: 'Chaque repas peut nommer les membres du foyer qui y mangent : les avatars s’affichent sur la carte du repas.',
      },
      {
        icon: 'plus',
        title: 'Ajout en deux taps',
        text: 'Le plus de chaque case ouvre le formulaire prérempli avec le bon jour et le bon moment ; enregistrer suffit.',
      },
    ],
  },
  {
    icon: 'receipt',
    title: 'Du menu à la liste de courses',
    intro: 'Le bouton « Générer les courses » transforme la semaine en courses : les ingrédients de chaque recette sont mis à l’échelle sur les portions du repas, puis fusionnés dans la liste choisie.',
    features: [
      {
        icon: 'receipt',
        title: 'Ingrédients à l’échelle',
        text: 'Une recette pour 4 servie à 6 personnes ? Les quantités sont recalculées sur les portions de chaque repas avant l’envoi.',
      },
      {
        icon: 'copy',
        title: 'Fusion, jamais doublon',
        text: 'Deux repas qui demandent des œufs n’écrivent pas deux lignes : les ingrédients identiques s’additionnent sur la même ligne de la liste, y compris avec ce qui y était déjà.',
      },
      {
        icon: 'heart',
        title: 'Le plan reste intact',
        text: 'Générer les courses ne modifie pas le menu : la génération peut être rejouée, seuls les ingrédients s’ajustent dans la liste.',
      },
    ],
  },
  {
    icon: 'people',
    title: 'Un menu partagé',
    intro: 'Le menu est celui du foyer entier : tout le monde voit le même planning, et les profils enfant le consultent sans le modifier.',
    features: [
      {
        icon: 'users',
        title: 'Un planning par foyer',
        text: 'Les repas ajoutés par un membre sont visibles de tous, en ligne comme sur mobile — plus de « mais qui devait cuisiner ? ».',
      },
      {
        icon: 'lock',
        title: 'Lecture pour les enfants',
        text: 'Les profils enfant consultent le menu sans pouvoir y écrire : les commandes d’ajout et de modification leur sont masquées.',
      },
      {
        icon: 'heart',
        title: 'Recettes respectées',
        text: 'Supprimer une recette du foyer retire aussi ses repas du menu : jamais de recette fantôme dans le planning.',
      },
    ],
  },
];

export const MENU_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut planifier ou modifier un repas ?',
    answer: 'Les administrateurs et les membres du foyer. Les profils enfant consultent le menu mais n’y écrivent pas.',
  },
  {
    question: 'Un repas peut-il être à la fois une recette et un texte libre ?',
    answer: 'Non : un repas porte l’un ou l’autre. Modifiez le repas pour changer de forme.',
  },
  {
    question: 'Que se passe-t-il si je supprime une recette du foyer ?',
    answer: 'Ses repas disparaissent du menu en même temps que la recette — le planning ne garde jamais de recette fantôme.',
  },
  {
    question: 'La génération des courses écrase-t-elle ma liste ?',
    answer: 'Non : les ingrédients s’ajoutent ou s’incrémentent sur les lignes existantes, et rien de ce que vous aviez noté n’est retiré.',
  },
  {
    question: 'Puis-je planifier un repas d’une semaine passée ou future ?',
    answer: 'Oui : naviguez de semaine en semaine avec les flèches, puis ajoutez le repas dans la semaine affichée.',
  },
  {
    question: 'À quoi servent les portions d’un repas ?',
    answer: 'À mettre la recette à l’échelle lors de la génération des courses : les quantités sont recalculées sur le nombre de couverts du repas.',
  },
];
