import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de l'accueil.
 *
 * L'accueil est la page qu'on voit tous les jours : le point du jour, cinq
 * widgets à réorganiser, et les accès aux dix-sept espaces. La personnalisation
 * est PERSONNELLE : elle est enregistrée par membre, pas pour le foyer.
 */

export const ACCUEIL_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'sun',
    title: 'Le point du jour',
    intro:
      "Ce qui mérite votre attention aujourd'hui, sans perdre de vue ce qui compte : les tâches du jour, les événements du jour, et le prochain rendez-vous.",
    features: [
      {
        icon: 'clock',
        title: 'Deux colonnes, pas une liste',
        text: "À gauche les tâches du jour, à droite les événements. Cinq lignes par colonne, puis « …et N autres ». Le bandeau se remet à jour tout seul chaque minute.",
      },
      {
        icon: 'grid',
        title: 'Les cinq essentiels',
        text: "Calendrier, Tâches, Météo, Anniversaires, Routines : cinq cartes que l’on peut réorganiser, masquer, ou remettre à l’ordre par un bouton.",
      },
      {
        icon: 'cloud',
        title: 'La météo, sans clé',
        text: "La météo vient d’Open-Meteo, sans compte ni clé : seule la ville du profil est transmise. Si la lecture échoue, la carte le dit — elle n’invente pas de ciel bleu.",
      },
      {
        icon: 'comment',
        title: 'L’activité du foyer',
        text: "Les dernières contributions de chacun : une tâche, une dépense, une publication dans le Cercle. Rien que du déjà fait, jamais une alerte.",
      },
    ],
  },
  {
    icon: 'people',
    title: 'Tout le foyer',
    intro:
      "Un accès direct à chaque espace du foyer, et un accueil qui s'adapte à chacun.",
    features: [
      {
        icon: 'grid',
        title: 'Un espace par organisation',
        text: "Dix-sept tuiles photographiques, une par espace : on ouvre directement, sans chercher dans un menu. Les espaces réservés aux adultes n'y sont pas pour un enfant.",
      },
      {
        icon: 'drag',
        title: 'Réorganiser à la main',
        text: "La poignée d’un widget se saisit et se déplace — à la souris, au doigt par appui long, ou au clavier. L’ordre est mémorisé, et il est personnel.",
      },
      {
        icon: 'settings',
        title: 'Personnaliser l’accueil',
        text: "Le bouton Personnaliser l’accueil masque les widgets dont on n’a pas besoin, et un bouton remet l’ordre d’origine. Si tout est masqué, l’accueil le dit.",
      },
    ],
  },
];

export const ACCUEIL_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Que sont les widgets ?',
    answer:
      "Cinq cartes : Calendrier, Tâches, Météo, Anniversaires, Routines. Vous pouvez les réorganiser, les masquer, et revenir à l’ordre d’origine.",
  },
  {
    question: 'Ma personnalisation est-elle visible par les autres ?',
    answer:
      "Non : l’ordre et les widgets masqués sont enregistrés pour vous, membre par membre. Le foyer garde ses propres réglages, vous les vôtres.",
  },
  {
    question: 'Que voit un enfant sur l’accueil ?',
    answer:
      "Un accueil réduit : les espaces réservés aux adultes n’y sont pas, et la carte de l’ardoise disparaît. Le reste est le même.",
  },
  {
    question: 'D’où vient la météo ?',
    answer:
      "D’Open-Meteo, sans compte ni clé. Seule la ville de votre profil est transmise — elle vient des préférences, et se change là-bas.",
  },
  {
    question: 'Le point du jour se met-il à jour tout seul ?',
    answer:
      "Oui, toutes les minutes. Et il ne montre que ce qui est dû aujourd’hui : une tâche en retard reste visible jusqu’à ce qu’elle soit faite.",
  },
  {
    question: 'Puis-je masquer tous les widgets ?',
    answer:
      "Oui, et l’accueil le dit alors : un message invite à les réactiver depuis « Personnaliser l’accueil », plutôt que d’afficher une page vide.",
  },
];
