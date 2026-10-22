import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des prestataires.
 *
 * Ce texte décrit le carnet tel que le code le fait : une fiche par
 * professionnel, des types que le foyer invente, des pièces jointes, et deux
 * raccourcis — appeler, trouver l'itinéraire.
 */

export const PRESTATAIRES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'settings',
    title: 'Le carnet des professionnels du foyer',
    intro:
      "Médecin, artisan, école de foot : le foyer note une fois, et ne cherche plus un numéro dans un carnet papier. La fiche garde tout, et la trouve quand on en a besoin.",
    features: [
      {
        icon: 'user',
        title: 'Une fiche complète par contact',
        text: "Nom, type, téléphone, e-mail, adresse, code postal, ville et notes. Les pièces jointes — devis, factures, attestations — se rangent sur la même fiche, et s’ouvrent dans un nouvel onglet.",
      },
      {
        icon: 'phone',
        title: 'Appeler et guider, sans chercher l’adresse',
        text: "Chaque fiche a un bouton Appeler, qui ouvre le téléphone, et un bouton Itinéraire, qui ouvre le plan vers l’adresse. Le type du contact donne son icône, et son nom de type est écrit sous le sien.",
      },
      {
        icon: 'settings',
        title: 'Des types que le foyer invente',
        text: "Les types sont propres au foyer : on en crée, on les renomme, on leur donne une icône, on en supprime. Un type supprimé ne supprime pas les fiches : elles restent, simplement sans type.",
      },
      {
        icon: 'search',
        title: 'Rechercher dans tout le carnet',
        text: "La recherche porte sur le nom, le type, la ville, l’e-mail, le téléphone et les notes. Un filtre par type se combine avec elle, et un bouton Réinitialiser les filtres rend la vue entière.",
      },
    ],
  },
];

export const PRESTATAIRES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut voir le carnet des prestataires ?',
    answer:
      "Les membres du foyer. L’espace est réservé aux adultes : un enfant qui ouvre la page est renvoyé vers l’accueil, avec un message qui l’explique.",
  },
  {
    question: 'Comment ajouter un contact ?',
    answer:
      "Le bouton Ajouter un prestataire ouvre une fiche vierge. Seuls le nom et le type sont dérangeants : tout le reste peut attendre, et se compléter plus tard.",
  },
  {
    question: 'Que puis-je mettre dans les pièces jointes ?',
    answer:
      "Des images et des PDF. La fiche en accepte plusieurs : un devis, une facture, une attestation de scolarité, un relevé.",
  },
  {
    question: 'À quoi servent les types de prestataires ?',
    answer:
      "À filtrer la liste, et à donner une icône à chaque fiche. Vous en créez autant que vous voulez : ils sont propres à votre foyer, et personne d’autre ne les voit.",
  },
  {
    question: 'Que se passe-t-il si je supprime un type ?',
    answer:
      "Les fiches qui portaient ce type restent au carnet, sans type. Rien n’est perdu, et vous pourrez leur en donner un autre.",
  },
  {
    question: 'Peut-on modifier une fiche après l’avoir créée ?',
    answer:
      "Oui : le crayon sur la fiche la rouvre en édition. Le bouton Enregistrer le contact enregistre, et un message confirme la mise à jour.",
  },
];
