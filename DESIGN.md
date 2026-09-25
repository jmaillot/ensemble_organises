# Ensemble & Organisés — Système de design

> Document de référence pour le prototype PWA et son export React.
> Source visuelle : `ensemble-organises.html` et `react-export/src/styles.css`.
> Version : 1.0 · Produit : PWA familiale de gestion du foyer · Langue produit : français

## 1. Intention

**Ensemble & Organisés** est un espace calme et concret pour organiser la vie d’un foyer. L’interface doit réduire la charge mentale : elle montre l’essentiel du jour, permet d’agir immédiatement, puis laisse chaque module secondaire devenir un espace de travail plus détaillé.

La direction est **chaleureuse, éditoriale et utilitaire** : un fond ivoire lumineux, une encre bleu-pétrole pour la hiérarchie, un vert pétrole pour l’action et le progrès, et un corail réservé aux alertes et aux moments qui demandent une attention particulière.

### Règle de synthèse

> Fond ivoire + encre bleu-pétrole + accent pétrole + corail parcimonieux ; trois zones éditoriales — navigation, résumé du jour, modules.

## 2. Principes

1. **Le jour d’abord.** L’accueil commence par le point du jour, les tâches ouvertes et les widgets, pas par une navigation de fonctions.
2. **Un accent, pas une décoration.** Le vert pétrole structure l’action et la progression. Le corail signale l’urgence, la notification ou l’état qui doit être vu.
3. **La couleur ne porte jamais seule une information.** Priorité, état et sélection sont toujours accompagnés d’un libellé, d’une forme ou d’une icône.
4. **Les surfaces sont calmes.** Les cartes sont blanches ou ivoire, légèrement bordées ; les ombres restent discrètes.
5. **Chaque module a une action principale.** Une vue ne doit pas présenter plusieurs boutons pleins réalisant la même action.
6. **Le produit reste calme en profondeur.** Une vue détaillée peut être dense, mais jamais bruyante.

## 3. Tokens de couleur

Les tokens ci-dessous sont normatifs. Ne pas introduire de valeurs hexadécimales dans les composants : toute variation doit être dérivée en `oklch()`.

### Couleurs de base

| Token | Valeur | Rôle |
|---|---|---|
| `--bg` | `oklch(98% 0.004 240)` | Fond global, ivoire lumineux |
| `--surface` | `oklch(100% 0 0)` | Cartes, panneaux, surfaces surélevées |
| `--fg` | `oklch(20% 0.02 240)` | Texte principal, encre bleu-pétrole |
| `--muted` | `oklch(50% 0.018 240)` | Texte secondaire, aides, métadonnées |
| `--border` | `oklch(90% 0.006 240)` | Séparateurs, contours discrets |
| `--ink-soft` | `oklch(28% 0.025 240)` | Texte de tableau et zones denses |

### Accent et états

| Token | Valeur | Rôle |
|---|---|---|
| `--accent` | `oklch(56% 0.12 170)` | Progression, avatars, confirmation légère |
| `--accent-strong` | `oklch(47% 0.11 170)` | CTA principal, focus, sélection forte |
| `--accent-soft` | `oklch(94% 0.045 170)` | Fonds sélectionnés et chips positifs |
| `--accent-faint` | `oklch(97% 0.018 170)` | Hover très discret, pistes, fond de progression |
| `--coral` | `oklch(64% 0.15 32)` | Alerte, notification, état urgent |
| `--coral-soft` | `oklch(95% 0.04 32)` | Fond d’alerte ou de réaction |
| `--amber` | `oklch(68% 0.12 78)` | Rappel, jour férié, information temporelle |
| `--amber-soft` | `oklch(95% 0.045 78)` | Fond d’information temporelle |

