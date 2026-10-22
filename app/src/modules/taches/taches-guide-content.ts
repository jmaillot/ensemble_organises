import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des tâches.
 *
 * Une tâche est ponctuelle : un nom, une échéance, un responsable. La
 * routine, elle, se répète — la différence est expliquée dans les questions.
 */

export const TACHES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'checkCircle',
    title: 'Ce qu’il y a à faire',
    intro:
      "Une tâche est ponctuelle : un nom, une échéance claire, et qui s’en occupe. Le foyer la voit, et la voit changer.",
    features: [
      {
        icon: 'plus',
        title: 'Une tâche, un responsable',
        text: "Nom, échéance, priorité, dossier, et les personnes qui s’en chargent. Une tâche peut être partagée par plusieurs, et porter une description.",
      },
      {
        icon: 'drag',
        title: 'Glissez les lignes pour réordonner',
        text: "La poignée saisit la ligne et la déplace, à la souris, au doigt ou au clavier. Les tâches en retard restent en tête et les terminées en dernier : on ne mélange pas les deux.",
      },
      {
        icon: 'filter',
        title: 'Un tri en un clic',
        text: "Par échéance ou par responsable, d’un coup : l’ordre trié devient le vôtre, comme quand vous rangez les lignes à la main. Le tri par responsable attend que les assignés soient connus — il ne devine personne.",
      },
      {
        icon: 'grid',
        title: 'Liste ou tableau',
        text: "La vue Tableau range les tâches en trois colonnes — À faire, En cours, Terminée — et une carte se déplace par sa poignée, ou change de statut au clavier. La vue choisie est mémorisée.",
      },
      {
        icon: 'bell',
        title: 'Le rappel du jour',
        text: "Une tâche peut porter une heure de rappel. Le panneau Rappels du jour en liste trois, pour aujourd’hui seulement, et rien pour les jours suivants.",
      },
    ],
  },
  {
    icon: 'archive',
    title: 'Les dossiers',
    intro:
      "Général, ou un dossier par thème. Un dossier du foyer se partage ; un dossier personnel reste sous votre seule main.",
    features: [
      {
        icon: 'archive',
        title: 'Général, ou un dossier par thème',
        text: "Les tâches se rangent dans Général ou dans un dossier que vous créez. Un dossier du foyer est visible par tous ; un dossier perso, par vous seul.",
      },
      {
        icon: 'info',
        title: 'Le dossier du foyer garde le contenu',
        text: "Supprimer un dossier du foyer range son contenu dans Général : rien n’est perdu. Un dossier perso part avec ce qu’il contient, et la confirmation le dit.",
      },
      {
        icon: 'user',
        title: 'Qui peut supprimer quoi',
        text: "Un administrateur du foyer supprime une tâche, un dossier du foyer ou une routine. Un dossier personnel se supprime par son propriétaire. Le reste appartient à tout le monde.",
      },
    ],
  },
];

export const TACHES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Quelle différence entre une tâche et une routine ?',
    answer:
      "Une tâche se fait une fois. Une routine se répète : elle a une récurrence, elle se coche chaque jour où elle revient, et elle tient une série.",
  },
  {
    question: 'Comment se passe le glisser-déposer ?',
    answer:
      "Sur la poignée de la ligne. Au clavier : Espace pour saisir, les flèches pour déplacer, Espace pour déposer, Échap pour annuler. Le lecteur d’écran annonce chaque étape.",
  },
  {
    question: 'Peut-on réordonner une tâche en retard ?',
    answer:
      "Non : les tâches en retard restent en tête, et les terminées en dernier. L’application refuse le déplacement et dit pourquoi — ces deux groupes ont une place fixe.",
  },
  {
    question: 'Un rappel de tâche déclenche-t-il une notification ?',
    answer:
      "Oui, si les notifications sont activées dans les préférences. Une tâche ne porte qu’un rappel : en écrire un nouveau remplace l’ancien.",
  },
  {
    question: 'Qui peut supprimer une tâche ?',
    answer:
      "Un administrateur du foyer. Le refus est dit, jamais silencieux : un membre qui essaie se voit répondre que son rôle ne le permet pas.",
  },
  {
    question: 'Un enfant peut-il utiliser les tâches ?',
    answer:
      "Il les lit, et il ne les écrit pas : ni création, ni déplacement, ni modification. La règle est appliquée côté serveur, pas seulement dans l’écran.",
  },
];
