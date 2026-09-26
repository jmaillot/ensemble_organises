# Backend & exploitation — « Ensemble & Organisés »

Ce document décrit la partie **versionnée** du backend : le schéma PostgreSQL,
les fonctions serveur, les tests SQL, les scripts d'exploitation et le routage
Traefik. Il est le companion opérationnel de `AGENTS.md` (référentiel) et
`app/docs/frontend-contract.md` (contrat frontend).

Tout ce qui est décrit ici est **idempotent** : bootstrap, migrations, tests et
déploiement de fonctions peuvent être rejoués sans effet de bord.

---

## 1. Ce qui est versionné, ce qui ne l'est pas

| Emplacement | Versionné | Rôle |
|---|---|---|
| `supabase/migrations/` | oui | source de vérité du schéma (source *of truth*) |
| `supabase/functions/` | oui | fonctions **métier** uniquement, sans bootstrap runtime |
| `supabase/tests/` | oui | tests SQL exécutés dans la base |
| `scripts/` | oui | migration, déploiement des fonctions, tests, sauvegarde, restauration |
| `supabase-project/docker-compose.traefik.yml` | oui | override de routage et de durcissement |
| `supabase-project/.supabase-version` | oui | tag du snapshot épinglé, utilisé par `update.sh` |
| `supabase-project/docker-compose.yml` | **non** | snapshot fournisseur, réécrit à chaque mise à jour |
| `supabase-project/.env` | **jamais** | secrets, hors dépôt |
| `supabase-project/volumes/functions/main` | **jamais** | bootstrap fournisseur, jamais remplacé par le code métier |

Le répertoire `supabase/functions` ne contient aucun runtime : le bootstrap
fournisseur reste dans `volumes/functions/main`, et le déploiement consiste à
copier les fonctions métier à côté. C'est ce que fait
`scripts/deploy-functions.sh`.

---

## 2. Bootstrap de la stack

La référence vérifiée est le tag `self-hosted/v0.8.2`. Vérifier le changelog
avant toute montée de version.

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

Contraintes :

* **Terminal protégé** pour les scripts de génération : ils affichent les secrets
  produits et ne doivent jamais être lancés depuis un journal CI.
* Les valeurs par défaut de `.env.example` sont interdites.
* `add-new-auth-keys.sh` est une exception officielle : ses modifications sont
  conservées comme patch local auditable.
* Un secret supplémentaire est à ajouter **à la main** dans `.env` :

  ```bash
  openssl rand -base64 48      # ≥ 256 bits
  # INVITE_TOKEN_HMAC_SECRET=...
  ```

  `INVITE_TOKEN_HMAC_SECRET` n'est lu que par la fonction serveur
  `household-invite` (injeté via `supabase-project/docker-compose.traefik.yml`).
  Il ne doit jamais être réutilisé comme clé d'API. **Sa rotation invalide tous
  les tokens actifs** et impose leur régénération. Voir « Variables
  d'environnement du backend » ci-dessous pour l'ensemble du `.env`.

* Les images de la stack sont mises à jour **ensemble** à partir du tag
  `self-hosted/vX.Y.Z`, jamais image par image. Le tag reste associé à
  `.supabase-version` pour que `update.sh` fusionne correctement.

Prérequis : Docker Compose **≥ 2.24.4** (syntaxe `!override` de l'override
Traefik) et le réseau externe `frontend` créé et attaché à Traefik.

### Variables d'environnement du backend

Le fichier `supabase-project/.env` est **jamais versionné**. Il est construit à
partir du `.env.example` du snapshot, complété par `utils/generate-keys.sh` et
`utils/add-new-auth-keys.sh`, puis complété des variables propres au projet.
Extrait illustratif (les valeurs par défaut du snapshot sont interdites) :

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

# Secret dédié aux empreintes HMAC des tokens d'invitation (≥ 256 bits).
INVITE_TOKEN_HMAC_SECRET=...

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

- **Les valeurs par défaut de `.env.example` sont interdites.** Générer tous
  les secrets avec les scripts officiels du snapshot, dans un terminal protégé.
- **`INVITE_TOKEN_HMAC_SECRET`** (≥ 256 bits, `openssl rand -base64 48`) est
  propre à l'empreinte des tokens d'invitation. Il est stocké dans Vault / le
  gestionnaire de secrets de l'hôte, injecté **uniquement** dans le service
  `functions` (cf. `docker-compose.traefik.yml`) et n'existe **nulle part en
  base** : la base ne conserve que `HMAC-SHA-256(secret, token)`. Ne jamais
  réutiliser une clé Supabase pour ce HMAC. **Sa rotation invalide tous les
  tokens actifs** et impose leur régénération.
- **`FUNCTIONS_VERIFY_JWT=false` est indispensable ici.** La stack doit laisser
  passer trois familles d'appels : le navigateur qui ne porte que la clé
  publiable (mode `publishable`), le client authentifié qui porte sa session
  (mode `user`) et le job `pg_cron` qui ne porte que la clé secrète (mode
  `secret`). Avec `FUNCTIONS_VERIFY_JWT=true`, la passerelle exige un JWT
  utilisateur sur **chaque** appel et rejetterait d'emblée les modes
  `publishable` et `secret` — donc le job quotidien, qui n'a pas de session.
  L'override Traefik force `false` par défaut (`${FUNCTIONS_VERIFY_JWT:-false}`)
  pour qu'un `.env` incomplet ne fasse pas tomber la stack au démarrage.
- **Cette valeur ne déverrouille rien.** Chaque Edge Function déclare
  explicitement ses modes dans `withSupabase` (`publishable`, `user`, `secret`,
  `none`) et rejette elle-même ce qu'elle n'attend pas. L'autorisation réelle
  reste la RLS et les fonctions `SECURITY DEFINER`, qui revérifient le rôle en
  base. Une Edge Function compromise ne peut donc pas agir pour un
  non-administrateur, même si la passerelle laisse passer la requête.
- `SUPABASE_SECRET_KEY`, `POSTGRES_PASSWORD`, `INVITE_TOKEN_HMAC_SECRET`, les
  clés OAuth et SMTP ne doivent **jamais** être passés comme arguments de build
  du frontend.
- Dans les consoles OAuth, enregistrer l'origine `https://app.votredomaine.fr`
  et le callback `https://api.votredomaine.fr/auth/v1/callback` (Facebook :
  `public_profile` et `email`).
- Le CORS global d'Envoy est volontairement permissif : l'autorisation repose
  sur la clé d'API, le JWT et la RLS, pas sur l'origine. Une allowlist stricte
  se configure dans `volumes/api/envoy/lds.template.yaml` — tester les
  requêtes `OPTIONS` avant de la durcir.

---

## 3. Démarrage

Les deux applications Compose sont indépendantes : `compose.app.yaml` (frontend)
et `supabase-project/docker-compose.yml` (backend).

```bash
# 1. Enregistrer l'override AVANT le premier démarrage
cd supabase-project
sh run.sh config add traefik          # ajoute docker-compose.traefik.yml à COMPOSE_FILE

# 2. Déployer les fonctions métier
sh ../scripts/deploy-functions.sh

# 2 bis. Les hôtes publiés doivent correspondre aux URL de la stack.
#         Aucun déploiement n'échoue si elles divergent : l'échec apparaît à
#         l'inscription, sur une page introuvable, sans cause visible.
sh ../scripts/check-hosts.sh

# 3. Base et stockage, aucune route publique.
#    `storage` est indispensable : c'est lui qui crée le schéma
#    `storage.buckets` utilisé par la migration 0010. `migrate.sh` le
#    détecte et s'arrête avec cette consigne s'il manque.
sh run.sh start db storage
sh ../scripts/migrate.sh

# 4. Tests SQL (base restaurée à l'identique en sortie)
sh ../scripts/test-db.sh

# 5. Publier la stack
sh run.sh start

# 6. Frontend, une fois le schéma disponible
cd ..
cp .env.app.example .env.app           # renseigner URL + clé publiable
docker compose --env-file .env.app -f compose.app.yaml config
docker compose --env-file .env.app -f compose.app.yaml up -d --wait
```

Ne jamais maintenir une seconde liste manuelle de fichiers Compose :
`sh run.sh config add traefik` fait le travail.

### Points de sécurité du routage

* **Studio** est protégé par `chain-authentik@file` et n'est jamais publié sur un
  port hôte.
* **La gateway API ne reçoit aucun middleware d'authentification** : elle sert
  l'API authentifiée par clé publiable, JWT utilisateur et RLS. Un middleware
  de session devant cette route bloquerait l'application.
* Le catch-all `/` d'`api-gw` sert également Studio : il reste couvert par
  l'authentification Basic du gateway (`DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`).
  **Tester explicitement ce chemin sur les deux hôtes** après chaque mise à jour.
* `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`, `functions`, `db`
  et `supavisor` restent sur le réseau Docker interne.
* Les WebSockets Realtime (`/realtime/v1/websocket`) doivent conserver
  `Upgrade`/`Connection` : ne pas ajouter de middleware qui les supprime.