```css
:root {
  --bg: oklch(98% 0.004 240);
  --surface: oklch(100% 0 0);
  --fg: oklch(20% 0.02 240);
  --muted: oklch(50% 0.018 240);
  --border: oklch(90% 0.006 240);
  --accent: oklch(56% 0.12 170);
  --accent-strong: oklch(47% 0.11 170);
  --accent-soft: oklch(94% 0.045 170);
  --accent-faint: oklch(97% 0.018 170);
  --coral: oklch(64% 0.15 32);
  --coral-soft: oklch(95% 0.04 32);
  --amber: oklch(68% 0.12 78);
  --amber-soft: oklch(95% 0.045 78);
  --ink-soft: oklch(28% 0.025 240);
  --shadow-sm: 0 2px 10px oklch(20% 0.02 240 / 0.06);
  --shadow-md: 0 14px 34px oklch(20% 0.02 240 / 0.08);
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 22px;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

### Règles de contraste

- `--fg` sur `--bg` / `--surface` est la paire de texte normale.
- `--muted` est réservé aux métadonnées, jamais au contenu principal.
- `--accent-strong` sur fond clair est utilisé pour les CTA, le focus et les labels actifs.
- `--coral` ne doit pas être utilisé comme couleur de texte normal sur `--bg` : le réserver aux marques, icônes, badges et textes courts en gros corps. Sur fond sombre, inverser les deux couleurs de l’élément.
- Un changement d’état ne doit jamais diminuer le contraste du texte. Sur un hover, déplacer le fond ou le contour ; ne pas simplement rendre le texte plus gris.
- Les contrôles focus utilisent une bordure de 3 px `var(--accent-strong)` avec 3 px de décalage.

## 4. Typographie

### Familles

```css
--font-display: 'Söhne', 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
--font-body: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
```

- **Display** : titres, chiffres importants, montants, salutations, titres de cartes.
- **Body** : libellés, paragraphes, formulaires, tableaux, messages, contenu secondaire.
- **Mono** : codes de fidélité uniquement : `ui-monospace, SFMono-Regular, Menlo, monospace`.

### Échelle

| Rôle | Taille | Poids | Traitement |
|---|---:|---:|---|
| `h1` | `clamp(30px, 3.2vw, 47px)` | 780 | line-height `1.02`, tracking `-0.035em` |
| `h2` | `clamp(22px, 2.1vw, 30px)` | 780 | line-height `1.08` |
| `h3` | `18px` | 780 | line-height `1.15` |
| `h4` | `15px` | 760 | line-height serré |
| Corps | `15px` | 400–500 | line-height `1.45` |
| Lede | `15px` | 400 | largeur max `520px` |
| Métadonnée | `12px` | 400 | couleur `--muted` |
| Eyebrow | `11px` | 850 | uppercase, tracking `.12em` |
| Micro-label | `10px` | 800 | uppercase, tracking `.08em` |
| Widget label | `11px` | 800 | uppercase, tracking `.09em` |

### Règles éditoriales

- Une seule phrase forte par section ; les détails restent en `12px`.
- Les titres ne doivent pas être forcés sur une seule ligne. Réduire la taille ou laisser le texte passer à la ligne avant d’utiliser `nowrap`.
- Éviter les paragraphes de plus de 3 lignes dans une carte.
- Le nom d’un produit, d’une personne ou d’un lieu reste une donnée réelle ; ne pas le remplacer par un texte de remplissage décoratif.

## 5. Iconographie et identité

- Jeu d’icônes SVG local, trait `1.8px`, extrémités et jointures arrondies.
- Tailles : `15px` (en ligne / bouton), `18px` (navigation), `21px` (état prominent).
- Les icônes sont décoratives (`aria-hidden="true"`) ; le contrôle qui les contient porte le libellé.
- Ne pas utiliser d’emoji comme icône fonctionnelle.
- Le brand mark combine encre et accent pétrole ; il n’utilise pas de dégradé ni d’illustration.
- Les cartes photo utilisent un overlay sombre uniquement pour garantir la lisibilité du texte blanc.

## 6. Espacements, rayons et relief

### Espacements

Utiliser une échelle de 4 px, avec des exceptions uniquement pour composer une grille :

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 26 · 32 · 34 · 38 · 40 · 48 · 64`

