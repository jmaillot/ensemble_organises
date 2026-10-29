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

Le build Vite **incorpore** l'URL, la clé publiable et l'estampille : elles sont
passées comme `ARG` à l'image, pas comme variables de conteneur. Un déploiement
frontend signifie donc **reconstruire**, pas redémarrer.

```sh
cd ..
# Deux moitiés, chacune indispensable :
#  * GIT_SHA vient du SHELL — Compose n'exécute pas les substitutions shell
#    (un `$(git …)` dans compose.app.yaml passerait littéralement), et la
#    variable du shell l'emporte sur le --env-file ;
#  * --build — sans lui, `up -d` ne reconstruit rien, ni à un changement
#    d'argument de build ni à un changement du contexte (mesuré sur Compose
#    v5.6.0) : l'estampille ne se republierait jamais.
GIT_SHA="$(git rev-parse HEAD)" docker compose --env-file .env.app -f compose.app.yaml config    # vérifier l'interpolation (GIT_SHA visible dans args)
GIT_SHA="$(git rev-parse HEAD)" docker compose --env-file .env.app -f compose.app.yaml up -d --build --wait
```

```
Point de contrôle : la page d'accueil se charge en HTTPS, le manifeste et le
                    service worker sont servis avec `Cache-Control: no-cache`
                    (l'app installée doit voir la nouvelle version).
  curl -sSI https://<hôte-app>/ | grep -i x-app-version   # nomme le SHA servi
  curl -sS https://<hôte-app>/version.json                # le SHA complet, sans cache
```

## 5. Contrôles finaux (si le lot les touche)

