import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des anniversaires.
 *
 * La liste est AGRÉGÉE : elle montre les anniversaires saisis à la main ET
 * les contacts qui ont une date de naissance, sans jamais compter deux fois
 * la même personne. Le 29 février n'est jamais perdu : il retombe sur le
 * dernier jour du mois.
 */

export const ANNIVERSAIRES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'heart',
    title: 'Les dates à ne pas oublier',
    intro:
      "Le calendrier du foyer en version humaine : ce qui revient chaque année, et le compte à rebours qui va avec.",
    features: [
      {
        icon: 'calendar',
        title: 'Une liste et un calendrier',
        text: "La liste donne la prochaine échéance de chacun ; la vue calendrier étale le mois, une pastille par date, à la couleur du membre associé.",
      },
      {
        icon: 'users',
        title: 'Les contacts compris, sans doublon',
        text: "Une fiche contact qui porte une date de naissance apparaît ici automatiquement. Si la même personne est aussi saisie à la main, une seule ligne est affichée — et un badge « 2 sources » signale le cas ambigu.",
      },
      {
        icon: 'checkCircle',
        title: 'Le jour J se fête à l’écran',
        text: "Le jour de l’anniversaire, une pluie de confettis s’affiche sur l’accueil. Elle n’apparaît pas si vous préférez moins d’animations sur votre appareil.",
      },
      {
        icon: 'clock',
        title: 'Le compte à rebours, jour par jour',
        text: "« C’est aujourd’hui », « Demain », « Dans N jours » : le décompte est exact, et l’âge est indiqué à côté de la date.",
      },
    ],
  },
];

export const ANNIVERSAIRES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Faut-il saisir les dates deux fois ?',
    answer:
      "Non. Une fiche contact qui porte une date de naissance apparaît automatiquement dans les anniversaires. Si la même personne est aussi saisie à la main, une seule ligne est affichée.",
  },
  {
    question: 'Que signifie le badge « 2 sources » ?',
    answer:
      "Que la personne existe des deux côtés : une fiche contact et une ligne saisie à la main, sans lien entre elles. L’application ne tranche pas à votre place — elle le signale, et vous choisissez la ligne à garder.",
  },
  {
    question: 'Pourquoi une ligne vient-elle me renvoyer vers Contacts ?',
    answer:
      "Parce que sa source est une fiche contact : la modifier se fait là-bas, sur la fiche elle-même. L’application ne crée pas de doublon pour la modifier.",
  },
  {
    question: 'Que se passe-t-il pour le 29 février ?',
    answer:
      "Il n’est jamais perdu : en année bissextile, il tombe le 28 février ; sinon, le dernier jour du mois. L’anniversaire reste suivi chaque année.",
  },
  {
    question: 'Peut-on créer un contact en même temps ?',
    answer:
      "Oui : la case « Créer aussi un contact » ajoute la fiche dans la liste Famille, sans doublon d’anniversaire. Si la fiche contact échoue, l’anniversaire est retiré lui aussi, et l’erreur est dite.",
  },
  {
    question: 'L’anniversaire déclenche-t-il une notification ?',
    answer:
      "Non. Cet espace montre les dates et les compte à rebours ; il n’envoie ni notification, ni e-mail, ni rappel.",
  },
];
