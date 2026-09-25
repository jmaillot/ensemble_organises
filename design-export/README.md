# Ensemble & Organisés — export React

Export **React 18 + TypeScript** du prototype `ensemble-organises.html`, prêt à modifier avec un workflow vibe coding.

## Démarrer

```bash
cd react-export
pnpm install --ignore-workspace
pnpm dev
```

`--ignore-workspace` est utile dans ce dossier Design Files, qui est imbriqué dans le workspace OpenDesign. Si vous copiez le dossier dans un projet React autonome, `pnpm install` suffit.

Pour vérifier le typage et produire un build :

```bash
pnpm build
```

## Structure

- `src/App.tsx` : composant `EnsembleOrganisesApp`, état local, navigation, modules et dialogues.
- `src/main.tsx` : point d’entrée React.
- `src/styles.css` : système visuel extrait du prototype (ivoire, pétrole, corail, rayons, grille).
- `public/assets/` : images locales utilisées par les cartes et les fiches.
- `public/manifest.webmanifest` et `public/sw.js` : reprise de la couche PWA.

## Props minimales

```tsx
import { EnsembleOrganisesApp } from './src/App';

<EnsembleOrganisesApp
  assetBase="/assets"
  storageKey="ensemble-organises-react-v1"
  initialState={undefined}
/>;
```

- `assetBase` : préfixe des images publiques.
- `storageKey` : clé `localStorage` utilisée pour persister l’état local.
- `initialState` : état initial optionnel pour brancher des données serveur plus tard.

## Ce qui est porté

- Shell responsive, navigation, topbar et modules.
- Accueil avec widgets, réorganisation par glisser-déposer et résumé de l’ardoise.
- Tâches : ajout, édition, filtre par échéance, priorité, validation et suppression.
- Calendrier : navigation de mois, anniversaires récurrents, jours fériés français, agenda, ajout et suppression d’événements.
- Notes avec recherche, courses, routines, ardoise, cadeaux, anniversaires, animaux, prestataires, fidélité, adresses, Cercle, voyages et messages.
- Cercle : réactions, commentaire ciblé et aperçu média.
- Messages : sélection de conversation et envoi dans le fil actif.

## Intégration

Le composant ne dépend d’aucune librairie UI. Il utilise uniquement React, `localStorage` et les APIs du navigateur. Le backend pourra remplacer les mutations de `handleDialogSubmit` par des appels API sans changer la structure des vues.

Les images sont volontairement locales et ne dépendent d’aucune URL distante. `assets/ATTRIBUTION.md` reprend l’attribution du média de voyage ; les autres images sont les médias de démonstration déjà présents dans le projet.

## Limites assumées

Les données restent locales pour cette exportation. Les flux « temps réel », l’envoi d’invitations et la météo live sont des points d’intégration backend/API : les composants prévoient déjà les emplacements et les callbacks nécessaires.