Le script se lit lui-même : ses trois valeurs (`SUPABASE_PUBLIC_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) sont lues dans le `.env` de
la pile, sans être affichées ni saisies à la main — un secret écrit sur la
ligne de commande finit dans l'historique du shell (§2.7 H). L'URL doit être
la **RACINE** (`SUPABASE_PUBLIC_URL`) et non `API_EXTERNAL_URL` (`…/auth/v1`),
qui rendrait « 404 page not found ». L'ancrage du script le rend invoquable
depuis la racine comme depuis `supabase-project/`.

```sh
sh scripts/smoke-functions-serveur.sh

# Secrets push dans Vault (les jobs pg_cron les lisent) :
sh scripts/set-push-secrets.sh --check
```

- `FUNCTIONS_VERIFY_JWT=false` reste en place : l'autorisation repose sur la clé
  publiable, le JWT et les RLS, chaque fonction déclarant son mode
  (`auth: 'publishable' | 'user' | 'secret' | 'none'`).
- La route API ne porte **aucun** middleware d'authentification Traefik ; un
  middleware de session devant `api-gw` bloquerait l'application.

## Transport mail des checks (alertes et sauvegardes, D-06/D-13)

Les scripts d'exploitation (`send-mail.sh`, `backup.sh`, puis les checks
d'alerte de la phase 28) notifient le résultat par mail. Le transport retenu
est **msmtp sur l'hôte avec un relais Gmail** (révision D-13 du 2026-10-29,
décision opérateur) — le canal d'origine, le SMTP de la stack D-13, reste le
repli conteneur. Les alertes des checks passent par `send-mail.sh`, qui
sélectionne seul msmtp quand il est présent.

- Le `.env` de la stack définit `SMTP_HOST=supabase-mail`, `SMTP_PORT=2500`.
  `supabase-mail` est un **nom de réseau Docker interne** : il n'est pas
  résolvable depuis l'hôte. Un envoi depuis un script hôte (cron) avec ces
  valeurs échouerait en « name or service not known », sans le moindre
  rapport avec les identifiants.
- **Sonde à jouer sur l'hôte de prod** (cette section est écrite depuis le
  dépôt ; le résultat réel se consigne à l'exécution) — le `.env` est lu par
  `sed`, jamais sourcé (§2.7 C et H) :

  ```sh
  STACK_ENV=supabase-project/.env
  SMTP_HOST="$(sed -n 's/^SMTP_HOST=//p' "$STACK_ENV" | head -n1)"
  SMTP_PORT="$(sed -n 's/^SMTP_PORT=//p' "$STACK_ENV" | head -n1)"
  echo "sonde : $SMTP_HOST:$SMTP_PORT (depuis l'hôte)"
  if nc -z -w5 "$SMTP_HOST" "$SMTP_PORT" 2>/dev/null; then
    echo "JOIGNABLE depuis l'hôte"
  else
    echo "INJOIGNABLE depuis l'hôte (attendu : nom de réseau Docker)"
  fi
  ```

- **Arbitrage retenu** (révisé le 2026-10-29, décision opérateur) : le transport
  retenu est **msmtp sur l'hôte avec un relais externe Gmail** — révision
  explicite de D-13, qui pointait initialement le SMTP de la stack (Stalwart).
  Le propriétaire du projet préfère la simplicité opérationnelle du relais
  Google à la conformité self-hosted stricte : les contenus d'alerte
  (noms de tables, chemins, contexte serveur) transitent par Google — arbitrage
  assumé et consigné ici. Le support msmtp/TLS est déjà celui du script
  (`tls on`, `tls_trust_file`, creds dans un fichier 600 référencé par
  `EO_MAIL_RC`), aucune modification de `send-mail.sh` n'est nécessaire.
  Le mode conteneur jetable reste disponible en repli si `msmtp` est absent
  (l'option d'origine, jamais supprimée).

  Dans les deux cas, les identifiants SMTP ne sont **jamais** en ligne de
  commande, en variable de session ni versionnés : ils vivent dans des fichiers
  chmod 600 dont les chemins sont donnés par des variables d'environnement
  (cf. `scripts/send-mail.sh`).

**Résultat de la sonde sur la prod :** **2026-10-29 — sonde JOIGNABLE, mail
`[EO-sonde]` reçu et lu** (transport msmtp → smtp.gmail.com:587, révision
D-13). Caveat consigné à l'usage : `/var/log/msmtp.log` est réservé à root ;
une sonde lancée en utilisateur doit désactiver le log avec
`msmtp --log=stderr` (le réglage `logfile` du msmtprc reste le bon pour cron
et checks, qui tournent en root).

**Commandes à jouer sur l'hôte de prod** (arbitrage Gmail via msmtp — révision
D-13 du 2026-10-29 ; les secrets vivent dans des fichiers 600, jamais en argv) :

**Résultat de la première exécution sur la prod :** **2026-10-29 —
sauvegarde `20261029T092434Z` terminée et vérifiée, mail de verdict reçu**
(4 `.gpg` + SHA256SUMS ; vérification D-07 : `pg_restore --list` ✓, tailles ✓,
sha256 ✓ ; steps 5-6 du transport mail joués OK par l'opérateur).

```sh
# 1. Installer msmtp (si absent) :
command -v msmtp || { apt-get update && apt-get install -y msmtp; }

# 2. Côté Google (une fois, dans le compte Gmail) : activer la validation
#    en 2 étapes, puis créer un MOT DE PASSE D'APPLICATION
#    (https://myaccount.google.com/apppasswords) — le mot de passe du compte
#    seul ne suffit plus pour SMTP.

# 3. Config msmtp — /etc/msmtprc, chmod 600. Le mot de passe d'application
#    se met au même endroit ; il n'est ni versionné ni journalisé :
#    defaults
#    auth           on
#    tls            on
#    tls_trust_file /etc/ssl/certs/ca-certificates.crt
#    logfile        /var/log/msmtp.log
#
#    account        gmail
#    host           smtp.gmail.com
#    port           587
#    from           votreadresse@gmail.com
#    user           votreadresse@gmail.com
#    password       <mot-de-passe-application>
#
#    account default : gmail
cat > /etc/msmtprc <<'MSMTP'
defaults
auth           on
tls            on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile        /var/log/msmtp.log

account        gmail
host           smtp.gmail.com
port           587
from           votreadresse@gmail.com
user           votreadresse@gmail.com
password       MOT_DE_PASSE_APPLICATION_ICI

account default : gmail
MSMTP
chmod 600 /etc/msmtprc
# (éditer le fichier pour y poser le vrai mot de passe d'application)

# 4. Sonde d'envoi réelle (le verdict doit arriver dans la boîte Gmail cible) :
printf 'From: votreadresse@gmail.com\nTo: operateur@votredomaine.fr\nSubject: [EO-sonde] test transport msmtp\n\nSonde de transport.\n' \
  | msmtp --file=/etc/msmtprc --read-recipients && echo "SONDE OK"

# 5. Destinataire du verdict : fichier simple, pas un secret, mais même
#    discipline — un fichier, pas une variable de session.
echo "operateur@votredomaine.fr" > /etc/eo-mail-to && chmod 600 /etc/eo-mail-to

# 6. Première sauvegarde complète notifiée (4 .gpg + SHA256SUMS + mail) —
#    avec msmtp présent, send-mail.sh bascule seul sur ce transport :
EO_MAIL_TO="$(cat /etc/eo-mail-to)" sh scripts/backup.sh

# 7. Cron nocturne (D-05) — le même bloc, dans le crontab de root :
#    15 2 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/backup.sh >> /var/log/eo-backup.log 2>&1
```

## Réplication vers la machine tierce (D-01/D-02/D-03)

> **Absence déclarée (décision opérateur, 2026-10-29)** : la réplication
> vers la machine tierce n'est **pas** déployée à ce stade — l'opérateur a
> choisi de considérer D-01/D-02/D-03 comme acquises sans preuve
> d'exécution réelle. La chaîne prouvée reste : backup local chiffré +
> vérification D-07 + mail (preuve réelle du 2026-10-29,
> `20261029T092434Z`). Le script `scripts/backup-replicate.sh` existe et est
> prêt ; les commandes ci-dessous sont à jouer le jour où une machine tierce
> est désignée. À re-diligencer avant l'ouverture publique (phase 31).

Les sauvegardes chiffrées de `scripts/backup.sh` (les `.gpg` + `SHA256SUMS`,
telles quelles — pas de re-chiffrement, pas de restic, per D-02) sont
répliquées chaque nuit vers une machine tierce auto-hébergée. L'ordre est non
négociable (Pitfall 6) : **réplication → vérification (stamp du jour +
SHA256SUMS) → copie de la clé pgsodium → purge GFS**. La purge ne détruit
jamais avant que la réplication du jour soit vérifiée.

**Deux copies disjointes de la clé pgsodium** (D-03) : elle part avec le dump
chiffré (`db-config.tar.gz`) ET vit séparément sur la tierce, **hors du
répertoire des sauvegardes** (`EO_PGSODIUM_COPY`, ex. `/srv/secrets/eo/pgsodium/`).

### Paramètres de réplication

| Paramètre | Valeur | Rôle |
|---|---|---|
| `EO_REPL_TARGET` | `<utilisateur>@<hôte-tierce>` | cible ssh/réplication |
| `EO_REPL_DIR` | `/srv/backups/eo/` | répertoire des sauvegardes sur la tierce |
| `EO_REPL_SSH` | `~/.ssh/eo_replication` | clé ssh DÉDIÉE (fichier chmod 600, jamais la clé d'agent par défaut) |
| `EO_REPL_KNOWN_HOSTS` | `~/.ssh/eo_replication_known_hosts` | known_hosts dédié : hôte tierce épinglé (T-28-05) |
| `EO_PGSODIUM_COPY` | `/srv/secrets/eo/pgsodium/` | chemin tierce DISJOINT de `EO_REPL_DIR` (D-03, refusé sinon) |
| `EO_PGSODIUM_LOCAL` | `supabase-project/backups/<stamp>/db-config.tar.gz` | la clé locale ; elle vit déjà dans le tar db-config répliqué |

⚠ **Valeurs à remplir à la première installation** : `<utilisateur>` et
`<hôte-tierce>` sont à consigner ici (nom de machine, pas un secret).

### Commandes d'installation ssh (à livrer à l'utilisateur, D-05)

**Sonde préalable (A2)** — sur l'hôte de prod, vérifier que `rsync` et `ssh`
sont présents (`command -v rsync ssh` — présents sur la machine de
développement au 2026-10-29 ; l'hôte de prod est à confirmer). Si absent :
`apt install rsync openssh-client` (Debian/Ubuntu).

```sh
# 1. Créer la clé ssh DÉDIÉE à la réplication (fichier 600, jamais la clé d'agent) :
ssh-keygen -t ed25519 -f ~/.ssh/eo_replication -N "" -C "eo-replication"
chmod 600 ~/.ssh/eo_replication

# 2. Déposer la clé sur la machine tierce (une fois, via un accès existant) :
ssh-copy-id -i ~/.ssh/eo_replication.pub <utilisateur>@<hôte-tierce>

# 3. Créer les répertoires sur la tierce — la clé pgsodium vit HORS des sauvegardes (D-03) :
ssh -i ~/.ssh/eo_replication <utilisateur>@<hôte-tierce> \
  'mkdir -p /srv/backups/eo /srv/secrets/eo/pgsodium && chmod 700 /srv/secrets/eo/pgsodium'

# 4. Épingler l'hôte tierce dans un known_hosts DÉDIÉ (T-28-05) :
ssh-keyscan -H <hôte-tierce> >> ~/.ssh/eo_replication_known_hosts
chmod 600 ~/.ssh/eo_replication_known_hosts

# 5. Sonde de connexion (BatchMode : échoue si la clé ne suffit pas) :
ssh -o BatchMode=yes -o ConnectTimeout=5 -o UserKnownHostsFile=~/.ssh/eo_replication_known_hosts \
  -i ~/.ssh/eo_replication <utilisateur>@<hôte-tierce> true \
  && echo "JOIGNABLE" || echo "INJOIGNABLE — consigner ici"

# 6. Première réplication + purge (la purge GFS ne s'exécute qu'après vérification) :
EO_REPL_TARGET=<utilisateur>@<hôte-tierce> \
EO_REPL_SSH=$HOME/.ssh/eo_replication \
EO_REPL_DIR=/srv/backups/eo \
EO_PGSODIUM_COPY=/srv/secrets/eo/pgsodium \
  sh scripts/backup-replicate.sh

# 7. Cron nocturne (D-05) — APRÈS backup.sh (le stamp du jour doit exister),
#    dans le crontab de root :
#    45 2 * * * EO_REPL_TARGET=<user>@<hôte-tierce> EO_REPL_SSH=/root/.ssh/eo_replication EO_REPL_DIR=/srv/backups/eo EO_PGSODIUM_COPY=/srv/secrets/eo/pgsodium EO_PGSODIUM_LOCAL=/srv/backups/eo sh /chemin/depot/scripts/backup-replicate.sh >> /var/log/eo-backup-replicate.log 2>&1
```

**Vérification par l'utilisateur** (exercice réel, D-05) : le stamp du jour
est présent sous `/srv/backups/eo/`, `sha256sum -c SHA256SUMS` y répond vert,
la purge GFS a conservé les strates (quotidien 7 j / hebdo 1 mois / mensuel
1 an) et les a purgées de la même façon en local comme sur la tierce.

### Rétention GFS (D-04, OPS-05)

La purge GFS est la **même logique** des deux côtés (locale et tierce, via
ssh) : elle complète la rétention plate `RETENTION_DAYS` de `backup.sh` et
conserve — par date portée dans le nom du répertoire `20*` :

- **quotidien** : les 7 derniers jours ;
- **hebdomadaire** : le premier stamp de chaque semaine du mois écoulé ;
- **mensuel** : le premier stamp de chaque mois de l'année écoulée.

Elle ne s'exécute **qu'après** la vérification du stamp du jour sur la tierce
(la destruction n'est jamais antérieure à la réplication vérifiée — T-28-03),
jamais par `rsync --delete` : la sélection des répertoires à supprimer est
explicite, par date.

## Installation de l'ordonnancement nocturne (D-05)

Section de référence : **toutes les commandes d'installation à livrer à
l'opérateur** sont ici (exigence explicite « me donner toutes les commandes
plus consigner dans le readme »). Aucun secret dans ces commandes —
uniquement des chemins de fichiers chmod 600 (§2.7-H). La procédure de
**restauration** ne se duplique pas : elle vit dans
`docs/EXPLOITATION.md` (« Runbook de restauration », D-10) — une seule copie
de chaque procédure ; si elle change, la corriger **dans toutes les copies**
(§2.7-I, ici : une seule).

### Arbitrage du créneau nocturne

Les jobs `pg_cron` internes tournent déjà la nuit et le matin
(`cron.job`, relevé dans `docs/EXPLOITATION.md` § « Catalogue des jobs ») :
purges et rappels entre 04:14 et 06:40, `eo-push-dispatch` chaque minute,
`eo-push-messages` toutes les 5 minutes. Choix retenu :

- **backup.sh à 02:15** : avant les jobs internes du matin. Le dump est un
  instantané cohérent à chaud (§11), donc les jobs de la minute ne le
  corrompent pas ; le créneau 02:15 laisse toute la fenêtre 02:45–04:14 à la
  réplication, sans chevaucher les purges nocturnes de la base.
- **backup-replicate.sh à 02:45** : 30 minutes après le backup — marge pour
  un dump de taille prod ; si un jour la réplication dépasse 04:14, rien ne
  casse (elle ne touche que des fichiers, pas la base), mais la marge est
  l'objectif de dimensionnement.
- **Checks d'alerte le matin (07:10–07:40)** : après le dernier job interne
  (06:40) — un check de santé lancé au milieu des purges crierait au loup ;
  les checks de récence (pg_cron) jugent alors la nuit entière.

### Crontabs complets (root, `crontab -e`)

```cron
# ── Sauvegarde et réplication (D-05) ──────────────────────────────────────
# 02:15 — sauvegarde chiffrée + vérification D-07 + mail du verdict D-06.
#         EO_MAIL_TO est requis : sans destinataire, aucune notification.
15 2 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/backup.sh >> /var/log/eo-backup.log 2>&1

# 02:45 — réplication tierce + purge GFS (seulement quand la tierce est
#         connectée ; aujourd'hui NON déployée, voir la bannière ci-dessus).
45 2 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) EO_REPL_TARGET=<user>@<hote-tierce> EO_REPL_SSH=/root/.ssh/eo_replication EO_REPL_DIR=/srv/backups/eo EO_PGSODIUM_COPY=/srv/secrets/eo/pgsodium EO_PGSODIUM_LOCAL=/srv/backups/eo sh /chemin/depot/scripts/backup-replicate.sh >> /var/log/eo-backup-replicate.log 2>&1

