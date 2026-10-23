import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des voyages.
 *
 * Un voyage est un espace À PART : ses courses, ses notes, ses tâches et ses
 * adresses lui appartiennent, et n'apparaissent jamais dans les pages du
 * foyer. Le cycle de vie est fermé : figer, rouvrir, partir — détruire
 * n'existe pas.
 */

export const VOYAGES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'map',
    title: 'Un espace par voyage',
    intro:
      "Infos, Courses, Notes, Tâches, Adresses, Budget, Paramètres : le voyage a ses rubriques, et elles lui restent.",
    features: [
      {
        icon: 'map',
        title: 'Des rubriques que l’on choisit',
        text: "Cinq rubriques se masquent d’un simple interrupteur : elles disparaissent de la barre, et leur contenu est conservé. Infos et Paramètres, eux, restent toujours.",
      },
      {
        icon: 'archive',
        title: 'Rien ne déborde vers le foyer',
        text: "Les courses, notes, tâches et adresses d’un voyage lui appartiennent : elles n’apparaissent pas dans les pages du foyer. Et l’inverse est vrai aussi.",
      },
      {
        icon: 'lock',
        title: 'Figer, rouvrir, partir',
        text: "Figer rend la fiche en lecture seule sans rien supprimer. Rouvrir répare. Partir retire la fiche de votre liste — les lignes que vous avez écrites restent pour le foyer.",
      },
      {
        icon: 'users',
        title: 'Toute la famille voyage',
        text: "Les enfants sont des participants comme les autres. Ils voient les rubriques, ils répondent, ils y notent leurs propres notes.",
      },
    ],
  },
  {
    icon: 'wallet',
    title: 'Le budget et les invités',
    intro:
      "Le budget du voyage est une ardoise, avec les mêmes règles que l’ardoise du foyer. Les invités hors foyer, eux, viennent par un code.",
    features: [
      {
        icon: 'wallet',
        title: 'Un budget qui est une ardoise',
        text: "Qui a payé, combien, pour qui, et le règlement : le budget du voyage est une ardoise liée, avec ses parts et ses soldes.",
      },
      {
        icon: 'share',
        title: 'Inviter hors foyer, par code',
        text: "Un code ouvre le voyage à un proche. Avec son compte, il participe ; sans compte, il visite en invité, et sa dépense part sur le budget partagé.",
      },
      {
        icon: 'users',
        title: 'Le budget reste aux adultes',
        text: "Un enfant peut voyager, mais il n’entre pas dans les dépenses : ni comme payeur, ni comme participant. L’application le dit à la création de la dépense.",
      },
      {
        icon: 'archive',
        title: 'Un voyage ne se détruit pas',
        text: "Aucun voyage ne se supprime : fermer fige, rouvrir répare, partir retire. Détruire n’existe pas, et c’est écrit dans l’onglet Paramètres.",
      },
    ],
  },
];

export const VOYAGES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut ouvrir un voyage ?',
    answer:
      "Ses participants, et les administrateurs du foyer. Un administrateur qui ne participe pas voit une vue de modération : il administre le voyage sans y écrire.",
  },
  {
    question: 'Que devient le contenu d’une rubrique masquée ?',
    answer:
      "Il est conservé, intact. Masquer retire l’onglet de la barre ; l’onglet de nouveau affiché retrouve tout ce qu’il contenait.",
  },
  {
    question: 'Un voyage se supprime-t-il ?',
    answer:
      "Non. Il se fige, se rouvre, ou on le quitte. C’est une décision du projet : rien n’est détruit par accident, et l’historique reste lisible.",
  },
  {
    question: 'Comment un invité rejoint-il le voyage ?',
    answer:
      "Avec le code de partage. S’il a un compte, il participe aux rubriques ; sinon, il visite sous pseudonyme, et peut avancer une dépense sur le budget.",
  },
  {
    question: 'Mes notes de voyage apparaissent-elles dans l’espace Notes ?',
    answer:
      "Non. Les notes d’un voyage lui appartiennent, et les notes du foyer restent dans l’espace Notes : les deux ne se mélangent pas.",
  },
  {
    question: 'Que se passe-t-il si le voyage est figé ?',
    answer:
      "Toutes les rubriques passent en lecture seule : on lit, on ne modifie plus. Un administrateur du foyer peut rouvrir le voyage depuis l’onglet Paramètres.",
  },
];
