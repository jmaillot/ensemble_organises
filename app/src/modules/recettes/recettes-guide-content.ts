import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des recettes.
 *
 * Trois choses à savoir avant d'écrire : les quantités se recalculent selon le
 * nombre de convives, les étapes se réordonnent au glisser, et le mode cuisine
 * garde l'écran allumé. Le reste est dans la fiche.
 */

export const RECETTES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'utensils',
    title: 'Le carnet de cuisine',
    intro:
      "Une recette, ses ingrédients, ses étapes. Le foyer y ajoute ses propres cuisine, et les share quand il le veut.",
    features: [
      {
        icon: 'utensils',
        title: 'Une recette, ses ingrédients, ses étapes',
        text: "Nom, catégorie, étiquettes, nombre de personnes de référence, temps de préparation et de cuisson. La photo de couverture et les ingrédients se complètent dans la fiche.",
      },
      {
        icon: 'users',
        title: 'Les quantités suivent le nombre de convives',
        text: "Un curseur règle le nombre de personnes, et les quantités sont recalculées : 1000 g, jamais 1000 gs. Une ligne sans nombre s’affiche « au goût ».",
      },
      {
        icon: 'drag',
        title: 'Des étapes que l’on réordonne',
        text: "La pastille numérotée est une poignée : glissez-la pour remettre l’étape à sa place. Le clavier le fait aussi, l’ordre est enregistré, et l’étape peut porter sa photo.",
      },
      {
        icon: 'search',
        title: 'Chercher par ce qu’on a sous la main',
        text: "La recherche porte sur le nom et sur les ingrédients, sans distinction d’accents. La catégorie, l’étiquette et les favoris se combinent avec elle.",
      },
    ],
  },
  {
    icon: 'checkCircle',
    title: 'Cuisiner, et partager',
    intro:
      "Le mode cuisine, l’impression, l’envoi aux courses, le partage : ce qui se fait quand la recette sort de l’écran.",
    features: [
      {
        icon: 'checkCircle',
        title: 'Le mode cuisine',
        text: "Un interrupteur épure la fiche : les étapes numérotées, une par une. On coche au fur et à mesure, et la progression est mémorisée sur cet appareil.",
      },
      {
        icon: 'sun',
        title: 'L’écran reste allumé',
        text: "Tant que le mode cuisine est actif, l’application demande à l’appareil de ne pas s’endormir. Si l’appareil ne le permet pas, elle le dit plutôt que de le faire semblant.",
      },
      {
        icon: 'receipt',
        title: 'Envoyer les ingrédients aux courses',
        text: "Un bouton envoie les ingrédients à une liste de courses, quantités comprises. Le résultat dit ce qui a été ajouté, et ce qui a été cumulé sur une ligne déjà là.",
      },
      {
        icon: 'share',
        title: 'Partager en lecture seule',
        text: "Un lien — et son QR — ouvrent la recette à quelqu’un sans compte, en lecture seule : le curseur et les cases suivent, aucun bouton d’édition n’apparaît. Le lien se révoque.",
      },
    ],
  },
];

export const RECETTES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Le mode cuisine efface-t-il mes coches ?',
    answer:
      "Non : la progression est mémorisée sur cet appareil, et elle revient quand vous rouvrez la recette. Le mode cuisine, lui, repart éteint à chaque ouverture — c’est un écran, pas un état.",
  },
  {
    question: 'Pourquoi les quantités changent-elles quand je change le nombre de convives ?',
    answer:
      "Elles sont recalculées à l’échelle : la recette est écrite pour un nombre de référence, et l’application reporte les quantités sur le nombre choisi.",
  },
  {
    question: 'Peut-on réordonner les étapes ?',
    answer:
      "Oui : la pastille numérotée est une poignée. Glissez-la, ou utilisez les boutons « Monter l’étape » et « Descendre l’étape ». L’ordre est enregistré pour tout le foyer.",
  },
  {
    question: 'Un enfant peut-il modifier une recette ?',
    answer:
      "Non. Il peut la lire, la suivre, et même cocher ses étapes en mode cuisine — mais pas l’écrire. La règle est appliquée côté serveur.",
  },
  {
    question: 'Comment imprimer une recette ?',
    answer:
      "Le bouton Exporter ouvre l’impression du navigateur, sur une mise en page réduite à la recette : titre, ingrédients, étapes numérotées et leurs photos.",
  },
  {
    question: 'Que se passe-t-il si je supprime une recette ?',
    answer:
      "La recette et tout son contenu disparaissent : ingrédients, étapes et photo. L’action est confirmée, et elle est définitive.",
  },
];
