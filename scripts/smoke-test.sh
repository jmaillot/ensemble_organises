#!/usr/bin/env sh
# scripts/smoke-test.sh
# Parcours réel de bout en bout contre une stack déployée.
#
#   sh scripts/smoke-test.sh
#   API=https://api.exemple.fr sh scripts/smoke-test.sh
#
# Ce que la suite SQL ne peut pas prouver : que PostgREST résout `auth.uid()`
# pour un vrai utilisateur. Toutes les politiques s'appuient dessus, et
# `testkit.as_user` pose lui-même les GUC du jeton — la suite vérifie donc que
# les politiques sont correctes, pas que la chaîne JWT est câblée. C'est
# précisément ce qu'un JWT émis par GoTrue apporte, et ce qu'aucune assertion SQL
# ne peut simuler fidèlement.
#
# Le parcours : inscription, création de foyer, relecture, isolement, puis
# création d'un token d'invitation et échange par un second compte.
#
# Les comptes sont jetables et supprimés en sortie : le script se rejoue sans
# jamais s'accumuler. Aucune clé n'est affichée.
#
# Variables d'environnement reconnues :
#   API     URL publique de la stack (défaut : SUPABASE_PUBLIC_URL du .env)
#   STACK_ENV  fichier .env de la stack (défaut : supabase-project/.env)

set -eu

# Les chemins sont ancrés sur l'emplacement du script, pas sur le répertoire
# courant : la documentation fait lancer ce script depuis `supabase-project/`
# comme depuis la racine, et un chemin relatif au répertoire courant donnerait
# `supabase-project/supabase-project/.env` dans le premier cas.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"

STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"
API="${API:-}"

if [ ! -f "$STACK_ENV" ]; then
  echo "smoke-test.sh: $STACK_ENV introuvable." >&2
  echo "  Depuis la racine du dépôt, ou depuis supabase-project/ :" >&2
  echo "    sh scripts/smoke-test.sh" >&2
  echo "    sh ../scripts/smoke-test.sh" >&2
  echo "  Autre emplacement : STACK_ENV=/chemin/vers/.env" >&2
  exit 1
fi

# --- Lecture du .env sans le sourcer ----------------------------------------
# Le fichier contient des secrets et des commandes potentielles : on l'extrait
# ligne à ligne, on ne l'exécute pas, et rien n'est affiché.
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(stack_value SUPABASE_PUBLISHABLE_KEY)}"
SECRET_KEY="${SECRET_KEY:-$(stack_value SUPABASE_SECRET_KEY)}"

# L'URL est lue après le .env, puisqu'elle en vient. `SUPABASE_PUBLIC_URL` est
# celle que le frontend consomme comme `VITE_SUPABASE_URL` : le test vise donc
# exactement la même adresse que l'application.
if [ -z "$API" ]; then
  API="$(stack_value SUPABASE_PUBLIC_URL)"
fi

if [ -z "$API" ]; then
  echo "smoke-test.sh: aucune URL de stack." >&2
  echo "  Ni la variable API, ni SUPABASE_PUBLIC_URL dans $STACK_ENV." >&2
  echo "  API=https://api.exemple.fr sh scripts/smoke-test.sh" >&2
  exit 1
fi

# Une barre finale produirait « https://api.exemple.fr//auth/v1/health ».
API="${API%/}"

if [ -z "$PUBLISHABLE_KEY" ]; then
  echo "smoke-test.sh: SUPABASE_PUBLISHABLE_KEY absent de $STACK_ENV" >&2
  exit 1
fi

# Refus sans secret, dans les DEUX modes (CS-02, §2.7 F) : sans la clé secrète,
# ni la création admin ni la purge vérifiée ne peuvent s'exécuter — le fallback
# d'hier (« pas de clé secrète : comptes laissés en place ») produisait un smoke
# partiel muet, c'est-à-dire un échec inexpliqué.
if [ -z "$SECRET_KEY" ]; then
  echo "smoke-test.sh: SUPABASE_SECRET_KEY absent de $STACK_ENV." >&2
  echo "  Le smoke crée ET purge ses comptes via l'Admin GoTrue : sans la clé" >&2
  echo "  secrète, aucun compte ne peut être créé ni supprimé — le run serait" >&2
  echo "  muet, donc mensonger." >&2
  echo "  Lancez le smoke depuis l'hôte de la stack, où le .env porte la clé :" >&2
  echo "    sh scripts/smoke-test.sh" >&2
  echo "  (Autre emplacement : STACK_ENV=/chemin/vers/.env)" >&2
  exit 1
