# AGENTS.md — Ensemble & Organisés

Ce document sert de référence pour tout agent (humain ou IA) travaillant sur le projet. Il décrit la stack technique, l'architecture, le modèle de données et les conventions à respecter pour chaque module.

---

## 1. Vue d'ensemble

**Nom** : Ensemble & Organisés
**Type** : Progressive Web App (PWA), installable, offline-first partiel
**Cible** : familles / foyers qui veulent centraliser l'organisation du quotidien (tâches, courses, calendrier, budget partagé, souvenirs...)
**Unité de base** : le **foyer** (household). Chaque utilisateur appartient à un ou plusieurs foyers, chaque foyer a des membres avec des rôles.

---

## 2. Stack technique recommandée

### 2.1 Frontend

> **Versions de référence vérifiées le 25 septembre 2026.** Dès l'initialisation du frontend, `package-lock.json` est versionné afin de verrouiller les patches. Ne pas utiliser de plages de versions flottantes dans le code. Une mise à jour majeure exige la lecture de son guide de migration et la validation de la chaîne de tests.

| Besoin | Choix | Justification |
|---|---|---|
| Runtime de build | **Node.js 24 LTS** + npm | Satisfait le minimum de React Router 8 et la chaîne Vite 8; l'image Docker est figée par version et digest |
| Framework | **React 19.3** + **React DOM 19.3** | React 19 est la base de React Router 8; 19.3 stable apporte notamment les View Transitions et Fragment Refs |
| Langage | **TypeScript 7** | Compilateur CLI natif et rapide pour le type-checking du frontend et des types générés |
| Build tool | **Vite 8.3** | HMR, build Rolldown et plugins dédiés pour Tailwind et la PWA |
| Routing | **React Router 8.4**, mode déclaratif pour la SPA | `BrowserRouter`, `Routes` et `Route` sont importés depuis `react-router`; aucun import `react-router-dom` |
| Client backend | **@supabase/supabase-js v2** | Client officiel typé pour Auth, PostgREST, Realtime, Storage et Edge Functions |
| État serveur / cache | **TanStack Query v5** | Cache, revalidation, annulation, synchronisation et mutations optimistes |
| État global UI (widgets, thème, etc.) | **Zustand v5** | État client léger, typé, sans boilerplate Redux |
| Style | **Tailwind CSS v4** | Configuration CSS-first, moteur moderne et bon support des containers |
| Composants accessibles | **shadcn/ui** construit sur **Radix UI** | Propriétés du composant copiées dans le dépôt; primitives WAI-ARIA et contrôle visuel total |
| Formulaires | **React Hook Form v7** + **Zod v4** via `@hookform/resolvers` | Validation typée de bout en bout et performances adaptées aux formulaires longs |
| Drag & drop (widgets, réordonner tâches) | **dnd-kit modulaire** (`@dnd-kit/core` v6, `@dnd-kit/sortable` v10, `@dnd-kit/utilities` v3) | Accessible, tactile-friendly; le paquet umbrella `dnd-kit` est déprécié |
| Dates / fuseaux | **date-fns v4** + **@date-fns/tz** | Gestion cohérente des dates, de l'heure et des changements d'heure |
| Récurrence | **rrule.js** | RRULE iCalendar pour les routines et leurs occurrences |
| Calendrier UI | Composant maison basé sur `date-fns` | Contrôle complet du rendu mobile-first; `react-big-calendar` n'est pas retenu par défaut |
| Scan code-barres / QR | API native **BarcodeDetector** + repli `html5-qrcode` | Meilleure intégration quand l'API est disponible, sans abandonner la compatibilité navigateur |
| Compression images avant upload | `createImageBitmap` + `<canvas>`/`toBlob` | Traitement natif côté navigateur, sans dépendance supplémentaire; WebP lorsque disponible, JPEG sinon |
| Offline cache | **Dexie v4** + service worker Workbox via **`vite-plugin-pwa` v1** | Cache applicatif IndexedDB et pré-cache des assets générés par Vite |
| Notifications push | **Web Push API** + VAPID, implémentées dans une Edge Function auto-hébergée | Abonnements et envoi contrôlés par l'application, sans service d'hébergement tiers |

TypeScript 7.0 n'expose pas encore son API publique de compilateur. Utiliser `tsc` 7 pour le build, mais vérifier les plugins qui consomment l'API TypeScript; si nécessaire, installer `@typescript/typescript6` en parallèle pour ces outils plutôt que de dégrader le vérificateur du projet.

### 2.2 Backend / données

**Choix arrêté : Supabase auto-hébergé avec Docker Compose** (PostgreSQL + Auth + PostgREST + Realtime + Storage + Edge Functions). Le backend est toujours exécuté par l'infrastructure Docker du projet.

Pourquoi PostgreSQL/Supabase :
- Le modèle de données est fortement **relationnel** (foyers → membres → tâches assignées, dépenses ↔ participants multiples, animaux ↔ carnet de santé). PostgreSQL et ses jointures SQL sont adaptés au calcul de répartition de l'Ardoise.
- **Row Level Security (RLS)** native : les politiques d'accès sont centralisées dans PostgreSQL pour sécuriser le multi-foyer.
- **Realtime** couvre le Cercle, les commentaires, les réactions et les notifications temps réel.
- **Storage + imgproxy** stockent et redimensionnent les photos/vidéos.
- **Edge Functions + `@supabase/server`** exécutent la logique serveur sensible : répartition Ardoise, notifications Web Push, rappels et génération des occurrences. Chaque fonction déclare explicitement son mode : `publishable` pour un appel navigateur portant la clé publiable, `user` pour une session, `secret` pour un appel serveur, ou `none` avec vérification de signature interne pour un webhook public. Une fonction multi-clients utilise un tableau de modes.
- **pg_cron** déclenche quotidiennement la génération des occurrences et l'évaluation des retards. L'extension, le schéma, le fuseau `Europe/Paris`, les jobs et leur historique sont versionnés dans les migrations/runbooks, puis vérifiés dans `cron.job` et `cron.job_run_details`. Si `POSTGRES_DB` change, définir explicitement `cron.database_name` dans la migration. Les commandes planifiées récupèrent les secrets via Vault et ne les inscrivent pas en clair dans `cron.job.command`.