---

## 4. Migrations

`scripts/migrate.sh` s'exécute depuis la racine du dépôt **ou** depuis
`supabase-project/`. Tous les scripts d'exploitation passent par `db_compose`
(`scripts/lib-db.sh`), qui se place dans le répertoire de la stack : sans cela,
`docker compose` lancé depuis la racine ne trouve aucun fichier Compose — il n'y
a que `compose.app.yaml`, que Docker ne reconnaît pas — et `ps --services` ne
rend aucun nom. Le message affichait alors « le service db n'est pas démarré »
alors que le conteneur tournait, ce qui envoyait démarrer un service déjà lancé.

Un runtime absent et un service arrêté donnent désormais deux messages
distincts, parce que les corrections ne sont pas les mêmes : `db_require_runtime`
renvoie à `docs/BACKEND.md` §2, le second à `sh run.sh start db storage`.


`supabase/migrations` est la source de vérité du schéma. Les fichiers sont
appliqués dans l'ordre lexicographique, chacun dans sa propre transaction, puis
journalisés dans `public.schema_migrations`.

```bash
sh scripts/migrate.sh --status   # journal
sh scripts/migrate.sh            # application
```

L'idempotence vient du journal, pas de `if not exists` sur les tables : un
fichier ne doit être appliqué qu'une fois. Un échec annule le fichier entier,
version non enregistrée.

| Fichier | Contenu |
|---|---|
| `0001_foundations.sql` | schéma `private`, révocations, `private.new_id`, `private.is_member_color` |
| `0002_tables_identity.sql` | `profiles`, `households`, `household_members`, `household_invite_tokens`, `invitations` |
| `0003_tables_daily.sql` | courses, calendrier, notes, tâches, routines, recettes |
| `0004_tables_shared.sql` | Ardoise, cadeaux, anniversaires, animaux, prestataires, fidélité, adresses, Cercle, voyages, messages, widgets |
| `0005_indexes_and_constraints.sql` | index de jointure, de filtrage RLS, unicités métier |
| `0006_security_helpers.sql` | utilitaires d'autorisation `SECURITY DEFINER`, opérations serveur sur les tokens, solde de l'Ardoise |
| `0007_rls_policies.sql` | politiques RLS (motif commun généré + cas spécifiques écrits à la main) |
| `0008_triggers.sql` | profil à la première connexion, horodatage, intégrité des références et des parts |
| `0009_grants.sql` | privilèges : RLS filtre les lignes, GRANT filtre les tables |
| `0010_storage_and_realtime.sql` | buckets privés, politiques Storage, publication Realtime |
| `0011_cron.sql` | expansion RRULE, occurrences, retards, purge, jobs pg_cron |
| `0012_notifications.sql` | prochaine occurrence d'un anniversaire, alertes du mois et des sept prochains jours, job `eo-birthday-alerts` |
| `0013_server_rpc.sql` | appartenance vérifiée par acteur, rapport de maintenance des routines, ponts `public.expense_settlement()` et `public.routine_maintenance()` |
| `0014_rls_child_tables.sql` | active la RLS sur les tables enfants et de rappel dont les politiques existaient déjà sans jamais l'avoir été (voir la note de migration) |
| `0015_share_uniqueness.sql` | remplace quatre contraintes `unique nulls not distinct` par des index uniques partiels : le partage d'une dépense et d'une liste était impossible dès la deuxième part |
| `0016_expenses_policies.sql` | donne ses quatre politiques RLS à `public.expenses`, qui n'en avait aucune : table fermée à double tour, donc Ardoise inerte côté client |
| `0016_create_household.sql` | crée un foyer et son premier administrateur dans une transaction, via `public.create_household` : deux requêtes laissaient un foyer sans administratrice, donc insupprimable, et l'insertion renvoyée passait la politique de lecture d'un foyer dont l'appelant n'est pas encore membre |
| `0017_redeem_side_effects.sql` | retire deux `update … set is_active = false` suivis d'un `raise` dans `redeem_household_invite_token` : même instruction, donc l'exception annulait l'UPDATE. La désactivation revient à `prune_expired_invite_tokens` |

> Numérotation : les alertes d'anniversaires (`0012`) précèdent le pont `public`
> des Edge Functions (`0013`). Les deux sont indépendantes, restent applicables
> dans l'ordre lexicographique, chacune dans sa propre transaction, et ne
> dépendent d'aucune base existante.

### Décisions de schéma (et pourquoi)

**Identifiants `text` préfixés, pas `uuid`.** Le frontend génère lui-même ses
identifiants (`randomId()` de `app/src/lib/utils.ts` produit
`<préfixe>_<uuid>`) et les transmet à PostgREST ; un `uuid` rejecterait ces
inserts. Toutes les clés primaires métier sont donc des `text` :
`task_1a2b…`, `member_…`. Les identifiants d'identité (`profiles.id`,
`household_members.user_id`, `households.created_by`,
`household_invite_tokens.created_by`) restent des `uuid` alignés sur
`auth.users`. Les lignes créées côté serveur utilisent
`private.new_id('<préfixe>')`, qui produit exactement le même format.

> Conséquence : un `id` n'est pas garanti triable ni unique par format. Les clés
> étrangères sont des `text`, tous les index de rendu sont explicites.

**`household_members.id` est la référence « membre »**, pas `auth.users.id`.
`tasks.created_by`, `posts.author_id`, `messages.sender_id`, `expenses.paid_by`,
`gift_items.reserved_by`, `loyalty_cards.member_id`, `birthdays.linked_member_id`
et `dashboard_widgets.member_id` référencent tous `household_members.id` : c'est
ce que montre `app/src/types/database.ts` et ce que produit le jeu de
démonstration. Un membre peut donc être un profil géré par un parent
(`user_id` nullable, rôle `enfant`).

**Contraintes `CHECK` plutôt que types `enum`.** Les vocabulaires fermés
(`role`, `status`, `widget_type`, `code_type`, `place.type`, …) sont encodés en
`CHECK`. Un `ALTER TYPE … ADD VALUE` ne peut pas être exécuté dans une
transaction et casserait le principe de « migration transactionnelle » ; le
`CHECK` garde la migration atomique et le vocabulaire lisible dans
`information_schema`.

**`household_id` dénormalisé, justifié et contraint.** Ces tables le portent
pour éviter une jointure sur chaque requête de tableau de bord :
`shopping_list_items`, `routine_completions`, `gift_items`, `pet_records`,
`post_media`, `post_comments`, `post_reactions`, `messages`. Elles sont
alignées sur leur parent par le déclencheur `align_household`
(`migration 0008`), qui refuse tout écart et met à jour la colonne si elle est
absente. `supabase/tests/0001_schema_contract.sql` vérifie que ce déclencheur
est présent sur chacune d'elles.

**Tables enfants sans `household_id`.** `event_reminders`, `task_assignees`,
`task_reminders`, `routine_assignees`, `routine_reminders`,
`expense_participants` et `conversation_members` accèdent au foyer par leur
parent. Leurs politiques RLS résolvent le parent via les utilitaires
`private.can_read_*` / `can_write_*` / `can_admin_*`.

> Attention côté frontend : `useResource()` ajoute systématiquement un filtre
> `household_id`. Sur ces sept tables, il faut passer par `useQuery` + `data.list`
> avec un filtre sur la clé parente, sinon PostgREST répond « colonne
> inexistante ». Voir « Points hors périmètre ».

**Visibilité des listes de cadeaux.** `visibility = 'privee'` n'est lisible que
par le propriétaire et les partages explicites (membre du foyer ou email).
`'foyer'` et `'partagee'` sont lisibles par tous les membres. La
propriété (`owner_member_id`) n'est transférable que par un administrateur du
foyer (déclencheur `guard_gift_list_ownership`).

**Rôles.** `admin` : lecture, écriture, gestion des membres et des invitations.
`membre` : lecture et écriture sur le contenu. `enfant` : **lecture seule**.
C'est la décision retenue pour la question ouverte d'`AGENTS.md` §9.3 : un
profil enfant n'écrit pas dans le foyer, il consulte.

**Dernier administrateur.** La suppression d'un membre `admin` est refusée s'il
est le dernier du foyer. Un membre ne peut jamais s'attribuer `admin` : seule la
politière `household_members_insert` (créateur du foyer) ou
`household_members_update` (administrateur existant) l'autorise.

---

## 5. RLS

La RLS est la frontière d'autorisation finale. Elle est activée **dans la
migration de création de chaque table** : une table sans politique est donc
inaccessible, pas ouverte.

