import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi du calendrier.
 *
 * Le calendrier du foyer est COMMUN par défaut, et chacun peut y ajouter un
 * calendrier PERSONNEL. Passer un événement de l'un à l'autre est un geste
 * visible, jamais un effet de bord.
 */

export const CALENDRIER_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'calendar',
    title: 'Le temps du foyer',
    intro:
      "Les rendez-vous, les sorties, les échéances : un événement, une date, une heure. Et la vue qui va avec.",
    features: [
      {
        icon: 'plus',
        title: 'Un événement, une date, une heure',
        text: "Titre, date, heure de début, heure de fin, journée entière, lieu, catégorie, description, rappel. Un objet à la couleur d’un membre porte son nom.",
      },
      {
        icon: 'grid',
        title: 'Quatre vues',
        text: "Mois, Semaine, Jour, Liste. La vue choisie est mémorisée. En vue Mois, un appui long sur une date crée l’événement — et l’agenda du jour s’ouvre à côté.",
      },
      {
        icon: 'filter',
        title: 'Les filtres',
        text: "Par catégorie, par membre, par calendrier, et les anniversaires. La vue Liste montre les trente prochains jours, en ne gardant que les jours occupés.",
      },
      {
        icon: 'download',
        title: 'Imprimer la période affichée',
        text: "L’impression reprend exactement ce que vous regardez, et le dit si un filtre est actif — pour que rien ne paraisse manquer sur le papier.",
      },
    ],
  },
  {
    icon: 'lock',
    title: 'Les calendriers et la zone scolaire',
    intro:
      "Un calendrier commun, des calendriers personnels, et les vacances scolaires selon la zone du foyer.",
    features: [
      {
        icon: 'lock',
        title: 'Un calendrier à soi',
        text: "Chacun peut créer un calendrier personnel, visible de lui seul. Un événement qui y vit ne se montre pas aux autres, et y passer demande confirmation.",
      },
      {
        icon: 'pin',
        title: 'La zone scolaire',
        text: "La zone A, B ou C détermine les vacances affichées. Un administrateur du foyer la règle ; un bouton la déduit de la ville de votre profil.",
      },
      {
        icon: 'flag',
        title: 'Les jours fériés',
        text: "Onze jours fériés sont calculés, et les vacances selon la zone. Si le référentiel est indisponible, l’application le dit : elle n'invente pas de calendrier.",
      },
      {
        icon: 'checkCircle',
        title: 'Depuis le calendrier, une tâche',
        text: "Le bouton Ajouter une tâche ouvre l’espace Tâches avec l’échéance du jour sélectionné, toute seule. Une échéance se prépare là où elle se décide.",
      },
    ],
  },
];

export const CALENDRIER_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Quelle différence entre un événement et une tâche ?',
    answer:
      "Un événement occupe une place dans le temps : un rendez-vous, une sortie. Une tâche est une chose à faire, avec une échéance. Les deux se voient dans le calendrier, et une tâche peut en sortir.",
  },
  {
    question: 'Comment créer un événement vite ?',
    answer:
      "En maintenant une date dans la grille du mois : un appui long ouvre l’événement, déjà daté. Sinon, le bouton Ajouter un événement ouvre la même fiche.",
  },
  {
    question: 'Un calendrier personnel, c’est secret ?',
    answer:
      "Il est à vous. Un administrateur du foyer peut le voir, en lecture seule. Et faire passer un événement de ce calendrier vers le calendrier Commun demande confirmation, parce que tout le foyer le verra.",
  },
  {
    question: 'Que change la zone scolaire ?',
    answer:
      "Les vacances affichées, et rien d’autre. Un administrateur choisit la zone ; un bouton peut la déduire de la ville de votre profil, quand elle est connue.",
  },
  {
    question: 'Comment l’impression tient-elle compte des filtres ?',
    answer:
      "Elle imprime la période affichée, et elle écrit qu’un filtre est actif quand c’est le cas. Les jours vides sont écartés, et une période sans élément le dit.",
  },
  {
    question: 'Un enfant peut-il écrire dans le calendrier ?',
    answer:
      "Non : il voit le calendrier du foyer, sans créer ni modifier d’événement. En revanche, il n’a pas de zone scolaire ni de calendrier personnel à gérer.",
  },
];
