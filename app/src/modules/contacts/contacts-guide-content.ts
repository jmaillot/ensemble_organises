import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des contacts.
 *
 * Une liste partagée, « Famille », et des listes personnelles. Une fiche
 * contact qui porte une date de naissance devient un anniversaire suivi —
 * c'est le miroir, côté serveur.
 */

export const CONTACTS_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'people',
    title: 'Les visages du foyer',
    intro:
      "La famille proche, les amis, le médecin : des fiches avec un nom, une date, et la liste où elles rangent.",
    features: [
      {
        icon: 'users',
        title: 'Une liste du foyer, des listes personnelles',
        text: "La liste « Famille » est partagée par tout le foyer. Chacun peut avoir ses propres listes, marquées « perso », qu’il seul voit.",
      },
      {
        icon: 'calendar',
        title: 'Une date, et l’anniversaire suit',
        text: "Une fiche qui porte une date de naissance apparaît automatiquement dans les anniversaires du foyer. Une photo et un membre du foyer peuvent s’y ajouter.",
      },
      {
        icon: 'send',
        title: 'Rendre une fiche à la famille',
        text: "Une fiche de votre liste personnelle peut être déplacée dans « Famille » : elle devient visible par tous, et son anniversaire est partagé. Le geste est demandé, jamais subi.",
      },
      {
        icon: 'search',
        title: 'Retrouver une fiche',
        text: "La recherche porte sur le nom. Elle se combine avec le choix de la liste, et la liste « Famille » est proposée par défaut.",
      },
      {
        icon: 'send',
        title: 'Importer un fichier vCard',
        text: "Un .vcf exporté du téléphone se lit avant d’être écrit : chaque fiche est montrée, les doublons probables sont marqués et écartés par défaut, les fiches de structure (sociétés) sont comptées puis ignorées. Seuls le nom et la date de naissance sont repris.",
      },
    ],
  },
];

export const CONTACTS_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui voit une fiche contact ?',
    answer:
      "Les membres de la liste qui la contient. Une liste personnelle n’est visible que de son propriétaire ; la liste « Famille » est visible de tout le foyer.",
  },
  {
    question: 'Que se passe-t-il quand on déplace une fiche vers Famille ?',
    answer:
      "Elle devient visible par tout le foyer, et son anniversaire est partagé. Une confirmation le dit avant : on ne déplace pas une fiche par surprise.",
  },
  {
    question: 'Pourquoi l’application me dit-elle « doublon probable » ?',
    answer:
      "Parce qu’une fiche porte déjà un nom proche. Ce n’est pas un blocage : les homonymes existent, et vous pouvez enregistrer quand même.",
  },
  {
    question: 'Que devient l’anniversaire quand je supprime une fiche ?',
    answer:
      "Son anniversaire miroir disparaît aussi. Une date saisie à la main dans l’espace Anniversaires, elle, reste : c’est une autre ligne.",
  },
  {
    question: 'Que retient l’import d’un fichier vCard ?',
    answer:
      "Le nom et la date de naissance — une date crée aussi l’anniversaire. Les photos, téléphones et adresses du fichier ne sont pas repris ; une fiche de structure (société) n’est pas importée, l’espace porte des personnes. Le fichier est montré avant toute écriture.",
  },
  {
    question: 'Peut-on envoyer une fiche à quelqu’un ?',
    answer:
      "Non. Cet espace n’a ni partage, ni export, ni e-mail : les fiches restent dans le foyer.",
  },
];