fi

# --- Bibliothèque comptes e2e (CS-04) ----------------------------------------
# Un seul chemin d'accès à SUPABASE_SECRET_KEY : création/purge/liste passent
# toutes par la bibliothèque, dont les appels Admin portent la clé via un
# fichier curl -K en 0600 — jamais en argv.
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
SMOKE_API="$API"
SMOKE_STACK_ENV="$STACK_ENV"

# Domaine des emails e2e (EE-01) : lu du .env de la stack, défaut aligné sur le
# déploiement réel (A2 — aucun DNS requis, les comptes admin n'envoient aucun
# email).
E2E_MAIL_DOMAIN="${E2E_MAIL_DOMAIN:-$(stack_value E2E_MAIL_DOMAIN)}"
E2E_MAIL_DOMAIN="${E2E_MAIL_DOMAIN:-ensemble.jeremymaillot.fr}"

# --- Outils ------------------------------------------------------------------
uuid() {
  # /proc est toujours présent sur l'hôte Linux, contrairement à uuidgen.
  cat /proc/sys/kernel/random/uuid
}

ok=0
ko=0

step() {
  echo
  echo "── $1"
}

pass() {
  echo "   ✓ $1"
  ok=$((ok + 1))
}

fail() {
  echo "   ✗ $1" >&2
  ko=$((ko + 1))
}

# Version lisible : une seule requête, corps ET code.
# `prefer` reprend ce que fait le client : supabase-js termine chaque insertion
# par `.select('*')`, qui vaut `Prefer: return=representation` — donc
# l'insertion RENVOIE sa ligne, et PostgreSQL lui applique la politique de
# lecture.
#
# Le smoke test n'envoyait rien, donc PostgREST restait en `return=minimal` et
# n'appliquait aucune politique. C'est ainsi qu'un 403 du client a pu passer
# pour un problème de RLS alors que le test, lui, réussissait : un test de
# bout en bout qui ne parle pas comme le client ne teste pas le client.
call() {
  path="$1"; method="$2"; payload="$3"; bearer="$4"; key="${5:-$PUBLISHABLE_KEY}"
  auth_header=''
  [ -n "$bearer" ] && auth_header="Authorization: Bearer $bearer"
  prefer="$PREFER"
  [ "$method" = "POST" ] && prefer='return=representation'
  response="$(curl -sS -w '\n%{http_code}' -X "$method" "$API$path" \
    -H "apikey: $key" -H 'Content-Type: application/json' -H "$auth_header" \
    ${prefer:+-H "Prefer: $prefer"} \
    ${payload:+--data "$payload"} 2>/dev/null || printf '\n000')"
  CODE="$(printf '%s' "$response" | tail -n 1)"
  BODY="$(printf '%s' "$response" | sed '$d')"
}
PREFER=''

# Extraction d'une valeur d'un JSON, sans dépendance externe. Suffit aux
# réponses de GoTrue, qui sont plates ou à un niveau.
# Les espaces autour des « : » sont tolérés, et c'est nécessaire.
#
# GoTrue répond au format compact — `"access_token":"…"`. PostgREST rend le jsonb
# avec une espace — `"id": "…"`. Les extracteurs exigeaient la forme compacte :
# sur une réponse de fonction SQL, ils ne trouvaient rien, renvoyaient une
# chaîne vide, et chaque étape suivante partait de là. Le parcours échouait
# alors sur une cause réelle mais rapportée à la mauvaise ligne — l'erreur
# survenue dix étapes plus loin.
json_string() {
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" | head -n 1
}

json_number() {
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\([0-9][0-9.]*\).*/\1/p" | head -n 1
}

