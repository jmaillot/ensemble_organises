#!/usr/bin/env sh
# Connexion psql au conteneur `db`, commune aux scripts d'exploitation.
#
# À fournir par les scripts appelants (migrate.sh, test-db.sh, backup.sh,
# restore.sh). Elle n'exécute rien : elle définit `db_resolve`, `db_exec` et
# `db_exec_as`.
#
# Cinq pièges corrigés ici, rencontrés lors des premières exécutions réelles :
#
#   1. `docker compose exec` sans `-u` se connecte avec l'utilisateur système
#      root, que l'authentification « peer » de PostgreSQL rejette. On exécute
#      donc en tant qu'utilisateur `postgres`.
#   2. Sans `-U`/`-d` explicites, psql passe par le socket Unix et prend ses
#      valeurs par défaut. On les passe en argument.
#   3. Le rôle et la base de la stack ne sont pas `postgres` : le snapshot
#      auto-hébergé définit `POSTGRES_USER=supabase_admin` et une base
#      associée, et PostgREST/GoTrue s'y connectent. Migrer `-d postgres`
#      créerait une base que personne n'utilise. On lit donc les valeurs
#      réelles dans le conteneur, l'environnement de l'hôte restant prioritaire.
#   4. `docker compose` sans `-f` ne cherche que dans le RÉPERTOIRE COURANT.
#      Lancé depuis la racine du dépôt, il ne trouve aucun fichier Compose —
#      il n'y a que `compose.app.yaml`, que Docker ne reconnaît pas — et
#      `ps --services` ne rend aucun nom. Le message devenait alors « le
#      service db n'est pas démarré », alors que le service tournait et que
#      l'erreur venait du répertoire. Or `migrate.sh` docrait précisément
#      l'inverse de ce qu'il fallait faire. Tous les appels passent donc par
#      `db_compose`, qui se place dans `supabase-project/` : c'est là que
#      vivent `docker-compose.yml` et le `.env` qui porte le `COMPOSE_FILE`
#      enregistré par `sh run.sh config add traefik`.
#   5. Un runtime absent et un service arrêté doivent être deux messages
#      distincts : le premier se corrige en bootstrapant, le second en
#      démarrant. `db_require_runtime` sépare les deux.
#
# Variables d'environnement reconnues :
#   DB_CONTAINER    nom du service Compose (défaut : db)
#   EO_PROJECT_DIR  répertoire de la stack (défaut : supabase-project/)
#   POSTGRES_USER   rôle à utiliser (défaut : valeur du conteneur, sinon postgres)
#   POSTGRES_DB     base à utiliser (défaut : valeur du conteneur, sinon postgres)

EO_PROJECT_DIR="${EO_PROJECT_DIR:-$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase-project" 2>/dev/null && pwd || echo '')}"

# Le défaut documenté PLUS HAUT, appliqué ici.
#
# Six scripts définissent eux-mêmes `DB_CONTAINER="${DB_CONTAINER:-db}"` avant
# de sourcer ce fichier, et ce défaut n'était donc jamais exercé par la
# bibliothèque. Le septième l'a omis : son en-tête documentait la variable, la
# ligne d'initialisation manquait, et le script est mort sur
# `DB_CONTAINER: parameter not set` — à la ligne 44, avant tout le reste.
#
# Le défaut est donc ici, et pas chez l'appelant. Une bibliothèque qui annonce
# un défaut dans son en-tête doit l'appliquer : sinon chaque nouveau script
# porte à recopier une ligne, et l'oubli ne se voit qu'à l'exécution.
#
# Idem pour `DB_USER_RESOLVED` et `DB_NAME_RESOLVED` : ils ne sont pas définis
# ici, mais `db_resolve` les exporte avant tout `db_exec`, et il est appelé par
# chaque script. Un appelant qui n'appelle pas `db_resolve` n'a rien à
# exécuter de toute façon.
DB_CONTAINER="${DB_CONTAINER:-db}"

# `docker compose` dans le répertoire de la stack, quel que soit l'endroit
# d'où le script est appelé. Un sous-shell : le répertoire courant de
# l'appelant est restauré à la sortie, et rien ne dérive ensuite.
db_compose() {
  (cd "$EO_PROJECT_DIR" && docker compose "$@")
}

# Le runtime est-il présent ? Message distinct de « service arrêté ».
db_require_runtime() {
  if [ -z "$EO_PROJECT_DIR" ] || [ ! -f "$EO_PROJECT_DIR/docker-compose.yml" ]; then
    echo "runtime absent : ${EO_PROJECT_DIR:-supabase-project}/docker-compose.yml est introuvable." >&2
    echo "  La stack auto-hébergée doit être bootstrapée avant toute migration." >&2
    echo "  Voir docs/BACKEND.md §2, ou le README §5.2." >&2
    return 1
  fi
  return 0
}

# Valeur d'une variable d'environnement du conteneur, sans échouer si absente.
#
# Le `< /dev/null` est indispensable, et son absence est un bug qui a coûté un
# tour de diagnostic. `docker compose exec` attache l'ENTRÉE STANDARD de l'hôte
# au processus du conteneur : même si la commande ne lit rien, le client Docker
# consomme et jette ce qu'il trouve. Or `db_resolve` appelle `db_printenv` au
# démarrage de `psql.sh` — donc `cat fichier.sql | sh scripts/psql.sh` perdait
# le fichier avant que `psql` ne le lise, sans message d'erreur : la commande
# sans le moindre message d'erreur : la commande semblait avoir réussi.
#
# `test-db.sh` n'était pas concerné, et c'est ce qui a masqué le défaut : il
# appelle `db_resolve` une fois en tête de script, puis redirige le fichier au
# moment de chaque `psql_exec`. Un `psql.sh` mono-usage ne peut pas faire les
# deux dans cet ordre.
db_printenv() {
  db_compose exec -T "$DB_CONTAINER" printenv "$1" 2>/dev/null </dev/null | tr -d '\r' | head -n 1 || true
}

# Résout le rôle et la base à utiliser, une seule fois, avant tout psql.
db_resolve() {
  DB_USER_RESOLVED="${POSTGRES_USER:-}"
  DB_NAME_RESOLVED="${POSTGRES_DB:-}"

  if [ -z "$DB_USER_RESOLVED" ]; then
    DB_USER_RESOLVED="$(db_printenv POSTGRES_USER)"
  fi
  if [ -z "$DB_NAME_RESOLVED" ]; then
    DB_NAME_RESOLVED="$(db_printenv POSTGRES_DB)"
  fi

  [ -n "$DB_USER_RESOLVED" ] || DB_USER_RESOLVED=postgres
  [ -n "$DB_NAME_RESOLVED" ] || DB_NAME_RESOLVED=postgres

  export DB_USER_RESOLVED DB_NAME_RESOLVED
}

# db_exec <args psql…> : psql dans le conteneur, sur le bon rôle et la bonne base.
db_exec() {
  db_compose exec -T -u postgres -e ON_ERROR_STOP=1 "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -X -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" "$@"
}

# db_exec_as <utilisateur unix> <commande…> : pour pg_dump / pg_restore.
db_exec_as() {
  run_as="$1"
  shift
  db_compose exec -T -u "$run_as" -e ON_ERROR_STOP=1 "$DB_CONTAINER" "$@"
}
