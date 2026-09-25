#!/usr/bin/env sh
# scripts/check-hosts.sh
# Vérifie que les hôtes publiés par Traefik correspondent aux URL de la stack.
#
# Trois hôtes sont publiés : le frontend, la gateway API et Studio. Les deux
# premiers sont également stockés dans `supabase-project/.env` — `SITE_URL` et
# `API_EXTERNAL_URL` — parce que le backend y renvoie après une confirmation
# de courriel ou une redirection OAuth.
#
# Rien ne relie automatiquement les deux côtés. Une divergence ne produit
# AUCUNE erreur au déploiement : le site se charge, l'API répond, l'inscription
# fonctionne… jusqu'à la confirmation, où la redirection part vers un hôte sans
# conteneur derrière lui. L'utilisateur voit une page introuvable alors qu'il
# vient de réussir à créer son compte — un symptôme qui ne renvoie à aucun des
# deux paramètres qui le causent.
#
# Ce script lit les deux côtés et les compare. Il ne parle à aucun service : il
# compare des fichiers, et se lance donc avant même le premier déploiement.
#
#   sh scripts/check-hosts.sh
#
# Codes de sortie : 0 tout correspond · 1 divergence ou valeur manquante.
#
# Variables d'environnement reconnues :
#   STACK_ENV  fichier .env de la stack (défaut : supabase-project/.env)

set -eu

STACK_ENV="${STACK_ENV:-supabase-project/.env}"
APP_ENV="${APP_ENV:-.env.app}"
APP_COMPOSE="${APP_COMPOSE:-compose.app.yaml}"
STACK_COMPOSE="${STACK_COMPOSE:-supabase-project/docker-compose.traefik.yml}"

errors=0
warnings=0

note_error() {
  echo "  ✗ $1" >&2
  errors=$((errors + 1))
}

note_warning() {
  echo "  ! $1" >&2
  warnings=$((warnings + 1))
}