# ── Checks d'alerte (silence = vert ; un mail part uniquement si alerte) ──
# 07:10 — disque : seuil 85 % (EO_DISK_THRESHOLD), points de montage par
#         EO_DISK_PATHS. Quotidien : un disque qui se remplit en 8 h exige
#         une détection journalière.
10 7 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/check-disk.sh >> /var/log/eo-checks.log 2>&1

# 07:20 — certificats TLS : seuil 21 jours (EO_CERT_THRESHOLD_DAYS), hôtes
#         EO_CERT_HOSTS="app.votredomaine.fr api.votredomaine.fr studio.votredomaine.fr".
20 7 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) EO_CERT_HOSTS="app.votredomaine.fr api.votredomaine.fr studio.votredomaine.fr" sh /chemin/depot/scripts/check-certs.sh >> /var/log/eo-checks.log 2>&1

# 07:30 — santé pg_cron (OPS-04) : présence/active, récence N×période,
#         échecs 'failed'. La liste des jobs est codée dans le script
#         (relevé réel du catalogue — docs/EXPLOITATION.md).
30 7 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/check-cron-health.sh >> /var/log/eo-checks.log 2>&1

# 07:40 — erreurs Edge : seuil 0 sur la fenêtre 24 h
#         (EO_EDGE_ERROR_THRESHOLD=0, EO_EDGE_WINDOW_HOURS=24).
40 7 * * * EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/check-edge-errors.sh >> /var/log/eo-checks.log 2>&1
```

| Check | Fréquence | Seuil par défaut | Alerte [EO-*] |
|---|---|---|---|
| `check-disk.sh` | quotidien 07:10 | 85 % de remplissage | `[EO-disque]` |
| `check-certs.sh` | quotidien 07:20 | expiration < 21 jours | `[EO-certificats]` |
| `check-cron-health.sh` | quotidien 07:30 | job absent/inactif, récence > N×période, statut `failed` | `[EO-cron]` |
| `check-edge-errors.sh` | quotidien 07:40 | ≥ 1 réponse status ≥ 400 sur 24 h | `[EO-edge]` |

Les quatre checks réutilisent `scripts/send-mail.sh` (transport arbitré
msmtp/conteneur, D-13) : l'installation du transport est dans la section
« Transport mail des checks » ci-dessus — elle précède l'installation du cron.

### Variante timers systemd (acceptée par D-05)

Même horaire, un fichier `*.timer` + `*.service` par script, ex. pour le
backup (les autres checks : copier en changeant `OnCalendar`, la description
et le script) :

```ini
# /etc/systemd/system/eo-backup.timer
[Unit]
Description=EO — sauvegarde chiffrée nocturne (D-05)

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/eo-backup.service
[Unit]
Description=EO — scripts/backup.sh (dump + tars + vérification + mail)

