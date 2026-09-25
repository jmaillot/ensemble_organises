#!/usr/bin/env sh
# scripts/init-app-env.sh
# Écrit le `.env.app` du frontend à partir du `.env` de la stack.
#
#   sh scripts/init-app-env.sh
#   sh scripts/init-app-env.sh --force        # écrase un fichier existant
#   sh scripts/init-app-env.sh --host app.mon-domaine.fr
#
# Pourquoi un script plutôt que trois lignes à taper : la clé publiable vit
# dans `supabase-project/.env`, et la recopier à la main impose de l'afficher
# — elle finit dans l'historique du shell et dans le défilement du terminal, ce
# qu'AGENTS.md interdit explicitement pour les secrets. Ici elle est lue et
# écrite, jamais affichée.
#
# L'hôte du frontend est DÉDUIT de `SITE_URL` : c'est la valeur que le backend
# utilisera pour renvoyer l'utilisateur après une confirmation de courriel ou
# une redirection OAuth. Les recopier à la main dans deux fichiers est la façon
# la plus simple de les faire divergir, et le symptôme — une page introuvable
# après une inscription réussie — ne renvoie à aucun des deux. `check-hosts.sh`
# vérifie la cohérence après coup ; ici elle tient par construction.
#
# Le fichier écrit ne contient aucun secret : la clé publiable est publique par
# conception (Vite l'incorpore au bundle), et c'est la RLS qui protège les
# données.

set -eu

STACK_ENV="${STACK_ENV:-supabase-project/.env}"
APP_ENV="${APP_ENV:-.env.app}"
FORCE=0
HOST=''

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --host) shift; HOST="${1:-}" ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "init-app-env.sh: option inconnue : $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ ! -f "$STACK_ENV" ]; then
  echo "init-app-env.sh: $STACK_ENV introuvable." >&2
  echo "  Depuis la racine du dépôt, ou : STACK_ENV=/chemin/vers/.env" >&2
  exit 1
fi

stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

SITE_URL="$(stack_value SITE_URL)"
PUBLIC_URL="$(stack_value SUPABASE_PUBLIC_URL)"
PUBLISHABLE_KEY="$(stack_value SUPABASE_PUBLISHABLE_KEY)"

if [ -z "$PUBLISHABLE_KEY" ]; then
  echo "init-app-env.sh: SUPABASE_PUBLISHABLE_KEY absent de $STACK_ENV." >&2
  echo "  Lancez les scripts de génération du snapshot :" >&2
  echo "    sh utils/generate-keys.sh --update-env" >&2
  echo "    sh utils/add-new-auth-keys.sh --update-env" >&2
  exit 1
fi

if [ -z "$PUBLIC_URL" ]; then
  echo "init-app-env.sh: SUPABASE_PUBLIC_URL absent de $STACK_ENV." >&2
  exit 1
fi

# `SITE_URL` peut porter un chemin : l'hôte Traefik n'en garde que le nom.
if [ -z "$HOST" ]; then
  if [ -z "$SITE_URL" ]; then
    echo "init-app-env.sh: SITE_URL absent de $STACK_ENV, et aucun --host fourni." >&2
    echo "  SITE_URL est l'adresse du FRONTEND. Elle doit exister." >&2
    exit 1
  fi
  HOST="$(printf '%s' "$SITE_URL" | sed -e 's|^[a-zA-Z][a-zA-Z0-9+.-]*://||' -e 's|/.*$||' -e 's|:.*$||')"
fi

if [ -f "$APP_ENV" ] && [ "$FORCE" -ne 1 ]; then
  echo "init-app-env.sh: $APP_ENV existe déjà." >&2
  echo "  Comparez avant d'écraser — sans afficher la clé :" >&2
  echo "    grep -v PUBLISHABLE_KEY $APP_ENV" >&2
  echo "  puis relancez avec --force." >&2
  exit 1
fi

umask 077
cat > "$APP_ENV" <<EOF
# Généré par scripts/init-app-env.sh le $(date '+%Y-%m-%d %H:%M').
# Ne pas versionner. La clé publiable est publique par conception : c'est la
# RLS et le jeton de session qui protègent les données, pas elle.

# Hôte sous lequel le frontend est publié. Déduit de SITE_URL dans
# supabase-project/.env : les deux doivent coïncider, c'est l'URL vers laquelle
# le backend renvoie après une confirmation de courriel ou une redirection
# OAuth. Le script scripts/check-hosts.sh le vérifie.
EO_APP_HOST=$HOST

VITE_SUPABASE_URL=$PUBLIC_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
EOF
umask 022

echo "$APP_ENV écrit :"
echo "  EO_APP_HOST                    = $HOST"
echo "  VITE_SUPABASE_URL              = $PUBLIC_URL"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY  = <${#PUBLISHABLE_KEY} caractères, masquée>"
echo
echo "Fichier en permissions 600, comme les .env de la stack."
echo
echo "Vérification de cohérence :"
sh "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/check-hosts.sh"