Contraintes liées à l'auto-hébergement :
- PostgreSQL, les sauvegardes, la restauration, le HTTPS, les mises à jour de sécurité, la supervision et la haute disponibilité relèvent de l'équipe projet.
- Les images de la stack doivent être mises à jour **ensemble** à partir d'un tag `self-hosted/vX.Y.Z` testé par Supabase; ne pas choisir indépendamment des images individuelles en production. Le tag doit rester associé au fichier `.supabase-version` afin que `update.sh` puisse fusionner correctement les changements.
- Prévoir au minimum **4 Go de RAM, 2 CPU et 40 Go de SSD** pour l'ensemble de la stack; **8 Go, 4 CPU et 80 Go** sont recommandés dès qu'Analytics/Logs, Realtime, Storage et Edge Functions sont actifs.

### 2.3 Hébergement

- **Docker Compose uniquement** derrière le reverse proxy **Traefik** existant.
- **Frontend** : image multi-stage Node.js 24 + Nginx non privilégié servi sur le port 8080.
- **Backend** : stack officielle Supabase auto-hébergée, services privés et gateway API/Studio publiquement routeés par Traefik.
- **Base** : PostgreSQL 17 fourni par le snapshot Supabase auto-hébergé officiel; migrations versionnées dans le dépôt.
- **Objets** : volumes Docker persistants uniquement dans l'architecture retenue.
- **Proxy** : TLS terminé par Traefik, WebSockets Realtime activés, aucun port de base de données ou service interne exposé sur l'hôte.

### 2.4 Tests

- **Vitest 5** + **React Testing Library** + **Testing Library user-event** pour les composants et hooks.
- **MSW** pour simuler le réseau et **fake-indexeddb** pour tester Dexie.
- **Playwright** pour les parcours critiques end-to-end : connexion, création/rejoint de foyer, tâche, dépense et scan de carte de fidélité.
- Tests d'accessibilité automatisés et parcours manuels clavier/lecteur d'écran pour les parcours clés.

### 2.5 Authentification

**Supabase Auth auto-hébergé** gère l'email/mot de passe et l'OAuth (Google, Facebook) sans développer de couche d'authentification maison.

- **Google SSO** : renseigner `GOOGLE_ENABLED`, `GOOGLE_CLIENT_ID` et `GOOGLE_SECRET`, puis les injecter dans le service Auth avec le préfixe `GOTRUE_EXTERNAL_GOOGLE_*`. Callback : `https://api.votredomaine.fr/auth/v1/callback`.
- **Facebook SSO** : même principe avec `FACEBOOK_*` et `GOTRUE_EXTERNAL_FACEBOOK_*`; demander les permissions `public_profile` et `email`.
- Fallback **email / mot de passe** conservé ; un service SMTP de production est obligatoire pour les confirmations et les réinitialisations.
- Côté frontend, utiliser deux appels explicites : `supabase.auth.signInWithOAuth({ provider: 'google' })` et `supabase.auth.signInWithOAuth({ provider: 'facebook' })`.
- Un enregistrement `profiles` (`id = user_id`, `email`, `display_name`, `avatar_url`, `provider`) est créé à la première connexion par un trigger `SECURITY DEFINER` sur `auth.users`, avec `search_path` fixe, privilèges restreints et `upsert` idempotent.
- Utiliser uniquement la clé publiable `SUPABASE_PUBLISHABLE_KEY` dans le frontend. La clé secrète `SUPABASE_SECRET_KEY` reste exclusivement dans les services serveur/Edge Functions.

### 2.6 Row Level Security et données sensibles

La RLS est la frontière d'autorisation finale. Les règles minimales sont :

- Une fonction utilitaire `SECURITY DEFINER` vérifie l'appartenance et le rôle d'un utilisateur, avec un `search_path` fixe et des privilèges minimaux.
- Chaque table métier multi-foyer active la RLS et possède des politiques explicites `SELECT`, `INSERT`, `UPDATE` et `DELETE`. Les tables enfants accèdent au foyer par leur parent ou portent un `household_id` dénormalisé justifié et contraint.
- Les politiques d'écriture vérifient le rôle du foyer ; un membre ne peut pas s'attribuer le rôle `admin`, un autre foyer ou un autre participant.
- `profiles` est global et contient des données personnelles : RLS activée, lecture limitée au profil propre et aux profils explicitement visibles dans un foyer commun, aucune liste globale des emails.
- Les buckets Storage sont privés par défaut. Leurs politiques vérifient le propriétaire et le foyer via le chemin de l'objet; aucun bucket média public non justifié.
- Les opérations de rôle administrateur, envoi de rappels, création d'occurrences et compensation de l'Ardoise s'exécutent côté serveur avec la clé secrète, jamais depuis le client.
- `household_invite_tokens` n'est jamais lisible directement par le client; création, régénération et utilisation passent par des opérations serveur transactionnelles.
- Les tests PostgreSQL incluent des cas négatifs explicites : utilisateur sans foyer, membre de deux foyers, tentative de lecture/écriture inter-foyer, suppression d'un objet d'un autre foyer et escalade de privilèges.

### 2.7 Vérification avant commit

Section prescriptive. Elle vient de quatre campagnes où un défaut a franchi la
migration, le test de contrat **et** la relecture, pour n'échouer qu'à la
première exécution. Les récits sont dans `docs/RETROSPECTIVE.md`, les
mécanismes sont ici.

#### La chaîne, dans cet ordre

```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py
sh scripts/test-db.sh          # sur une machine qui a Docker
```

Docker n'est pas toujours disponible. Les quatre premières étapes suffisent
alors, et `test-db.sh` devient un **passage obligatoire** avant de considérer un
changement SQL comme validé. Ne pas annoncer « le SQL est bon » parce que la
migration s'est appliquée : c'est précisément le cas des défauts que cette
section existe pour attraper.

#### A. Le SQL n'est vérifié qu'à l'exécution

`create function` enregistre un corps sans l'exécuter. Une migration s'applique,
le test de contrat passe, la relecture ne voit rien — et la fonction ne se
révèle qu'à son premier appel, en production, quatre fois par heure.

