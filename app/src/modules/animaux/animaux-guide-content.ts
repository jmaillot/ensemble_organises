import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des animaux.
 *
 * Une fiche par animal, et un carnet de santé qui se lit comme une frise.
 * Le rappel de vaccination est un CHAMP DE DATE et une alerte à l'écran —
 * l'application n'envoie aucune notification.
 */

export const ANIMAUX_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'heart',
    title: 'La santé de la famille',
    intro:
      "Une fiche par animal : l’identité, les repères de santé, et le carnet des vaccins et des traitements.",
    features: [
      {
        icon: 'user',
        title: 'Une fiche par animal',
        text: "Nom, espèce, race, poids, date de naissance, numéro d’identification, photo. Le foyer compte plusieurs animaux : un sélecteur en montre un à la fois.",
      },
      {
        icon: 'bell',
        title: 'Un rappel qui se voit',
        text: "Un suivi peut porter une prochaine échéance. À moins de quatorze jours, une pastille « Rappel approche » s’affiche ; passé l’échéance, « Rappel en retard ». Aucun message n’est envoyé : l’alerte est à l’écran.",
      },
      {
        icon: 'clock',
        title: 'Le carnet de santé, en frise',
        text: "Produits, vaccins, traitements et informations se succèdent du plus récent au plus ancien. Les rappels les plus proches remontent sur la fiche de l’animal.",
      },
      {
        icon: 'image',
        title: 'Les documents du vétérinaire',
        text: "Ordonnances, factures, photos : les pièces jointes vont sur la fiche, en images ou en PDF, et s’ouvrent dans un nouvel onglet.",
      },
    ],
  },
];

export const ANIMAUX_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'L’application prévient-elle d’un rappel de vaccination ?',
    answer:
      "Non. Le rappel est une date affichée, avec une alerte visuelle sur la fiche et dans le carnet. Aucune notification, aucun e-mail, aucune programmation.",
  },
  {
    question: 'Qui peut supprimer une fiche ou un suivi ?',
    answer:
      "Un administrateur du foyer. Tout le monde peut en revanche modifier une fiche ou un suivi : les deux gestes sont distincts, et la suppression est confirmée.",
  },
  {
    question: 'Comment sont rangés les suivis ?',
    answer:
      "En quatre onglets — Produits, Vaccins, Traitements, Informations — et, en dessous, le carnet de santé qui les remet dans l’ordre du temps.",
  },
  {
    question: 'Que se passe-t-il si je supprime la fiche d’un animal ?',
    answer:
      "La fiche et tout son carnet de santé sont supprimés, après confirmation. L’action est définitive.",
  },
  {
    question: 'Le poids et la date de naissance sont-ils obligatoires ?',
    answer:
      "Non. La fiche se remplit ce qu’on sait : le nom et l’espèce sont le minimum, et les autres champs restent vides jusqu’à ce qu’on sache.",
  },
];