# --- Lecture d'une valeur du .env de la stack -------------------------------
# Format attendu : `CLE=valeur`, sans espaces ni guillemets. On ne source pas le
# fichier : il contient des secrets, et les sourcer exécuterait ce qu'il contient.
stack_value() {
  [ -f "$STACK_ENV" ] || return 1
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 \
    | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

# Nom d'hôte d'une URL, sans son schéma ni sa barre finale.
host_of() {
  echo "$1" | sed -e 's|^[a-zA-Z][a-zA-Z0-9+.-]*://||' -e 's|/.*$||' -e 's|:.*$||'
}

# --- Lecture d'un hôte dans une règle Traefik --------------------------------
# Une règle s'écrit `Host(\`${EO_APP_HOST:-app.exemple.fr}\`)`. Il faut rendre la
# valeur RÉELLEMENT utilisée, donc résoudre la variable exactement comme Compose
# le fait : l'environnement d'abord, puis le fichier passé par `--env-file`,
# puis la valeur par défaut inscrite dans la règle.
#
# Une lecture naïve se contente de lire l'environnement du script, et conclurait
# à une divergence alors que le déploiement est correct. Ce serait un contrôle
# qui cries au loup — pire que pas de contrôle du tout.
#
# Paramètres : <fichier compose> <nom du routeur> <valeur par défaut>
traefik_host() {
  compose_file="$1"
  router="$2"
  fallback_host="$3"

  if [ ! -f "$compose_file" ]; then
    echo "<fichier absent>"
    return 0
  fi

  extracted="$(sed -n \
    "s/.*routers\.$router\.rule=Host(\`\(.*\)\`).*/\1/p" "$compose_file" \
    | head -n 1)"

  if [ -z "$extracted" ]; then
    echo "<règle absente>"
    return 0
  fi

  case "$extracted" in
    '${'*':-'*)
      # `${EO_APP_HOST:-app.exemple.fr}` → nom, défaut
      # `${…}` se déballe par `sed` : un `${` littéral dans un motif
      # d'expansion de paramètre n'est pas portable d'un shell à l'autre.
      inner="$(printf '%s' "$extracted" | sed -e 's/^[$][{]//' -e 's/}$//')"
      var_name="${inner%%:*}"
      # `:-` et non `:` : le séparateur de Compose en fait deux caractères, et
      # le premier `:` du nom de variable ne doit pas être pris pour lui.
      default_host="${inner#*:-}"

      # L'environnement prime, comme dans Compose.
      resolved=""
      eval "resolved=\${$var_name-}"
      if [ -n "$resolved" ]; then
        printf '%s' "$resolved"
        return 0
      fi

      # Puis le fichier d'environnement du Compose concerné. `compose.app.yaml`
      # est à la racine et se lit avec `--env-file .env.app` ; l'override de la
      # stack est lu avec le `.env` du répertoire du projet.
      env_file="$APP_ENV"
      case "$compose_file" in
        supabase-project/*) env_file="$STACK_ENV" ;;
      esac

      if [ -f "$env_file" ]; then
        from_file="$(sed -n \
          "s/^[[:space:]]*$var_name[[:space:]]*=[[:space:]]*//p" "$env_file" \
          | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/')"
        if [ -n "$from_file" ]; then
          printf '%s' "$from_file"
          return 0
        fi
      fi

      printf '%s' "$default_host"
      ;;
    *)
      printf '%s' "$extracted"
      ;;
  esac
}

echo "Correspondance des hôtes"
echo

# --- 1. Les fichiers existent-ils ? -----------------------------------------
for required in "$APP_COMPOSE" "$STACK_COMPOSE"; do
  if [ ! -f "$required" ]; then
    note_error "fichier introuvable : $required"
  fi
done

if [ -f "$STACK_ENV" ]; then
  echo "  Fichier stack : $STACK_ENV"
else
  note_error "fichier stack introuvable : $STACK_ENV"
  echo
  echo "Impossible de comparer. CREEZ-LE depuis .env.example du snapshot :" >&2
  echo "  cp $STACK_ENV.example $STACK_ENV" >&2
  exit 1
fi
echo

# --- 2. SITE_URL et l'hôte du frontend ---------------------------------------
site_url="$(stack_value SITE_URL)"
api_external_url="$(stack_value API_EXTERNAL_URL)"
app_host="$(traefik_host "$APP_COMPOSE" eo-app-rtr app.votredomaine.fr)"

if [ -z "$site_url" ]; then
  note_error "SITE_URL absent de $STACK_ENV — le backend ne saura pas où renvoyer"
  echo "      SITE_URL=https://ensemble.jeremymaillot.fr   # l'hôte du FRONTEND"
else
  site_host="$(host_of "$site_url")"
  echo "  SITE_URL                 → $site_host"
  echo "  Traefik (frontend)       → $app_host"
  if [ "$site_host" = "$app_host" ]; then
    echo "    ✓ correspondance"
  else
    note_error "SITE_URL pointe sur $site_host mais le frontend est publié sur $app_host"
    echo "      Redirigez EO_APP_HOST=$site_host au build, ou corrigez SITE_URL."
    echo "      Après confirmation de courriel ou redirection OAuth, l'utilisateur"
    echo "      atterrira sur un hôte sans conteneur."
  fi
fi
echo

# --- 3. API_EXTERNAL_URL et l'hôte de la gateway ------------------------------
api_host="$(traefik_host "$STACK_COMPOSE" eo-api-rtr api.votredomaine.fr)"

if [ -z "$api_external_url" ]; then
  note_error "API_EXTERNAL_URL absent de $STACK_ENV"
else
  url_host="$(host_of "$api_external_url")"
  echo "  API_EXTERNAL_URL          → $url_host"
  echo "  Traefik (gateway)        → $api_host"
  if [ "$url_host" = "$api_host" ]; then
    echo "    ✓ correspondance"
  else
    note_error "API_EXTERNAL_URL pointe sur $url_host mais la gateway est publiée sur $api_host"
    echo "      EO_API_HOST=$url_host, ou corrigez API_EXTERNAL_URL."
  fi
fi
echo

# --- 4. Studio ---------------------------------------------------------------
studio_host="$(traefik_host "$STACK_COMPOSE" eo-studio-rtr studio.votredomaine.fr)"
echo "  Traefik (Studio)         → $studio_host"
if [ "$studio_host" = "$app_host" ] || [ "$studio_host" = "$api_host" ]; then
  note_error "Studio est publié sur le même hôte que $studio_host"
  echo "      Studio sert aussi la racine '/' pour l'API : deux services se"
  echo "      disputeraient la même route Traefik."
fi
echo

# --- 5. Les redirections autorisées -------------------------------------------
# GoTrue n'accepte que les origines listées dans ADDITIONAL_REDIRECT_URLS. Un
# frontend absent de cette liste ne peut pas démarrer une redirection OAuth :
# l'erreur est un « redirect url not in allow list », sans rapport avec l'hôte.
redirects="$(stack_value ADDITIONAL_REDIRECT_URLS)"
if [ -n "$site_url" ]; then
  if [ -z "$redirects" ]; then
    note_error "ADDITIONAL_REDIRECT_URLS absent de $STACK_ENV"
    echo "      ADDITIONAL_REDIRECT_URLS=$site_url"
  else
    found=1
    for candidate in $redirects; do
      if [ "$(host_of "$candidate")" = "$(host_of "$site_url")" ]; then
        found=0
      fi
    done
    if [ "$found" -eq 1 ]; then
      note_error "ADDITIONAL_REDIRECT_URLS ne contient pas $site_url"
      echo "      Sans cette origine, le SSO Google et Facebook sera refusé."
    else
      echo "  ADDITIONAL_REDIRECT_URLS  → $redirects"
      echo "    ✓ contient le frontend"
    fi
  fi
fi
echo

# --- Verdict -----------------------------------------------------------------
if [ "$errors" -gt 0 ]; then
  echo "ÉCHEC : $errors divergence(s) à corriger avant de déployer." >&2
  echo "       Tant qu'elles subsistent, le déploiement réussit et l'échec" >&2
  echo "       apparaît à l'inscription, sans cause visible." >&2
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  echo "Correspondance vérifiée, $warnings point(s) de vigilance."
  exit 0
fi

echo "Correspondance vérifiée : les trois hôtes publiés et les redirections"
echo "autorisées sont cohérentes avec les URL de la stack."
