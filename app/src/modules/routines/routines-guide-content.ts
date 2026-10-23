import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des routines.
 *
 * Décocher une occurrence ne l'efface pas : elle passe à « manquée » dans
 * l'historique, et la série s'arrête. C'est le cœur du rituel — voir ce qui
 * a été fait, et ce qui a été manqué.
 */

export const ROUTINES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'refresh',
    title: 'Les habitudes du foyer',
    intro:
      "Sortir le chien, descendre les poubelles,réviser le soir : un rituel a un rythme, un responsable, et une série qui se construit.",
    features: [
      {
        icon: 'refresh',
        title: 'Un rituel, un rythme',
        text: "Nom, récurrence — quotidien, hebdomadaire, mensuel, annuel, ou une règle RRULE saisie à la main — et les personnes qui s’en chargent.",
      },
      {
        icon: 'checkCircle',
        title: 'Cocher pour aujourd’hui',
        text: "La case enregistre l’occurrence du jour, avec la personne qui l’a faite. La décocher ne l’efface pas : elle passe à « manquée » dans l’historique, et la série s’arrête là.",
      },
      {
        icon: 'star',
        title: 'Les séries se construisent',
        text: "Une pastille compte les jours d’affilée. Elle se relance sans punition : une occurrence manquée n’efface pas la série, elle l’interrompt.",
      },
      {
        icon: 'bell',
        title: 'Les rappels, avant l’heure',
        text: "Une routine peut porter un rappel, et une case ajoute automatiquement un rappel la veille. Le décompte des rappels est écrit sous le champ, pour éviter le doublon.",
      },
    ],
  },
  {
    icon: 'calendar',
    title: 'L’historique',
    intro:
      "Ce qui a été fait, ce qui a été manqué, ce qui vient. L’historique se lit, et se corrige quand une trace s’est écrite par erreur.",
    features: [
      {
        icon: 'calendar',
        title: 'Trente jours, ou sept',
        text: "L’historique se lit sur sept ou trente jours, et une carte mensuelle montre le mois d’un coup d’œil. Chaque occurrence porte son état : terminée, en retard, manquée, à venir.",
      },
      {
        icon: 'trash',
        title: 'Retirer une trace fausse',
        text: "Un administrateur peut retirer une occurrence de l’historique. Les cochages, eux, restent : seul ce qui a été écrit peut s’effacer.",
      },
      {
        icon: 'archive',
        title: 'Un dossier par thème',
        text: "Comme les tâches, les routines se rangent dans Général ou dans un dossier, du foyer ou personnel.",
      },
    ],
  },
];

export const ROUTINES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Que se passe-t-il quand je décoche une routine ?',
    answer:
      "L’occurrence passe à « manquée » dans l’historique, et la série s’arrête. Elle n’est pas effacée : l’historique montre ce qui a été fait et ce qui a été manqué.",
  },
  {
    question: 'Que signifie « en retard » ?',
    answer:
      "Qu’une occurrence attendue n’a pas été cochée. Un filtre « En retard uniquement » les met de côté, et la pastille « En retard » les signale sur la carte.",
  },
  {
    question: 'Comment sais-je quand la prochaine routine revient ?',
    answer:
      "Chaque routine affiche sa fréquence en français et sa prochaine occurrence : « Demain », « Dans 3 jours », ou « Aucune occurrence » si elle n’a plus de date.",
  },
  {
    question: 'À quoi sert la règle RRULE ?',
    answer:
      "À écrire une récurrence que les presets ne couvrent pas. Le champ affiche un aperçu en français avant l’enregistrement, et refuse une règle illisible.",
  },
  {
    question: 'Un enfant peut-il cocher une routine ?',
    answer:
      "Non. Il voit les routines du foyer et leur état, mais la case est verrouillée : l’écriture est réservée aux autres rôles.",
  },
  {
    question: 'Que se passe-t-il si je supprime une routine ?',
    answer:
      "La routine, ses assignataires, son rappel et toutes ses occurrences sont retirés du foyer, après confirmation. L’action est définitive.",
  },
];