# Compte les éléments d'un tableau JSON renvoyé sur une seule ligne, ce que fait
# PostgREST par défaut : compte les « { ».
#
# Un corps d'erreur — `{"error": …}` — compte lui aussi un « { » et ferait croire
# à une ligne trouvée. Un compte de zéro est la conclusion que l'on tire le
# plus souvent de cette fonction : « l'isolation tient ». Elle ne doit pas
# pouvoir devenir un « l'isolation tient » sur une erreur.
# La fonction renvoie { household: {…}, member: {…} }. Chaque identifiant est
# extrait de son objet : une recherche du premier « id » orthogonal à l'ordre
# des clés, et l'ordre d'un jsonb n'est pas garanti.
json_household_id() {
  printf '%s' "$1" | sed -n 's/.*"household": *{[^}]*"id": *"\([^"]*\)".*/\1/p' | head -n 1
}

json_member_id() {
  printf '%s' "$1" | sed -n 's/.*"member": *{[^}]*"id": *"\([^"]*\)".*/\1/p' | head -n 1
}

json_rows() {
  if printf '%s' "$1" | grep -q '"error":'; then
    echo 0
    return 0
  fi
  printf '%s' "$1" | grep -o '{' | wc -l | tr -d ' '
}

# Le runid porte l'entropy $$ (deux runs à la même seconde ne collisionnent pas),
# et le + isole ces adresses de tout vrai destinataire.
RUN="$(date +%s)$$"
ALICE_MAIL="e2e+${RUN}-1@${E2E_MAIL_DOMAIN}"
BOB_MAIL="e2e+${RUN}-2@${E2E_MAIL_DOMAIN}"
PASSWORD='Mot-de-passe-de-test-2026!'

# Le mot de passe est partagé entre la bibliothèque (création) et le smoke
# (session par mot de passe en mode admin) : il ne doit diverger nulle part.
SMOKE_ACCOUNT_PASSWORD="$PASSWORD"
smoke_accounts_init

# Renseignés par l'étape 3, depuis la réponse de la fonction. Le test ne les
# devine pas : il lit ce que le serveur a réellement créé, comme le ferait le
# client.
HOUSEHOLD_ID=''
MEMBER_ID=''

ALICE_ID=''
ALICE_JWT=''
BOB_ID=''
BOB_JWT=''

cleanup() {
  echo
  echo "── Nettoyage"

  # Le foyer d'abord : `households.created_by` est en `on delete set null`, le
  # foyer survivrait à la suppression du compte. Les membres, en revanche, sont
  # en cascade depuis `auth.users`.
  if [ -n "$ALICE_JWT" ] && [ -n "$HOUSEHOLD_ID" ]; then
    call "/rest/v1/households?id=eq.$HOUSEHOLD_ID" DELETE "" "$ALICE_JWT"
    [ "$CODE" = "204" ] || [ "$CODE" = "200" ] \
      && echo "   ✓ foyer supprimé" \
      || echo "   ! foyer non supprimé (code $CODE)"
  fi

  # Détection résiduelle (EE-02) : les comptes e2e hors de ce run sont
  # SIGNALÉS, jamais supprimés par ce run — la purge est bornée à ses propres
  # runids, un run concurrent ne doit pas être touché. Un résidu relève d'une
  # action humaine, pas d'une purge auto-réparatrice.
  if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]; then
    echo "   ! comptes e2e résiduels hors de ce run (à traiter à la main) :" >&2
    printf '     %s\n' "$residus" >&2
  fi

  # Purge vérifiée (§2.7 F) : chaque suppression est prouvée par un re-delete
  # dont le 404 est exigé — la purge muette d'hier (`|| true` + echo
  # inconditionnel) faisait passer un échec HTTP pour un succès. Bornée aux
  # uids du run courant (EE-02). Un compte qui survit fait échouer le run.
  if [ -s "$SMOKE_ACCOUNTS_LOG" ]; then
    if smoke_accounts_purge "$RUN"; then
      echo "   ✓ comptes purgés, purge prouvée (re-delete → 404)"
    else
      echo "   ✗ purge incomplète : un compte du run a survécu (voir ci-dessus)" >&2
      exit 1
    fi
  else
    echo "   (aucun compte créé, rien à purger)"
  fi
  smoke_accounts_tmp_clean
}
trap cleanup EXIT

echo "Parcours de bout en bout — $API"
echo "Run $RUN. Les comptes $ALICE_MAIL et $BOB_MAIL sont jetables."