> **Une politique sans RLS activée est inerte.** C'est le piège qu'a révélé la
> première application réelle : sept tables enfants et de rappel avaient bien
> leurs politiques (migration 0007) mais aucune ligne
> `enable row level security` — le bloc qui suit la création des tables les
> oubliait. Comme 0009 accorde `... on all tables in schema public to
> authenticated`, elles étaient alors lisibles et modifiables par tout
> utilisateur connecté, tous foyers confondus. Deux garde-fous l'empêchent de
> revenir :
>
> * `0014_rls_child_tables.sql` échoue bruyamment si une table attendue n'a ni
>   RLS ni politique ;
> * le contrat de schéma (`tests/0001_schema_contract.sql`) exige la RLS sur
>   **toutes** les tables de `public`, sans liste d'exclusion.
>
> Toute nouvelle table doit être couverte par les deux.
>
> **Second piège, même famille : le GUC du JWT.** Les politiques s'appuient sur
> `auth.uid()`, qui est une fonction de la stack, pas de notre code. Sur
> l'instantané `self-hosted/v0.8.2` elle se définit par
> `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid` : elle ne lit
> que le GUC **scalaire**, jamais le JSON `request.jwt.claims`. PostgREST pose
> les deux à chaque requête, donc la production n'est pas concernée ; un harnais
> qui ne pose que le JSON, en revanche, voit `uid()` à `NULL` et filtre **tout**.
> C'est ce qui est arrivé, et le symptôme — « Alice voit 0 membre » — ne disait
> rien de la cause. `testkit.as_user` pose donc les deux formes, par symétrie
> avec PostgREST, et `0002_rls_isolation.sql` vérifie `auth.uid()` avant sa
> première assertion pour que le prochain changement de version soit nommé.
>
> **Troisième piège, plus discret : l'outillage qui ment.** `testkit.count()`
> exécute la requête et en prend la première ligne — un `select 1 from
> household_members` sur trois membres rendait `1`, pas `3`, et `NULL` si la RLS
> n'en montrait aucun. Toutes les assertions de comptage de `0002` et `0003`
> comparaient donc une valeur qui n'était pas un compte, et le défaut est resté
> invisible précisément parce qu'un `NULL` et un `1` se ressemblent dans un
> message d'échec. La fonction encapsule désormais la requête et compte
> vraiment. À garder en tête pour tout utilitaire de test : un helper qui
> rapporte autre chose que ce que son nom promet produit des tests verts.
>
> Quatrième membre de la famille, trouvé dans la même campagne : `expenses` est
> arrivée sans **aucune** politique. RLS activée, `GRANT … on all tables`
> ouvert — la table était close à double tour. Personne n'y accédait, pas même
> l'administrateur légitime, et l'utilisateur voyait une liste vide plutôt
> qu'une erreur. `0007` avait bien écrit les quatre politiques de la table
> fille `expense_participants` : c'est la mère qui avait été omise de la liste.
>
> Une politique manquante et une politique inerte produisent le même symptôme —
> « je ne vois rien » — et des causes opposées. D'où les deux contrôles
> désormais distincts du contrat de schéma : RLS activée sur chaque table,
> **et** au moins une politique sur chacune, `household_invite_tokens` étant la
> seule exception documentée.

Deux familles de politiques (`migration 0007`) :

1. **Tables « foyer plat »** — motif commun, généré dans un bloc `DO` pour
   éviter deux cents déclarations divergentes :

   ```sql
   SELECT  -> private.is_household_member(household_id)
   INSERT  -> private.can_write_household(household_id) ET auteur = membre courant
   UPDATE  -> private.can_write_household(household_id) ET auteur = membre courant
   DELETE  -> private.is_household_admin(household_id)
   ```

   Les colonnes d'auteur (`created_by`, `added_by`, `author_id`, `member_id`,
   `linked_member_id`, `completed_by`) doivent être **nulles ou désigner le
   membre courant** : impossible d'écrire au nom d'un autre.

2. **Cas spécifiques**, écrits à la main : foyers, membres, profils, invitations,
   tables enfants, cadeaux, conversations, messages, widgets.

Points sensibles :

* **`household_invite_tokens` n'a aucune politique.** Aucune lecture, aucune
  écriture, aucune inférence. Les `GRANT` sont en plus retirés à `anon` et
  `authenticated` (`migration 0009`). La table n'est atteignable que par
  `service_role`, c'est-à-dire l'Edge Function.
* **`profiles`** : pas de politique d'insertion (la ligne naît du trigger sur
  `auth.users`) ni de suppression. La politique d'`UPDATE` porte sur `id = auth.uid()`
  et un déclencheur interdit en plus la modification de `email`, `provider` et
  `created_at` — une politique ne peut pas restreindre les colonnes d'un
  `UPDATE`, un déclencheur si. Il n'existe **aucune politique de type « liste
  globale »** : la lecture est filtrée ligne à ligne sur les foyers communs.
* **Le déclencheur `on_auth_user_created`** crée le profil à la première
  connexion (`SECURITY DEFINER`, `search_path` fixé, `upsert` idempotent) en
  reprenant `raw_user_meta_data`.

Tous les utilitaires d'autorisation sont des `SECURITY DEFINER` avec
`set search_path = ''` (le plus strict possible : `pg_catalog` reste implicite,
tout le reste est qualifié) : ils portent donc la vérification d'appartenance et
de rôle, et contournent la RLS pour ne pas se récurser.

---

## 6. Edge Functions

Cinq fonctions métier, toutes versionnées dans `supabase/functions` et
déployées par `scripts/deploy-functions.sh` (qui copie le code métier dans le
runtime épinglé, sans toucher aux répertoires fournisseurs `main` et `hello`).
**Elles doivent être déployées avant leur premier usage** : la migration qui
expose les RPC associées est déjà en base, mais sans le code déployé l'endpoint
répond 404 et la fonction renvoie `503` si la migration, elle, manque.