1. **Ne jamais réécrire une migration appliquée.** Corriger vers l'avant, dans
   une nouvelle migration. Le dépôt garde le code fautif, c'est voulu : il
   raconte ce qui s'est passé.
2. Ce qui compte, c'est la **définition effective** d'une fonction : la
   dernière, celle que la base contient.
3. `set search_path = ''` n'est pas une précaution facultative — c'est ce qui
   empêche un appelant de détourner la fonction. Mais un `search_path` vide ne
   résout **aucun** nom : toute table s'écrit `public.tasks`.
4. Un CTE masque la table du même nom. `join tasks t` dans le CTE `tasks` joint
   le CTE à lui-même.
5. `returns table (a, b, …)` ne décrit pas seulement le résultat : en PL/pgSQL,
   `a` et `b` sont des **variables**. Une référence non qualifiée est ambiguë, ou
   silencieusement remplacée par `NULL`.

#### B. Le contrôle statique SQL

`python3 scripts/check-sql-statique.py` — vert avant tout commit. Six
vérifications : nom de table non qualifié sous un `search_path` vide, CTE qui se
rejoint lui-même, littéral laissé ouvert en fin de ligne, référence non qualifiée
à une colonne de `returns table`, types des deux arguments de `testkit.eq`,
variable plpgsql dans une chaîne SQL exécutée par `testkit.count()`.

Trois règles qui rendent le contrôle digne de confiance :

* il ne porte que sur la **définition effective** ; les définitions dépassées
  sont signalées sans faire échouer le contrôle, sinon le dépôt serait rouge
  indéfiniment pour une faute déjà corrigée ;
* il ne conclut que sur ce qu'il peut déterminer **avec certitude** — un
  littéral s'accorde sur l'autre argument, donc il ne peut pas être un conflit ;
* **un contrôle se prouve sur un cas qui doit échouer.** Un vérificateur qui
  n'a jamais refusé quelque chose n'a pas été exercé. Et un vérificateur qui
  refuse du code que les tests couvrent est pire qu'aucun : on apprend à
  l'ignorer avant qu'il ne trouve un vrai défaut.

#### C. La frontière du conteneur

`psql.sh` exécute psql **dans** le conteneur `db`. Le dépôt et le `/tmp` de
l'hôte n'y existent pas. **Le seul canal qui traverse la frontière est l'entrée
standard.**

| Forme | Verdict |
|---|---|
| `psql.sh < fichier` | correct — stdin |
| `psql.sh -f fichier` | **échoue** : le chemin est résolu dans le conteneur |
| `psql.sh -c "$(cat fichier)"` | met le contenu dans la liste des processus |
| `psql.sh -c "… $SECRET …"` | **jamais** : le secret est lisible par quiconque voit les processus |

Corollaire : un utilitaire qui résout un contexte avant d'agir doit détourner
l'entrée standard de cette phase (`< /dev/null`), sinon il mange celle de
l'appelant. C'est le cas de `db_printenv`.

#### D. Écrire une assertion à partir de l'implémentation

1. **Lire la fonction avant d'écrire l'assertion.** Une assertion écrite de
   mémoire teste l'idée qu'on se fait du code, pas le code.
2. **Toute assertion borne sa portée.** Compter sur toute une table suppose
   une base vide ; la règle est presque toujours *par foyer*. Sur une base
   contenant des données réelles, une assertion non bornée échoue pour une
   raison qui n'a rien à voir avec ce qu'elle vérifie.

   Le mécanisme mérite d'être connu, parce qu'il distingue une assertion
   fragile d'une assertion correcte qui lui ressemble : **le rôle courant**. En
   `authenticated`, la RLS borne déjà la requête au foyer de l'acteur, et les
   données d'un autre foyer sont invisibles — un comptage non borné y est donc
   correct. En `postgres`, la RLS est court-circuitée : la table entière est
   visible, et le comptage doit être borné à la main. `0002` et `0003` comptent
   en `authenticated` et peuvent se permettre des totaux ; `0007` compte en
   `postgres` et doit borner chaque assertion.

   L'appartenance se prouve par une marque reconnaissable dans les données
   d'essai — ici, un endpoint qui se termine par un long bloc de `a` — plutôt
   que par un identifiant d'objet, que le test ne connaît pas à l'avance.
3. **Aucune tautologie.** `count(*) >= 0`, `x is not null` sur une colonne
   `not null`, `expect_true(true)` : vertes sans rien vérifier. Une assertion
   fausse n'est pas moins fausse qu'une assertion absente.
4. **Sur un fichier de test nouveau, un échec est la norme**, pas un signal
   d'alarme. Le signal d'alarme, c'est un fichier qui n'a jamais rien vérifié.
5. `testkit.eq` est `eq(anyelement, anyelement, text)` : les deux valeurs
   doivent être du même type. Et `testkit.count('…')` exécute dans une fonction
   séparée : une variable du bloc appelant n'y existe pas.

#### E. Corriger la classe, pas l'instance

Devant un défaut, poser deux questions : « comment corriger celui-ci » **et**
« quelles autres occurrences de la même cause restent dans le dépôt ». La
première répare, la deuxième évite les allers-retours suivants. Une seule
inspection vaut souvent mieux que dix exécutions.

#### F. Un succès muet est un échec inexpliqué

« Ça n'a rien fait, sans erreur » n'est pas « ça a marché ». Un résultat
silencieux se traite comme un échec tant qu'il n'est pas expliqué. Corollaire
inverse : tout contrôle doit produire une preuve de sa propre efficacité.

#### G. Le message de commit est vérifié avant le push, pas après

Un message fautif poussé puis amendé impose un `--force-with-lease` sur un
branche déjà partagée. Le contenu est identique, mais cela fait tirer deux fois
à quelqu'un d'autre. Relire le message **avant** `git push`.

#### H. Les secrets

Ni versionné, ni en ligne de commande, ni dans `cron.job.command`. Les
variables du dépôt ne portent que des **noms** ; les valeurs vivent dans le
`.env` de la stack, dans Vault, ou dans le gestionnaire de secrets de
l'exploitant. Voir §2.6 et `docs/BACKEND.md` §6.4.