# ----------------------------------------------------------------------------
step "1. La stack répond"
# ----------------------------------------------------------------------------
call "/auth/v1/health" GET "" ""
if [ "$CODE" = "200" ]; then
  pass "GoTrue est joignable"
else
  fail "GoTrue ne répond pas (code $CODE) — la stack est-elle démarrée ?"
  echo
  echo "  Impossible de continuer sans authentification."
  exit 1
fi

# Détection du mode par la sonde publique (CS-01) : GET /auth/v1/settings est
# sans effet de bord, et c'est la stack réellement ciblée qui répond — pas une
# lecture de config locale qui pourrait diverger.
MODE="$(smoke_accounts_mode)" || {
  echo
  echo "  Impossible de détecter le mode (mailer_autoconfirm). Le parcours n'a"
  echo "  pas de sens sans lui : abandon avant tout compte créé."
  exit 1
}
if [ "$MODE" = "admin" ]; then
  echo "   mode prod : création via l'Admin GoTrue (autoconfirm désactivé)"
else
  echo "   mode dev : création via /auth/v1/signup (autoconfirm actif)"
fi

# ----------------------------------------------------------------------------
step "2. Inscription d'un premier compte"
# ----------------------------------------------------------------------------
if [ "$MODE" = "admin" ]; then
  # prod : ENABLE_EMAIL_AUTOCONFIRM=false — la création passe par l'Admin API
  # avec email_confirm:true (SMOKE-01). Jamais de demande de réactiver
  # l'autoconfirm : c'est la config prod, elle reste ce qu'elle est (CS-01).
  if smoke_accounts_create "$RUN" 1 "Alice Martin"; then
    ALICE_ID="$SMOKE_CREATED_ID"
    ALICE_MAIL="$SMOKE_CREATED_EMAIL"
    # L'Admin ne renvoie pas de jeton : la session s'obtient par le grant
    # password, possible car le compte est déjà confirmé (A1).
    if smoke_accounts_session "$ALICE_MAIL" "$PASSWORD"; then
      ALICE_JWT="$SMOKE_SESSION_JWT"
      pass "Alice créée via l'Admin GoTrue (email_confirm:true) et connectée par mot de passe"
    else
      fail "compte admin créé mais session impossible (grant_type=password)"
    fi
  else
    fail "création admin d'Alice refusée (voir le corps nommé ci-dessus)"
  fi
else
  call "/auth/v1/signup" POST \
    "{\"email\":\"$ALICE_MAIL\",\"password\":\"$PASSWORD\",\"data\":{\"full_name\":\"Alice Martin\"}}" ""

  case "$CODE" in
    200|201)
      ALICE_JWT="$(json_string "$BODY" access_token)"
      ALICE_ID="$(json_string "$BODY" id)"
      if [ -n "$ALICE_JWT" ] && [ -n "$ALICE_ID" ]; then
        pass "Alice est connectée (confirmation de courriel désactivée)"
      else
        fail "inscription acceptée mais aucun jeton renvoyé — ENABLE_EMAIL_AUTOCONFIRM ?"
      fi
      ;;
    422|400)
      fail "inscription refusée (code $CODE) : $BODY"
      ;;
    500)
      # Cas observé sur une stack sans SMTP : GoTrue crée le compte puis échoue
      # en tentant l'envoi, et remonte une 500. Le corps est ici plus utile que
      # le code — c'est lui qui nomme la cause.
      fail "GoTrue n'a pas su envoyer le courriel de confirmation (code $CODE)"
      case "$BODY" in
        *confirmation*)
          echo "    Aucun service SMTP n'est branché, ou ses variables sont encore"
          echo "    celles de l'exemple du snapshot."
          echo
          echo "    Pour valider la chaîne tout de suite, dans .env :"
          echo "      ENABLE_EMAIL_AUTOCONFIRM=true"
          echo "    puis redémarrer GoTrue : sh run.sh up -d"
          echo
          echo "    À ne pas laisser en production : un compte créé sans confirmation"
          echo "    porte une adresse non vérifiée, et cette adresse sert à partager"
          echo "    une liste de cadeaux. Un vrai SMTP reste nécessaire — un service"
          echo "    d'envoi transactionnel suffit, avec une clé d'API."
          ;;
        *)
          echo "    $BODY"
          ;;
      esac
      ;;
    *)
      fail "inscription inattendue (code $CODE) : $BODY"
      ;;
  esac