| Fonction | Endpoint | Modes déclarés | Objet |
|---|---|---|---|
| `household-invite` | `POST /functions/v1/household-invite` | `['publishable', 'user']` | cycle de vie des tokens d'invitation |
| `expense-settlement` | `POST /functions/v1/expense-settlement` | `'user'` | soldes et compensation des dettes de l'Ardoise |
| `generate-routine-occurrences` | `POST /functions/v1/generate-routine-occurrences` | `['secret', 'user']` | maintenance quotidienne des routines |
| `push-subscribe` | `POST /functions/v1/push-subscribe` | `'user'` | abonnement, révocation et liste des appareils ; clé VAPID publique |
| `push-notify` | `POST /functions/v1/push-notify` | `['secret', 'user']` | chiffrement et distribution des rappels (le mode `user` ne sert qu'au test) |

Toutes :

* en cas d'erreur, renvoient `{ error: string }` avec un code HTTP, jamais de
  détail technique ni de secret ;
* acceptent `OPTIONS` (préflight) et refusent toute méthode autre que `POST`
  par `405` ;
* journalisent côté serveur un **code** d'erreur, jamais un montant ni un
  secret ;
* lisent leurs secrets uniquement dans l'environnement du service
  `functions`.

### 6.1 `household-invite`

```
POST /functions/v1/household-invite
Content-Type: application/json
apikey: <clé publiable>            # mode `publishable`
authorization: Bearer <JWT>        # mode `user`
```

| Action | Corps | Réponse |
|---|---|---|
| `create` | `{ action, expiresAt?, maxUses?, householdId? }` | `InviteTokenPreview` : `{ token, expiresAt, maxUses, householdId }` |
| `revoke` | `{ action, householdId? }` | `{ revoked: number }` |
| `summary` | `{ action, householdId? }` | `InviteTokenSummary` ou `null` |
| `redeem` | `{ action, token }` | `{ household_id }` |

Erreurs attendues : `400` corps invalide ou expiration non future, `401` appel
sans session, `403` appelant non administrateur, `404` token inconnu ou foyer
absent, `409` régénération impossible, `410` token révoqué, expiré ou épuisé,
`429` limitation de débit, `500` `INVITE_TOKEN_HMAC_SECRET` absente ou trop
courte (≥ 256 bits).

Modes déclarés : `auth: ['publishable', 'user']`. Les quatre actions exigent une
session ; `create`, `revoke` et `summary` exigent en outre le rôle `admin` du
foyer, revérifié **en base** par les fonctions SQL appelées. Une Edge Function
compromise ne peut donc pas agir pour un non-administrateur.

Fonctionnement du token :

1. La fonction tire 128 bits aléatoires et les encode en base64url (22
   caractères, format identique à `generateInviteToken()` du frontend).
2. Elle calcule `HMAC-SHA-256(token, INVITE_TOKEN_HMAC_SECRET)` en hexadécimal.
3. Elle appelle `public.create_household_invite_token(...)` avec **seulement**
   l'empreinte. La base n'a jamais vu le token brut.
4. Le token brut n'est renvoyé qu'à cet appel. Les appels suivants ne
   retournent qu'un résumé sans empreinte.
5. `redeem` recalcule l'empreinte du token soumis et appelle
   `public.redeem_household_invite_token(...)`, qui verrouille la ligne
   (`FOR UPDATE`), revalide l'empreinte **à temps constant**, l'activité, la
   date d'expiration et le compteur, puis crée le membre et incrémente
   `use_count` dans la même transaction.

Autres garde-fous :

* `max_uses` borné à `[1, 100]`, `expires_at` plafonné à 90 jours et nécessairement
  dans le futur.
* Régénérer un token **désactive immédiatement** le précédent.
* Un token d'invitation n'attribue **jamais** le rôle `admin` : le rôle transmis
  par le client est ignoré (`membre` ou `enfant` seulement).
* Réutiliser un token alors qu'on est déjà membre du foyer est **idempotent** et
  ne consomme pas d'utilisation.
* `redeem` applique une limitation de débit par IP (8 tentatives / minute).
  Limitation **par instance** : à compléter par un compteur partagé si le
  service tourne en réplique.
* La comparaison des empreintes (`private.token_hash_matches`) parcourt tous les
  octets sans sortie anticipée. La ligne est d'abord localisée par l'index sur
  `token_hash`, puis la comparaison constante est refaite : l'index ne fournit
  aucune information exploitable au-delà du fait que le préfixe existe déjà.

Les quatre fonctions SQL appelées par l'Edge Function vivent dans `public` parce
qu'elles sont appelées via PostgREST, mais leur `EXECUTE` n'est accordé
qu'à `service_role`. Un client porteur d'un JWT utilisateur obtient le rôle
`authenticated` et se voit refuser l'appel — vérifié par
`supabase/tests/0001_schema_contract.sql` et `0003_invites.sql`.

### 6.2 `expense-settlement`

```
POST /functions/v1/expense-settlement
Content-Type: application/json
authorization: Bearer <JWT>        # mode `user` — session obligatoire
```

| Paramètre | Type | Requis | Rôle |
|---|---|---|---|
| `household_id` | `text` (`household_<uuid>`) | non | foyer visé ; sinon le premier foyer de l'appelant |

Réponse `200` :

```json
{
  "household_id": "household_…",
  "balances":    [{ "member_id": "member_…", "display_name": "Alice", "amount": 40.00 }],
  "settlements": [{ "from_member_id": "member_…", "from_name": "Bob",
                    "to_member_id": "member_…", "to_name": "Alice", "amount": 20.00 }],
  "generated_at": "2026-09-25T05:40:00+00:00"
}
```

* `balances` : un solde par membre, positif = le foyer lui doit. La somme est
  toujours nulle.
* `settlements` : nombre **minimal** de transferts, `from` rembourse `to`.
  `from_name` / `to_name` sont une commodité d'affichage ; l'identifiant fait
  foi.
* Tous les montants sont arrondis au centime.

Modes déclarés : `auth: 'user'`. Aucun appel sans session n'aboutit, et le foyer
est **déduit de la session** : un `household_id` explicite n'est accepté que si
l'appelant en est membre, revérifié en base par
`private.assert_household_member()` via `public.expense_settlement()`.

Erreurs attendues : `400` corps invalide ou foyer ambigu (plusieurs foyers sans
`household_id`), `401` sans session, `403` `household_id` usurpé, `404` aucun
foyer, `405` méthode non `POST`, `500` calcul impossible, `503` migration 0013
non appliquée.

L'algorithme n'est **pas** réimplémenté en TypeScript : la fonction appelle
`private.household_balances()` et `private.simplify_household_debts()` (migration
0006) par le pont `public.expense_settlement()` (migration 0013, `EXECUTE`
réservé à `service_role`). La référence unique reste la SQL, testée par
`supabase/tests/0005_ardoise.sql`. Le client ne doit jamais recalculer un solde.

### 6.3 `generate-routine-occurrences`

```
POST /functions/v1/generate-routine-occurrences
Content-Type: application/json
apikey: <clé secrète>              # mode `secret` — job pg_cron / runner
authorization: Bearer <JWT>        # mode `user` — déclenchement manuel
```

| Paramètre | Type | Requis | Rôle |
|---|---|---|---|
| `household_id` | `text` | non | foyer visé par un déclenchement manuel ; sinon administrateur d'au moins un foyer |

Réponse `200` :

```json
{
  "occurrences_created": 42,
  "occurrences_late": 3,
  "occurrences_missed": 1,
  "generated_at": "2026-09-25T05:40:00+00:00"
}
```

* `occurrences_created` : occurrences matérialisées sur les 14 derniers jours
  jusqu'à aujourd'hui ;
* `occurrences_late` : occurrences échues encore `en_retard` après évaluation ;
* `occurrences_missed` : occurrences passées en `manque` (plus de 7 jours).

Modes déclarés : `auth: ['secret', 'user']`. En mode `user`, le rôle `admin` est
revérifié **en base** par `public.routine_maintenance()`. La fonction échoue
explicitement (`500`, journal `configuration serveur absente`) si
`SUPABASE_SECRET_KEY` manque : c'est un défaut de configuration, pas une erreur
d'appel, et elle ne doit pas laisser croire à un succès.

Erreurs attendues : `400` corps invalide ou foyer manquant, `401` session
invalide en mode `user`, `403` appelant non administrateur, `405` méthode non
`POST`, `500` clé secrète absente, `503` migration 0013 non appliquée.

**Le job quotidien n'utilise pas cette fonction** : `eo-routine-maintenance`
appelle directement `private.run_daily_routine_maintenance()` en SQL, sans
aller-retour HTTP. Cette Edge Function sert au déclenchement manuel et à la
supervision, et renvoie le même résumé.

### 6.4 `push-subscribe`

```
POST /functions/v1/push-subscribe
Content-Type: application/json
authorization: Bearer <JWT>        # session obligatoire
```

| Action | Corps | Réponse |
|---|---|---|
| `config` | `{}` | `{ vapid_public_key, push_configured }` |
| `subscribe` | `{ endpoint, keys: { p256dh, auth }, expirationTime, userAgent }` | `{ id, endpoint, created_at, last_success_at }` |
| `unsubscribe` | `{ endpoint }` | `{ removed }` |
| `list` | `{}` | `[{ id, endpoint, device, created_at, last_success_at, failure_count }]` |

Modes déclarés : `auth: 'user'`. Aucun mode `publishable` : un `endpoint` de
Push est une **capacité** — quiconque le détient peut notifier cet appareil.
Seul un appel authentifié obtient une configuration, et `config` ne touche à
aucune donnée : il répond sur la seule présence d'une session.

La table `public.push_subscriptions` n'a **ni politique RLS ni privilège** pour
`anon`/`authenticated` (migration 0018). C'est nécessaire : le `GRANT` par
défaut posé par la migration 0009 s'applique à toute table créée ensuite, et
avait suffi à ouvrir sept tables de jointure lors de la première campagne
(rétrospective §1.1). Les trois opérations passent donc par des fonctions
`SECURITY DEFINER` réservées à `service_role`, qui revérifient l'acteur qu'on
leur passe — `p_user_id` n'est jamais déduit de `auth.uid()`, qui serait nul
puisque la fonction est appelée avec la clé secrète.

`list` ne renvoie **jamais** `p256dh` ni le secret d'authentification : le
navigateur n'a aucun motif de les connaître, et le serveur ne les partage pas.

Erreurs attendues : `400` corps invalide ou clé mal formée, `401` session
invalide, `405` méthode non `POST`, `429` au-delà de 20 appels par minute et
par IP, `500` opération impossible.

### 6.5 `push-notify`

```
POST /functions/v1/push-notify
Content-Type: application/json
apikey: <clé secrète>              # mode `secret` — job pg_cron
authorization: Bearer <JWT>        # mode `user` — test uniquement
```

| `scope` | Effet |
|---|---|
| `rappels` | rappels de tâche, d'événement et de routine dus dans la fenêtre |
| `anniversaires` | anniversaires du jour |
| `test` | message de test, sur les seuls appareils du demandeur |

Réponse `200` : `{ notifications, delivered, failed, dropped, consumed }`.

Modes déclarés : `auth: ['secret', 'user']`. **En mode `user`, seul `test` est
accepté** : distribuer les rappels réels depuis une session autoriserait
n'importe quel membre à déclencher l'envoi de tout le foyer, à volonté. Le
message de test est écrit par `public.due_push_notifications('test', …)`, pas
reçu du client : celui-ci ne peut choisir ni le texte ni la cible, et ne voit
toujours pas les clés de chiffrement.

Variables d'environnement, lues par cette seule fonction :

| Variable | Rôle |
|---|---|
| `VAPID_PUBLIC_KEY` | clé publique de la paire VAPID (87 caractères base64url) |
| `VAPID_PRIVATE_KEY` | clé privée, format PKCS8 base64url (184 caractères) |
| `VAPID_SUBJECT` | contact du service Push, `mailto:` ou `https:` |

Elles ne sont lues par aucune autre fonction, ne sont écrites ni en base ni
dans un fichier versionné, et ne sont pas nécessaires au job pg_cron : celui-ci
n'appelle que l'URL de la fonction avec la clé secrète du projet, lue dans
Vault. Elles voyagent par le même chemin que `INVITE_TOKEN_HMAC_SECRET` : les
trois lignes de `.env.vapid` sont recopiées dans le `.env` de la stack, et
l'override `docker-compose.traefik.yml` ne les déclare que pour le service
`functions`. Le `.env` n'est jamais versionné et n'est lu que par Compose.

```bash
sh scripts/generate-vapid-keys.sh          # écrit .env.vapid en 600
```

L'override versionné `supabase-project/docker-compose.traefik.yml` déclare déjà
ces trois variables, et **uniquement** pour le service `functions`. Il reste donc
à reporter les trois lignes de `.env.vapid` dans `supabase-project/.env`, puis à
reconstruire le service :

```sh
grep '^VAPID_' .env.vapid >> supabase-project/.env    # jamais versionné
cd supabase-project && sh run.sh recreate functions
```

Les deux secrets des jobs, eux, vont dans **Vault** — pas dans le `.env`, qui
est lu par tous les services :

```sh
sh scripts/set-push-secrets.sh            # lit le .env, n'affiche rien
sh scripts/set-push-secrets.sh --check    # noms, états, dates
```

`post_push_dispatch()` se contente d'un `warning` si l'un manque : aucun job
n'échoue, le calcul des rappels continue, et rien ne part. Un secret absent se
remarque donc au bout de plusieurs jours, en croyant que le foyer a coupé ses
notifications. D'où le `--check`.

**Ce que renvoie un job.** `private.dispatch_push_notifications()` et
`private.dispatch_birthday_alerts()` renvoient toutes deux la même forme :

```json
{ "due": 2, "dispatched": true, "generated_at": "2026-09-26T05:00:00+00:00" }
```

* `due` : nombre de notifications ayant **au moins un abonné**. C'est le seul
  chiffre qui décrit le foyer, et il ne dépend d'aucun secret.
* `dispatched` : `false` quand `due = 0` — le job n'a appelé personne, ce qui est
  le cas normal sur une stack où personne n'a activé les notifications. Un
  `dispatched: false` malgré un `due > 0` signale, lui, un secret manquant ou
  une Edge Function injoignable.
* Depuis la migration 0019, ces fonctions ne rendent plus les compteurs de
  fenêtre (« semaine », « mois ») : décider de ce qui est dû appartient à
  `public.due_push_notifications()`, et le résumer ici demanderait de faire
  compter deux fois la même chose par deux chemins différents.

Sans ces variables, la fonction échoue explicitement en `500` — elle ne doit
jamais laisser croire à un envoi réussi. La clé publique n'a **pas** à être
ajoutée au frontend : `push-subscribe` la renvoie au navigateur via
`action: 'config'`. C'est un choix, pas une commodité : le bundle est servi en
cache pendant des mois, et une rotation de clé y obligerait à reconstruire et
redéployer le frontend.

**Rotation** : une nouvelle paire invalide les abonnements existants. Le
navigateur conserve un abonnement pour l'ancienne clé, que le service Push
refuse. `app/src/modules/parametres/lib/push.ts` le détecte — il compare
`options.applicationServerKey` à la clé du serveur, résilie l'abonnement
périmé et en crée un nouveau, ce qui évite l'`InvalidStateError` que
`pushManager.subscribe()` lève sur un abonnement existant. Le bouton
« Synchroniser cet appareil » suffit ; sans lui, l'activation resterait cassée
sur tous les appareils ayant déjà activé les notifications.

**Chiffrement** : `push-notify/web-push.ts` applique la RFC 8291 (ECDH P-256,
HKDF, AES-128-GCM) et la RFC 8292 (jeton VAPID ES256). Ce fichier n'utilise que
`globalThis.crypto` : il est donc vérifié par la suite Vitest du frontend
(`npm test`) contre les **vecteurs publiés** de la RFC 8291 — le message
complet de 145 octets, octet pour octet, plus chaque valeur intermédiaire de
l'annexe A. Sans ces vecteurs, la suite ne prouverait que l'auto-cohérence
d'un générateur.

Erreurs attendues : `400` corps invalide, `401` session invalide en mode
`user`, `403` portée réservée au serveur ou test demandé côté serveur, `409`
aucun appareil enregistré, `500` configuration VAPID absente, `503` migration
0019 non appliquée.

---

### 6.6 Valider les chemins d'envoi sur un serveur réel

`0007_push.sql` vérifie la logique des trois chemins sans en produire aucun : ses
assertions s'arrêtent à la frontière HTTP, et c'est délibéré — un envoi réel dans
une transaction annulée n'enverrait rien. La validation se fait donc sur la stack,
et « ça marche » se distingue de « ça a été vérifié » par **ce qui disparaît de
la base**.

Le chemin « Envoyer un test » ne prouve que lui-même : il signe, chiffre et
envoie, mais ne consomme aucun rappel. Les deux chemins qui restent ne sont
validés que par la **disparition de la ligne de rappel** après l'envoi.

#### Le script, et ce qu'il ajoute à la marche manuelle

```sh
sh scripts/test-dispatch-push.sh
```

Il fait toute la marche ci-dessous, et il est **attribuable** : il note le
dernier `net._http_response` *avant* d'appeler le dispatch, donc le rapport
qu'il lit est nécessairement celui de son propre appel. La marche manuelle
laisse la place pour qu'un job `pg_cron` consomme le rappel entre la semure et
l'appel — et le rapport lu est alors celui du job, avec `due = 0` et sans aucune
explication. C'est ce qui est arrivé lors de la première validation : un `200`
portant `consumed: 1`, mais attribuable à personne.

Trois faits sont vérifiés, et chacun échoue seul : `due ≥ 1`, la réponse `200`
avec `consumed: 1`, et la disparition de la ligne. Le troisième est le seul qui
distingue « distribué » de « distribué **et** consommé ».

Il exige un **abonnement réel** : un endpoint de push ne se fabrique pas, et un
endpoint factice serait `dropped` plutôt que `delivered` — un chiffre juste et
une preuve fausse. Les endpoints des suites SQL, qui se terminent par une longue
suite de `a`, sont exclus, et le script s'arrête si aucun abonnement réel
n'existe.

`ATTENTE` (45 s par défaut) borne l'attente de la réponse, pg_net étant
asynchrone.

Le script supprime la tâche qu'il a créée, et il le **vérifie par un comptage** :
une suppression dont on ignore le sort est un succès muet — le script annonce
`OK` et la tâche « Rappel de test push » s'accumule dans la liste de tâches de
quelqu'un, à chaque passage. Le compte fait partie du verdict, donc un nettoyage
raté sort en ÉCHEC et non en silence. En cas de sortie en erreur, le `trap`
nettoie lui aussi et prévient.

Le contrôle de ce nouveau chemin en a été un, et il a refusé le code correct
avant d'être juste : un numéro de ligne employé comme indice de liste, alors
que la liste avait ses commentaires retirés. Un contrôle qui signale un défaut
inexistant n'est pas plus utile qu'un contrôle absent — c'est pire, parce qu'on
apprend à l'ignorer.

#### Un rappel dû maintenant

Le script ci-dessus sème son propre rappel et le supprime en sortie. La marche
manuelle qui suit ne sert qu'au **diagnostic** : quand aucun appareil n'est
abonné, donc quand le script refuse de s'exécuter. Elle est moins bonne que lui
sur un point qui compte : elle n'attribue pas le rapport à son appel, et un job
`pg_cron` peut consommer le rappel entre la semure et l'envoi.

Le formulaire de tâche expose le champ de rappel — `reminderAt` est au schéma
Zod, saisi en `datetime-local`, et `saveTask` appelle `setTaskReminder`. La ligne
ne se crée donc **plus** par SQL en usage normal. La sémure ci-dessous est le
moyen de la créer sans navigateur, en rattachant le rappel à la tâche ouverte la
plus récente pour éviter d'avoir à connaître un identifiant d'utilisateur :

```sh
sh scripts/psql.sh -c "
  insert into public.task_reminders (id, task_id, remind_at)
  select private.new_id('task-reminder'), t.id, now()
    from public.tasks t
   where t.status <> 'fait'
   order by t.created_at desc
   limit 1;"
```

Si la requête ne renvoie rien, le foyer n'a aucune tâche ouverte : en créer une
depuis l'interface d'abord.

#### L'envoi, sans attendre le job

Le job `eo-push-dispatch` passe toutes les quinze minutes. La même fonction
s'appelle directement, ce qui évite l'attente et rend le test déterministe :

```sh
sh scripts/psql.sh -c "select private.dispatch_push_notifications();"
```

Trois lectures, et une seule compte :

| Résultat | Lecture |
|---|---|
| `due = 0` | aucune notification n'a d'abonné, ou aucun rappel n'est dans la fenêtre de 24 h |
| `due = 1`, `dispatched = true`, **la ligne a disparu** | le chemin est validé, consommation comprise |
| `due = 1`, `dispatched = true`, **la ligne est toujours là** | l'envoi est passé mais la consommation non : `consume_push_reminders` n'a rien supprimé, et le même rappel reviendra au prochain passage |
| `due = 1`, `dispatched = false` | un secret manque dans Vault, ou l'Edge Function est injoignable — `sh scripts/set-push-secrets.sh --check` |

**`dispatched = true` ne veut pas dire « distribué ».** La valeur signifie que
`net.http_post` a été **mis en file d'attente** par pg_net, et rien de plus.
L'envoi se fait ensuite, dans un tour de boucle : la base ne fait qu'appeler
`push-notify`, et c'est l'Edge Function qui chiffre, envoie, puis appelle
`consume_push_reminders`. La ligne de rappel disparaît donc **après** la
commande, pas pendant.

Vérifier trop tôt lit donc un faux échec. Attendre, puis vérifier :

```sh
sleep 20
sh scripts/psql.sh -c "select count(*) from public.task_reminders;"
```

C'est aussi pour cela que la **disparition** est le seul contrôle qui compte :
elle ne peut venir que de l'Edge Function, donc elle prouve que toute la boucle
s'est refermée. Un `dispatched = true` sans elle ne prouve que la moitié — que
la base a su appeler sa propre fonction.

Et le rapport de livraison se lit dans `net._http_response`, **pas dans les
logs du conteneur** :

```sh
sh scripts/psql.sh -c "
  select id, status_code, content
    from net._http_response
   order by id desc
   limit 2;"
```

C'est une correction d'une consigne antérieure, qui renvoyait à
`docker compose logs functions`. Ces logs ne contiennent que des lignes du
runtime — `serving the request with …` — et la ligne journalisée par
`push-notify` n'y apparaît pas. `net._http_response` conserve le **corps** de la
réponse, rapport complet : c'est le seul endroit où `{ notifications, delivered,
failed, dropped, consumed }` est lisible. C'est ce `consumed` qui doit valoir 1,
et c'est aussi ce qui permet de voir un `401 UNUSABLE_CREDENTIAL` après coup,
longtemps après que la cause a disparu des logs.

Les `401` archivés dans cette table valent d'ailleurs de la documentation : le
premier corps dit `received: {authorization: "api-key", apikey: "absent"}`, ce
qui nomme la faute sans qu'on ait à la déduire.

#### Le chemin anniversaires

La source filtre sur `days_until = 0`, ce qui vaut **toute la journée** du
24 décembre au 1er janvier : il n'y a pas de fenêtre d'une minute. Le job
`eo-birthday-alerts` passe à 06 h 40, et c'est donc le matin qu'un anniversaire du
jour est annoncé. Le valider suppose d'insérer un anniversaire daté du jour,
puis d'appeler `private.dispatch_birthday_alerts()`.

Le message se comporte comme un rappel, avec une différence qui n'est pas
dérisoire : **rien n'est consommé.** `consume_push_reminders` ne connaît que
`tache`, `evenement` et `routine`, et un anniversaire n'a pas de ligne à
supprimer puisqu'il est recalculé chaque matin. Une relance manuelle le
réannoncera donc, ce qui est le comportement voulu — mais c'est aussi pourquoi ce
chemin ne peut pas être validé par la disparition d'une ligne, et il faut le
vérifier autrement.


## 7. Tâches planifiées (pg_cron)

```bash
docker compose exec db psql -U postgres -c "select jobid, jobname, schedule, database, active from cron.job order by jobname;"
docker compose exec db psql -U postgres -c "select jobid, run_time, status, return_message from cron.job_run_details order by run_time desc limit 20;"
```

| Job | Horaire | Effet |
|---|---|---|
| `eo-routine-maintenance` | `5 6 * * *` | génère les occurrences dues (14 derniers jours → aujourd'hui) et escalade en `manque` celles de plus de 7 jours |
| `eo-invite-token-prune` | `20 6 * * *` | désactive les tokens expirés ou épuisés |
| `eo-birthday-alerts` | `40 6 * * *` | annonce les anniversaires **du jour** de chaque foyer |
| `eo-push-dispatch` | `*/15 * * * *` | distribue les rappels de tâche, d'événement et de routine dus |
| `eo-push-prune` | `30 6 * * *` | supprime les abonnements push sans envoi réussi depuis six mois |

Points de conception :

* **Fuseau** : toutes les dates sont calculées en `Europe/Paris`
  (`now() at time zone 'Europe/Paris'`), jamais via le fuseau du conteneur. La
  planification est donc indépendante de la configuration système.
* **`database_name` explicite** : les jobs sont installés avec
  `cron.schedule_in_database(..., current_database())`. Si `POSTGRES_DB` change,
  relancez `sh scripts/migrate.sh` : la migration désinstalle puis réinstalle
  les jobs, elle est idempotente.
* **Un job n'appelle qu'une fonction privée sans paramètre** : c'est une
  contrainte vérifiée par `supabase/tests/0004_cron.sql`. Toute logique,
  y compris la lecture de secrets, reste dans la fonction.
* **Aucun secret en clair** dans `cron.job.command`. Les deux dispatches Web
  Push lisent `project_url` et `service_role_key` dans Vault **au moment de
  l'exécution**, via `private.post_push_dispatch()`. Ils n'appellent la fonction
  d'envoi que s'il y a des destinataires : sans cela, la stack se réveillerait
  quatre fois par heure pour rien.
* **Un seul point d'entrée d'envoi** : `functions/v1/push-notify`, avec un
  `scope` (`rappels` ou `anniversaires`). Deux fonctions d'envoi, ce serait deux
  déploiements à tenir alignés et deux jeux de secrets.
* `private.dispatch_daily_notifications()` (migration 0011) pointait vers une
  fonction `daily-briefing` qui n'a jamais existé, et plus aucun job ne l'appelle
  : `0011` avait créé la fonction sans programmer le job. La migration **0021**
  la fait déléguer à `private.dispatch_push_notifications()`, qui est le même
  travail sous son nom actuel. Le corps n'est donc écrit qu'une fois, l'ancien
  nom continue de fonctionner, et l'endpoint fantôme a disparu du dépôt.
  `supabase/tests/0004_cron.sql` vérifie les deux moitiés : elle délègue, et elle
  ne référence plus `daily-briefing`.
* Si `pg_cron` n'est pas installé sur l'image, la migration émet un `notice` et
  s'arrête proprement : le schéma reste déployable.

### Une notification, une fois

Un rappel est une ligne de `task_reminders`, `event_reminders` ou
`routine_reminders`. Deux garde-fous, distincts, et tous deux nécessaires :

* la **fenêtre** `(maintenant − 24 h, maintenant]` borne ce qui est encore
  pertinent : au-delà, le rappel est caduc ; en deçà, un job raté est rattrapé.
  Les fenêtres de deux passages consécutifs se recouvrent volontairement ;
* l'**unicité** vient de la suppression de la ligne dès qu'un envoi a réussi
  (`public.consume_push_reminders`). Un rappel dont aucun appareil n'a pu le
  recevoir reste en place, et sera tenté au passage suivant.

La fréquence du job (quinze minutes) et la granularité d'un rappel (de l'ordre
de la minute) sont les deux seules constantes du dimensionnement.

### Sous-ensemble RRULE supporté

`private.rrule_day_matches()` implémente `FREQ` `DAILY` / `WEEKLY` / `MONTHLY` /
`YEARLY`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` et `BYMONTHDAY`. Les autres
clés (`BYSETPOS`, `BYMONTH`, `WKST`, les composantes horaires) ne sont pas gérées
et la journée correspondante est ignorée. Le moteur de référence reste
`rrule.js` côté client : la base ne matérialise que les occurrences dues, sur une
fenêtre glissante.

