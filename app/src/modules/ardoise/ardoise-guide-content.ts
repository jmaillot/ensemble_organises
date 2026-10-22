import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de l'ardoise.
 *
 * L'ardoise est le compte du foyer : qui a avancé quoi, et qui doit quoi à
 * qui. Le partage se calcule côté serveur quand il répond, et en local sinon
 * — jamais un écran d'erreur au milieu d'un dinner.
 */

export const ARDOISE_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'wallet',
    title: 'Qui a dépensé quoi',
    intro:
      "Une ardoise par occasion : la coloc, le week-end entre amis, la sortie en famille. Chacune a son total, ses dépenses et ses participants.",
    features: [
      {
        icon: 'plus',
        title: 'Ajouter une dépense en trois gestes',
        text: "Un libellé, un montant, un payeur. Le partage se calcule tout seul entre les participants cochés, et le total de l’ardoise suit.",
      },
      {
        icon: 'grid',
        title: 'Des parts personnalisées quand il faut',
        text: "Le partage est égal par défaut. Les options avancées permettent des montants personnalisés — et la somme des parts est vérifiée au centime près avant d’enregistrer.",
      },
      {
        icon: 'users',
        title: 'Un invited, ou un membre du foyer',
        text: "Une dépense peut être payée par un invité, et même être offerte : le cas est dit, et la part de l’invité est alors nulle. Le montant, lui, est obligatoire et doit être supérieur à zéro.",
      },
      {
        icon: 'share',
        title: 'Ouvrir l’ardoise hors foyer',
        text: "Un code de partage ouvre l’ardoise à un proche. Sans compte, un pseudonyme suffit, et son billet reste sur son appareil ; le code porte un nombre d’utilisations et une date d’expiration.",
      },
    ],
  },
  {
    icon: 'receipt',
    title: 'Qui doit quoi à qui',
    intro:
      "Le relevé des dettes, puis le règlement le plus court possible : l’ardoise ne dit pas qui a payé, elle dit qui doit quoi.",
    features: [
      {
        icon: 'wallet',
        title: 'Un solde par participant',
        text: "Chaque participant a un solde : ce qu’on vous doit, ce que vous devez. Le calcul vient du serveur quand il répond, et se fait sur place sinon — sans jamais d’écran d’erreur.",
      },
      {
        icon: 'checkCircle',
        title: 'Le règlement, simplifié',
        text: "Le nombre de versements est réduit au minimum : le tableau dit qui paie quoi à qui, en un clic de copie. Quand tout est réglé, l’ardoise le dit.",
      },
      {
        icon: 'user',
        title: 'Gérer les participants',
        text: "Un administrateur du foyer ajoute ou retire un membre de l’ardoise. Retirer quelqu’un conserve ses dépenses : l’historique reste, son solde cesse d’être calculé.",
      },
      {
        icon: 'archive',
        title: 'Le partage s’arrête, l’historique reste',
        text: "Arrêter le partage coupe le code : plus personne n’entre par ce lien. Les dépenses, les soldes et l’historique, eux, ne bougent pas.",
      },
    ],
  },
];

export const ARDOISE_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui voit les dépenses de l’ardoise ?',
    answer:
      "Les membres de l’ardoise, et les invités qui l’ont rejointe par le code. L’espace est réservé aux adultes : un enfant qui ouvre la page est renvoyé vers l’accueil.",
  },
  {
    question: 'Comment se fait le partage ?',
    answer:
      "Automatiquement, entre les participants cochés, à parts égales. Le formulaire indique le montant par personne avant d’enregistrer, et les options avancées permettent des parts personnalisées.",
  },
  {
    question: 'Un invité peut-il avancer une dépense ?',
    answer:
      "Oui, depuis la page invitée : sa dépense part sur l’ardoise liée, payée par lui. Il lui faut un pseudonyme, et le billet reste sur son appareil.",
  },
  {
    question: 'Peut-on supprimer une ardoise ?',
    answer:
      "Oui, après confirmation : l’ardoise, ses dépenses et ses soldes sont retirés. Arréter le partage, lui, ne supprime rien — il coupe seulement l’accès par le code.",
  },
  {
    question: 'Qu’est-ce qu’une ardoise de voyage ?',
    answer:
      "C’est une ardoise liée à un voyage : elle n’apparaît pas dans la liste du foyer, mais dans l’onglet Budget du voyage, avec les mêmes règles de partage.",
  },
  {
    question: 'Qui peut ajouter ou retirer un participant ?',
    answer:
      "Un administrateur du foyer. Les autres membres voient la liste, sans la modifier — et l’application le dit, plutôt que de cacher le bouton en silence.",
  },
];
