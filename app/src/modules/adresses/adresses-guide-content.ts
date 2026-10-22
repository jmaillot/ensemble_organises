import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi des adresses.
 *
 * Le carnet garde les lieux du foyer : un restaurant qu'on aime, un parc, une
 * pharmacie de garde. Le tri par ville est un regroupement textuel — il n'y a
 * pas de carte géographique dans cette application.
 */

export const ADRESSES_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'pin',
    title: 'Les lieux à retrouver',
    intro:
      "Un restaurant qu’on aime, un parc, une pharmacie de garde : le foyer note une fois, et retrouve le chemin tout de suite.",
    features: [
      {
        icon: 'search',
        title: 'Une recherche, des filtres, une note',
        text: "La recherche porte sur le nom, la ville et l’adresse. Elle se combine avec un filtre par type de lieu — restaurant, café, parc, musée… — et une note minimale, de une à cinq étoiles.",
      },
      {
        icon: 'pin',
        title: 'L’adresse se cherche en ligne',
        text: "En tapant une adresse dans la fiche, OpenStreetMap propose des correspondances : en choisir une remplit la rue, le code postal et la ville. Ce que vous avez déjà écrit n’est jamais écrasé — le nom du lieu n’est repris que s’il est vide, et tout reste modifiable à la main.",
      },
      {
        icon: 'grid',
        title: 'Grille ou par ville',
        text: "La vue se bascule d’un bouton : la grille montre les fiches avec leur photo, la vue par ville regroupe les lieux sous le nom de leur ville. Un lieu sans ville se range sous « Sans ville ».",
      },
      {
        icon: 'star',
        title: 'Noter, et marquer comme visité',
        text: "Une note de une à cinq étoiles, votre avis personnel, et un interrupteur « Déjà visité » qui bascule d’un geste. Les lieux se séparent alors en « à découvrir » et « déjà visités ».",
      },
      {
        icon: 'phone',
        title: 'Appeler et guider',
        text: "Chaque fiche a un lien pour appeler et un lien pour l’itinéraire. Un lieu sans adresse le dit franchement, plutôt que d’afficher une ligne vide.",
      },
    ],
  },
];

export const ADRESSES_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui voit le carnet des adresses ?',
    answer:
      "Les membres du foyer. Cet espace n’est pas réservé aux adultes : un enfant peut y ajouter un lieu, comme les autres.",
  },
  {
    question: 'D’où vient la photo d’un lieu ?',
    answer:
      "De vous : vous la choisissez au moment d’enregistrer la fiche. Elle est compressée puis rangée dans le coffre privé du foyer — elle n’est jamais exposée publiquement.",
  },
  {
    question: 'Que se passe-t-il si je supprime un lieu ?',
    answer:
      "Il est retiré du carnet du foyer, après confirmation. Les lieux qui appartiennent à un voyage ne sont pas concernés : ils vivent dans la fiche du voyage.",
  },
  {
    question: 'Les lieux d’un voyage apparaissent-ils ici ?',
    answer:
      "Non. Une adresse ajoutée dans un voyage reste dans ce voyage : elle ne remonte pas dans le carnet du foyer, et l’inverse est vrai aussi.",
  },
  {
    question: 'Comment retrouver les lieux d’une ville ?',
    answer:
      "Le bouton Vue par ville regroupe les lieux sous le nom de leur ville, avec le compte de chacun. Un filtre par type de lieu s’applique aussi à cette vue.",
  },
  {
    question: 'Peut-on changer la note d’un lieu ?',
    answer:
      "Oui : le crayon sur la fiche la rouvre en édition, note comprise. Le marqueur « Déjà visité » se change, lui, d’un simple interrupteur sur la carte.",
  },
  {
    question: 'D’où viennent les adresses proposées en ligne ?',
    answer:
      "D’OpenStreetMap, via un relais qui ne transmet que la requête, borne le rythme et met en cache une heure. Le nom du lieu n’est repris que si le champ est vide : ce que vous avez déjà écrit n’est jamais remplacé.",
  },
];