[Service]
Type=oneshot
# Aucun secret ici : les chemins de fichiers 600 seulement (§2.7-H).
Environment=EO_MAIL_TO_FILE=/etc/eo-mail-to
ExecStart=/bin/sh -c 'EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/backup.sh >> /var/log/eo-backup.log 2>&1'
```

```sh
systemctl daemon-reload && systemctl enable --now eo-backup.timer
systemctl list-timers 'eo-*'   # vérifier la prochaine échéance
```

### Test de bout en bout après installation

Chaque unité est déclenchée **manuellement** une première fois, et deux
preuves sont exigées : le mail correspondant reçu, et l'effet de bord attendu
consigné.

```sh
# 1. Sauvegarde — mail [EO-backup] succès + stamp du jour créé :
EO_MAIL_TO=$(cat /etc/eo-mail-to) sh /chemin/depot/scripts/backup.sh
ls -1 /chemin/depot/supabase-project/backups          # ← le stamp du jour y est

# 2. Réplication (tierce connectée seulement) — mail en échec uniquement :
EO_REPL_TARGET=<user>@<hote-tierce> EO_REPL_SSH=/root/.ssh/eo_replication \
EO_REPL_DIR=/srv/backups/eo EO_PGSODIUM_COPY=/srv/secrets/eo/pgsodium \
  sh /chemin/depot/scripts/backup-replicate.sh
