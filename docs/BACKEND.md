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

Trois fonctions métier, toutes versionnées dans `supabase/functions` et
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

---

## 7. Tâches planifiées (pg_cron)

```bash
docker compose exec db psql -U postgres -c "select jobid, jobname, schedule, database, active from cron.job order by jobname;"
docker compose exec db psql -U postgres -c "select jobid, run_time, status, return_message from cron.job_run_details order by run_time desc limit 20;"
```

| Job | Horaire | Effet |
|---|---|---|
| `eo-routine-maintenance` | `5 6 * * *` | génère les occurrences dues (14 derniers jours → aujourd'hui) et escalade en `manque` celles de plus de 7 jours |
| `eo-birthday-alerts` | `40 6 * * *` | calcule les anniversaires du mois et des 7 prochains jours de chaque foyer |
| `eo-invite-token-prune` | `20 6 * * *` | désactive les tokens expirés ou épuisés |

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
* **Aucun secret en clair** dans `cron.job.command`. Le dispatch des
  notifications (Web Push) lit `project_url` et `service_role_key` dans Vault au
  moment de l'exécution, via `private.dispatch_daily_notifications()`. Cette
  fonction **n'est pas encore planifiée** : elle attend l'endpoint
  `functions/v1/daily-briefing` et la table d'abonnements Web Push, qui n'existe
  pas. Le modèle est en place, l'activation est une décision produit.
* Si `pg_cron` n'est pas installé sur l'image, la migration émet un `notice` et
  s'arrête proprement : le schéma reste déployable.

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

```bash
sh scripts/test-db.sh            # tout
sh scripts/test-db.sh 0003       # un fichier
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
| `0001_schema_contract.sql` | les 40 tables du contrat `database.ts` avec exactement leurs colonnes, RLS active partout, clé primaire ou unicité partout, déclencheurs d'alignement présents, `household_invite_tokens` inaccessible, fonctions serveur non exécutables par un client, profil créé par le trigger, buckets privés |
| `0002_rls_isolation.sql` | lecture et écriture inter-foyers, escalade de rôle, dernier administrateur, rôle `enfant` en lecture seule, accès dérivés du parent, intégrité des références de membre et des `household_id` dénormalisés, visibilité des listes privées et partagées, widgets personnels, profils sans liste globale, `anon` sans accès |
| `0003_invites.sql` | cycle de vie complet des tokens : empreintes 64 hex, jamais de token brut en base, régénération, révocation, expiration, plafond 90 jours, `max_uses`, idempotence, rôle `admin` refusé, refus des non-administrateurs, comparaison à temps constant |
| `0004_cron.sql` | prédicat RRULE, génération idempotente des occurrences, escalade en `manque`, protection des occurrences validées, présence des deux jobs historiques, `database_name` courant, absence de secret dans `cron.job.command`, job n'appelant qu'une fonction privée sans paramètre |
| `0005_ardoise.sql` | soldes par membre, somme des soldes nulle, compensation minimale des dettes, intégrité de la répartition (somme des parts, participant externe rattaché au même foyer), pont `public.expense_settlement` (contrat de réponse, acteur non membre refusé, privilèges `service_role` uniquement) |
| `0006_birthdays.sql` | prochaine occurrence d'un anniversaire (29 février compris), périmètre « mois + 7 jours », isolation entre foyers, résumé du dispatch sans envoi tant que l'endpoint n'existe pas, job `eo-birthday-alerts` planifié sur la base courante sans secret, privilèges `service_role` uniquement |

> Le job `eo-birthday-alerts` est également couvert par les contrôles
> génériques de `0004_cron.sql` (`database_name` courant, commande sans secret,
> appel d'une fonction privée sans paramètre).

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
* **Notifications Web Push** : `private.dispatch_daily_notifications()` est prête
  mais non planifiée ; il manque la table d'abonnements et l'endpoint
  `daily-briefing`. Les alertes d'anniversaires, elles, sont **calculées et
  planifiées** (`eo-birthday-alerts`, migration 0012) mais rien n'est envoyé :
  `private.dispatch_birthday_alerts()` ne distribue que si `push_endpoint` et
  `service_role_key` sont présents dans Vault, ce qui suppose l'Edge Function
  `birthday-alerts`, qui n'existe pas encore.
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
