# Product

<!-- impeccable:product-schema 1 -->

> Rédigé le 24/10/2026 à partir des fichiers faisant foi du dépôt (AGENTS.md,
> DESIGN.md v2, roadmap §7) — aucune donnée inventée ; les décisions non
> prises sont listées comme telles, pas devinées.

## Platform

web

## Users

- **Utilisateurs principaux** : familles et foyers (colocataires, couples,
  familles avec enfants) qui veulent centraliser l'organisation du quotidien —
  tâches, courses, calendrier, budget partagé, souvenirs.
- **Unité de base** : le foyer (household). Chaque utilisateur appartient à un
  ou plusieurs foyers ; chaque foyer a des membres aux rôles `admin`,
  `membre`, `enfant`.
- **Rôle `enfant`** : accès restreint (5 modules hors périmètre masqués, pas
  de lecture des dépenses, pas de drag). Le mode de compte autonome des
  enfants reste une décision produit ouverte (voir plus bas).

## Product Purpose

**Ensemble & Organisés** est une PWA installable qui réduit la charge
mentale d'un foyer : elle montre l'essentiel du jour (le point du jour),
permet d'agir immédiatement, puis laisse chaque module secondaire devenir un
espace de travail plus détaillé. Succès = un foyer qui revient chaque jour
parce que l'app lui évite de retenir : ce qui est dû aujourd'hui, qui a payé
quoi, ce qu'il faut acheter.

20 espaces : Courses, Calendrier, Notes, Tâches, Routines, Ardoise,
Recettes, Cadeaux, Anniversaires, Contacts, Animaux, Prestataires, Fidélité,
Adresses, Cercle, Voyages, Messages, Frigo, Menu, Documents.

## Positioning

Un seul produit pour TOUTE l'organisation du foyer — pas une app par besoin —
avec une vraie répartition multi-participants (Ardoise : calcul serveur des
soldes et compensation des dettes), un multi-foyer sécurisé par RLS
PostgreSQL, et un partage de foyer par token à usage contrôlé (HMAC,
expiration, quotas) plutôt qu'un carnet d'adresses où chacun refait la
même liste.

## Operating Context

- **Usage** : en ligne d'abord, écran de téléphone au quotidien (courses en
  magasin, scan de cartes de fidélité en caisse) ; une démo locale existe
  (offline retiré le 2026-10-12, D-10 phase 09).
- **Onboarding** : landing → Google SSO ou email → choix « Créer mon foyer »
  ou « Rejoindre un foyer » (token) → tableau de bord.
- **Exploitation** : auto-hébergement Docker (Supabase + Traefik), opéré par
  l'équipe projet ; sauvegardes PostgreSQL et volumes Storage, exercices de
  restauration à définir (RPO/RTO non tranchés).

## Capabilities and Constraints

- **Stack (faisant foi, AGENTS.md §2)** : React 19.3 + React Router 8,
  TypeScript 7, Vite 8, Tailwind CSS 4, shadcn/Radix, TanStack Query 5,
  Zustand, dnd-kit, date-fns + rrule.js ; backend Supabase auto-hébergé
  (PostgreSQL 17, RLS, Realtime, Storage, Edge Functions typées
  publishable/user/secret/none), pg_cron pour occurrences et rappels ;
  Web Push + VAPID auto-hébergés.
- **Sécurité** : la RLS est la frontière d'autorisation finale ; les
  opérations sensibles (rôles admin, rappels, occurrences, compensation
  Ardoise) sont serveur, jamais client ; aucun secret dans le frontend, les
  variables du dépôt ne portent que des noms (AGENTS.md §2.7 H).
- **Chaîne de vérification avant commit (§2.7, prescriptive)** :
  `typecheck && test && build`, e2e, `check-sql-statique.py` (+ son propre
  test), `test-db.sh` sur machine avec Docker pour tout changement SQL,
  `test-dispatch-push.sh` en plus pour le dispatch des notifications.
  Aucun linter — les raisons d'un choix se disent en français dans le code.
- **Migrations** : jamais réécrire une migration appliquée ; corriger vers
  l'avant.
- **Terminologie** : langue produit = français pur (« réunis » pas
  « reunited », « enfant » pas « Kids ») ; pas de jargon technique sur une
  page destinée aux familles ; dates et montants au format français.
- **Décisions produit encore ouvertes (AGENTS.md §9, à ne pas inventer)** :
  périmètre du module Messages (fil simple vs vraie messagerie) ;
  application native (PWA pure vs wrapper) ; gestion des comptes enfants ;
  règles du token de foyer (usage unique, rôle par défaut, expiration) ;
  objectifs de reprise (RPO/RTO, rétention) ; conservation et suppression
  des comptes, médias et données.

## Brand Commitments

- **Nom** : Ensemble & Organisés.
- **Langue produit** : français (interface et contenu).
- **Pas d'emoji** comme icône, illustration ou objet de tuile : icônes SVG
  locales (trait 1,8px, extrémités arrondis) et dessins maison à deux tons
  (`module-object.tsx`) ; aucune marque, produit ou lieu inventés dans le
  contenu.
- **Images locales uniquement** (`public/assets/`, `ATTRIBUTION.md` à jour).

## Evidence on Hand

- Application réelle dans `app/src` (le prototype `ensemble-organises.html`
  et `react-export/` ne sont plus des sources).
- Schéma complet par catégorie dans AGENTS.md §5 ; migrations sous
  `supabase/migrations` (source de vérité).
- Données de démonstration riches (`app/src/lib/data/seed.ts`, foyers,
  membres, tâches, dépenses…) signalées comme démo.
- Revues UI datées dans DESIGN.md (23–24/10/2026) avec mesures de contraste
  commentées dans `app.css`.
- Absence à ne pas combler par invention : aucun témoignage client, aucune
  métrique d'usage, aucune presse.

## Product Principles

1. **Le jour d'abord.** L'accueil commence par le point du jour, pas par la
   navigation.
2. **Réduire la charge mentale.** Montrer l'essentiel, permettre d'agir
   immédiatement, garder les modules secondaires calmes mais complets.
3. **Le foyer est l'unité de confiance.** Multi-foyer, rôles, RLS : tout ce
   qui touche aux données d'autrui se décide côté serveur.
4. **Un objet par espace, une action principale par vue.** Calme visuel,
   jamais un mur de zéros ni une décoration qui porte l'information seule.
5. **La vérification fait partie du produit.** Un défaut qui a franchi la
   chaîne une fois y ajoute son contrôle (§2.7) ; un succès muet est un
   échec inexpliqué.

## Accessibility & Inclusion

- **Plancher WCAG AA** appliqué partout, initiales d'avatar comprises : tout
  texte sur son aplat réel ≥ 4,5:1 (mesures commentées dans `app.css`,
  audité les 23–24/10/2026) ; `accent-strong` pour le texte sur pastels.
- Un texte < 12px est un micro-label documenté (eyebrow 11px,
  `section-kicker` 10px, nav basse et pastilles 10,5px).
- Cibles tactiles ≥ 44px (52px en barre basse mobile) ; drag accessible au
  clavier avec instructions lecteur d'écran ; `aria-current` sur l'actif ;
  `role="alert"` sur les erreurs de formulaire ; l'information ne passe
  jamais par la seule couleur.
- `prefers-reduced-motion: reduce` coupe transitions et animations.
- Parcours critiques (connexion, foyer, tâche, dépense, scan) testés en e2e
  Playwright et prévus pour revue clavier/lecteur d'écran.