---

## 3. Architecture du projet

```
/app                           # package frontend autonome
  /src
    /app                        # routing, layout global, providers
    /modules
      /courses
      /calendrier
      /notes
      /taches
      /routines
      /recettes
      /ardoise
      /cadeaux
      /anniversaires
      /animaux
      /prestataires
      /fidelite
      /adresses
      /cercle
      /voyages
      /messages
      /widgets
    /components/ui               # primitives et composants UI locaux
    /components/shared            # composants métier partagés
    /lib
      /supabase                  # client et accès aux services auto-hébergés
      /offline                   # cache Dexie et queue de synchronisation
      /notifications
    /hooks
    /stores
    /types
  /Dockerfile
  /nginx.conf
/supabase                       # migrations, fonctions, tests SQL et code versionné
  /migrations
  /functions               # fonctions métier uniquement, sans bootstrap runtime
  /tests
/supabase-project                # runtime officielle épinglé et overrides locaux
  /docker-compose.yml
  /docker-compose.traefik.yml
/compose.app.yaml                # Compose autonome du frontend
/scripts
  /migrate.sh                    # applique supabase/migrations via le conteneur db
  /deploy-functions.sh           # copie les fonctions métier dans le runtime épinglé
.env.app                         # variables Vite publiques, propre à l'environnement
```

Chaque module suit la même structure interne : `components/`, `hooks/`, `api.ts` (requêtes Supabase), `types.ts`.

---

## 4. Flux d'onboarding (landing page → tableau de bord)