ssh -i /root/.ssh/eo_replication <user>@<hote-tierce> 'ls /srv/backups/eo'  # ← stamp du jour

# 3. Checks — chaque commande suivante est silencieuse et exit 0 (vert) ;
#    pour prouver la chaîne complète, déclencher une fois en rouge (procédure
#    de preuve : « Preuves des alertes » ci-dessous) puis remettre en ordre :
EO_CERT_HOSTS="app.votredomaine.fr api.votredomaine.fr studio.votredomaine.fr" sh /chemin/depot/scripts/check-certs.sh
sh /chemin/depot/scripts/check-disk.sh
sh /chemin/depot/scripts/check-cron-health.sh
sh /chemin/depot/scripts/check-edge-errors.sh
```

Vérification finale du cron : après la première nuit, `grep EO /var/log/cron`
(ou `journalctl -u eo-backup.timer`) montre les exécutions, et le mail du
verdict D-06 est arrivé — un cron silencieux sans mail de succès est un échec
inexpliqué (§2.7-F).

### Restauration

La procédure pas-à-pas (Compose isolé `supabase-project-restore/`,
désactivation des cron jobs avant démarrage, ordre db → storage →
db-config, mesure du RTO) vit dans `docs/EXPLOITATION.md` — « Runbook de
restauration » (D-10). Ne pas la recopier ici.

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

## Preuves des alertes

Chaque alerte est **prouvée par un déclenchement réel** (§2.7-B : vu rouge
avant vert), mail reçu et lu, puis remise en ordre — jamais promise. Les
preuves jouées par l'agent sur la base de développement sont consignées
ci-dessous ; les preuves finales **sur prod avec mail reçu** se jouent par
l'opérateur (commandes fournies dans chaque entrée) et sont horodatées à la
main dans ce tableau.

### pg_cron — déclenché par l'agent (2026-10-29, base de dev)

Méthode du plan : un job de test pointant vers une fonction inexistante
créé, vu en échec, supprimé — l'échec d'une rotation de secret se présente
identiquement (status `failed` sur `cron.job_run_details`).

```sh
# Déclenchement
echo "select cron.schedule('eo-check-test-broken', '* * * * *',
  'select private.check_cron_test_absente()');" | sh scripts/psql.sh
