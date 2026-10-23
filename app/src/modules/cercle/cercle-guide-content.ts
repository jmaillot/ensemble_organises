import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi du Cercle.
 *
 * Le fil est à tout le foyer : chacun y écrit, chacun y répond. On ne modifie
 * et ne supprime que ses propres messages — la règle est décidée côté serveur,
 * pas seulement dans l'écran.
 */

export const CERCLE_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'people',
    title: 'Le fil du foyer',
    intro:
      "Une photo, un mot, ou les deux. Le fil se met à jour pour tout le monde sans recharger la page.",
    features: [
      {
        icon: 'plus',
        title: 'Publier un moment',
        text: "Le compositeur accepte une photo ou un simple mot. La photo est compressée sur l’appareil avant l’envoi, et la publication s’affiche tout de suite.",
      },
      {
        icon: 'comment',
        title: 'Répondre sans quitter la carte',
        text: "Les deux dernières réponses s’affichent sous la publication, et on y écrit directement. L’historique complet s’ouvre dans un dialogue, à part.",
      },
      {
        icon: 'heart',
        title: 'Réagir d’un geste',
        text: "Le bouton Réagir porte le nombre de réactions déjà posées. Un second appui retire la vôtre ; les autres réactions restent.",
      },
      {
        icon: 'user',
        title: 'Chacun sa publication',
        text: "On ne modifie et ne supprime que ses propres messages ; les autres, on les commente. La suppression est confirmée, et elle emporte la photo, les commentaires et les réactions.",
      },
    ],
  },
  {
    icon: 'lock',
    title: 'Un fil calme, et privé',
    intro:
      "Le Cercle n’est pas un réseau social : c’est l’espace du foyer, et il n’en sort pas.",
    features: [
      {
        icon: 'people',
        title: 'Qui fait vivre le fil',
        text: "Le panneau Membres du foyer liste les participants et le rôle de chacun : administrateur, membre, enfant. Le fil se lit comme une conversation de famille.",
      },
      {
        icon: 'image',
        title: 'Des photos qui restent au foyer',
        text: "Les images sont rangées dans le coffre privé du foyer et servies par des liens temporaires. Elles ne sont indexées nulle part ailleurs.",
      },
      {
        icon: 'bell',
        title: 'Les nouveaux commentaires se voient',
        text: "Une publication qui reçoit des commentaires non lus le signale, et la cloche de l’application reprend le fil. Ouvrir les commentaires les marque comme lus.",
      },
    ],
  },
];

export const CERCLE_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui voit les publications ?',
    answer:
      "Tous les membres du foyer. Une publication n’est jamais publique, et elle n’est pas indexée sur le web.",
  },
  {
    question: 'Puis-je modifier le message de quelqu’un d’autre ?',
    answer:
      "Non : chaque message n’appartient qu’à son auteur. La règle est appliquée côté serveur, pas seulement dans l’écran — un administrateur non plus ne passe pas.",
  },
  {
    question: 'Que se passe-t-il quand je supprime une publication ?',
    answer:
      "Le message, la photo, les commentaires et les réactions associés sont retirés du fil. L’action est confirmée avant.",
  },
  {
    question: 'Peut-on joindre une vidéo ?',
    answer:
      "Pas pour l’instant : le compositeur accepte une photo. Le fil sait afficher une vidéo déjà présente dans le foyer, mais on ne peut pas en envoyer une depuis l’écran.",
  },
  {
    question: 'Comment savoir ce qui est nouveau ?',
    answer:
      "La publication porte une pastille « nouveau commentaire », la section du fil compte les non-lus, et la cloche de l’application les reprend.",
  },
  {
    question: 'Un enfant peut-il publier dans le Cercle ?',
    answer:
      "Oui. Le Cercle n’est pas un espace réservé aux adultes : chacun y écrit et y répond, avec les mêmes règles.",
  },
];