fi

if [ -z "$ALICE_JWT" ]; then
  echo
  echo "  Parcours interrompu : sans jeton, rien de ce qui suit ne peut être"
  echo "  exécuté dans le rôle authenticated — c'est-à-dire exactement les"
  echo "  requêtes que ce test doit valider."
  exit 1
fi

# ----------------------------------------------------------------------------
step "3. Alice crée son foyer — foyer et membre en une seule opération"
# ----------------------------------------------------------------------------
# Le client appelle `public.create_household`, pas deux insertions. Le test fait
# de même : c'est le chemin réel, et lui seul prouve que le chemin réel
# fonctionne. Deux requêtes laisseraient un foyer sans administratrice — donc
# insupprimable, puisque `households_delete` exige un administrateur.
call "/rest/v1/rpc/create_household" POST \
  "{\"p_name\":\"Foyer de test\",\"p_avatar_color\":\"accent\"}" \
  "$ALICE_JWT"
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  HOUSEHOLD_ID="$(json_household_id "$BODY")"
  MEMBER_ID="$(json_member_id "$BODY")"
  if [ -n "$HOUSEHOLD_ID" ]; then
    pass "le foyer et son administratrice sont créés en une transaction"
  else
    fail "la fonction a répondu sans identifiant de foyer : $BODY"
  fi
else
  fail "création refusée (code $CODE) : $BODY"
  case "$BODY" in
    *session*) echo "    La fonction exige une session : le jeton n'est pas passé." ;;
    *) echo "    La fonction est atteinte, donc câblée ; c'est sa logique." ;;
  esac
fi

# Un prérequis manquant rend tout ce qui suit non évaluable. Continuer produirait
# des verdicts trompeurs — c'est arrivé : un identifiant de foyer vide a fait
# échouer l'étape « la RLS reconnaît Alice », alors que la RLS n'avait rien fait
# de faux. On interrompt donc, et on nomme la cause.
if [ -z "$HOUSEHOLD_ID" ]; then
  echo
  echo "Parcours interrompu : aucun foyer créé, les étapes suivantes n'ont pas" >&2
  echo "de sens. La cause est celle de l'étape 3." >&2
  exit 1
fi

# Le foyer doit être lisible immédiatement après sa création : c'est
# précisément ce que l'insertion renvoyait mal, la politique de lecture refusant
# un foyer dont l'appelant n'est pas encore membre.
call "/rest/v1/households?id=eq.$HOUSEHOLD_ID" GET "" "$ALICE_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -ge 1 ] 2>/dev/null; then
  pass "et il est lisible dans la foulée"
else
  fail "le foyer créé n'est pas lisible (code $CODE, $rows ligne(s)) : $BODY"
fi

# ----------------------------------------------------------------------------
step "4. Alice relit son foyer — la preuve que auth.uid() est résolu"
# ----------------------------------------------------------------------------
# C'est LE contrôle du parcours. Si PostgREST ne posait pas le GUC que lit
# `auth.uid()`, cette requête renverrait un tableau vide au lieu d'une erreur :
# le test SQL l'a déjà montré, un `count = 0` ne distingue pas « pas autorisé »
# de « personne ».
call "/rest/v1/households?id=eq.$HOUSEHOLD_ID" GET "" "$ALICE_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -ge 1 ] 2>/dev/null; then
  pass "la RLS reconnaît Alice : elle relit le foyer qu'elle vient de créer"
else
  fail "Alice ne relit pas son propre foyer (code $CODE, $rows ligne(s)) : $BODY"
  echo "    Cause la plus probable : auth.uid() ne résout pas le sous du JWT."
  echo "    C'est le défaut que toute la conception de la RLS présume absent."
fi