1. **Landing page** : présentation courte de l'app + boutons "Continuer avec Google", "Continuer avec Facebook", et un lien "Continuer avec un email" en option secondaire.
2. **Après connexion réussie**, l'app vérifie si l'utilisateur est déjà membre d'au moins un foyer (`household_members` où `user_id = utilisateur courant`) :
   - **Si oui** → direction vers le tableau de bord du foyer (ou un sélecteur de foyer si l'utilisateur en a plusieurs).
   - **Si non** → écran de choix à deux options claires, sans étape intermédiaire inutile :
     - **"Créer mon foyer"**
     - **"Rejoindre un foyer"**
3. **Créer mon foyer** :
   - Formulaire minimal (nom du foyer, éventuellement une couleur/icône).
   - Création de la ligne `households`, ajout automatique de l'utilisateur comme membre avec le rôle `admin`.
   - Génération automatique d'un **token d'invitation** d'au moins 128 bits, affiché immédiatement avec les boutons « Copier » et QR. Le token brut n'est jamais persisté en clair : la base stocke seulement son HMAC calculé avec `INVITE_TOKEN_HMAC_SECRET`; la validation/rédemption s'effectue dans une transaction serveur unique avec expiration, nombre maximal d'utilisations, révocation et limitation de débit.
4. **Rejoindre un foyer** :
   - Champ de saisie du token (encodage base64url court, par exemple 22 caractères ou plus) ; aucune politique de format à alphabet réduit de huit caractères.
   - Vérification côté serveur du HMAC avec une comparaison à temps constant, puis contrôle de l'expiration, du compteur et de l'état actif; création de `household_members` dans la même transaction afin d'éviter une double utilisation.
   - Redirection vers le tableau de bord du foyer rejoint.
5. **Gestion du token dans les paramètres du foyer** : un admin peut régénérer le token, ce qui invalide immédiatement le précédent, définir son expiration et son nombre maximal d'utilisations, puis le régénérer pour le partager à nouveau (paramètres → « Inviter des membres »). Seul le nouveau token brut est affiché à sa génération. La rotation de `INVITE_TOKEN_HMAC_SECRET` invalide tous les tokens actifs et impose leur régénération.

---

## 5. Modèle de données (résumé par catégorie)

> **Cette section est une carte fonctionnelle non exhaustive, pas un schéma SQL exécutable.** Les migrations sous `supabase/migrations` font foi. Dans chaque migration, chaque table doit déclarer explicitement sa clé primaire ou sa contrainte composite, son rattachement au foyer et ses champs d'audit; aucune colonne n'est présumée implicite. Les tables métier racines portent `id` (uuid) et `household_id`, sauf `profiles` (globale), `households` (racine du tenant) et les tables personnelles explicitement listées. Les tables d'association portent leurs clés parentes (`task_id`, `routine_id`, `expense_id`, etc.) et dérivent leur accès du foyer via leur parent. Toute dénormalisation de `household_id` doit être justifiée, contrainte et couverte par la RLS.

### Foyer & membres
- `profiles` (id = user_id Supabase Auth, email, display_name, avatar_url, provider [google/facebook/email])
- `households` (id, name, avatar_color)
- `household_members` (id, household_id, user_id, display_name, avatar_url, color_tag, role [admin/membre/enfant])
- `household_invite_tokens` (id, household_id, token_hash, created_by, expires_at nullable, max_uses, use_count, is_active) — `token_hash` est un HMAC-SHA-256 calculé avec un secret dédié `INVITE_TOKEN_HMAC_SECRET`, stocké dans Vault/secret manager et jamais en base; le token brut n'est affiché qu'à sa génération
- `invitations` (id, household_id, email/phone, role, statut) — réservé aux invitations ciblées (ex: partage d'une liste de cadeaux à un externe), distinct du token d'accès au foyer

### Courses
- `shopping_lists` (id, household_id, name)
- `shopping_list_items` (id, list_id, name, quantity, unit, category, checked boolean, added_by)

### Calendrier
- `events` (id, household_id, title, description, start_at, end_at, all_day, location, color, created_by)
- `event_reminders` (id, event_id, remind_at)

### Notes
- `notes` (id, household_id, title, content, category, color, created_by)

### Tâches
- `tasks` (id, household_id, name, description, due_date, priority_order, status [à faire/en cours/fait], created_by)
- `task_assignees` (task_id, member_id)
- `task_reminders` (id, task_id, remind_at)

### Routines
- `routines` (id, household_id, name, description, recurrence_rule (RRULE), created_by)
- `routine_assignees` (routine_id, member_id)
- `routine_reminders` (id, routine_id, remind_at)
- `routine_completions` (id, routine_id, occurrence_date, completed_by, completed_at, status [fait/en retard/manqué])

### Recettes
- Placeholder : `recipes` (id, household_id, title) — schéma complet à définir plus tard (ingrédients, étapes, temps de préparation, liaison possible avec Courses)

### Ardoise
- `expenses` (id, household_id, title, amount, paid_by member_id, expense_date, split_type [égal/personnalisé])
- `expense_participants` (id, expense_id, participant_type [membre/externe], member_id nullable, external_participant_id nullable, share_amount) — contrainte SQL : `membre` exige `member_id` non nul et `external_participant_id` nul; `externe` exige l'inverse. Les deux références sont validées dans le même foyer.
- `external_participants` (id, household_id, name, contact) — participant externe aux membres du foyer, mais toujours rattaché au même `household_id`
- Solde calculé côté serveur (vue SQL ou Edge Function) : qui doit combien à qui, simplifié (algorithme de compensation des dettes)

### Cadeaux
- `gift_lists` (id, owner_member_id, name, visibility) — liste personnelle dérivée du foyer via `household_members`
- `gift_items` (id, list_id, name, price, comment, photo_url, url, reserved_by, purchased boolean)
- `gift_list_shares` (list_id, shared_with_member_id nullable, shared_with_email nullable, permission [lecture/réservation])

### Anniversaires
- `birthdays` (id, household_id, name, birth_date, photo_url, linked_member_id nullable)

### Animaux
- `pets` (id, household_id, name, species, breed, weight_kg, birth_date, identification_number, photo_url)
- `pet_records` (id, pet_id, type [produit/vaccin/traitement/info], name, record_date, next_due_date, notes, attachment_url)

### Prestataires
- `provider_types` (id, household_id, name) — configurable via l'icône paramètres
- `providers` (id, household_id, provider_type_id, name, email, phone, address, postal_code, city, notes)

### Fidélité
- `loyalty_cards` (id, household_id, member_id nullable, name, code_type [barcode/qr], code_value, brand_color)

### Adresses
- `places` (id, household_id, type [restaurant/café/bar/hôtel/boutique/parc/musée/cinéma/théâtre/bien-être/lieu phare/tourisme/autre], photo_url, name, street, postal_code, city, phone, rating 1-5, visited boolean)

### Cercle
- `posts` (id, household_id, author_id, text, created_at)
- `post_media` (id, post_id, type [photo/vidéo], url)
- `post_comments` (id, post_id, author_id, content)
- `post_reactions` (id, post_id, author_id, type)

### Voyages
- Structure minimale proposée (à affiner avec vous) : `trips` (id, household_id, name, destination, start_date, end_date, cover_photo, notes) + possibilité future d'un lien vers Adresses (lieux du voyage) et Calendrier (dates bloquées)

### Messages
- `conversations` (id, household_id, type [direct/groupe])
- `conversation_members` (conversation_id, member_id)
- `messages` (id, conversation_id, sender_id, content, media_url, created_at)
- ⚠️ Point d'attention : une vraie messagerie temps réel est un gros morceau (accusés de lecture, notifications, pièces jointes). envisager un scope réduit (fil de discussion simple par foyer, sans conversations privées)

### Widgets (tableau de bord personnalisé)
- `dashboard_widgets` (id, member_id, widget_type [calendrier/tâches/météo/anniversaires/routines], position_x, position_y, width, height, settings jsonb) — préférences personnelles; le foyer est dérivé du membre

---

## 6. Guidelines UX / accessibilité par catégorie

Principes transverses :
- **Écran d'accueil = grille de tuiles cliquables** avec photo/illustration de fond + icône + nom (correspond à la demande "boutons cliquables avec photos"). Tuiles larges, zones tactiles ≥ 44px, contraste texte/fond vérifié (WCAG AA) même sur les photos (overlay semi-opaque derrière le texte).
- **Code couleur par membre** cohérent sur toute l'app (avatar, tâches assignées, événements calendrier, routines) pour une lecture rapide sans avoir à lire les noms.
- **Actions destructrices** (supprimer une tâche, un événement...) toujours confirmées par une modale, jamais de suppression en un seul tap.
- **Formulaires longs** (animaux, prestataires) découpés en sections repliables plutôt qu'un long scroll unique ; champs optionnels clairement indiqués.
- **Gestes rapides** : swipe pour cocher ou supprimer sur les listes (courses, tâches), uniquement comme action supplémentaire. Une alternative visible au bouton et accessible au clavier/lecteur d'écran est toujours disponible; la suppression par geste exige la même confirmation que l'action classique.
- **États vides soignés** : chaque catégorie vide propose un texte d'invitation + bouton d'action clair plutôt qu'un écran blanc.

Idées spécifiques :

- **Courses** : ajout rapide au clavier avec suggestions basées sur l'historique ; regroupement automatique par rayon (fruits/légumes, épicerie...) pour un usage en magasin ; case à cocher large.
- **Calendrier** : vue mois par défaut avec pastilles colorées par membre, vue jour au clic ; création d'événement en tap-and-hold sur une date ; distinction visuelle claire jours fériés vs événements personnels.
- **Notes** : catégories sous forme de tags colorés filtrables, recherche plein texte, tri par date de modification.
- **Tâches** : tri automatique par échéance (retard en rouge en haut), glisser-déposer pour changer la priorité manuelle, badge visuel sur l'avatar de la personne assignée.
- **Routines** : vue "aujourd'hui" avec cases à cocher type checklist, indicateur visuel de série (streak) pour motiver, historique consultable en calendrier avec code couleur fait/en retard/manqué.
- **Ardoise** : résumé visuel simple en haut ("Tu dois 12 € à Marie") avant le détail des dépenses ; ajout de dépense en 3 champs minimum (montant, qui a payé, qui partage) avec le reste en options.
- **Cadeaux** : mode "liste privée" clairement signalé pour ne pas divulguer les envies à la mauvaise personne ; case "réservé par" masquée au propriétaire de la liste pour préserver la surprise.
- **Anniversaires** : bascule liste/calendrier en un tap ; alerte visuelle sur les anniversaires du mois en cours.
- **Animaux** : fiche façon carnet de santé, timeline chronologique des vaccins/traitements avec rappel visuel si un rappel de vaccin approche.
- **Prestataires** : recherche/filtre par type ; bouton d'appel direct (`tel:`) et d'itinéraire (lien carte) directement sur la fiche.
- **Fidélité** : affichage plein écran du code-barres/QR en un tap (pour le scan en caisse), tri par enseigne utilisée récemment.
- **Adresses** : filtre par type de lieu et par note, carte visuelle si possible (regroupement géographique), bascule "à visiter / déjà visité" en évidence.
- **Cercle** : fil chronologique type réseau social familial, notifications groupées ("3 nouveaux commentaires") pour ne pas spammer.
- **Widgets** : mode édition explicite (bouton "personnaliser") pour éviter les déplacements accidentels, grille avec accroche (snap-to-grid) plutôt que positionnement libre pixel-perfect.

---

## 7. Roadmap suggérée

**Phase 1 — MVP foyer**
Authentification (SSO Google/Facebook + email), création/rejoindre un foyer par token, Tâches, Courses, Calendrier, Notes, Widgets de base (Calendrier, Tâches, Météo)

**Phase 2 — Vie quotidienne étendue**
Routines, Ardoise, Anniversaires, Widget Anniversaires/Routines

**Phase 3 — Réseau familial**
Cercle, Messages (version simple), Cadeaux

**Phase 4 — Écosystème complet**
Animaux, Prestataires, Fidélité, Adresses, Voyages, Recettes

---

## 8. Déploiement Docker

Le déploiement est **exclusivement conteneurisé**. Tous les environnements passent par Docker Compose et sont publiés uniquement par le Traefik existant sur le réseau externe `frontend`. Le frontend et le backend sont donc toujours des services Docker ; aucun hébergeur applicatif tiers n'entre dans l'architecture.

### 8.1 Supabase auto-hébergé

Installer la stack officielle à partir d'un **tag de release stable et épinglé**. La référence vérifiée le 25 septembre 2026 est `self-hosted/v0.8.2`; vérifier le changelog avant toute montée de version.

```bash
bootstrap_dir="$(mktemp -d)"
git clone --depth 1 --branch self-hosted/v0.8.2 \
  https://github.com/supabase/supabase.git \
  "$bootstrap_dir/supabase"
mkdir -p supabase-project
cp -R "$bootstrap_dir/supabase/docker/." supabase-project/
rm -rf "$bootstrap_dir"

cd supabase-project
cp .env.example .env
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env
printf 'ref=self-hosted/v0.8.2\n' > .supabase-version
```

Règles d'intégration :

- Ne pas éditer manuellement les fichiers de base si une extension Docker Compose suffit. Utiliser notamment `docker-compose.traefik.yml` pour le routage. Les modifications opérées par `add-new-auth-keys.sh` sont une exception officielle et doivent être conservées comme patch local auditable.
- Retirer les publications `ports:` héritées de `api-gw` et `supavisor` dans l'override : Traefik accède aux services via le réseau Docker.
- Publier trois hôtes : le frontend sur `app.votredomaine.fr`, la gateway API sur `api.votredomaine.fr` et Studio sur `studio.votredomaine.fr`.
- Utiliser `sh run.sh start`, `sh run.sh logs <service>`, `sh run.sh recreate <service>` et `sh run.sh config add <override>` plutôt que des commandes ad hoc divergentes.
- Exiger Docker Compose 2.24.4 ou ultérieur pour les tags YAML `!override` utilisés ci-dessous.
- Le réseau externe `frontend` doit être créé et attaché à Traefik avant tout démarrage.
- Exécuter les scripts de génération dans un terminal protégé : ils affichent les secrets générés et ne doivent jamais être lancés dans des logs CI.
- Sauvegarder les secrets dans un gestionnaire dédié ou un secret store de l'hôte. Ne jamais versionner `.env` ni les clés privées.

Le dépôt comporte deux applications Compose indépendantes : `compose.app.yaml` à la racine ne contient que le frontend, tandis que `supabase-project/docker-compose.yml` contient la stack backend. Créer `supabase-project/docker-compose.traefik.yml` à partir de l'override de la section 8.3 avant le premier démarrage, afin qu'aucun port interne ne soit exposé temporairement.

Le répertoire versionné `supabase/functions` contient uniquement les fonctions métier. Le script `scripts/deploy-functions.sh` les copie dans `supabase-project/volumes/functions` sans supprimer ni remplacer les répertoires fournisseurs `main` et `hello`; il supprime les anciennes fonctions métier obsolètes avant la copie. Le répertoire `supabase/migrations` est la source de vérité du schéma; `scripts/migrate.sh` applique les fichiers SQL dans l'ordre lexicographique via le service `db`, avec `ON_ERROR_STOP`, transaction par migration et enregistrement dans `schema_migrations` avant de démarrer l'application.

### 8.2 Conteneur frontend

Le build Vite doit recevoir l'URL et la clé publiable de la stack locale. Comme Vite les incorpore dans le bundle, elles sont passées comme `ARG`/`ENV` pendant le build ; un `env_file` du conteneur Nginx ne fonctionnerait pas.

```dockerfile
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

Les digests ci-dessus sont multi-architectures et correspondent aux images vérifiées le 25 septembre 2026. Toute montée de Node.js ou Nginx met à jour ensemble la version, le digest, le lockfile npm et la chaîne de tests.

Créer `app/.dockerignore` — le build context est `app/` — en excluant au minimum `.env*`, `.git`, `node_modules`, `dist`, `coverage` et les artefacts de tests.

`nginx.conf` sert la SPA React Router, met en cache les assets versionnés et force la revalidation du service worker et du manifeste (`Cache-Control: no-cache`) :

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;

    location = /sw.js {
        expires -1;
        try_files $uri =404;
    }

    location = /manifest.webmanifest {
        expires -1;
        try_files $uri =404;
    }

    location /assets/ {
        expires 1y;
        try_files $uri =404;
    }

    location / {
        expires -1;
        try_files $uri $uri/ /index.html;
    }
}
```

HSTS, Content Security Policy et Permissions Policy sont ajoutés au niveau Traefik après validation des domaines OAuth, Storage, Realtime et du service worker. Ne pas dupliquer ces en-têtes dans plusieurs conteneurs.

Service applicatif dans le fichier `compose.app.yaml` placé à la racine du dépôt :

```yaml
services:
  ensemble-organises-app:
    build:
      context: ./app
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    container_name: ensemble-organises-app
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    networks:
      - frontend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.eo-app-rtr.entrypoints=https"
      - "traefik.http.routers.eo-app-rtr.rule=Host(`app.votredomaine.fr`)"
      - "traefik.http.routers.eo-app-rtr.service=eo-app-svc"
      - "traefik.http.services.eo-app-svc.loadbalancer.server.port=8080"
      - "traefik.docker.network=frontend"

networks:
  frontend:
    external: true
```

### 8.3 Backend derrière Traefik

La gateway par défaut des versions Supabase auto-hébergées actuelles est **Envoy**, exposée par le service Compose `api-gw` sur le port interne 8000. Ajouter un override qui lui retire toute publication de port et la joint au réseau `frontend` :

```yaml
# docker-compose.traefik.yml
services:
  auth:
    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_ENABLED}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/callback
      GOTRUE_EXTERNAL_FACEBOOK_ENABLED: ${FACEBOOK_ENABLED}
      GOTRUE_EXTERNAL_FACEBOOK_CLIENT_ID: ${FACEBOOK_CLIENT_ID}
      GOTRUE_EXTERNAL_FACEBOOK_SECRET: ${FACEBOOK_SECRET}
      GOTRUE_EXTERNAL_FACEBOOK_REDIRECT_URI: ${API_EXTERNAL_URL}/callback

  studio:
    networks:
      - default
      - frontend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.eo-studio-rtr.entrypoints=https"
      - "traefik.http.routers.eo-studio-rtr.rule=Host(`studio.votredomaine.fr`)"
      - "traefik.http.routers.eo-studio-rtr.service=eo-studio-svc"
      - "traefik.http.routers.eo-studio-rtr.middlewares=chain-authentik@file"
      - "traefik.http.services.eo-studio-svc.loadbalancer.server.port=3000"
      - "traefik.docker.network=frontend"

  api-gw:
    ports: !override []
    networks:
      - default
      - frontend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.eo-api-rtr.entrypoints=https"
      - "traefik.http.routers.eo-api-rtr.rule=Host(`api.votredomaine.fr`)"
      - "traefik.http.routers.eo-api-rtr.service=eo-api-svc"
      - "traefik.http.services.eo-api-svc.loadbalancer.server.port=8000"
      - "traefik.docker.network=frontend"

  supavisor:
    ports: !override []

networks:
  frontend:
    external: true
```

Démarrer séparément le frontend et le backend :

```bash
# Backend : enregistrer l'override avant le premier démarrage
cd supabase-project
sh run.sh config add traefik
sh ../scripts/deploy-functions.sh

# Démarrer uniquement PostgreSQL, sans route publique
sh run.sh start db
sh ../scripts/migrate.sh

# Publier la stack seulement après le succès des migrations
sh run.sh start

# Frontend, une fois le schéma disponible
cd ..
docker compose --env-file .env.app -f compose.app.yaml config
docker compose --env-file .env.app -f compose.app.yaml up -d --wait
```

`sh run.sh config add traefik` ajoute `docker-compose.traefik.yml` à la variable officielle `COMPOSE_FILE`; ne pas maintenir une seconde liste manuelle de fichiers Compose.

Points de sécurité :
- **Studio direct** est protégé par `chain-authentik@file` et n'est jamais publié directement sur un port hôte.
- **La gateway API ne reçoit aucun middleware d'authentification Traefik** : elle sert l'API authentifiée par clé publiable, JWT utilisateur et RLS. Un middleware de session devant cette route bloquerait l'application.
- Le catch-all `/` d'`api-gw` sert également Studio; il reste protégé par l'authentification Basic Auth du gateway (`DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`). Tester explicitement ce chemin sur les deux hôtes.
- Les services `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`, `functions`, `db` et `supavisor` restent uniquement sur le réseau Docker interne.
- Les politiques RLS sont la barrière d'autorisation finale pour les données du foyer. Ne jamais se fier uniquement à l'état de session du frontend.

### 8.4 Variables d'environnement

Variables utilisées au **build du frontend**, placées dans `.env.app` à la racine :

```dotenv
VITE_SUPABASE_URL=https://api.votredomaine.fr
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ces deux valeurs reprennent respectivement `SUPABASE_PUBLIC_URL` et `SUPABASE_PUBLISHABLE_KEY` du backend. Elles sont publiques par conception, mais restent propres à l'environnement et ne sont pas versionnées. Exécuter `docker compose ... config` avant le build pour vérifier leur interpolation.

La date et l'heure du frontend proviennent du navigateur et du profil utilisateur. Ne pas figer le fuseau du client via la variable `TZ` du conteneur Nginx.

Extrait illustratif du `.env` de la stack auto-hébergée. Le fichier réel doit être construit à partir du `.env.example` du snapshot puis complété par les scripts de génération :

```dotenv
SUPABASE_PUBLIC_URL=https://api.votredomaine.fr
API_EXTERNAL_URL=https://api.votredomaine.fr/auth/v1
SITE_URL=https://app.votredomaine.fr
ADDITIONAL_REDIRECT_URLS=https://app.votredomaine.fr

POSTGRES_PASSWORD=...
DASHBOARD_USERNAME=...
DASHBOARD_PASSWORD=...

SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_SECRET=...

FACEBOOK_ENABLED=true
FACEBOOK_CLIENT_ID=...
FACEBOOK_SECRET=...

SMTP_ADMIN_EMAIL=...
SMTP_HOST=...
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_SENDER_NAME=Ensemble & Organisés

DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_EMAIL_AUTOCONFIRM=false
JWT_EXPIRY=3600
FUNCTIONS_VERIFY_JWT=false
```

Contraintes :

- Générer les secrets de la stack avec les scripts officiels du snapshot. Les valeurs par défaut de `.env.example` sont interdites; ne pas remplacer le `.env` complet par l'extrait ci-dessus.
- Générer séparément `INVITE_TOKEN_HMAC_SECRET` avec au moins 256 bits (`openssl rand -base64 48`), le stocker dans Vault/secret manager et l'injecter uniquement dans la fonction serveur qui génère et valide les tokens. Ne jamais réutiliser une clé Supabase pour ce HMAC. Sa rotation invalide tous les tokens actifs.
- Les variables OAuth sont injectées dans le service `auth` par l'override actif de la section 8.3.
- `SUPABASE_SECRET_KEY`, `POSTGRES_PASSWORD`, les clés OAuth et SMTP ne doivent jamais être passés comme arguments de build frontend.
- Dans les consoles OAuth, enregistrer l'origine frontend `https://app.votredomaine.fr` et le callback `https://api.votredomaine.fr/auth/v1/callback`. Pour Facebook, demander `public_profile` et `email`.
- `SITE_URL` pointe vers le frontend ; `API_EXTERNAL_URL` pointe vers la gateway Auth. En production, conserver des URLs de redirection exactes plutôt qu'un glob large.
- `FUNCTIONS_VERIFY_JWT=false` est nécessaire pour mélanger appels navigateur, utilisateur et cron serveur dans cette stack. Chaque Edge Function doit toutefois utiliser `withSupabase` avec `auth: 'publishable'`, `auth: 'user'`, `auth: 'secret'` ou `auth: 'none'`; une fonction multi-clients accepte un tableau et une fonction `none` vérifie elle-même toute signature entrante.
- Le CORS global par défaut d'Envoy est volontairement permissif; l'autorisation repose sur la clé API, le JWT et les RLS, pas sur l'origine. Si une allowlist stricte est requise, modifier `volumes/api/envoy/lds.template.yaml` et tester les requêtes OPTIONS avant de personnaliser la configuration.

### 8.5 Exploitation et points d'attention

- **WebSockets** : Traefik transmet l'upgrade HTTP vers `/realtime/v1/websocket`; la route API ne doit pas ajouter de middleware qui supprime `Upgrade`/`Connection`.
- **Reverse proxy** : vérifier la transmission de `Host`, `X-Forwarded-Proto` et `X-Forwarded-Host`. Les URLs OAuth doivent correspondre à la configuration publique.
- **HTTPS** : obligatoire en production pour la PWA, les cookies/session, OAuth et les Web Push services.
- **Sauvegardes** : automatiser des dumps PostgreSQL cohérents et sauvegarder `volumes/storage`, le volume Docker nommé `db-config` (clé pgsodium et configuration PostgreSQL), ainsi que `volumes/functions` et `volumes/snippets` s'ils ne sont pas déjà versionnés. Tester régulièrement une restauration complète; une copie à chaud ne constitue pas une sauvegarde cohérente.
- **Mises à jour** : lire le changelog, épingler un nouveau tag `self-hosted/vX.Y.Z`, exécuter le script officiel `update.sh` dans une préproduction, puis rejouer `deploy-functions.sh`, les tests, migrations et la restauration avant déploiement. Le bootstrap fournisseur `volumes/functions/main` est mis à jour par le snapshot et n'est jamais remplacé par le code métier.
- **Observabilité** : activer l'override Logs/Analytics si nécessaire, surveiller santé des conteneurs, requêtes Realtime, erreurs Edge Functions, espace disque et expiration des certificats.
- **Ressources** : retirer un service non utilisé réduit la consommation, mais ne doit pas retirer Auth, PostgREST, Realtime, Storage ou Edge Functions sans décision de produit explicite.
- **Exercice de reprise** : définir et tester périodiquement la procédure de restauration, les RTO/RPO et le remplacement d'un hôte.

---

## 9. Décisions produit encore à trancher

1. Périmètre exact du module Messages pour le MVP (fil de foyer simple ou vraie messagerie privée).
2. Besoin ou non d'une application mobile native à terme (PWA pure ou wrapper Capacitor).
3. Gestion des membres « enfants » : compte autonome avec accès restreint ou profil géré par un parent.
4. Usage du token de foyer : à usage unique, réutilisable, nombre maximal d'utilisations et rôle attribué par défaut.
5. Expiration automatique du token, durée maximale et révocation de toutes les sessions concernées.
6. Objectifs de reprise après sinistre : RPO, RTO, rétention des sauvegardes et niveau de haute disponibilité attendu.
7. Règles de conservation et de suppression des comptes, médias et données du foyer.

---

## 10. Politique de versions et sources officielles

- Le projet suit les versions stables vérifiées dans ce document, mais les **patchs sont épinglés** dans le lockfile et les images Docker par digest ou par tag de release.
- Avant une mise à jour majeure, lire les notes de migration, vérifier la compatibilité React Router/Vite/PWA et exécuter la chaîne complète de tests.
- Les APIs/flags React non stables ou React Router marqués `unstable` ne sont pas autorisés en production.
- React 19.3 : https://react.dev/blog/2026/09/09/react-19-3
- React Router 8 et prérequis : https://reactrouter.com/8.4.0/start/changelog
- React Router 8, mode déclaratif : https://reactrouter.com/8.4.0/start/declarative/installation
- Vite 8 : https://vite.dev/blog/announcing-vite8-1
- TypeScript 7 : https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Tailwind CSS 4 : https://tailwindcss.com/blog/tailwindcss-v4
- TanStack Query 5 : https://tanstack.com/query/latest/docs/framework/react
- Zod 4 : https://zod.dev/v4
- Vitest 5 : https://vitest.dev/guide/
- Vite PWA : https://vite-pwa-org.netlify.app/
- Supabase auto-hébergé avec Docker : https://supabase.com/docs/guides/self-hosting/docker
- Clés publishable/secret et authentification asymétrique : https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- Gateway Envoy auto-hébergée : https://supabase.com/docs/guides/self-hosting/self-hosted-envoy
- Edge Functions auto-hébergées : https://supabase.com/docs/guides/self-hosting/self-hosted-functions
- Authentification des Edge Functions : https://supabase.com/docs/guides/functions/auth
- Supabase derrière un reverse proxy : https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- OAuth auto-hébergé : https://supabase.com/docs/guides/self-hosting/self-hosted-oauth
- Sauvegarde de la clé pgsodium / `db-config` : https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17