---

## 8. Ardoise : soldes et compensation

`AGENTS.md` §2.2 impose que le solde soit calculé **côté serveur**. Deux
fonctions portent cette responsabilité, volontairement hors de `public` et
inaccessibles au client (`service_role` uniquement) :

* `private.household_balances(household_id)` — pour chaque membre, le total
  avancé, le total de ses parts et son solde (positif = le foyer lui doit).
  La somme des soldes d'un foyer est toujours nulle. Une dépense sans aucune
  part est imputée en totalité à son payeur, et ne crée donc aucune dette.
* `private.simplify_household_debts(household_id)` — réduit les sommes croisées
  à un **nombre minimal de transferts**, par glissement des deux plus grands
  soldes, avec une tolérance d'arrondi au centime.

L'intégrité de la répartition est garantie par le schéma et par la base, pas par
le client :

* `expense_participants` impose `membre` ⇒ `member_id` rempli et
  `external_participant_id` nul, et l'inverse pour `externe` ;
* un déclencheur vérifie que le membre **et** le participant externe
  appartiennent au foyer de la dépense ;
* une contrainte **différée** vérifie que la somme des parts correspond au
  montant de la dépense, ce qui permet au client d'insérer la dépense puis ses
  participants dans une même transaction, sans ordre imposé.