# ----------------------------------------------------------------------------
step "5. Un compte de foyer voisin ne voit rien"
# ----------------------------------------------------------------------------
# Les DEUX comptes passent par le même chemin (CS-04) : en mode admin, Bob est
# créé sérialisé après Alice, puis connecté par le grant password — même
# interface, même discipline de secrets, jamais une seconde implémentation.
if [ "$MODE" = "admin" ]; then
  if smoke_accounts_create "$RUN" 2 "Bob Martin"; then
    BOB_ID="$SMOKE_CREATED_ID"
    BOB_MAIL="$SMOKE_CREATED_EMAIL"
    if smoke_accounts_session "$BOB_MAIL" "$PASSWORD"; then
      BOB_JWT="$SMOKE_SESSION_JWT"
      pass "Bob créé via l'Admin GoTrue (email_confirm:true) et connecté par mot de passe"
    else
      fail "compte admin de Bob créé mais session impossible (grant_type=password)"
    fi
  else
    fail "création admin de Bob refusée (voir le corps nommé ci-dessus)"
  fi
else
  call "/auth/v1/signup" POST \
    "{\"email\":\"$BOB_MAIL\",\"password\":\"$PASSWORD\",\"data\":{\"full_name\":\"Bob Martin\"}}" ""
  BOB_JWT="$(json_string "$BODY" access_token)"
  BOB_ID="$(json_string "$BODY" id)"
  [ -n "$BOB_JWT" ] && pass "Bob est connecté" || fail "inscription de Bob refusée : $BODY"
fi

call "/rest/v1/households?id=eq.$HOUSEHOLD_ID" GET "" "$BOB_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -eq 0 ] 2>/dev/null; then
  pass "le foyer d'Alice est invisible pour Bob — isolement inter-foyers confirmé"
else
  fail "Bob voit le foyer d'Alice (code $CODE, $rows ligne(s)) : $BODY"
fi

call "/rest/v1/household_members?household_id=eq.$HOUSEHOLD_ID" GET "" "$BOB_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -eq 0 ] 2>/dev/null; then
  pass "et la table des membres également"
else
  fail "Bob voit les membres d'un autre foyer (code $CODE, $rows ligne(s))"
fi

# ----------------------------------------------------------------------------
step "6. Alice crée une tâche, Bob ne la voit pas"
# ----------------------------------------------------------------------------
TASK_ID="task_$(uuid)"
# `client_key` est NOT NULL depuis 0177 (phase 34, idempotence du rejeu
# client) et typé uuid : une valeur propre au run, comme le client réel qui
# génère la sienne — jamais le `id` textuel du smoke.
call "/rest/v1/tasks" POST \
  "{\"id\":\"$TASK_ID\",\"client_key\":\"$(uuid)\",\"household_id\":\"$HOUSEHOLD_ID\",\"name\":\"Valider le carnet\",\"status\":\"a_faire\",\"created_by\":\"$MEMBER_ID\"}" \
  "$ALICE_JWT"
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] \
  && pass "la tâche est créée" \
  || fail "création de tâche refusée (code $CODE) : $BODY"

call "/rest/v1/tasks?id=eq.$TASK_ID" GET "" "$BOB_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -eq 0 ] 2>/dev/null; then
  pass "Bob ne voit pas la tâche d'Alice"
else
  fail "Bob voit une tâche d'un autre foyer (code $CODE, $rows ligne(s))"
fi

# ----------------------------------------------------------------------------
step "7. Alice émet un token d'invitation"
# ----------------------------------------------------------------------------
# `expiresAt` est exigé par le schéma Zod de la fonction (action create) :
# le client réel envoie toujours une échéance — le smoke fait de même.
INVITE_EXPIRES_AT="$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)"
call "/functions/v1/household-invite" POST \
  "{\"action\":\"create\",\"householdId\":\"$HOUSEHOLD_ID\",\"expiresAt\":\"$INVITE_EXPIRES_AT\"}" \
  "$ALICE_JWT"
TOKEN="$(json_string "$BODY" token)"
if [ -n "$TOKEN" ]; then
  pass "un token brut est émis (${#TOKEN} caractères, jamais stocké en clair)"
else
  fail "aucun token renvoyé (code $CODE) : $BODY"
  case "$BODY" in
    *HMAC*) echo "    INVITE_TOKEN_HMAC_SECRET est absent ou trop court." ;;
    *) echo "    La fonction est joignable et authentifiée : c'est sa logique." ;;
  esac
fi

