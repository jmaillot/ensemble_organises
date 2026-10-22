import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des cadeaux.
 *
 * Deux choses cohabitent ici : les LISTES (une liste de cadeaux, celle de
 * quelqu'un, celle que l'on partage) et les IDÉES (le carnet d'envies du
 * foyer, « pour qui, à quel prix »). Et une règle qui vaut plus que tout le
 * reste : la surprise. Le propriétaire d'une liste ne voit pas QUI a réservé
 * quoi, et une idée destinée à un membre ne lui est pas montrée.
 */

export const CADEAUX_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'gift',
    title: 'Les listes et les idées',
    intro:
      "Une liste pour un anniversaire, un carnet d'envies pour la famille. Les deux vivent dans le même espace, et se partagent différemment.",
    features: [
      {
        icon: 'copy',
        title: 'Des listes privées ou du foyer',
        text: "Une liste privée n’est visible que de son propriétaire, et l’application le dit : « Ne partagez pas cette liste : elle est votre surprise. » Une liste du foyer est visible par tous.",
      },
      {
        icon: 'star',
        title: 'Des idées, avec un prix et un destinataire',
        text: "Le carnet d’idées dit pour qui l’idée est, son prix et son état : à offrir, ou offert. Une idée liée à un contact affiche la prochaine occasion de ce contact.",
      },
      {
        icon: 'share',
        title: 'Partager, par les membres ou par un code',
        text: "Un partage donne aux membres du foyer le droit de réserver. Un code, lui, ouvre la liste à un proche, sans compte : un nom suffit pour réserver, et le lien peut être révoqué.",
      },
      {
        icon: 'checkCircle',
        title: 'Réserver, et rendre la réservation',
        text: "On réserve un article d’un geste. L’interrupteur « Reçu » le libère, après confirmation — l’action est visible par tout le monde.",
      },
    ],
  },
  {
    icon: 'lock',
    title: 'La surprise, tenue par le serveur',
    intro:
      "Le cadeau doit rester une surprise. Ce n’est pas une cachette dans l’écran : la règle est décidée par la base, et l’écran ne fait que la montrer.",
    features: [
      {
        icon: 'user',
        title: 'Le propriétaire ne voit pas qui a réservé',
        text: "Sur votre propre liste, un article réservé affiche « Réservé », sans nom. Vous savez que c’est pris, pas par qui — et les autres membres voient, eux, leur propre réservation.",
      },
      {
        icon: 'heart',
        title: 'Une idée ne s’adresse pas à vous',
        text: "Une idée liée à un contact qui est votre propre fiche ne vous est pas montrée : elle est de quelqu’un d’autre. Le reste du foyer la voit, pour aider à faire le cadeau.",
      },
      {
        icon: 'users',
        title: 'Le partage se contrôle pièce par pièce',
        text: "Retirer un partage ici ne révoque pas le lien d’invitation : les deux se gèrent séparément, et l’application vous le dit quand un code reste actif.",
      },
    ],
  },
];

export const CADEAUX_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Quelle différence entre une liste et une idée ?',
    answer:
      "Une liste est un ensemble d’articles offert à quelqu’un, souvent pour une occasion. Une idée est une envie notée au carnet du foyer : « pour qui, à quel prix ».",
  },
  {
    question: 'Comment la surprise est-elle tenue ?',
    answer:
      "Par la base, pas par l’écran. Le propriétaire d’une liste voit « Réservé » sans nom, et une idée liée à sa propre fiche contact ne lui est pas montrée.",
  },
  {
    question: 'Puis-je partager une liste privée ?',
    answer:
      "Oui, et c’est votre choix. En partageant, vous acceptez que les personnes choisies voient la liste et réservent des articles.",
  },
  {
    question: 'À quoi sert le code de partage ?',
    answer:
      "À ouvrir la liste à un proche qui n’a pas de compte : un nom suffit pour réserver. Le lien peut être révoqué, et il porte un nombre d’utilisations et une date d’expiration.",
  },
  {
    question: 'Comment rendre un article réservé ?',
    answer:
      "L’interrupteur « Reçu » le libère, après une confirmation qui dit que l’action est visible par tous. Le guest qui avait réservé peut le reprendre.",
  },
  {
    question: 'Que se passe-t-il si je supprime une liste ?',
    answer:
      "La liste, ses idées et ses partages sont supprimés, après confirmation. Une idée du carnet, elle, peut être supprimée à part : les articles déjà créés depuis elle sont conservés.",
  },
];
