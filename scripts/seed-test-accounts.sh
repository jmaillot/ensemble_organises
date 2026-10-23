#!/bin/sh
# Crée deux comptes de test et un foyer partagé sur la stack Supabase locale.
#
# Usage :
#   sh scripts/seed-test-accounts.sh
#   TEST_PASSWORD='...' sh scripts/seed-test-accounts.sh
#
# Le script est idempotent : relancé, il reconnecte les comptes existants,
# réutilise le foyer et ne recrée pas l'invitation si Thomas est déjà membre.
#
# Il ne lit que des valeurs publiques (URL, clé publiable) dans le `.env` de la
# stack. La clé secrète n'est jamais nécessaire : l'inscription est ouverte et
# les courriels sont auto-confirmés sur la stack locale. Aucun jeton de session
# n'apparaît dans la ligne de commande : les appels authentifiés passent par un
# fichier de configuration `curl` en 0600, supprimé à la sortie.
#
# Les comptes créés sont des comptes de DÉVELOPPEMENT. Ne jamais les créer sur
# une stack accessible publiquement.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/supabase-project/.env"}

EMAIL_A=${EMAIL_A:-camille@test.local}
EMAIL_B=${EMAIL_B:-thomas@test.local}
NAME_A=${NAME_A:-Camille Martin}
NAME_B=${NAME_B:-Thomas Martin}
TEST_PASSWORD=${TEST_PASSWORD:-TestFoyer2026!}
HOUSEHOLD_NAME=${HOUSEHOLD_NAME:-Foyer Martin (test)}

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE introuvable. La stack locale est-elle installée ?" >&2
  exit 1
fi

# Les valeurs sont lues sans être affichées. `sed` ne garde que la première
# occurrence, comme le fait le runtime Compose.
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1
}

API_EXTERNAL_URL=$(env_value API_EXTERNAL_URL)
PUBLISHABLE_KEY=$(env_value SUPABASE_PUBLISHABLE_KEY)

if [ -z "$API_EXTERNAL_URL" ] || [ -z "$PUBLISHABLE_KEY" ]; then
  echo "✗ API_EXTERNAL_URL ou SUPABASE_PUBLISHABLE_KEY absent de $ENV_FILE." >&2
  exit 1
fi

# `API_EXTERNAL_URL` finit par `/auth/v1` ; les autres services sont à la racine.
API=${API_EXTERNAL_URL%/auth/v1}

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT HUP INT TERM

# Un fichier de configuration par identité : l'en-tête `apikey` est public, le
# jeton de session ne l'est pas. `curl -K` les lit sans les exposer dans `ps`.
auth_config() {
  file="$TMP_DIR/auth-$1"
  header_a="apikey: $PUBLISHABLE_KEY"
  header_b="Authorization: Bearer $2"
  {
    printf 'header = "%s"\n' "$header_a"
    printf 'header = "%s"\n' "$header_b"
  } >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

public_config() {
  file="$TMP_DIR/auth-public"
  printf 'header = "apikey: %s"\n' "$PUBLISHABLE_KEY" >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

# Réponse + code HTTP dans deux fichiers, sans les laisser dans la sortie.
http() {
  method=$1
  url=$2
  config=$3
  body=${4:-}
  if [ -n "$body" ]; then
    curl -sS -o "$TMP_DIR/body" -w '%{http_code}' -X "$method" "$url" \
      -K "$config" -H 'Content-Type: application/json' --data "$body"
  else
    curl -sS -o "$TMP_DIR/body" -w '%{http_code}' -X "$method" "$url" -K "$config"
  fi
}

body() { cat "$TMP_DIR/body"; }

signup() {
  email=$1
  name=$2
  config=$(public_config)
  code=$(http POST "$API/auth/v1/signup" "$config" \
    "$(jq -nc --arg e "$email" --arg p "$TEST_PASSWORD" --arg n "$name" \
      '{email:$e, password:$p, data:{full_name:$n}}')")
  case "$code" in
    200|201) echo "   ✓ compte créé : $email" ;;
    400|422)
      # Déjà inscrit : ce n'est pas une erreur pour un script idempotent.
      if body | jq -e '.msg // .error_description // "" | test("already|déjà|existe"; "i")' >/dev/null 2>&1; then
        echo "   · compte déjà présent : $email"
      else
        echo "   ✗ inscription refusée pour $email (HTTP $code) : $(body)" >&2
        return 1
      fi
      ;;
    *)
      echo "   ✗ inscription de $email impossible (HTTP $code) : $(body)" >&2
      return 1
      ;;
  esac
}