- Padding de carte : `17–19px`.
- Padding de panneau : `19–23px`.
- Gap widget : `14px`.
- Gap module : `12px`.
- Gap de formulaire : `14px`.
- Marge de section : `24–34px`.

### Rayons

| Token / usage | Valeur |
|---|---:|
| Petit contrôle | `10px` |
| Carte, champ, avatar secondaire | `16px` |
| Panneau, boîte de dialogue | `22px` |
| Cible de date, petit badge | `10–13px` |
| Chip, switch, avatar circulaire | `999px` |

### Ombres

```css
--shadow-sm: 0 2px 10px oklch(20% 0.02 240 / 0.06);
--shadow-md: 0 14px 34px oklch(20% 0.02 240 / 0.08);
```

- `--shadow-sm` : cartes, widgets, panneaux, fenêtres contextuelles.
- `--shadow-md` : hover de tuile photo, toast, boîte de dialogue.
- Ne pas empiler plusieurs ombres sur une même surface.

## 7. Mouvement

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

| Interaction | Durée | Comportement |
|---|---:|---|
| Hover bouton / nav | `180ms` | fond, contour, légère translation |
| Glissement de widget | `180ms` | opacité et cible accentuées |
| Tuile module | `180ms` | `translateY(-3px)` + shadow-md |
| Photo de tuile | `300ms` | zoom très léger `scale(1.04)` |
| Toast | `180ms` | entrée/sortie ease-out |
| Focus / reduced motion | immédiat | `prefers-reduced-motion` désactive les transitions |

Règles :

- Ne jamais démarrer une animation à `scale(0)`.
- Ne pas utiliser `ease-in` pour l’entrée d’un élément.
- Le hover ne doit pas rendre le texte moins contrasté.
- Le focus clavier doit être au moins aussi visible que le hover.

## 8. Architecture de l’écran

### Desktop — trois zones

1. **Navigation** : sidebar fixe, largeur `246px`, fond `--surface`, bordure droite.
2. **Résumé du jour** : topbar sticky hauteur `76px`, puis le header de page et le bandeau `pulse-banner`.
3. **Modules** : contenu principal, largeur maximale `1480px`, padding horizontal `38px`.

Grilles principales :

- Dashboard : `minmax(0, 1fr) 290px`.
- Contenu détaillé : `minmax(0, 1.3fr) minmax(280px, .7fr)`.
- Calendrier : `minmax(0, 1.25fr) minmax(270px, .75fr)`.
- Cercle : `minmax(0, 1fr) 285px`.
- Messages : `290px minmax(0, 1fr)`.
- Widgets : 2 colonnes.
- Catalogue de modules : 4 colonnes desktop, 3 colonnes tablette, 1 colonne mobile.

### Breakpoints

| Breakpoint | Comportement |
|---|---|
| `> 1180px` | Layout complet, sidebar `246px`, modules en 4 colonnes |
| `≤ 1180px` | Sidebar `218px`, contenu `26px`, modules en 3 colonnes |
| `≤ 920px` | Sidebar réduite à `76px`, icônes seules, side column en 2 colonnes |
| `≤ 650px` | Sidebar masquée, navigation mobile fixe, grilles en 1 colonne, padding `15px` |

Le mobile ne doit jamais scroller horizontalement. Les tableaux longs utilisent une zone de scroll interne (`.table-wrap`), pas la page entière.

## 9. Composants

### Navigation et chrome

- **Brand mark** : carré `38px`, fond encre, rayon `13px`, accent pétrole dans le coin.
- **Nav item** : hauteur min `44px`, rayon `12px`, état actif `accent-soft` + `accent-strong`.
- **Topbar** : sticky, fond translucide ivoire, blur `18px`, bordure basse.
- **Avatar** : rond, fond encre, initiales en `800`.
- **Notification dot** : corail, `7px`, bordure surface de `2px`.