if [ -z "$TOKEN" ]; then
  echo
  echo "Parcours interrompu : aucun token émis, les étapes d'échange n'ont pas" >&2
  echo "de sens. La cause est celle de l'étape 7." >&2
  exit 1
fi

# ----------------------------------------------------------------------------
step "8. Un échange anonyme est refusé — c'est voulu, et c'est vérifié"
# ----------------------------------------------------------------------------
# L'étape demandait initialement qu'un échange fonctionne SANS session, avec la
# seule clé publiable. La fonction refuse, délibérément : le mode `publishable`
# de `withSupabase` ne laisse passer la requête que pour que la fonction puisse
# répondre elle-même, en français, au lieu du refus générique du runtime.
#
# Un échange ne peut pas se faire sans compte : `redeem_household_invite_token`
# exige un `p_user_id`, et le nom affiché vient du profil créé à la première
# connexion — jamais du corps de la requête, pour qu'un client ne puisse pas
# choisir le nom sous lequel il apparaît chez les autres. C'est une propriété de
# sécurité, elle se vérifie comme telle.
call "/functions/v1/household-invite" POST \
  "{\"action\":\"redeem\",\"token\":\"$TOKEN\"}" ""
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  pass "un échange sans session est refusé (code $CODE) : le mode publishable ne suffit pas"
else
  fail "un échange sans session a été accepté (code $CODE) : $BODY"
  echo "    Un visiteur sans compte pourrait alors rejoindre un foyer."
fi

# ----------------------------------------------------------------------------
step "9. Bob, connecté, échange le token"
# ----------------------------------------------------------------------------
# Le parcours réel : on s'inscrit, on est connecté, on colle le token. Bob a un
# compte, donc une session, donc le rôle `authenticated`.
call "/functions/v1/household-invite" POST \
  "{\"action\":\"redeem\",\"token\":\"$TOKEN\"}" "$BOB_JWT"
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  pass "Bob rejoint le foyer (échange atomique, HMAC validé en base)"
else
  fail "échange refusé (code $CODE) : $BODY"
fi

call "/rest/v1/household_members?household_id=eq.$HOUSEHOLD_ID" GET "" "$BOB_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -ge 2 ] 2>/dev/null; then
  pass "Bob apparaît dans les membres du foyer ($rows membres)"
else
  fail "Bob n'est pas membre après l'échange (code $CODE, $rows membre(s)) : $BODY"
fi

# ----------------------------------------------------------------------------
step "10. Le même token, le même compte : pas de double adhésion"
# ----------------------------------------------------------------------------
call "/functions/v1/household-invite" POST \
  "{\"action\":\"redeem\",\"token\":\"$TOKEN\"}" "$BOB_JWT"
case "$CODE" in
  200|201) pass "le second échange est idempotent (déjà membre)" ;;
  400|401|403|409) pass "le second échange est refusé (code $CODE), comme attendu" ;;
  *) fail "le second échange a rendu un code inattendu : $CODE $BODY" ;;
esac

call "/rest/v1/household_members?household_id=eq.$HOUSEHOLD_ID" GET "" "$BOB_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -eq 2 ] 2>/dev/null; then
  pass "et le foyer ne compte toujours que deux membres"
else
  fail "le second échange a modifié la liste des membres ($rows)"
fi

call "/rest/v1/households?id=eq.$HOUSEHOLD_ID" GET "" "$ALICE_JWT"
rows="$(json_rows "$BODY")"
if [ "$CODE" = "200" ] && [ "$rows" -ge 1 ] 2>/dev/null; then
  pass "Alice relit toujours son foyer en fin de parcours"
else
  fail "la RLS a cessé de reconnaître Alice en cours de parcours (code $CODE)"
fi

# ----------------------------------------------------------------------------
echo
if [ "$ko" -eq 0 ]; then
  echo "Parcours de bout en bout : $ok contrôles réussis, aucun échec."
  echo
  echo "La chaîne complète fonctionne : GoTrue émet un jeton, PostgREST le"
  echo "transmet, auth.uid() le résout, les politiques filtrent, et l'échange"
  echo "d'un token crée le membre attendu en base."
  exit 0
fi

echo "Parcours de bout en bout : $ok réussis, $ko échecs." >&2
exit 1
