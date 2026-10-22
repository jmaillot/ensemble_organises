import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de Fidélité.
 *
 * Le code-barres est un vrai rendu SVG, lisible par un lecteur de
 * code-barres ; le QR code est un SVG généré. Les deux s'affichent en plein
 * écran, pour être présentés en caisse.
 */

export const FIDELITE_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'wallet',
    title: 'Les cartes du foyer, à portée de caisse',
    intro:
      "Le code de l’enseigne, rangé une fois pour toutes. On le retrouve en un tap, en plein écran, quand il faut le présenter.",
    features: [
      {
        icon: 'scan',
        title: 'Scanner la carte, ou la saisir',
        text: "Sur mobile, l’appareil photo cadre le code-barres ou le QR code de l’enseigne, et la fiche se pré-remplit. Sans caméra, ou sans permission, on saisit le code à la main : la fiche est la même.",
      },
      {
        icon: 'search',
        title: 'Retrouver la carte par son enseigne',
        text: "Un filtre par catégorie — alimentaire, vêtements, maison, sport, animalerie… — et les cartes sont rangées par enseigne utilisée récemment : celle qu’on sort le plus souvent arrive en tête.",
      },
      {
        icon: 'checkCircle',
        title: 'Une carte à vous, ou à tout le foyer',
        text: "Chaque carte appartient à un membre ou au foyer entier. Une carte du foyer entier reste accessible à tous ; une carte personnelle n’est lisible que par son membre.",
      },
      {
        icon: 'star',
        title: 'Marquer comme utilisée',
        text: "Après un passage en caisse, un bouton remonte la carte dans le tri. La liste reste ordonnée par l’usage réel, pas par l’ordre de création.",
      },
    ],
  },
];

export const FIDELITE_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Comment scanner une carte de fidélité ?',
    answer:
      "Le bouton Scanner une carte ouvre la caméra, à cadrer sur le code. Si l’appareil n’a pas de caméra, ou si vous refusez l’accès, la fiche s’ouvre à la main, avec le code à saisir.",
  },
  {
    question: 'Que se passe-t-il si la caméra n’est pas disponible ?',
    answer:
      "L’application le dit — caméra indisponible, accès refusé, ou démarrage impossible — et propose de saisir le code à la main. La fiche n’est jamais bloquée par la caméra.",
  },
  {
    question: 'Le code reste-t-il dans le foyer ?',
    answer:
      "Oui, et c’est pourquoi l’application écrit de ne pas le partager en message ouvert : un code de fidélité est un bon d’achat.",
  },
  {
    question: 'Peut-on partager une carte avec un autre membre ?',
    answer:
      "La fiche choisit son propriétaire : un membre, ou le foyer entier. Changer de propriétaire se fait en modifiant la carte.",
  },
  {
    question: 'Pourquoi les cartes sont-elles dans cet ordre ?',
    answer:
      "Par enseigne utilisée récemment : marquer une carte comme utilisée la fait remonter. C’est l’ordre des passages, pas l’ordre de création.",
  },
  {
    question: 'Peut-on supprimer une carte ?',
    answer:
      "Oui, après confirmation : la carte et son code sont retirés du foyer. L’action est définitive.",
  },
];