### Boutons

| Variante | Fond | Texte | Usage |
|---|---|---|---|
| `primary` | `--accent-strong` | `--surface` | Une action principale par vue |
| `secondary` | `--surface` | `--fg` | Action de navigation ou alternative |
| `quiet` | transparent | `--accent-strong` | Lien d’action, retour, gestion |
| `danger` | `--coral-soft` | `--coral` | Suppression, action destructive |

- Hauteur normale : `44px` minimum.
- Icône : `15–18px`, jamais seule sans `aria-label` ni texte.
- Un bouton plein ne doit pas être répété dans le même viewport pour la même fonction.

### Surfaces

- **Panel** : fond surface, rayon `16px`, bordure `1px`, padding `19px`, shadow-sm.
- **Side card** : même base, padding `17px`.
- **Metric card** : pas d’ombre lourde, valeur display forte, légende muted.
- **Module tile** : hauteur min `154px`, photo en fond, overlay bas, contenu en bas à gauche, flèche en haut à droite.
- **Widget card** : hauteur min `190px`, déplaçable, padding `18px`, bordure accent pendant le drop.
- **Post** : carte éditoriale, média en flux naturel, commentaires dans un bloc `bg` interne.

### Contrôles de formulaire

- Champ : hauteur min `44px`, rayon `11px`, bordure `--border`.
- Focus : `outline: 3px solid var(--accent-strong)`, offset `3px`.
- Label : `11px`, poids `800`, couleur `--muted`.
- Champ multiligne : `textarea`, hauteur min `100px`, resize vertical.
- Champ obligatoire : astérisque dans le label ; validation HTML native conservée.
- Checkbox groupe : `.check-option`, bordure, état `:has(input:checked)` en accent-soft.
- Select : même hauteur et même focus que les champs texte.

### Calendrier

- Semaine lundi → dimanche.
- Jour sélectionné : contour accent-strong et inset shadow.
- Aujourd’hui : fond accent-strong, texte surface.
- Événement : point corail de `4–5px`.
- Jour férié / rappel : point ambre.
- Agenda : colonne heure `55px`, contenu flexible, actions à droite.
- Les anniversaires sont récurrants par mois et jour, pas limités à l’année de naissance.

### Statuts

| Statut | Traitement |
|---|---|
| Normal | texte `--fg`, surface neutre |
| Terminé | titre muted + strikethrough |
| Haute priorité | chip `coral-soft` + libellé |
| Normale | chip `amber-soft` + libellé |
| Basse | chip `bg` + libellé |
| Visitée | switch accent + libellé explicite dans l’aria-label |
| Non lu | dot corail + libellé accessible |

## 10. Contenu et modules

Les modules du catalogue sont :

1. Courses
2. Calendrier
3. Notes
4. Tâches
5. Routines
6. Ardoise
7. Recettes
8. Cadeaux
9. Anniversaires
10. Animaux
11. Prestataires
12. Fidélité
13. Adresses
14. Cercle
15. Voyages
16. Messages

### Règles de contenu

- Écrire en français, avec des phrases courtes et une information principale par carte.
- Utiliser des dates et montants en formats français (`15/09`, `24,90 €`).
- Ne pas inventer de marque, de produit, de lieu ou de personne pour une démonstration qui prétend représenter une réalité.
- Les données de démonstration sont signalées comme telles et ne doivent pas ressembler à une donnée de production.
- Une icône n’est jamais un substitut à un label.

## 11. Médias et images