sleep 75   # pg_cron exécute à la minute suivante

# Preuve rouge — l'axe « échecs » alerte, exit 1 :
EO_CRON_JOBS="…catalogue de test…" sh scripts/check-cron-health.sh   # → ✗ axe échecs, 2 exécutions failed

# Remise en ordre
echo "select cron.unschedule(22);" | sh scripts/psql.sh

# Preuve vert — silence, exit 0 :
EO_CRON_JOBS="…" sh scripts/check-cron-health.sh                    # → ✓ trois axes au vert
```

Observation au passage : sur la base de développement, les jobs quotidiens
(05 h–06 h) n'ont pas tourné pendant la nuit — la machine était éteinte et
pg_cron ne rattrape pas les créneaux manqués. Sur un hôte prod toujours
allumé, c'est un vrai signal ; sur la base dev, l'axe récence crie au loup à
chaque matin — utiliser `EO_CRON_JOBS` pour un test local (voir
`scripts/check-cron-health.sh`).

Mail : la patte d'envoi passe par `send-mail.sh` (transport arbitré en 28-01)
avec `EO_MAIL_TO` ; sur la base de dev, sans `EO_MAIL_TO`, l'alerte reste sur
stderr + exit 1. **La preuve mail reçu et lu se joue sur prod** (checkpoint
utilisateur, ci-dessous).

### Disque, certificats, erreurs Edge — preuves opérateur sur prod

Les déclenchements exigent l'hôte de prod (tmpfs à remplir, seuil de
certificat à dépasser, injection pg_net). Commandes exactes :

1. **Disque** — deux méthodes selon les droits disponibles. Sans racine sur
   l'hôte (cas de la preuve dev), dépasser le seuil par le seuil lui-même —
   même philosophie que les certificats ci-dessous :
   ```sh
   EO_DISK_THRESHOLD=20 sh scripts/check-disk.sh   # → rouge + mail [EO-disque] (usage réel > 20 %)
   sh scripts/check-disk.sh                        # remise en ordre : seuil par défaut 85 % → vert
   ```
   Avec la racine, remplir un tmpfs au-delà du seuil puis relâcher (preuve
   plus proche du réel) :
   ```sh
   mkdir -p /tmp/eo-disk-proof && mount -t tmpfs -o size=200M tmpfs /tmp/eo-disk-proof
   dd if=/dev/zero of=/tmp/eo-disk-proof/fill bs=1M count=190    # 95 % > seuil 85 %
   EO_DISK_PATHS=/tmp/eo-disk-proof sh scripts/check-disk.sh     # → rouge + mail
   umount /tmp/eo-disk-proof && rmdir /tmp/eo-disk-proof         # remise en ordre
   ```
   (Le tmpfs cible un chemin surveillé via `EO_DISK_PATHS` ; ajuster pour
   viser le point de montage réel de la stack en prod.)

2. **Certificats** — dépasser le seuil de 21 jours en sondant un hôte dont le
   certificat expire plus tôt (ou en abaissant le seuil sous l'âge restant
   réel, puis remettre) :
   ```sh
   EO_CERT_HOSTS="app.votredomaine.fr api.votredomaine.fr studio.votredomaine.fr" \
   # (le port est optionnel : « hôte » et « hôte:443 » sont acceptés) \
     EO_CERT_THRESHOLD_DAYS=400 sh scripts/check-certs.sh       # → rouge + mail [EO-certificats]
   # Remise en ordre : relancer sans EO_CERT_THRESHOLD_DAYS (défaut 21) → vert
   ```

3. **Erreurs Edge** — injecter un appel pg_net vers une URL en 404 :
   ```sh
   echo "select net.http_post(
           url := 'https://app.votredomaine.fr/eo-injection-404-test',
           headers := '{\"Content-Type\": \"application/json\"}'::jsonb,
           body := '{}'::jsonb);" | sh scripts/psql.sh
   sleep 10
   sh scripts/check-edge-errors.sh                               # → rouge + mail [EO-edge]
   # Remise en ordre : aucune — la fenêtre de 24 h vieillit l'entrée seule ;
   # le check redevient vert à la purge de net._http_response (ou vérifier
   # immédiatement que le seuil retombe après nettoyage de la fenêtre de test).
   ```

   Sanitizer : les mails d'alerte reprennent status_code + chemin, tronqués —
   jamais le corps de la réponse.

**Confirmation opérateur :** pour chaque alerte — commande de déclenchement
jouée, mail reçu et lu, remise en ordre faite, check revenu au vert.
Consigner date + résultat dans le tableau :

| Alerte | Date déclenchement | Mail reçu | Remise en ordre |
|--------|--------------------|-----------|-----------------|
| pg_cron | 2026-10-29 (dev, agent — rouge 2 failed, job de test créé puis supprimé) ; **prod 2026-10-29 : job de test `eo-check-test-broken` (jobid 19/20/22, 5 s), 15–36 exécutions failed vues, rouge puis vert après unschedule** | ✓ prod 2026-10-29, [EO-cron] reçu | ✓ (cron.unschedule, count=0, trois axes au vert) |
| Disque | 2026-10-29 (dev, agent) ; **prod 2026-10-29 : `EO_DISK_THRESHOLD=20`, `/` à 21 % → rouge** | ✓ prod 2026-10-29, [EO-disque] reçu | ✓ (seuil par défaut 85 % → vert, 21 %) |
| Certificats | 2026-10-29 (dev, agent) ; **prod 2026-10-29 : seuil 4000 j sur `ensemble.` et `api.jeremymaillot.fr:443`, 79 jours restants → rouge** | ✓ prod 2026-10-29, [EO-certificats] reçu | ✓ (seuil 21 j → vert, 79 jours restants) |
| Erreurs Edge | 2026-10-29 (dev, agent) ; **prod 2026-10-29 : injection pg_net id 178 vers /functions/v1/inexistant → réponse 500 InvalidWorkerCreation (≥ 400), rouge count=1** | ✓ prod 2026-10-29, [EO-edge] reçu | ✓ (la fenêtre 24 h vieillit l'entrée seule) |

Notes de preuve prod (2026-10-29) :
- Sans `EO_MAIL_TO` dans l'environnement, les checks alertent à l'écran mais
  n'envoient **volontairement** rien — deux cycles ont tourné muets avant que
  la variable ne soit exportée ; les mails ne partent qu'avec elle (comportement
  voulu, T-28-08, pas un défaut).
- Le certificat d'un hôte Let's Encrypt vit ~90 jours : le seuil par défaut
  (21 jours) est le bon réglage en prod ; le seuil 4000 j n'est qu'un
  déclencheur de preuve.
- Deux défauts de script trouvés et corrigés pendant la preuve :
  `check-cron-health.sh` criait au loup sur les jobs annuels jamais exécutés
  (exemption `EO_CRON_NEVER_OK`, commit fc141d6) et `check-certs.sh`
  doublait le port pour un `EO_CERT_HOSTS` portant `:443`
  (commit 4be0050) — §2.7-E, corriger la classe.

## Preuves UAT-27 (campagne distincte de l'exercice, D-11)

> **Absence déclarée (décision opérateur, 2026-10-29)** : la campagne UAT-27
> (27.5 / 27.6 / 27.7) n'a **pas** été jouée sur la prod. Comme pour
> l'exercice de restauration et la réplication tierce (28-02, commit
> `0c9bd9a`), l'absence est documentée honnêtement : **aucun des trois UAT
> ci-dessous n'est marqué comme vérifié**, et la dette de validation de la
> phase 27 reste ouverte. Elle est reportée sur la phase 31 (ouverture
> publique), où un SMTP livrable est de toute façon exigé par le critère de
> succès 1 — le test 27.7 (mail J-7 réellement livré) se jouera dans le même
> élan. Les prescriptions de campagne restent valables telles quelles.

| UAT | Ce qui devait être prouvé | Statut | Report |
|-----|---------------------------|--------|--------|
| UAT-27.5 | Annulation de suppression multi-foyer : restauration nom/photo dans CHAQUE foyer du membre, page de confirmation honnête (aucune promesse de sessions restaurées) | non joué — absence déclarée 2026-10-29 | phase 31 |
| UAT-27.6 | Données partagées survivantes : contributions d'un membre supprimé (tâches, courses, notes) restent au foyer | non joué — absence déclarée 2026-10-29 | phase 31 |
| UAT-27.7 | Mail J-7 réellement livré : simulation SQL de la date J-7 sur un compte de test, dispatch observé, réception dans la boîte réelle | non joué — absence déclarée 2026-10-29 | phase 31 (avec le SMTP réel exigé par OUV-01) |

Prescriptions de campagne (inchangées, à rejouer telles quelles) : campagne
**distincte** de tout exercice de restauration, sur la **prod** avec le SMTP
réel du serveur ; compte de test dédié, jamais un vrai compte famille ;
consigner pour chaque UAT la date, la commande, le résultat observé et, pour
27.7, la lecture du mail reçu ; purger le compte de test en fin de campagne
(T-28-12, §2.7-B).