login() {
  email=$1
  config=$(public_config)
  code=$(http POST "$API/auth/v1/token?grant_type=password" "$config" \
    "$(jq -nc --arg e "$email" --arg p "$TEST_PASSWORD" '{email:$e, password:$p}')")
  if [ "$code" != "200" ]; then
    echo "   ✗ connexion de $email impossible (HTTP $code) : $(body)" >&2
    return 1
  fi
  body | jq -r '.access_token'
}

echo "Comptes de test — $API"

signup "$EMAIL_A" "$NAME_A"
signup "$EMAIL_B" "$NAME_B"

JWT_A=$(login "$EMAIL_A")
JWT_B=$(login "$EMAIL_B")
USER_B=$(body | jq -r '.user.id')

CONFIG_A=$(auth_config a "$JWT_A")
CODE=$(http GET "$API/rest/v1/household_members?select=household_id&limit=1" "$CONFIG_A")
if [ "$CODE" != "200" ]; then
  echo "✗ Lecture des foyers impossible (HTTP $CODE) : $(body)" >&2
  exit 1
fi
HOUSEHOLD_ID=$(body | jq -r '.[0].household_id // empty')

if [ -z "$HOUSEHOLD_ID" ]; then
  CODE=$(http POST "$API/rest/v1/rpc/create_household" "$CONFIG_A" \
    "$(jq -nc --arg n "$HOUSEHOLD_NAME" '{p_name:$n, p_avatar_color:"accent"}')")
  if [ "$CODE" != "200" ]; then
    echo "✗ Création du foyer impossible (HTTP $CODE) : $(body)" >&2
    exit 1
  fi
  HOUSEHOLD_ID=$(body | jq -r '.household.id // empty')
  echo "   ✓ foyer créé : $HOUSEHOLD_NAME"
else
  echo "   · foyer déjà présent : $HOUSEHOLD_ID"
fi

# Thomas est-il déjà membre de CE foyer ? Camille peut lire les membres de son
# foyer ; le filtre sur `user_id` évite de conclure « oui » pour un autre foyer.
CONFIG_B=$(auth_config b "$JWT_B")
CODE_B=$(http GET "$API/rest/v1/household_members?select=id&household_id=eq.$HOUSEHOLD_ID&user_id=eq.$USER_B" "$CONFIG_A")
if [ "$CODE_B" = "200" ] && [ "$(body | jq 'length')" -gt 0 ]; then
  echo "   · Thomas est déjà membre du foyer"
else
  CODE=$(http POST "$API/functions/v1/household-invite" "$CONFIG_A" \
    '{"action":"create","maxUses":5}')
  if [ "$CODE" != "200" ]; then
    echo "✗ Création de l'invitation impossible (HTTP $CODE) : $(body)" >&2
    exit 1
  fi
  TOKEN=$(body | jq -r '.token')
  CODE=$(http POST "$API/functions/v1/household-invite" "$CONFIG_B" \
    "$(jq -nc --arg t "$TOKEN" '{action:"redeem", token:$t}')")
  if [ "$CODE" != "200" ]; then
    echo "✗ Rejoindre le foyer impossible (HTTP $CODE) : $(body)" >&2
    exit 1
  fi
  echo "   ✓ Thomas a rejoint le foyer"
fi

cat <<EOF

Comptes prêts.

  Admin  : $EMAIL_A
  Membre : $EMAIL_B
  Mot de passe : $TEST_PASSWORD
  Foyer  : $HOUSEHOLD_ID

Pour utiliser ces comptes dans l'application, créer app/.env.local :

  VITE_SUPABASE_URL=$API
  VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY

puis relancer \`npm run dev\` dans app/. Sans ce fichier, l'application reste
en mode démonstration (données IndexedDB, aucun compte requis).

Ces comptes sont des comptes de développement : ne pas les créer sur une stack
exposée publiquement.
EOF
