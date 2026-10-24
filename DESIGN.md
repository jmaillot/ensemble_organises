# Ensemble & Organisés — Système de design

> **Source de vérité : `app/src/styles/app.css`** et `app/index.html`. Ce document la décrit ; si les deux divergent, le code fait foi et ce document est corrigé le jour même (AGENTS.md §2.7 I : une affirmation de doc se vérifie en ouvrant le fichier).
> Version : 2.0 (2026-10-24, réécrite depuis `app.css` — la v1 décrivait le prototype ivoire/Söhne, jamais l'application en production)
> Produit : PWA familiale de gestion du foyer · Langue produit : français

## 1. Intention

**Ensemble & Organisés** est un espace calme et concret pour organiser la vie d'un foyer. L'interface réduit la charge mentale : elle montre l'essentiel du jour, permet d'agir immédiatement, puis laisse chaque module secondaire devenir un espace de travail plus détaillé.

La direction est **chaleureuse, éditoriale et utilitaire** (relevé Melimelo, benchmark §2.3) : fond crème, encre vert sapin, pastels doux pour les aplats des tuiles et des groupes, un corail et un ambre réservés aux alertes et aux informations temporelles. Fraunces (serif variable, `WONK` actif) porte les titres et les chiffres ; Inter Tight porte le texte courant.

### Règle de synthèse

> Fond crème + encre sapin + accents pastel par espace + corail parcimonieux ; trois zones sur l'accueil — héro du jour, personnalisation, catalogue des espaces.

## 2. Principes

1. **Le jour d'abord.** L'accueil commence par le héro « Le point du jour », pas par la navigation.
2. **Un accent, pas une décoration.** La couleur ne porte jamais seule une information : libellé, forme ou icône accompagnent état, priorité et sélection.
3. **Les surfaces sont calmes.** Cartes blanches sur fond crème, bordures fines, ombres discrètes ; le seul dégradé du système est celui de la carte héro (`hero-surface`).
4. **Chaque module a une action principale.** Un seul bouton plein par vue pour la même fonction.
5. **Le produit reste calme en profondeur.** Une vue détaillée peut être dense, jamais bruyante.
6. **Un objet par espace.** Tuiles et en-têtes parlent d'un objet d'illustration maison, jamais d'un emoji système (§5).

## 3. Tokens de couleur

Normatifs, définis dans `@theme`. Aucune valeur hexadécimale locale dans les composants : toute variation se dérive avec `color-mix()` ou rejoint le contrat.

| `--color-*` | Valeur | Rôle |
|---|---|---|
| `bg` | `#f2f0ec` | Fond global, crème |
| `surface` | `#ffffff` | Cartes, panneaux |
| `fg` | `#20413d` | Texte principal, encre sapin |
| `muted` | `#5e6f6b` | Texte secondaire, jamais le contenu essentiel |
| `border` | `#e3dfd7` | Séparateurs, contours |
| `accent` | `#20413d` | État actif (même encre que `fg`) |
| `accent-strong` | `#16302d` | Focus, texte sur pastels |
| `accent-deep` | `#0e201e` | Fond du dégradé héro |
| `accent-soft` | `#dfeae5` | Fonds sélectionnés, chips |
| `accent-faint` | `#eef3f0` | Hover discret |
| `coral` | `#d95f5c` | Alerte, badge erreur |
| `coral-text` | `oklch(52% 0.14 25)` | Texte sur `coral-soft` (4,81:1 au lieu de 2,97:1 — critique UI 23/10/2026) |
| `coral-strong` | `#f7c3bf` | Corail sur fond sombre |
| `coral-soft` | `#f8e3e1` | Fond d'alerte |
| `amber` | `#b9822f` | Information temporelle |
| `amber-strong` | `oklch(52% 0.11 78)` | Texte sur `amber-soft` |
| `amber-soft` | `#f7ebd3` | Fond d'information temporelle |
| `on-dark` | `rgb(255 255 255 / 0.72)` | Texte secondaire sur aplat sapin (5,59:1 mesuré) |

Pastels de catégorie (aplaits des tuiles et des en-têtes ; sapin dessus ≥ 7:1) :

| Pastel | Valeur | Texte sur aplat |
|---|---|---|
| `sage` | `#cfe0d6` | sapin |
| `blush` | `#f6d9d6` | sapin |
| `butter` | `#f6e7c4` | sapin |
| `sky` | `#d6e6ec` | `sky-strong #1f4e79` |
| `lilac` | `#e2dceb` | sapin |
| `sand` | `#efe7da` | sapin |

`meta name="theme-color"` = `#f2f0ec` (le crème réel ; la v1 annonçait un oklch ivoire — corrigé le 24/10/2026).

### Règles de contraste

- Corps et libellés de 10–14 px : ≥ 4,5:1 dans leur contexte réel (mesures commentées dans `app.css`).
- `muted` réservé aux métadonnées.
- Un changement d'état ne réduit jamais le contraste du texte ; sur hover, déplacer fond ou contour.
- Focus clavier : `outline: 3px solid var(--color-accent-strong)`, offset 3 px (gage global dans `app.css`).
- < 4,5:1 interdit, initiales d'avatar comprises : sur une pastille de membre, éclaircir la pastille ou renforcer l'initiale (retour du 24/10/2026 : blanc sur `coral` = 3,7:1).

## 4. Typographie

```css
--font-display: 'Fraunces Variable', 'Fraunces', ui-serif, Georgia, serif;
--font-body: 'Inter Tight Variable', 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace; /* codes de fidélité et données tabulaires */
```

Titres : `font-optical-sizing: auto`, `font-variation-settings: 'SOFT' 20, 'WONK' 1`, tracking `−0.022em`.

| Rôle | Taille | Interligne |
|---|---|---|
| `--text-display` (héro accueil) | `clamp(38px, 5.2vw, 76px)` | 0.98 |
| `--text-module` (titre de module) | `clamp(38px, 4.4vw, 62px)` | 1.02 |
| `--text-section` | 24px | 1.18 |
| Corps (`--text-body`) | 15.5px | 1.5 |
| Eyebrow (utilitaire CSS) | 11px, 850, uppercase, tracking .12em, `accent-strong` | — |
| `section-kicker` (utilitaire) | 10px, 800, uppercase, tracking .14em, `muted` | — |
| Noms de tuile | 16px bold, tracking −0.01em | tight |

Règles éditoriales : dates (`19 h 30`, `15/09`) et montants (`24,90 €`) en français ; chiffres en `tabular-nums` quand alignés ; la langue du produit ne contient pas d'anglicisme (rôles « enfant », pas « Kids ») ; le jargon technique (HMAC, RLS) reste dans la documentation, jamais sur une page destinée aux familles ; le corps de texte mesure ≤ 75ch ; `lang="fr"` sur `<html>` (césure française autorisée).

## 5. Iconographie, objets et identité

- Icônes : SVG locaux (`components/shared/icon`, trait 1,8 px, extrémités/jointures arrondis). Tailles : 15px (en ligne), 18px (navigation), 21px (état prominent). Décoratives (`aria-hidden`), le contrôle porte le libellé. **Chaque module a son icône distincte** : `receipt` ne sert pas deux espaces, `people` non plus.
- **Emoji proscrits** comme icône, illustration, ou objet de tuile (ilos v1 §5, désormais suivi par l'implémentation). L'« objet » d'une tuile est un dessin maison : SVG à deux tons (sapin + pastel), ou photo locale `public/assets/*` avec `object-fit`, `width`/`height` déclarés et `loading="lazy"`.
- Brand mark : carré sapin 38px, rayon 13px, cercle accent en coin bas droit.
- Overlays de photo (`tile-overlay`, `trip-overlay`) : dégradé encre 5%→84% avec texte clair ≥ 4,5:1 garanti.

## 6. Espacements, rayons et relief

Espacements : échelle 4px. Gutter principal 38px desktop (26px ≤1180, 15px ≤650). Padding carte 14px, panneau 16–20px.

Rayons (tokens `app.css`) : contrôle `14px`, carte/tuile `20px`, panneau/dialogue `22–28px`, chip/avatar `999px`, pilule nav basse `26px`.

Ombres : `--shadow-sm` (0 1px 2px / 0,05) surfaces au repos · `--shadow-md` (0 12px 32px / 0,07) hover · `--shadow-lg` (0 30px 80px / 0,16) nav basse et toasts. Jamais deux ombres empilées.

## 7. Mouvement

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` ; `--duration-quick: 180ms`, `--duration-slow: 300ms`.
- Hover : fond ou translation `-3px` + `shadow-md`, jamais une perte de contraste de texte.
- Drag : curseur `grabbing` global pendant le geste (`widgets-dragging`), opacité 0,55 sur la carte déplacée.
- Confettis du jour J : vitesse constante, `transform` + `opacity` seules, sortie à 104vh avant le bord.
- `prefers-reduced-motion: reduce` coupe transitions et animations.
- Interdictions : `scale(0)` en entrée, `ease-in` en entrée, la même animation d'entrée partout.

## 8. Architecture de l'écran

Desktop : rail (sidebar) fixe, topbar sticky translucide (`topbar-surface`, blur 18px), contenu max 1480px, padding 38px.

### Navigation
- Rail desktop : « Maison » + accès rapides épinglés (`nav: true`) + **tous les espaces** en un seul groupe (`catalogueModules`) — délibérément plat (retour utilisateur du 23/10/2026). Actif = `accent-soft` + libellé.
- Sous 920px : rail 76px, icônes seules. Chaque espace garde un moyen de reconnaissance (tooltip `title` + libellé au hover/focus) et une icône distincte.
- Mobile ≤ 650px : sidebar masquée, tiroir pour la carte foyer et les préférences, **barre basse flottante** (`MobileBottomNav`) : Maison, Courses, Agenda, Tâches + « Plus » (feuille dédiée « Tous les espaces » + réglages). Cibles ≥ 52px, positionnée avec `env(safe-area-inset-bottom)` ; le `main` réserve la hauteur pour la dégager.
- Réglages : focus piégé dans tiroir et feuille, `aria-modal`, fermeture Échap/overlay.

### Grilles
- Accueil : héro → personnalisation → widgets (2 col) → grille de tuiles 4 col / 3 (≤1180) / 1 (≤650).
- Catalogue : 4 col desktop, 3 tablette, 1 mobile.
- Détail : `minmax(0, 1.3fr) minmax(280px, .7fr)`.
- Ardoise : tableau desktop, cartes empilées mobile via `useIsMobileLayout` — **jamais de scroll horizontal, même interne** ; `.table-wrap` desktop seul.

### Breakpoints et garde-fous
`>1180` complet · `≤1180` rail compact · `≤920` rail icônes 76px · `≤650` mobile. Sous 650px : `html, body` en `overflow-x: clip` (gage `app.css`), padding latéral 15px, `MetricRow` reste à 2 colonnes, le contrat mobile détaillé (cibles 44px, feuilles bas d'écran, dialogues) reste normatif — validé 6/6 le 28/09/2026 (run deb572da).

## 9. Composants

- **Boutons** : `primary` (sapin plein, texte surface) — *un* par vue · `secondary` (surface, bordure) · `quiet` (accent-strong) · `danger` (`coral-soft`, texte `coral-text`). Hauteur ≥ 44px, rayon 14px.
- **Panel** : surface blanche, bordure 1px, rayon 20px, `shadow-sm`.
- **Tuile d'espace** (`AppTile`) : aspect 6:5, rayon 20px, aplat pastel, nom bold 16px en haut-gauche, objet en bas-droite (58px mobile / 112px PC, jamais rogné à moitié), pastille-compteur translucide bas-gauche, `select-none` sur l'objet. Compteur jamais à 0 (règle du mur de zéros). Nom accessible avec compteur : « Ouvrir Courses, 21 articles à acheter ».
- **Barre basse mobile** : pilule flottante, hauteur ≥ 52px, actif = aplat sapin + texte surface.
- **Champs** : hauteur ≥ 44px, rayon 11–14px, label 11px bold `muted`, focus gage global, `.check-option` avec `:has(:checked)`.
- **Statuts** : terminé = `muted` + strikethrough · haute = chip `coral-soft` + `coral-text` · normale = `amber-soft` · basse = neutre · non lu = point corail + libellé accessible.
- **Toasts** : bas d'écran, `calc(16px + env(safe-area-inset-bottom))` mobile.
- **Surfaces navigateur** : `::selection` accent-soft/sapin, scrollbar slim à poignée d'encre 32% sur crème — thémées ici, jamais laissées au défaut.

## 10. Contenu et modules

20 espaces (`lib/modules.ts`) : Courses, Calendrier, Notes, Tâches, Routines, Ardoise, Recettes, Cadeaux, Anniversaires, Contacts, Animaux, Prestataires, Fidélité, Adresses, Cercle, Voyages, Messages, Frigo, Menu, Documents. Chacun porte : label, accroche (`detail`), kicker, tint, objet, icône, route `/key`.

Règles : une phrase forte et une information principale par carte ; données de démonstration signalées comme telles ; aucune marque/produit/lieu inventés ; jamais un emoji ni du texte de remplissage à la place d'une donnée.

## 11. Médias

Images locales uniquement (`public/assets/`), `ATTRIBUTION.md` à jour. `width`/`height` ou `aspect-ratio` sur toute photo de contenu, `object-fit` volontaire, `loading="lazy"` hors héro. Image manquante = état étiqueté explicitement, pas placeholder silencieux.

## 12. Accessibilité

Un `h1` par vue (h2/h3 ensuite) ; rôles sémantiques ; tout contrôle à icône seule porte `aria-label` ; champs avec `label` associé ; zones décoratives `aria-hidden` ; focus jamais supprimé sans remplacement ; cibles ≥ 44px (52px en barre basse) ; `lang="fr"` ; l'information ne passe jamais par la seule couleur ; `role="alert"` sur les erreurs de formulaire ; drag accessible au clavier avec instructions lecteur d'écran.

## 13. PWA et persistance

Manifest : `standalone`, thème `#f2f0ec`, icônes locales SVG + PNG (iOS ignore le SVG). `meta theme-color` = crème réel ; `mobile-web-app-capable` remplace `apple-mobile-web-app-capable` déprécié (posé le 24/10/2026). SW : précache + push uniquement. Push : notification système silencieuse quand l'app est visible + toast in-app (`EO_PUSH`), sinon notification classique ; l'`endpoint` change à la réinstallation → re-synchronisation dans Préférences.

## 14. Règles d'implémentation

- Stack : React 19, React Router 8 (importé depuis `react-router`), Tailwind CSS 4 CSS-first (`@theme`), TypeScript strict, dnd-kit modulaire, TanStack Query v5, Zustand.
- Aucun hex local dans les composants : `@theme` fait foi, variations par `color-mix()`.
- Classes arbitraires tolérées pour une mesure précise (`text-[11px]`), jamais pour une couleur.
- Icônes et objets : composants React du jeu local ; pas d'emoji ; pas d'`innerHTML` brut.
- Mutations via les adaptateurs `@/lib/data`, état UI Zustand, cache serveur TanStack Query.
- Avant tout commit : `cd app && npm run typecheck && npm test && npm run build` (chaîne §2.7 d'AGENTS.md, sans linter).

## 15. Checklist de livraison

- [ ] Tokens réels appliqués sans hex local ; `theme-color` = `#f2f0ec`
- [ ] Aucun emoji fonctionnel ou décoratif (icônes et objets SVG/photos)
- [ ] Français pur : « réunis » pas « reunited », « enfant » pas « Kids », pas de jargon crypto en page publique
- [ ] Icônes de rail distinctes par espace ; < 920px, reconnaissance pas uniquement par l'icône
- [ ] Aucun texte < 12px hors micro-labels prévus (eyebrow 11px, kicker 10px, nav basse 10,5px)
- [ ] Tout texte sur son aplat réel ≥ 4,5:1, initiales d'avatar comprises
- [ ] Breakpoints 1180/920/650 respectés ; aucun scroll horizontal < 650px
- [ ] Focus visible, icônes seules étiquetées, `aria-current` sur l'actif
- [ ] Images locales avec dimensions + attribution à jour
- [ ] `typecheck`, `test`, `build` verts ; changement SQL → `test-db.sh` (machine avec Docker)

## 16. Périmètre documentaire

Les fichiers du prototype (`ensemble-organises.html`, `react-export/`) ne sont plus une source de vérité : l'application réelle vit dans `app/src`. Toute évolution visuelle met à jour ce document et `app.css` dans le même changement.