- Toutes les images sont locales au projet ; aucun hotlink.
- `public/assets/` contient les médias du prototype et `ATTRIBUTION.md`.
- Les images de tuiles, cartes de lieux, cadeaux et voyages sont des visuels décoratifs ou de couverture : `object-fit: cover` est autorisé pour un cadrage volontaire.
- Les portraits et photos de contenu doivent conserver leur ratio mesuré, avec `width`/`height` ou `aspect-ratio`, et utiliser `object-fit: contain` quand le cadrage complet est important.
- Le média de voyage `lisbonne.jpg` est attribué dans `public/assets/ATTRIBUTION.md` (Wikimedia Commons, CC BY 4.0).
- Une image manquante doit être corrigée ou remplacée par un état étiqueté explicitement ; pas de placeholder silencieux.

## 12. Accessibilité

- Structure sémantique : `header`, `nav`, `main`, `section`, `article`, `aside`, `footer` selon le sens de lecture.
- Un `h1` par vue ; les sections utilisent `h2` puis `h3`.
- Tous les contrôles à icône seule ont `aria-label`.
- Les champs ont un `label` associé ; les groupes de checkboxes ont un label de groupe.
- Les zones décoratives sont `aria-hidden` quand elles n’ajoutent pas d’information.
- Ne jamais supprimer le focus outline sans remplacement.
- Les cibles tactiles principales font au minimum `44px`.
- Prévoir un ordre de tabulation : navigation → actions de page → contenu → dialogues.
- Les images informatives ont un `alt` précis ; les images purement décoratives ont un `alt` vide.
- Ne pas transmettre une information par la seule couleur.

## 13. PWA et persistance

- Manifest : nom, description, couleur de thème, affichage `standalone`, icône locale.
- Service worker : cache d’abord pour les ressources versionnées, repli vers `index.html` pour une navigation.
- Les données de démonstration utilisent `localStorage` avec une clé de version.
- Une évolution de schéma doit prévoir une migration ou une réinitialisation explicite.
- Les médias importés par l’utilisateur doivent être limités à une taille raisonnable et l’échec de quota doit être annoncé.

## 14. Règles d’implémentation React

Le composant exporté est `EnsembleOrganisesApp` dans `react-export/src/App.tsx`.

Props publiques minimales :

```tsx
interface EnsembleOrganisesAppProps {
  initialState?: Partial<AppState>;
  assetBase?: string;
  storageKey?: string;
}
```

Contraintes :

- React `18.3.1`, TypeScript strict, Vite.
- Pas d’iframe.
- Pas de Tailwind dans cet export ; les styles sont dans `react-export/src/styles.css`.
- Pas d’insertion HTML brute.
- Les icônes sont des SVG React locaux et décoratifs.
- Les composants de module doivent conserver leurs libellés, leurs états et leurs `data-od-id` lorsqu’ils sont exposés à l’aperçu.
- Les mutations de l’état sont centralisées dans le composant principal afin de pouvoir les remplacer par des appels API.

## 15. Checklist de livraison

- [ ] Les six tokens `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent` sont utilisés sans hexadécimal.
- [ ] Le fond global est ivoire et non blanc pur.
- [ ] Le corail est limité aux accents et alertes.
- [ ] Le display et le body ne sont pas confondus.
- [ ] Les rayons et ombres proviennent des tokens.
- [ ] Les breakpoints 1180 / 920 / 650 sont respectés.
- [ ] Aucun élément ne déborde horizontalement sur mobile.
- [ ] Les états de focus sont visibles.
- [ ] Les images sont locales et attribuées lorsque nécessaire.
- [ ] Les données de démonstration sont signalées.
- [ ] `pnpm build` passe pour l’export React.
- [ ] Le HTML source et l’export React restent cohérents.

## 16. Fichiers de référence

- Prototype PWA : `ensemble-organises.html`
- Manifest PWA : `manifest.webmanifest`
- Service worker source : `sw.js`
- Export React : `react-export/src/App.tsx`
- Styles React : `react-export/src/styles.css`
- Médias React : `react-export/public/assets/`
- Guide d’intégration : `react-export/README.md`
