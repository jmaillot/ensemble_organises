# Ensemble & Organisés

**L'espace familial pour tout garder en mouvement.**

Application web installable (PWA) qui centralise l'organisation d'un foyer :
tâches, courses, calendrier, rappels, budget partagé, anniversaires, animaux,
prestataires, cartes de fidélité, adresses, souvenirs et échanges privés.

L'unité de partage n'est pas le compte, c'est le **foyer** : plusieurs membres
y travaillent avec des rôles (`admin`, `membre`, `enfant`), un code couleur
personnel, et des règles d'accès appliquées **côté base de données** (Row Level
Security) — jamais seulement dans l'interface.

- Référentiel produit et technique : [`AGENTS.md`](AGENTS.md)
- Contrat visuel (tokens, composants, viewports) : [`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) + [`design-export/`](design-export/)
- Contrat de développement frontend : [`app/docs/frontend-contract.md`](app/docs/frontend-contract.md)
- Backend, exploitation, runbook : [`docs/BACKEND.md`](docs/BACKEND.md)

---

## Sommaire

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Principes produit](#2-principes-produit)
3. [Stack technique](#3-stack-technique)
4. [Architecture du dépôt](#4-architecture-du-dépôt)
5. [Démarrage rapide](#5-démarrage-rapide)
6. [Déploiement Docker](#6-déploiement-docker)
7. [Variables d'environnement](#7-variables-denvironnement)
8. [Commandes utiles](#8-commandes-utiles)
9. [Modèle de données](#9-modèle-de-données)
10. [Sécurité](#10-sécurité)
11. [Design system et accessibilité](#11-design-system-et-accessibilité)
12. [Tests](#12-tests)
13. [Limites connues et prochaines étapes](#13-limites-connues-et-prochaines-étapes)

---

## 1. Ce que fait l'application

Dix-huit routes : seize espaces du foyer, plus l'accueil et les préférences. Un
seul jeu de membres, de rappels, de couleurs et de permissions pour tous :

| Espace | Route | Ce qu'on y fait |
|---|---|---|
| **Accueil** | `/accueil` | Widgets du jour réordonnables, point du jour, accès aux 16 espaces |
| **À faire** | `/taches` | Tâches par échéance, priorité, assignataires, rappels, réordonnancement au glisser-déposer |
| **Calendrier** | `/calendrier` | Vue mois, agenda du jour, jours fériés français, anniversaires, création par appui long |
| **Notes** | `/notes` | Notes avec catégories colorées, recherche plein texte, épinglage, visibilité privée/partagée |
| **Courses** | `/courses` | Listes partagées, regroupement par rayon, ajout rapide au clavier, suggestions d'historique |
| **Routines** | `/routines` | Rituel récurrent (RRULE), occurrences du jour, séries, historique et carte mensuelle |
| **Recettes** | `/recettes` | Espace réservé (placeholder) : les recettes arrivent bientôt |
| **Ardoise** | `/ardoise` | Dépenses partagées, soldes par membre, compensation de dettes, invitations ciblées |
| **Cadeaux** | `/cadeaux` | Listes privées ou partagées, idées, prix, réservation, partage à un proche |
| **Anniversaires** | `/anniversaires` | Liste et calendrier, recherche, rappel du mois en cours |
| **Animaux** | `/animaux` | Fiche, carnet de santé (produits, vaccins, traitements), alertes de rappel |
| **Prestataires** | `/prestataires` | Contacts par type, appel `tel:`, itinéraire, gestion des types |
| **Fidélité** | `/fidelite` | Cartes de fidélité, code en plein écran, scan code-barres / QR (API native + repli) |
| **Adresses** | `/adresses` | Lieux sauvegardés, note /5, « à visiter » vs « déjà visité », filtres |
| **Cercle** | `/cercle` | Fil familial : publications, photos compressées, réactions, commentaires |
| **Voyages** | `/voyages` | Projets, dates, avancement de préparation, membres invités |
| **Messages** | `/messages` | Conversations privées, temps réel, accusés de lecture côté client |
| **Paramètres** | `/parametres` | Profil, foyer, membres, tokens d'invitation, notifications, état hors ligne |

Et le parcours d'entrée : **landing** (`/`) → **connexion** (`/connexion`,
Google / Facebook / e-mail) → **créer ou rejoindre un foyer** (`/foyer`,
token d'invitation) → tableau de bord.

---

## 2. Principes produit

- **Le foyer d'abord.** Chaque donnée appartient à un foyer ; l'accès est vérifié
  en base, pas côté client.
- **Hors ligne d'abord.** Les données consultées sont mises en cache (IndexedDB),
  les saisies hors ligne sont rejouées à la reconnexion. L'application reste
  installable et utilisable sans réseau.
- **Lisible sans effort.** Un code couleur par membre (avatar, tâche assignée,
  événement, message), des échéances exprimées en français (« Dans 12 jours »),
  des totaux lisibles avant le détail.
- **Rien de destructif n'est accidentel.** Toute suppression demande
  confirmation ; les gestes rapides ne remplacent jamais un bouton accessible.
- **États soignés.** Chaque module a un état vide, un état de chargement, un état
  d'erreur et un état de succès — jamais un écran blanc.
- **Accessibilité par construction.** Cibles ≥ 44 px, focus visible, libellés
  explicites, hiérarchie de titres, contrastes WCAG AA, parcours clavier complet.

---

## 3. Stack technique

| Besoin | Choix |
|---|---|
| Build | **Node.js 24 LTS** + npm, **Vite 8.3** (Rolldown) |
| UI | **React 19.3**, **React DOM 19.3** |
| Routage | **React Router 8.4** (mode déclaratif) |
| Langage | **TypeScript 7** (`strict`, `verbatimModuleSyntax`, `noUnusedLocals`) |
| Style | **Tailwind CSS 4** (CSS-first, tokens en `@theme`) |
| Composants | **Radix UI** (primitives WAI-ARIA) + primitives maison |
| État serveur | **TanStack Query 5** (cache, invalidation, mutations optimistes) |
| État interface | **Zustand 5** (session, foyer, préférences) |
| Formulaires | **React Hook Form 7** + **Zod 4** |
| Données | **@supabase/supabase-js 2** (PostgREST, Auth, Realtime, Storage, Edge Functions) |
| Cache local | **Dexie 4** (IndexedDB) + file de synchronisation |
| Dates / récurrence | **date-fns 4**, **@date-fns/tz**, **rrule.js** |
| Glisser-déposer | **dnd-kit** (`core` / `sortable` / `utilities`) |
| PWA | **vite-plugin-pwa 1** (Workbox, pré-cache, repli navigation) |
| Tests | **Vitest 5** + Testing Library, **MSW** (si besoin), **Playwright** |
| Backend | **Supabase auto-hébergé** (PostgreSQL 17, GoTrue, PostgREST, Realtime, Storage, Edge Functions, pg_cron) |
| Déploiement | **Docker Compose** uniquement, publié par le **Traefik** existant |

Toutes les versions sont **épinglées** (pas de plages) dans `app/package.json` et
`app/package-lock.json`, et les images Docker sont figées par digest.

---

## 4. Architecture du dépôt

```
.
├── AGENTS.md                  # référentiel produit et technique
├── DESIGN-HANDOFF.md          # contrat visuel de l'export
├── DESIGN-MANIFEST.json       # manifeste de l'export (tokens, viewports, écrans)
├── design-export/             # export d'origine (référence visuelle, non exécuté)
│
├── app/                       # package frontend autonome
│   ├── src/
│   │   ├── app/               # routeur, layout global (barre latérale, topbar, nav mobile)
│   │   ├── modules/           # un dossier par espace du foyer
│   │   │   └── <espace>/      #   <espace>-page.tsx, api.ts, types.ts, components/, hooks/
│   │   ├── components/
│   │   │   ├── ui/            #   primitives accessibles (bouton, champ, dialogue…)
│   │   │   └── shared/        #   composants métier (en-tête de module, panneau, tuile…)
│   │   ├── lib/               # client Supabase, data layer, hors ligne, formatage
│   │   ├── stores/            # session et foyer (Zustand)
│   │   ├── hooks/             # hooks transverses (auth, calendrier, PWA, hors ligne)
│   │   ├── styles/app.css     # jetons de design (@theme) + utilitaires
│   │   └── types/             # lignes SQL typées (contrat avec le backend)
│   ├── e2e/                   # parcours critiques Playwright
│   ├── docs/                  # contrat de développement frontend
│   ├── Dockerfile, nginx.conf # image multi-stage → Nginx non privilégié (8080)
│   └── package-lock.json
│
├── supabase/
│   ├── migrations/            # source de vérité du schéma (14 migrations)
│   ├── functions/             # fonctions métier uniquement (3 Edge Functions)
│   └── tests/                 # tests SQL : contrat, RLS, invitations, cron, ardoise
│
├── supabase-project/          # runtime Supabase épinglé + override Traefik versionné
├── scripts/                   # migrate, deploy-functions, test-db, backup, restore
├── compose.app.yaml           # Compose du frontend (application séparée)
├── docs/BACKEND.md            # runbook backend
└── .env.app.example           # exemple des variables de build du frontend
```

Deux applications Compose **indépendantes** : `compose.app.yaml` ne contient que
le frontend, `supabase-project/docker-compose.yml` la stack backend. Elles ne
sont jamais démarrées par le même fichier.

---

## 5. Démarrage rapide

### 5.1 Le frontend seul, en mode démonstration

Aucun backend, aucun secret, aucune base de données : le frontend détecte
l'absence de configuration et bascule sur un adaptateur **IndexedDB** qui amorce
un foyer de démonstration complet.

```bash
cd app
npm ci
npm run dev            # http://localhost:5173
```

Puis, sur l'écran de connexion, **« Entrer dans la démonstration »**.

Ce mode est utile pour parcourir l'interface, faire une revue visuelle et
déboguer sans dépendre du backend. Il n'écrit que dans le cache local du
navigateur.

### 5.2 La stack complète

Prérequis : Docker Compose **≥ 2.24.4**, Node.js **24.21+**, et un Traefik
existant rattaché au réseau Docker externe `frontend`.

```bash
# 0. Réseau externe attendu par Traefik
docker network create frontend

# 1. Stack backend : snapshot Supabase épinglé
#    (voir docs/BACKEND.md §2 pour le bootstrap détaillé)
cd supabase-project
cp .env.example .env
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env
sh run.sh config add traefik            # override Traefik, avant le 1er démarrage

# 2. Schéma : base et stockage, aucune route publique
sh run.sh start db storage               # `storage` crée le schéma storage.buckets
sh ../scripts/migrate.sh                # 14 migrations, journalisées
sh ../scripts/test-db.sh                # contrat, RLS, invitations, cron, ardoise

# 3. Fonctions métier, puis publication
sh ../scripts/deploy-functions.sh
sh run.sh start

# 4. Frontend
cd ..
cp .env.app.example .env.app            # VITE_SUPABASE_URL + clé publiable
docker compose --env-file .env.app -f compose.app.yaml config
docker compose --env-file .env.app -f compose.app.yaml up -d --wait
```

Trois hôtes sont publiés : `app.votredomaine.fr` (frontend),
`api.votredomaine.fr` (API authentifiée par clé publiable + JWT + RLS) et
`studio.votredomaine.fr` (Studio, protégé par une authentification Traefik).
Aucun port de base ou de service interne n'est exposé sur l'hôte.

---

## 6. Déploiement Docker

### 6.1 Ce qui est conteneurisé

| Service | Image | Port interne | Rôle |
|---|---|---|---|
| Frontend | build multi-stage Node 24 → `nginxinc/nginx-unprivileged` | 8080 | sert la SPA, le manifeste et le service worker |
| Backend | snapshot Supabase auto-hébergé (`self-hosted/v0.8.2`) | — | Auth, PostgREST, Realtime, Storage, Edge Functions, PostgreSQL |
| Base | PostgreSQL 17 (image du snapshot) | — | données + RLS |
| Proxy | Traefik **existant** | 443 | TLS terminé, routage, websockets Realtime |

Le frontend est construit avec les deux variables publiques
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) passées en `ARG`/`ENV`
pendant le build, Vite les incorporating dans le bundle. Un `env_file` sur le
conteneur Nginx ne fonctionnerait pas.

### 6.2 Ordre de démarrage

1. Le réseau externe `frontend` existe et Traefik y est attaché.
2. `sh run.sh config add traefik` enregistre l'override (il ajoute
   `docker-compose.traefik.yml` à la variable officielle `COMPOSE_FILE`).
3. `sh run.sh start db storage` — la base et le service de stockage, aucune
   route publique. Le service `storage` crée le schéma `storage.buckets` au
   démarrage : sans lui, la migration des buckets échoue. `migrate.sh` le
   vérifie et s'arrête avec la consigne plutôt qu'au milieu d'une série.
4. `sh ../scripts/migrate.sh` — le schéma, une transaction par fichier
   (portée par le fichier lui-même), journal dans `public.schema_migrations`.
5. `sh ../scripts/test-db.sh` — les tests SQL, chaque fichier dans une
   transaction annulée.
6. `sh ../scripts/deploy-functions.sh` — copie les fonctions métier dans le
   runtime, sans toucher aux répertoires fournisseurs `main` et `hello`.
7. `sh run.sh start` — publication de la stack.
8. `docker compose … up -d --wait` — le frontend.

### 6.3 Ce que garantit l'override Traefik

- `api-gw` et `supavisor` perdent leurs publications de port (`!override`) :
  Traefik les joint via le réseau Docker.
- **Studio** est protégé par une chaîne d'authentification ; **l'API ne reçoit
  aucun middleware de session** (elle sert l'API authentifiée par clé publiable,
  JWT et RLS — un middleware de session bloquerait l'application).
- Les websockets Realtime sont transmis : aucune règle ne supprime
  `Upgrade`/`Connection`.
- HSTS, CSP et Permissions Policy sont ajoutés au niveau Traefik, une seule fois.

### 6.4 Sauvegardes et restauration

```bash
sh scripts/backup.sh                 # base + storage + db-config + SHA256SUMS
sh scripts/restore.sh <horodatage> --dry-run
sh scripts/restore.sh <horodatage>
```

Sauvegarder : les dumps PostgreSQL **cohérents**, `volumes/storage`, le volume
nommé `db-config` (clé pgsodium et configuration), et `volumes/functions` /
`volumes/snippets` s'ils ne sont pas déjà versionnés. Tester régulièrement une
restauration complète : une copie à chaud n'est pas une sauvegarde cohérente.

### 6.5 Mettre à jour la stack

Les images se mettent à jour **ensemble**, à partir d'un tag `self-hosted/vX.Y.Z`
testé — jamais image par image. Le tag reste associé à
`supabase-project/.supabase-version` pour que `update.sh` puisse fusionner
correctement les changements.

```bash
# dans une préproduction
printf 'ref=self-hosted/vX.Y.Z\n' > supabase-project/.supabase-version
sh supabase-project/update.sh
sh scripts/migrate.sh && sh scripts/test-db.sh
sh scripts/deploy-functions.sh
sh scripts/restore.sh <sauvegarde>      # vérifier la reprise avant déploiement
```

### 6.6 Ressources

Minimum **4 Go de RAM, 2 CPU, 40 Go de SSD** ; **8 Go, 4 CPU, 80 Go** dès que
Logs/Analytics, Realtime, Storage et les Edge Functions sont actifs.

---

## 7. Variables d'environnement

### Frontend — variables de **build** (`.env.app`)

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL de la gateway API (ex. `https://api.votredomaine.fr`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publiable (`sb_publishable_…`) |

Publiques par conception : elles n'ouvrent aucun accès seules, l'accès aux
données est filtré par la JWT de session et par les politiques RLS. Si elles
sont absentes, l'application démarre en mode démonstration.

### Backend — variables d'**exécution** (`supabase-project/.env`, jamais versionné)

| Variable | Rôle |
|---|---|
| `POSTGRES_PASSWORD` | mot de passe de la base |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | clés d'API asymétriques |
| `GOOGLE_*` / `FACEBOOK_*` | SSO OAuth (callback `https://api.votredomaine.fr/auth/v1/callback`) |
| `SMTP_*` | confirmations et réinitialisations de mot de passe |
| `API_EXTERNAL_URL`, `SITE_URL`, `ADDITIONAL_REDIRECT_URLS` | URLs publiques de la stack |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | authentification Basic du dashboard de la gateway |
| `FUNCTIONS_VERIFY_JWT=false` | obligatoire ici : la stack mélange appels navigateur (`publishable`), session (`user`) et cron serveur (`secret`) ; chaque fonction déclare son mode |
| `INVITE_TOKEN_HMAC_SECRET` | ≥ 256 bits (`openssl rand -base64 48`), stocké dans Vault, injecté **uniquement** dans l'Edge Function d'invitation ; sa rotation invalide tous les tokens actifs |

`SUPABASE_SECRET_KEY`, `POSTGRES_PASSWORD`, `INVITE_TOKEN_HMAC_SECRET`, les clés
OAuth et SMTP ne doivent **jamais** passer comme arguments de build du frontend.

---

## 8. Commandes utiles

### Frontend (`app/`)

```bash
npm ci
npm run dev          # serveur de développement Vite
npm run typecheck    # tsc --noEmit (strict, noUnusedLocals, verbatimModuleSyntax)
npm test             # Vitest : composants, hooks, data layer
npm run test:watch   # Vitest en continu
npm run test:e2e     # Playwright : connexion, foyer, tâche, dépense, carte
npm run build        # typecheck + build de production (PWA + service worker)
npm run preview      # sert le build
```

Pour une revue visuelle sur la matrice de viewports du manifeste :

```bash
node scripts/screenshots.mjs http://127.0.0.1:4173 /accueil /taches
# → /tmp/opencode/shots/<route>-<viewport>.png + rapport de débordement horizontal
```

### Backend

```bash
sh scripts/migrate.sh --status        # migrations appliquées
sh scripts/migrate.sh                 # appliquer
sh scripts/test-db.sh                 # tous les tests SQL
sh scripts/test-db.sh 0002            # un seul fichier
sh scripts/deploy-functions.sh        # fonctions métier → runtime
sh scripts/deploy-functions.sh --list
sh scripts/backup.sh
sh scripts/restore.sh <horodatage> --dry-run
```

Dans `supabase-project/` : `sh run.sh start|stop|logs <service>|recreate <service>`.

---

## 9. Modèle de données

40 tables, toutes en `public`, toutes avec RLS activée dès leur migration. Les
noms de tables et de colonnes correspondent **exactement** aux interfaces de
`app/src/types/database.ts` ; `supabase/tests/0001_schema_contract.sql` le
vérifie à chaque campagne.

| Famille | Tables |
|---|---|
| Identité | `profiles`, `households`, `household_members`, `household_invite_tokens`, `invitations` |
| Vie quotidienne | `shopping_lists`, `shopping_list_items`, `events`, `event_reminders`, `notes`, `tasks`, `task_assignees`, `task_reminders`, `routines`, `routine_assignees`, `routine_reminders`, `routine_completions`, `recipes` |
| Partage et mémoire | `expenses`, `expense_participants`, `external_participants`, `gift_lists`, `gift_items`, `gift_list_shares`, `birthdays`, `pets`, `pet_records`, `provider_types`, `providers`, `loyalty_cards`, `places`, `posts`, `post_media`, `post_comments`, `post_reactions`, `trips`, `conversations`, `conversation_members`, `messages`, `dashboard_widgets` |

Points de conception :

- Les tables racines portent `id` (texte préfixé, compatible avec les
  identifiants générés par le client) et `household_id`.
- Les tables enfants accèdent au foyer **par leur parent** quand elles n'ont pas
  de `household_id` ; les quelques colonnes dénormalisées sont justifiées,
  contraintes et alignées par déclencheur.
- Les tables d'association ont une **clé primaire composite** : le frontend
  n'y injecte pas d'identifiant.
- Les jetons d'invitation ne stockent qu'un **HMAC-SHA-256** ; le token brut
  n'existe qu'au moment de sa génération.

---

## 10. Sécurité

- **La RLS est la frontière d'autorisation finale.** Ne jamais faire confiance à
  l'état de session du frontend seul.
- `household_invite_tokens` n'a **aucune politique RLS** et aucun privilège pour
  `anon`/`authenticated` : création, régénération, révocation et utilisation
  passent par des opérations serveur transactionnelles, avec expiration, nombre
  maximal d'utilisations, limitation de débit et comparaison à temps constant.
- Aucun changement de rôle ni aucun secret depuis le client : un membre ne peut
  pas s'attribuer `admin`, un administrateur d'un foyer ne touche pas à un autre.
- `profiles` n'expose **aucune liste globale d'e-mails** : lecture limitée à son
  profil et aux profils d'un foyer commun.
- Les buckets Storage sont **privés** ; le chemin de l'objet porte l'identifiant
  du foyer et les politiques revérifient l'appartenance.
- Toute fonction `SECURITY DEFINER` a un `search_path` fixé et des privilèges
  minimaux ; toute fonction SQL exposée en `public` est verrouquée par `GRANT`
  **et** revérifie l'acteur en base.
- Les commandes planifiées (`pg_cron`) ne contiennent **aucun secret en clair** :
  elles lisent Vault au moment de l'exécution.
- Les tests SQL incluent des cas négatifs explicites : utilisateur sans foyer,
  membre de deux foyers, lecture/écriture inter-foyer, suppression d'un objet
  d'un autre foyer, escalade de privilèges, lecture de la table des tokens,
  énumération des e-mails via `profiles`.

---

## 11. Design system et accessibilité

Le système visuel est celui de l'export de design, repris **jeton par jeton**
dans `app/src/styles/app.css` : palette `oklch` (pétrole, corail, ambre, encre),
rayons 10/16/22 px, ombres douces, échelle typographique fluide
(`clamp()`), courbes d'animation `cubic-bezier(0.23, 1, 0.32, 1)`.

- **Points de rupture** repris de l'export : 1180 px (barre latérale 218 px),
  920 px (barre latérale 76 px, colonnes empilées), 650 px (navigation basse,
  colonne unique).
- **Matrice de contrôle** : 360, 390, 430, 600, 820, 1024, 1366, 1440 et
  1920 px de large — aucun débordement horizontal toléré.
- **Accessibilité** : cibles ≥ 44 px, `focus-visible` visible partout, libellés
  liés aux contrôles, `aria-live` sur les zones dynamiques, parcours clavier
  complet (y compris le réordonnancement), aucune action destructive sans
  confirmation.
- **Couleurs par membre** cohérentes sur toute l'application : avatar, tâche
  assignée, événement, message, pastille de règlement.

---

## 12. Tests

| Niveau | Commande | Couverture |
|---|---|---|
| Composants et hooks | `npm test` (dans `app/`) | rendu, interactions, états vides/chargement/erreur, règles métier de chaque module |
| Data layer | inclus | adaptateur local, file hors ligne, génération de token, formatage |
| End-to-end | `npm run test:e2e` (dans `app/`) | connexion, création/rejoint de foyer, tâche, dépense, carte de fidélité, calendrier, absence de débordement, lien d'évitement |
| SQL | `sh scripts/test-db.sh` | contrat de schéma, isolation RLS, invitations, cron, compensation Ardoise, anniversaires |

L'end-to-end se lance sur un build de production (`vite preview`) et joue les
parcours en français (`fr-FR`, `Europe/Paris`).

---

## 13. Limites connues et prochaines étapes

- **Aucun SQL n'a encore été exécuté** dans ce dépôt : les migrations et les
  tests SQL sont relus et vérifiés statiquement, mais la validation réelle
  (`sh scripts/migrate.sh` puis `sh scripts/test-db.sh` sur une stack neuve)
  reste à faire avant tout déploiement.
- **Web Push non branché** : le calcul des rappels d'anniversaires et le job
  `eo-birthday-alerts` existent ; il manque la table d'abonnements, l'Edge
  Function d'envoi et la clé VAPID.
- **Recettes** est un placeholder (le schéma détaillé reste à définir, comme
  prévu par le référentiel).
- **Accusés de lecture des messages** suivis côté client : il faudrait une
  colonne `read_at` et une mise à jour serveur.
- **Ville du profil** : elle pilote le widget météo de l'accueil, aujourd'hui
  stockée dans les préférences du widget ; une colonne `profiles.city` est
  préférable.
- **Colonnes suggérées par les modules** : `notes.visibility`
(remplacerait le champ `color` utilisé comme porteuse), `pets.notes`,
`pets.next_reminder_date`, `trips.status`.
- **Compensation de l'Ardoise** : l'algorithme de référence est côté serveur
  (Edge Function `expense-settlement`) ; le frontend calcule encore ses soldes
  localement pour l'affichage immédiat.
- **Messages** : accusés de lecture et pièces jointes restent hors périmètre.

Voir [`docs/BACKEND.md`](docs/BACKEND.md) pour le détail opératoire et
[`AGENTS.md`](AGENTS.md) §9 pour les décisions produit encore à trancher.
