# Génération des objets de tuiles (illustrations flat)

> 24/10/2026 — brief d'exécution pour la génération par modèle d'images.
> Remplace temporairement les dessins SVG de `module-object.tsx` dans les
> tuiles du catalogue (grille d'accueil + tiroir mobile). Les icônes
> fonctionnelles (barre basse, boutons, états actifs) RESTENT vectorielles :
> elles dépendent de `currentColor`, qu'un PNG ne peut pas porter.

## Palette imposée

| Jeton | Hex | Usage |
|---|---|---|
| Encre sapin | `#20413d` | trait principal, contours, détails sombres |
| Vert sapin doux | `#2f5d50` | seconde valeur de vert |
| Sage | `#cfe0d6` | aplat tuile sage (vert clair) |
| Blush | `#f6d9d6` | aplat tuile blush (rose clair) |
| Beurre | `#f6e7c4` | aplat tuile butter (jaune clair) |
| Ciel | `#d6e6ec` | aplat tuile sky (bleu clair) |
| Bleu profond | `#1f4e79` | accent froid autorisé |
| Lilas | `#e2dceb` | aplat tuile lilac |
| Sable | `#efe7da` | aplat tuile sand |

Contrainte de contraste : l'encre `#20413d` sur chaque pastel mesure ≥ 7:1.
Toute couleur hors palette est refusée à la revue.

## Prompt-matrice (identique pour les 21 dessins, seul le SUJET change)

```
Flat vector-style illustration, soft rounded shapes, thick smooth outlines,
limited palette: deep pine green #20413d, soft green #2f5d50, and at most
two accent fills from this list: {COULEURS}. Single centered subject: {SUJET}.
No text, no letters, no numbers, no background — fully transparent
background, PNG with alpha. Consistent line weight (~7% of canvas), rounded
line caps, friendly and calm family-organizer mood. Square 1024×1024,
subject fills ~70% of the frame, anchored toward the bottom-right.
```

`{COULEURS}` : au plus deux remplissages choisis dans blush/beurre/ciel/lilas/sable,
cohérents avec la teinte de la tuile du module (voir matrice ci-dessous).
Le vert reste dominant.

## Sujets — 20 modules + accueil

| Clé | Teinte tuile | Sujet (remplit `{SUJET}`) |
|---|---|---|
| accueil | sage | une petite maison familiale chaleureuse |
| courses | sage | un panier de courses garni (carottes, pain) |
| calendrier | sky | un calendrier relié, une date marquée d'un cœur |
| notes | butter | une pile de feuilles volantes, un de couleur |
| taches | blush | trois cases à cocher, une cochée avec un trait énergique |
| routines | lilac | un sablier entouré d'une boucle fléchée en boucle |
| ardoise | sand | une ardoise d'épicerie avec craie et monnaie |
| recettes | butter | une casserole fumante avec cuillère en bois |
| cadeaux | blush | un cadeau noué, ruban volant |
| anniversaires | sky | un gâteau d'anniversaire à une bougie |
| contacts | sage | trois têtes souriantes en cercle serré |
| animaux | butter | un chien et un chat côte à côte |
| prestataires | sand | un téléphone à combiné avec annuaire |
| fidelite | lilac | une pile de cartes de fidélité éventail |
| adresses | sky | une épingle de carte entourée de petits lieux |
| cercle | blush | deux polaroids empilés avec cœur |
| voyages | sage | une valise avec chapeau et billet |
| messages | lilac | deux bulles de discussion imbriquées |
| frigo | sky | un réfrigéateur entrouvert, lumière dedans |
| menu | butter | une assiette couverte cloche avec couverts |
| documents | sand | un dossier à clapet avec papiers qui dépassent |

## Contrôles après génération (obligatoires, §2.7)

1. **Fond transparent** : vérifier le canal alpha de chaque PNG (aucun fond
   blanc/mat hérité du modèle) ;
2. **Palette** : pixel-diff des couleurs dominantes contre la liste ci-dessus ;
3. **Cohérence** : planche contact des 21 dessins côte à côte — un style
   divergent = regeneration, pas exception ;
4. **Lisibilité à 58px** : aperçu à taille réelle de tuile mobile.

## Intégration prévue

- Fichiers : `app/src/assets/module-objects/{clé}.png` (1024², optimisés) ;
- `ModuleObject` rend l'image (`<img alt="" aria-hidden>`) à la place du SVG ;
- les SVG actuels restent dans le dépôt en repli documenté ;
- chaîne §2.7 complète avant commit, screenshot Playwright des tuiles.

## Accès au modèle (à brancher)

Serveur MCP déclaré dans la configuration OpenCode de l'utilisateur. Une fois
l'outil disponible dans la session, chaque appel reprend la prompt-matrice
avec son sujet — jamais une reformulation libre, pour garder la série cohérente.