Ces trois règles, ainsi que le pont serveur et le contrat de réponse, sont
couvertes par `supabase/tests/0005_ardoise.sql`.

L'algorithme de compensation n'est réimplémenté nulle part ailleurs : la SQL est
l'unique référence, testable sans backend. L'exposition au client passe par
l'Edge Function `expense-settlement` (§6.2), qui appelle
`public.expense_settlement()` (migration 0013) : revérification de l'appartenance
en base, puis agrégat JSON des soldes et des transferts. Le pont est
`SECURITY DEFINER`, son `EXECUTE` n'est accordé qu'à `service_role`, et
`authenticated` ne peut ni l'appeler ni lire les fonctions privées.

> Le frontend calcule encore ses soldes **localement**
> (`app/src/modules/ardoise/types.ts`) : le basculement vers la fonction serveur
> est un travail frontend, à faire avant la mise en production. Tant que ce
> n'est pas fait, l'affichage peut diverger du serveur — voir §13.

---

## 9. Stockage

Deux buckets privés, créés par la migration :

| Bucket | Contenu | Limite |
|---|---|---|
| `household-media` | photos et vidéos du foyer | 25 Mo, images + mp4/mov |
| `household-avatars` | avatars de membres | 2 Mo, images |

Le premier segment du chemin est l'identifiant du foyer
(`<household_id>/<dossier>/<fichier>`). Les politiques `storage.objects` vérifient
l'appartenance avant tout accès ; la suppression exige le rôle `admin` du foyer.
Aucun bucket média public n'est justifié, donc aucun n'existe.

