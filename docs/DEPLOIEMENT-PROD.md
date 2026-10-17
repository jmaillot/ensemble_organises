# Publier une nouvelle `main` en production

Séquence ordonnée pour porter une pile auto-hébergée **déjà en service** au
commit courant de `main` : appliquer les migrations, recharger les Edge
Functions, reconstruire le frontend.

Le *pourquoi* et l'architecture sont dans `AGENTS.md` §8 ; ce document est la
**marche à suivre opérateur**. En cas de divergence entre les deux, ce sont les
**scripts du dépôt** qui font foi : cette page les appelle, elle ne les
réécrit pas.

## Ce que ce runbook n'est pas

- Il ne couvre pas le **premier** déploiement d'une pile (bootstrap, génération
  des secrets, création du réseau externe `frontend`) : voir `AGENTS.md` §8.1.
- Il ne **prouve** pas le comportement des Edge déployées : le seul contrôle
  automatique qui les touche est `scripts/smoke-functions-serveur.sh`, qui passe
  par le réseau et une session réelle. Le reste se lit, il ne s'exécute pas ici.

## Pré-requis

- `main` est poussée et la chaîne locale est verte (`AGENTS.md` §2.7).
- Docker Compose **≥ 2.24.4** (les tags `!override` de l'override Traefik en
  dépendent).
- Le réseau externe `frontend` existe et est attaché à Traefik.
- `supabase-project/.env` est provisionné (secrets générés par les scripts
  officiels, jamais versionnés) et `.env.app` porte `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` de **cet** environnement.
- L'override Traefik est enregistré une fois pour toutes :
  `sh run.sh config add traefik` (depuis `supabase-project/`).

## 0. Sauvegarder avant de toucher à la pile

Une migration qui s'applique **ne se rejoue pas en arrière** (`AGENTS.md`
§2.7 A : on corrige vers l'avant). La sauvegarde est donc le seul retour
arrière réel pour les données.

```sh
# Phrase secrète de chiffrement : fichier 600, jamais versionné.
BACKUP_PASSPHRASE_FILE=supabase-project/.backup-passphrase sh scripts/backup.sh
```

`backup.sh` produit un `pg_dump` custom (instantané cohérent sur base active),
les objets Storage et le volume `db-config` (clé pgsodium). Vérifier que la
sauvegarde annoncée existe et est non vide **avant** de continuer.

```
Point de contrôle : le chemin de la sauvegarde est affiché et le fichier
                    est présent, de taille non nulle.
```

## 1. Base de données

```sh
cd supabase-project
sh run.sh start db          # uniquement le service db, sans route publique
sh ../scripts/migrate.sh
```

`migrate.sh` applique les fichiers de `supabase/migrations` dans l'ordre
lexicographique, une transaction par migration, et **ignore** celles déjà
journalisées — il est idempotent, on peut le relancer sans risque.

```
Point de contrôle : sh ../scripts/migrate.sh --status  nomme la dernière
                    migration attendue (aujourd'hui 0128) comme appliquée,
                    et n'annonce aucune migration en échec.
```

## 2. Edge Functions

Les fonctions métier vivent dans `supabase/functions` ; `deploy-functions.sh`
les copie dans le runtime épinglé **sans** remplacer les répertoires
fournisseurs (`main`, `hello`), et retire les anciennes fonctions métier
obsolètes.

```sh
sh ../scripts/deploy-functions.sh
sh run.sh recreate functions      # l'environnement est figé à la création
```

Le `recreate` est obligatoire : le service `functions` lit `SMTP_*` et les
secrets d'environnement **à sa création**, pas à chaud.

La copie n'a d'effet qu'au `recreate` : on la place **après** les migrations
pour qu'une Edge neuve ne démarre jamais avant le schéma qu'elle attend
(`AGENTS.md` §8.3 copie d'abord, mais il ne lance alors que des transitions de
fichiers — l'ordre effectif reste migrations puis rechargement).

```
Point de contrôle : sh run.sh logs functions  ne montre pas d'erreur de
                    démarrage, et les fonctions copiées sont bien listées.
```

## 3. Pile complète

```sh
sh run.sh start
```

```
Point de contrôle : sh ../scripts/check-hosts.sh   (les hôtes publiés par
                    Traefik correspondent à SITE_URL / API_EXTERNAL_URL)
                    sh ../scripts/smoke-test.sh    (la chaîne JWT réelle,
                    que la suite SQL ne peut pas prouver)
```

## 4. Frontend

Le build Vite **incorpore** l'URL et la clé publiable : elles sont passées comme
`ARG` à l'image, pas comme variables de conteneur. Un déploiement frontend
signifie donc **reconstruire**, pas redémarrer.

```sh
cd ..
docker compose --env-file .env.app -f compose.app.yaml config      # vérifier l'interpolation
docker compose --env-file .env.app -f compose.app.yaml up -d --wait
```

```
Point de contrôle : la page d'accueil se charge en HTTPS, le manifeste et le
                    service worker sont servis avec `Cache-Control: no-cache`
                    (l'app installée doit voir la nouvelle version).
```

## 5. Contrôles finaux (si le lot les touche)

```sh
# Edge serveur, session réelle — inclut gift-list-invite (oracle uniforme) :
API=https://api.<domaine> PUBLISHABLE_KEY=sb_publishable_… \
  SECRET_KEY=sb_secret_… sh scripts/smoke-functions-serveur.sh

# Secrets push dans Vault (les jobs pg_cron les lisent) :
sh scripts/set-push-secrets.sh --check
```

- `FUNCTIONS_VERIFY_JWT=false` reste en place : l'autorisation repose sur la clé
  publiable, le JWT et les RLS, chaque fonction déclarant son mode
  (`auth: 'publishable' | 'user' | 'secret' | 'none'`).
- La route API ne porte **aucun** middleware d'authentification Traefik ; un
  middleware de session devant `api-gw` bloquerait l'application.

## Retour arrière

| Élément | Procédure |
|---|---|
| Frontend | Reconstruire l'image au commit précédent (`git checkout <sha> -- app` puis rebuild), ou `up -d` sur l'image précédente si elle est conservée. |
| Edge Functions | Redéployer les fonctions du commit précédent (`deploy-functions.sh` + `recreate functions`). |
| Migrations | **Pas de retour arrière.** Corriger vers l'avant dans une **nouvelle** migration (`AGENTS.md` §2.7 A) ; ne jamais réécrire une migration appliquée. |
| Données | `sh scripts/restore.sh <sauvegarde> --dry-run` pour inspecter, puis `--confirm`. La cible est **irréversible** : restaurer remplace les données et les volumes. |

## Après le déploiement

- Rejouer la chaîne locale sur le commit déployé et noter le SHA dans l'entrée
  de suivi (`.planning/STATE.md`).
- Les étapes **M-01** (preuve push prod) et **M-02** (clés VAPID en production)
  se jouent à ce moment-là ; leur checklist est dans `docs/PWA.md`
  (« Exploitation push — checklist opérateur »).
