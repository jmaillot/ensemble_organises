import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Mode d'emploi de l'espace Documents (vague 3.2).
 *
 * Les papiers du foyer — factures, contrats, ordonnances — en dossiers
 * colorés, photo ou PDF, avec échéances et notes. Le contenu suit le contrat
 * du test `module-guides.test.ts` : cartes complètes, questions honnêtes,
 * aucune fonction que l'application n'a pas.
 */

export const DOCUMENTS_GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: 'archive',
    title: 'Ce que Documents fait pour vous',
    intro: 'Documents rassemble les papiers du foyer en dossiers colorés : chaque papier est une photo ou un PDF, avec une échéance et une note si besoin.',
    features: [
      {
        icon: 'grid',
        title: 'Des dossiers colorés',
        text: 'Six pastels de dossier — sauge, poudré, beurre, ciel, lilas, sable — que vous nommez comme vous voulez : « Assurance », « Santé », « École ». La couleur se choisit à la création et se change ensuite.',
      },
      {
        icon: 'image',
        title: 'Photo ou PDF',
        text: 'Chaque document est une photo ou un PDF : les images s’affichent en aperçu, les PDF portent leur étiquette. La taille se lit en clair — « 1,2 Mo » — elle ne se compte pas.',
      },
      {
        icon: 'filter',
        title: 'Tout, la racine, ou un dossier',
        text: 'La vue « Tout » réunit les documents du foyer. « Racine » montre ceux qui ne sont rangés nulle part ; chaque dossier se choisit d’un tap pour n’afficher que lui.',
      },
      {
        icon: 'search',
        title: 'Recherche dans les noms et les notes',
        text: 'La recherche porte sur le nom du document ET sur sa note : taper « ordonnance » retrouve la note qui la mentionne, même si le nom du fichier ne le dit pas.',
      },
    ],
  },
  {
    icon: 'clock',
    title: 'Les échéances des papiers',
    intro: 'Un papier a souvent une date de fin — attestation, ordonnance, contrat. Documents la suit avec le même vocabulaire que le frigo.',
    features: [
      {
        icon: 'calendar',
        title: 'Une échéance optionnelle',
        text: 'Chaque document peut porter une date d’expiration. Sans date, il reste listé sans alerte — c’est le cas des papiers qui n’expirent jamais.',
      },
      {
        icon: 'clock',
        title: 'Expiré, bientôt, valide',
        text: 'La pastille reprend les couleurs du frigo : rouge pour expiré, ambre pour ce qui expire sous deux jours, vert pour ce qui est encore valide.',
      },
      {
        icon: 'filter',
        title: 'Le tri suit l’urgence',
        text: 'Les documents se classent d’eux-mêmes : expirés en tête, puis ce qui expire bientôt, puis le reste par nom. Ce qui demande une action se voit d’abord.',
      },
      {
        icon: 'edit',
        title: 'La note dit le reste',
        text: 'Chaque document porte une note libre, jusqu’à 1000 caractères : le numéro de contrat, le nom du praticien, ce que le papier seul ne dit pas.',
      },
    ],
  },
  {
    icon: 'plus',
    title: 'Ajouter et entretenir',
    intro: 'Un papier entre par une photo ou un PDF choisi sur l’appareil, se corrige sans redéposer, et sort sur confirmation.',
    features: [
      {
        icon: 'plus',
        title: 'Ajout en quelques champs',
        text: '« Ajouter un document » ouvre un formulaire court : nom, dossier, fichier, échéance optionnelle, note. À la création, le fichier est obligatoire — un papier fantôme n’a pas de sens.',
      },
      {
        icon: 'edit',
        title: 'Édition sans redéposer',
        text: 'À l’édition, le fichier déposé à l’origine est conservé : on renomme, on change de dossier ou d’échéance sans reprendre de photo. Le fichier ne se remplace qu’en le retirant d’abord.',
      },
      {
        icon: 'trash',
        title: 'Retraits confirmés',
        text: 'Supprimer un document ou un dossier demande une confirmation. Et un dossier supprimé ne détruit rien : ses documents retombent à la racine du foyer.',
      },
      {
        icon: 'lock',
        title: 'Les enfants lisent',
        text: 'Un membre au rôle « enfant » consulte les documents du foyer : il ne dépose pas, ne renomme pas, ne supprime pas — les boutons d’écriture ne lui sont pas montrés.',
      },
    ],
  },
];

export const DOCUMENTS_GUIDE_QUESTIONS: GuideQuestion[] = [
  {
    question: 'Qui peut voir les documents du foyer ?',
    answer:
      'Tous les membres, enfants compris — en lecture seule pour eux. Les documents appartiennent au foyer : ce que l’un dépose, l’autre le retrouve.',
  },
  {
    question: 'Où sont rangés les fichiers ?',
    answer:
      'Dans le coffre privé du foyer, le même que les photos du Cercle. Aucun document n’est public : l’accès passe par le foyer et ses règles.',
  },
  {
    question: 'Que devient un document quand son dossier est supprimé ?',
    answer:
      'Il ne disparaît pas : il retombe à la racine, visible dans la vue « Racine ». Supprimer un dossier ne supprime jamais les papiers qu’il contenait.',
  },
  {
    question: 'Peut-on remplacer le fichier d’un document ?',
    answer:
      'À l’édition, le fichier déposé à l’origine est conservé — on ajuste le nom, le dossier, l’échéance et la note sans reprendre de photo. Pour un autre fichier, retirez le document et déposez le nouveau.',
  },
  {
    question: 'Les documents d’un voyage sont-ils ici ?',
    answer:
      'Non : chaque espace garde ses papiers. Les documents déposés ici concernent le foyer ; un voyage qui aurait les siens les porte dans sa fiche.',
  },
  {
    question: 'Que se passe-t-il à l’échéance d’un papier ?',
    answer:
      'Sa pastille passe au rouge et le document remonte en tête de la vue. Rien n’est supprimé automatiquement : c’est au foyer de décider de le retirer ou de repousser sa date.',
  },
];