---

## 10. Tests SQL

Sept suites numérotées, exécutées dans l'ordre :

```bash
sh scripts/test-db.sh            # tout
sh scripts/test-db.sh 0007       # un fichier
```

`_setup.sql` installe un schéma `testkit` éphémère (fixtures `auth.users`,
foyers, membres, assertions) ; chaque fichier numéroté tourne dans **sa propre
transaction annulée en fin de fichier** ; `_teardown.sql` retire `testkit`. La
campagne laisse la base **à l'identique** et peut être rejouée sur une base de
développement comme en préproduction.

Les contrôles d'écriture combinent deux outils, car une ligne filtrée par la
RLS ne lève pas d'erreur : elle n'est simplement pas visible.

* `testkit.expect_denied(sql)` — l'instruction **doit** échouer (violation de
  `WITH CHECK`, contrainte, privilège). Utilisé pour les `INSERT`.
* `testkit.affected(sql)` — nombre de lignes touchées, qui doit valoir `0`.
  Utilisé pour les `UPDATE` et `DELETE` filtrés.

| Fichier | Couverture |
|---|---|
| `0001_schema_contract.sql` | les 41 tables du contrat `database.ts` avec exactement leurs colonnes, RLS active partout, clé primaire ou unicité partout, déclencheurs d'alignement présents, tables inatteignables (`household_invite_tokens`, `push_subscriptions`) sans politique **ni privilège**, fonctions serveur non exécutables par un client, profil créé par le trigger et préférences de rappel lui appartenant, buckets privés |
| `0002_rls_isolation.sql` | lecture et écriture inter-foyers, escalade de rôle, dernier administrateur, rôle `enfant` en lecture seule, accès dérivés du parent, intégrité des références de membre et des `household_id` dénormalisés, visibilité des listes privées et partagées, widgets personnels, profils sans liste globale, `anon` sans accès |
| `0003_invites.sql` | cycle de vie complet des tokens : empreintes 64 hex, jamais de token brut en base, régénération, révocation, expiration, plafond 90 jours, `max_uses`, idempotence, rôle `admin` refusé, refus des non-administrateurs, comparaison à temps constant |
| `0004_cron.sql` | prédicat RRULE, génération idempotente des occurrences, escalade en `manque`, protection des occurrences validées, présence des **cinq** jobs et de leurs horaires, `database_name` courant, absence de secret (y compris VAPID) dans `cron.job.command`, job n'appelant qu'une fonction privée sans paramètre, point d'entrée d'envoi unique |
| `0005_ardoise.sql` | soldes par membre, somme des soldes nulle, compensation minimale des dettes, intégrité de la répartition (somme des parts, participant externe rattaché au même foyer), pont `public.expense_settlement` (contrat de réponse, acteur non membre refusé, privilèges `service_role` uniquement) |
| `0006_birthdays.sql` | prochaine occurrence d'un anniversaire (29 février compris), périmètre « mois + 7 jours », isolation entre foyers, job `eo-birthday-alerts` planifié sur la base courante sans secret, privilèges `service_role` uniquement |
| `0007_push.sql` | `push_subscriptions` inaccessible au client **et** aux fonctions serveur pour un client, enregistrement / renouvellement / transfert d'un endpoint, révocation par son seul propriétaire, clés de chiffrement absentes des réponses, fenêtre de 24 h, destinataires par type de rappel, préférences appliquées, message de test produit par la base, consommation sans doublon, `404`/`410` supprimant l'abonnement, seuil d'échecs, purge des inactifs, jobs inoffensifs sans destinataire |

> Les jobs sont également couverts par les contrôles génériques de
> `0004_cron.sql` (`database_name` courant, commande sans secret, appel d'une
> fonction privée sans paramètre).

### 10.1 Contrôles statiques, avant la base

```bash
python3 scripts/check-sql-statique.py            # migrations et tests
python3 scripts/check-sql-statique.py 0019       # un seul fichier
```

Cette campagne ne remplace pas `test-db.sh` : elle ne connaît pas le schéma, et
ne remplacera jamais un test exécuté. Elle existe parce que cinq défauts de la
même famille ont franchi la migration, le test de contrat **et** la relecture,
pour n'échouer qu'à la première exécution :

| Défaut | Ce que PostgreSQL disait |
|---|---|
| CTE nommé `window` | `syntax error at or near "window"` |
| liste de colonnes sur un appel de fonction | `a column definition list is only allowed for functions returning record` |
| tables non qualifiées sous `search_path = ''` | `relation "task_reminders" does not exist` |
| CTE nommé comme la table qu'il sélectionne | `recursive reference to query "tasks" must not appear within a non-recursive CTE` |
| colonne de sortie de `returns table` référencée sans qualification | `column reference "user_id" is ambiguous` |

Aucun n'est visible à la création : `create function` enregistre le corps sans
l'exécuter, et une migration appliquée n'est plus réécrite. Le contrôle vérifie
donc la **définition effective** de chaque fonction — la dernière, celle que la
base contient — et signale sans les condamner les définitions dépassées, qui
restent au dépôt avec leur code fautif.

Le dernier mérite d'être lu deux fois. `returns table (user_id uuid, …)` ne
décrit pas seulement le résultat : en PL/pgSQL, ces colonnes sont des
**variables**. Une référence non qualifiée est donc un conflit, et ses deux
issues sont mauvaises — PostgreSQL refuse si deux tables fournissent la colonne,
et si une seule le fait, plpgsql lui substitue la variable, qui vaut `NULL` dans
une fonction renvoyant un ensemble. Le second cas ne lève aucune erreur et
renvoie des lignes vides : seule une assertion sur le **contenu** des lignes peut
le voir.

Quatre vérifications sur les migrations, deux sur les tests : aucun nom de table
non qualifié sous un `search_path` vide, aucun CTE qui se rejoint lui-même,
aucun littéral laissé ouvert en fin de ligne, aucune référence non qualifiée à
une colonne de `returns table`, les deux valeurs comparées par `testkit.eq` du
même type, et aucune variable plpgsql dans une chaîne SQL exécutée par
`testkit.count()` ou ses voisins.

Les deux derniers méritent d'être lus. `returns table` ne décrit pas
seulement le résultat : en PL/pgSQL, ses colonnes sont des **variables** (voir
plus haut). Et `testkit.eq` est `eq(anyelement, anyelement, text)` : les deux
valeurs doivent être du même type, or `testkit.count()` renvoie `bigint` et une
variable déclarée `integer` est acceptée **à l'affectation** sans bruit. Le
défaut n'apparaît qu'à la comparaison, sous la forme « function
testkit.eq(bigint, integer, unknown) does not exist » — un message qui ne parle
ni de l'assertion ni de ce qu'elle vérifie.

Deux points de méthode, appris à l'usage. Le contrôle sur `returns table` ne
vise que `language plpgsql` : en `language sql`, ces colonnes ne sont que des
noms, il n'y a pas de variable, donc pas de risque. Signaler là-dessus
condamnerait du code qui fonctionne — et un contrôle qui condamne du code testé
vaut moins que pas de contrôle, parce qu'on apprend à l'ignorer. Et pour le même
motif, le contrôleur ne conclut que sur les types qu'il peut déterminer avec
certitude : un littéral s'accorde sur l'autre argument, donc il ne peut pas être
la cause d'un conflit, et le silence vaut mieux qu'une devinette.

Un mot sur le dernier piège, rencontré en chemin : un `$nom$` utilisé comme
espace réservé dans une chaîne entre en collision avec la syntaxe de
dollar-quoting de PostgreSQL, et un guillemet fermant mal placé produit une
erreur qui désigne le `$` de la variable au lieu du guillemet qui manque.

