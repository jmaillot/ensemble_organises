import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des notes.
 *
 * Le verrou est une FONCTION, pas un bouton : le titre, le contenu, la
 * catégorie, la visibilité et les pièces jointes cessent de bouger, et
 * l'écriture est refusée. La note reste visible et se cherche comme les
 * autres — le verrou protège de la modification, pas de la lecture. La règle
 * vit en base : seul l'auteur de la note et un administrateur peuvent la lever.
 */

export const NOTES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'edit',
    title: 'Vos pensées, au même endroit',
    intro:
      "Une idée, une information, une mémoire à garder. Une note peut rester privée, ou devenir un repère partagé avec le foyer.",
    features: [
      {
        icon: 'edit',
        title: 'Un titre, un contenu, du Markdown',
        text: "Le contenu s’écrit en Markdown — gras, italique, listes, liens — et l’aperçu se lit avant d’enregistrer, pour voir ce que les autres liront.",
      },
      {
        icon: 'lock',
        title: 'Privée ou partagée',
        text: "Une note reste privée, ou devient un repère partagé avec le foyer. Le badge sur la carte dit toujours dans quel état elle est, sans avoir à l’ouvrir.",
      },
      {
        icon: 'archive',
        title: 'Des dossiers',
        text: "Les notes se rangent dans Général ou dans un dossier. Un dossier du foyer est visible par tous ; un dossier perso, par vous seul.",
      },
      {
        icon: 'image',
        title: 'Une photo de couverture',
        text: "La couverture sert de bandeau sur la carte. À défaut, la première photo jointe prend le relais — et les pièces jointes (photos et PDF) restent accessibles depuis la note.",
      },
    ],
  },
  {
    icon: 'lock',
    title: 'Le verrou',
    intro:
      "Parfois une note doit rester telle quelle. Le cadenas la fige, et la règle est décidée par la base.",
    features: [
      {
        icon: 'lock',
        title: 'Verrouiller une note',
        text: "Le cadenas fige le titre, le contenu, la catégorie, la visibilité et les pièces jointes. La note ne s’ouvre plus en édition : toute écriture est refusée, par tout le monde.",
      },
      {
        icon: 'info',
        title: 'Un badge sur la carte',
        text: "La note porte un badge « Verrouillée » : on sait qu’elle est figée sans l’ouvrir, et sans tenter de la modifier pour le découvrir.",
      },
      {
        icon: 'user',
        title: 'Seul l’auteur ou un administrateur le lève',
        text: "La levée du verrou est réservée à l’autrice de la note et aux administrateurs du foyer. Elle ne se contourne pas : l’écriture est refusée côté serveur.",
      },
    ],
  },
];

export const NOTES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Que fige exactement le verrou ?',
    answer:
      "Le titre, le contenu, la catégorie, la visibilité et les pièces jointes. La note ne s’ouvre plus en édition : toute écriture est refusée, par tout le monde.",
  },
  {
    question: 'Qui peut lever le verrou ?',
    answer:
      "L’autrice de la note, et les administrateurs du foyer. Le verrou vit en base : un contournement de l’écran ne change rien.",
  },
  {
    question: 'Puis-je partager une note par lien ?',
    answer:
      "Non. Le partage se fait par la visibilité : une note privée reste privée, une note partagée l’est avec le foyer. Aucun lien n’est produit.",
  },
  {
    question: 'Comment s’écrit le contenu ?',
    answer:
      "En Markdown : **gras**, *italique*, listes, liens. L’aperçu montre le rendu avant l’enregistrement, et les liens externes s’ouvrent dans un nouvel onglet.",
  },
  {
    question: 'Que deviennent les pièces jointes ?',
    answer:
      "Elles restent sur la note : on voit leur nom et leur taille, et elles s’ouvrent dans un nouvel onglet. Images et PDF sont acceptés, comme dans le Cercle.",
  },
  {
    question: 'Un enfant peut-il écrire une note ?',
    answer:
      "Non. Il lit les notes partagées avec le foyer, mais il n’en crée pas et n’en modifie pas.",
  },
];
