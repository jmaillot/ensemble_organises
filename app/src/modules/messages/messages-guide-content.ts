import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des messages.
 *
 * Les conversations sont privées : un fil ne se voit que par ses membres.
 * Quitter, archiver ou rouvrir un fil ne détruit jamais rien — la règle est
 * écrite dans le code du serveur, pas seulement dans l'écran.
 */

export const MESSAGES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'message',
    title: 'Les échanges du foyer',
    intro:
      "Un fil à deux, ou un groupe entier. Les messages arrivent en direct, et personne ne lit par-dessus l’épaule de quelqu’un d’autre.",
    features: [
      {
        icon: 'send',
        title: 'Les messages arrivent en direct',
        text: "La conversation se remplit sans recharger la page. Votre message s’affiche tout de suite, avec la mention « envoi… » le temps qu’il parvienne.",
      },
      {
        icon: 'edit',
        title: 'Modifier, supprimer, joindre',
        text: "Un message se modifie ou se supprime, auteur seul, après confirmation. On joint une image : elle est compressée sur l’appareil avant de partir.",
      },
      {
        icon: 'download',
        title: 'Charger plus, jamais de défilement',
        text: "Les anciens messages se chargent à la demande, trente par page. Le fil reste lisible du début à la fin, sans défilement infini.",
      },
      {
        icon: 'people',
        title: 'Faire entrer quelqu’un',
        text: "Un bouton Ajouter invite un membre du foyer dans un groupe. Les invités hors foyer, eux, rejoignent par un code, et visitent sans compte.",
      },
    ],
  },
  {
    icon: 'archive',
    title: 'Partir, archiver, revenir',
    intro:
      "Un fil ne se supprime pas comme un message. On le quitte, on l’archive, et l’histoire reste lisible.",
    features: [
      {
        icon: 'logout',
        title: 'Partir sans effacer',
        text: "Quitter une conversation la fige à votre départ : vous continuez de lire ce qui s’est dit, et vous n’y écrivez plus. Vos messages restent visibles pour les autres.",
      },
      {
        icon: 'archive',
        title: 'Archiver pour soi',
        text: "Archiver retire la conversation de votre liste sans la fermer. Écrire un message la ramène : elle renaît dans la liste active.",
      },
      {
        icon: 'lock',
        title: 'Archiver pour tout le foyer',
        text: "Un administrateur peut figer la conversation pour tous : plus personne n’y écrit, et elle reste lisible dans les anciennes conversations.",
      },
    ],
  },
];

export const MESSAGES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut lire une conversation ?',
    answer:
      "Ses membres, et eux seuls. Un membre du foyer qui n’est pas dans le fil ne le voit pas, et ne peut pas le deviner. La règle est appliquée par la base, pas par l’écran.",
  },
  {
    question: 'Que se passe-t-il quand je quitte une conversation ?',
    answer:
      "Elle reste dans vos anciennes conversations, figée à votre départ, en lecture seule. Vos messages restent visibles pour les autres membres, et vous pouvez y revenir par le lien d’invitation.",
  },
  {
    question: 'Quelle différence entre « quitter » et « archiver » ?',
    answer:
      "Archiver, c’est ranger : la conversation sort de votre liste, mais vous pouvez encore y écrire, et elle revient toute seule. Quitter, c’est se retirer : la conversation devient lecture seule.",
  },
  {
    question: 'Que peut-on joindre dans un message ?',
    answer:
      "Une image. Elle est compressée sur l’appareil avant l’envoi, pour ne pas alourdir la conversation. Un message ne peut pas être vide s’il ne porte pas d’image.",
  },
  {
    question: 'Le fil s’ouvre-il sur une conversation ?',
    answer:
      "Non, et c’est volontaire : ouvrir un fil le marquerait comme lu sans que vous l’ayez choisi. La lecture se marque quand vous ouvrez réellement la conversation.",
  },
  {
    question: 'Que signifie « vous êtes seul dans cette conversation » ?',
    answer:
      "Que les autres participants l’ont quittée. Vos messages restent les vôtres, et l’envoi reste possible — mais ils ne seront lus par personne pour l’instant.",
  },
];