Reste le sixième contrôle, qui a valu quatre corrections d'un coup :
`testkit.count('select … where user_id = v_alice')` se lit comme du SQL
ordinaire — le texte est sur une seule ligne — mais `testkit.count` l'exécute
par `execute` **dans son propre corps**, et `v_alice` n'y est pas déclaré.
PostgreSQL répond « column "v_alice" does not exist », en nommant une variable
déclarée trois lignes plus haut. La forme correcte est un sous-requête
paramétré, `(select count(*) from … where col = v_x)`, qui laisse plpgsql
résoudre la variable. `format('… %L …', v_x)` est en revanche la bonne façon de
faire : il produit un littéral, et c'est précisément ce que ces tests veulent.

---

## 11. Sauvegarde et restauration

```bash
sh scripts/backup.sh                                   # instantané cohérent
BACKUP_DIR=/srv/backups/eo sh scripts/backup.sh        # ailleurs
sh scripts/restore.sh 20260925T060000Z --dry-run       # vérifie l'intégrité
sh scripts/restore.sh 20260925T060000Z --confirm       # restauration réelle
```

`backup.sh` produit, dans un répertoire horodaté :

* `database.dump` — `pg_dump --format=custom`, instantané cohérent même à chaud ;
* `storage.tar.gz` — les objets stockés ;
* `db-config.tar.gz` — **clé pgsodium et configuration PostgreSQL**, à
  sauvegarder avec la base : sans elle, la clé de chiffrement des secrets Vault
  est perdue ;
* `SHA256SUMS` — empreintes de contrôle.

`restore.sh` refuse de s'exécuter sans `--confirm` et `--dry-run` permet de
valider le manifest sans rien modifier.

Ré rehearser au moins une restauration complète par trimestre, sur un hôte
distinct. Une copie à chaud n'est pas une sauvegarde cohérente ; les RTO/RPO et
la rétention restent à trancher (`AGENTS.md` §9.6).

---

## 12. Exploitation courante

```bash
sh run.sh start | stop | restart
sh run.sh logs <service>
sh run.sh recreate <service>          # après une modification de .env
sh run.sh config add traefik

cd supabase-project
sh ../scripts/migrate.sh --status
sh ../scripts/test-db.sh
sh ../scripts/deploy-functions.sh --list
sh ../scripts/deploy-functions.sh      # après toute modification de supabase/functions

docker compose exec db psql -U postgres -c "\dt public.*"
docker compose exec db psql -U postgres -c "select * from cron.job_run_details order by run_time desc limit 10;"
```

Ordre de mise en production des fonctions : `migrate.sh` (les RPC
`public.expense_settlement` et `public.routine_maintenance` doivent exister),
puis `deploy-functions.sh` (sans quoi les endpoints répondent 404), puis
`sh run.sh recreate functions` si l'environnement a changé.

À surveiller : santé des conteneurs, requêtes Realtime, erreurs des Edge
Functions, espace disque, expiration des certificats, résultat de
`cron.job_run_details`.

---

## 13. Limites connues et points ouverts

* **Identifiants `text`** : conséquence du générateur d'identifiants du
  frontend. Le jour où celui-ci produit des `uuid`, une migration peut revenir à
  des `uuid` — mais c'est un changement hors périmètre ici.
* **`useResource()` et tables enfants** : le hook ajoute toujours un filtre
  `household_id`. Sur les sept tables qui n'en portent pas, il faut passer par
  `useQuery` + `data.list` avec un filtre parent (voir `AGENTS.md` §2.6).
* **`create`, `revoke`, `summary` avec plusieurs foyers** : si l'utilisateur
  appartient à plusieurs foyers, la fonction exige `householdId` dans le corps
  et répond `409` sinon. Le client (`app/src/lib/invites.ts`) ne l'envoie pas
  aujourd'hui : il faut ajouter `householdId` à ces trois appels côté frontend.
* **Notifications Web Push** : la chaîne est **exécutée pour de vrai** depuis le
  26 septembre 2026. Le chemin « Envoyer un test » a été validé sur un appareil
  réel, ce qui prouve la paire VAPID, l'abonnement, le chiffrement RFC 8291 et
  l'acceptation de la signature par le service Push. Le chemin des rappels
  (`eo-push-dispatch`) est **validé par un envoi réel, consommation comprise**.
  Le rapport conservé vaut
  `{ notifications: 1, delivered: 1, failed: 0, dropped: 0, consumed: 1 }`, et la
  ligne de rappel a disparu de `public.task_reminders`. C'est ce second fait qui établit que
  `consume_push_reminders` supprime bien, donc qu'un rappel ne reviendra pas
  quatre fois par heure. La validation est reproductible par
  `sh scripts/test-dispatch-push.sh`, qui sème son propre rappel et attribue le
  rapport à son appel (§6.6).

  Reste non validé par un envoi réel, et vérifié uniquement par `0007_push.sql` :
  * le chemin des anniversaires (`eo-birthday-alerts`, chaque matin) — et il ne
    peut pas l'être par disparition de ligne, puisqu'un anniversaire n'a rien à
    consommer (§6.6).

  La marche à suivre pour le chemin restant est en §6.6.

* **Ce qui n'a jamais été exercé par un humain** : la chaîne est vérifiée de bout
  en bout par le code et par `test-dispatch-push.sh`, et le formulaire de tâche
  expose bien le champ de rappel — `reminderAt` au schéma Zod, saisie en
  `datetime-local`, `saveTask` appelant `setTaskReminder`, et
  `removeTask` nettoyant au passage. Ce qui n'a jamais eu lieu, c'est une
  personne qui crée un rappel dans l'interface, reçoit la notification et clique
  dessus. Le `notificationclick` du service worker est écrit et relu, jamais
  exécuté. Un chemin dont chaque maillon est vérifié peut encore ne pas
  s'emboîter : c'est le genre de fait que seule une main sur la souris établit,
  et il ne se déduit pas des tests.
* **Cadence des rappels** : `profiles.reminder_frequency` est enregistrée et
  affichée, mais **aucun envoi ne s'y conforme**. Les rappels sont unitaires,
  donc toujours immédiats ; la cadence ne pourra être appliquée qu'à un point de
  synthèse quotidien, qui n'existe pas. L'interface le dit explicitement plutôt
  que de présenter un réglage sans effet.
* **Annonces d'anniversaire** : la push n'annonce un anniversaire que **le jour
  même**. L'alerte « anniversaires du mois » demandée par `AGENTS.md` §6 reste
  un état d'interface du module `/anniversaires`, pas une notification.
* **Limitation de débit** de `redeem` : par instance, à remplacer par un
  compteur partagé si le service est répliqué.
* **Solde de l'Ardoise** : calculé par `private.household_balances()` et
  `private.simplify_household_debts()`, exposés au client par l'Edge Function
  `expense-settlement` (§6.2). Le frontend **calcule encore ses soldes
  localement** : il faut le brancher sur la fonction serveur avant la mise en
  production, sinon deux vérités coexistent. C'est un choix assumé : **le client
  ne doit jamais recalculer un solde**, sinon l'affichage divergerait de la
  vérité serveur.
* **Déclenchement manuel des routines** : `generate-routine-occurrences`
  accepte le mode `user` pour un administrateur, mais aucun écran ne l'appelle
  encore ; la maintenance quotidienne est assurée par le job `pg_cron`.
* **Messagerie** : périmètre réduit (conversations de foyer ou direct), sans
  accusés de lecture ni pièces jointes — voir `AGENTS.md` §9.1.
* **Un seul jeu de migrations** : `supabase/migrations` a fait l'objet de deux
  implémentations parallèles inconciliables (mêmes tables, noms de tables privés
  différents). Elles ont été consolidées en une seule séquence, car deux jeux
  rendant `migrate.sh` inapplicable. Ce qui a été
  conservé de la seconde implémentation est listé ci-dessous ; ce qui a été
  retiré devra être réécrit si on le souhaite :
  * conservé : l'algorithme de compensation des dettes, porté dans
    `private.simplify_household_debts()` (migration 0006) et testé ;
  * conservé : la validation Zod et la limitation de débit par action de l'Edge
    Function `household-invite` ;
  * réécrit : l'Edge Function `expense-settlement` existe désormais, mais elle
    n'expose **plus** de fonction `public.simplify_debts` calculant la dette
    côté client. Elle appelle `private.simplify_household_debts()` à travers le
    pont `service_role` `public.expense_settlement()` (migration 0013) : la
    logique reste unique, en base, et l'appelant est revérifié membre du foyer ;
  * réécrit : l'Edge Function `generate-routine-occurrences` n'est plus un
    aller-retour HTTP dans le chemin nominal — le job `eo-routine-maintenance`
    appelle toujours la SQL directement. La fonction sert au déclenchement
    manuel (mode `user`, administrateur) et à la supervision, en renvoyant le
    même résumé ;
  * toujours retiré : une table `notifications` (absente de
    `app/src/types/database.ts`) et la suite `supabase/tests/rls.sql` (elle
    visait le schéma retiré `app_private` et doublonnait
    `0002_rls_isolation.sql`).
