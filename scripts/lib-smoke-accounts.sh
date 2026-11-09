# scripts/lib-smoke-accounts.sh
# Bibliothèque comptes e2e du smoke — création/purge/liste via l'Admin GoTrue.
#
# Fichier SOURCÉ, jamais exécuté (CS-04) : le smoke et le wrapper de la spec
# e2e réelle sourcent ce fichier pour créer et purger leurs comptes — un seul
# chemin d'accès à SUPABASE_SECRET_KEY à auditer.
#
# Discipline des secrets (§2.7 H) : la clé secrète quitte le .env de la stack
# uniquement vers un fichier de configuration `curl -K` en 0600, dans un
# répertoire temporaire supprimé à la sortie. Jamais en argv, jamais en log —
# `ps` ne doit jamais montrer la clé.
#
# Contrat d'appel (variables que le script appelant renseigne avant usage) :
#   SMOKE_API        URL publique de la stack (le smoke passe $API)
#   SMOKE_STACK_ENV  fichier .env de la stack (le smoke passe $STACK_ENV)
#   SMOKE_ACCOUNT_PASSWORD  mot de passe des comptes e2e (cohérent entre
#                    création et session par mot de passe)
# Variables de sortie consommables par l'appelant après un create réussi :
#   SMOKE_CREATED_EMAIL / SMOKE_CREATED_ID / SMOKE_CREATED_PASSWORD
#   SMOKE_SESSION_JWT  (après smoke_accounts_session)
#
# Fonctions publiques :
#   smoke_accounts_init           prépare le répertoire temporaire (obligatoire)
#   smoke_accounts_tmp_clean      supprime le répertoire temporaire (à appeler
#                                 dans le trap EXIT de l'appelant — la
#                                 bibliothèque ne pose PAS son propre trap,
#                                 elle écraserait celui du smoke)
#   smoke_accounts_mode           sonde GET /auth/v1/settings → « admin » ou
#                                 « signup » (CS-01, sonde publique sans effet
#                                 de bord)
#   smoke_accounts_create RUN_ID INDEX [NAME]
#                                 crée UN compte confirmé (email_confirm:true)
#                                 en mode admin ; emails e2e+<runid>-<index>@
#                                 (EE-01) ; 429 → pause fixe + UN retry, 422 →
#                                 échec nommé immédiat (DS-02)
#   smoke_accounts_purge RUN_ID   purge bornée aux uids du run courant,
#                                 prouvée par re-delete → 404 exigé (§2.7 F)
#   smoke_accounts_list           liste les comptes e2e résiduels HORS du run
#                                 courant sur stdout ; SIGNALE, ne supprime
#                                 jamais (EE-02)
#   smoke_accounts_session EMAIL PASSWORD
#                                 POST /auth/v1/token?grant_type=password — un
#                                 compte admin-créé est confirmé, le grant
#                                 password fonctionne sans autoconfirm (A1)

# Extraction d'une valeur booléenne JSON (mailer_autoconfirm n'est PAS une
# chaîne : json_string du smoke ne la trouverait pas).
smoke_json_bool() {
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\\(true\\|false\\).*/\\1/p" | head -n 1
}

# Extraction d'une valeur chaîne JSON, même tolérance aux espaces que le smoke.
smoke_json_string() {
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# Lecture du .env sans le sourcer — même canal que le smoke (stack_value).
smoke_stack_value() {
  [ -n "$SMOKE_STACK_ENV" ] || {
    echo "lib-smoke-accounts: SMOKE_STACK_ENV non renseigné." >&2
    return 1
  }
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$SMOKE_STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

smoke_accounts_api() {
  if [ -n "$SMOKE_API" ]; then
    printf '%s' "${SMOKE_API%/}"
  else
    echo "lib-smoke-accounts: SMOKE_API non renseignée." >&2
    return 1
  fi
}

smoke_accounts_init() {
  if [ -z "$SMOKE_LIB_TMP" ]; then
    SMOKE_LIB_TMP="$(mktemp -d)"
    SMOKE_ACCOUNTS_LOG="$SMOKE_LIB_TMP/comptes-du-run"
    : >"$SMOKE_ACCOUNTS_LOG"
  fi
}

smoke_accounts_tmp_clean() {
  if [ -n "$SMOKE_LIB_TMP" ]; then
    rm -rf "$SMOKE_LIB_TMP"
    SMOKE_LIB_TMP=""
    SMOKE_ACCOUNTS_LOG=""
  fi
}

# Le secret ne s'affiche jamais — son absence, elle, se nomme (CS-02, §2.7 F).
smoke_accounts_secret() {
  if [ -z "$SMOKE_SECRET_KEY" ]; then
    SMOKE_SECRET_KEY="${SECRET_KEY:-}"
    [ -n "$SMOKE_SECRET_KEY" ] || SMOKE_SECRET_KEY="$(smoke_stack_value SUPABASE_SECRET_KEY)" || return 1
  fi
  if [ -z "$SMOKE_SECRET_KEY" ]; then
    echo "lib-smoke-accounts: SUPABASE_SECRET_KEY absent de $SMOKE_STACK_ENV." >&2
    echo "  L'Admin GoTrue exige la clé secrète : lancez depuis l'hôte de la stack." >&2
    return 1
  fi
}

# Fichier de configuration curl -K en 0600 — le pattern de seed-test-accounts.sh.
# Seule forme du dépôt qui prouve l'absence du secret dans `ps` (§2.7 H).
smoke_admin_config() {
  smoke_accounts_init
  smoke_accounts_secret || return 1
  file="$SMOKE_LIB_TMP/admin-headers"
  {
    printf 'header = "apikey: %s"\n' "$SMOKE_SECRET_KEY"
    printf 'header = "Authorization: Bearer %s"\n' "$SMOKE_SECRET_KEY"
  } >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

smoke_accounts_mode() {
  api="$(smoke_accounts_api)" || return 1
  response="$(curl -sS -w '\n%{http_code}' "$api/auth/v1/settings" 2>/dev/null \
    || printf '\n000')"
  code="$(printf '%s' "$response" | tail -n 1)"
  body="$(printf '%s' "$response" | sed '$d')"
  if [ "$code" != "200" ]; then
    echo "lib-smoke-accounts: la sonde GET /auth/v1/settings a échoué (code $code)." >&2
    return 1
  fi
  autoconfirm="$(smoke_json_bool "$body" mailer_autoconfirm)"
  if [ "$autoconfirm" = "false" ]; then
    # prod : ENABLE_EMAIL_AUTOCONFIRM=false — création via Admin API (CS-01)
    printf 'admin'
  else
    # stack dev : autoconfirm actif — chemin /auth/v1/signup inchangé (CS-03)
    printf 'signup'
  fi
}

smoke_accounts_domain() {
  if [ -n "$SMOKE_MAIL_DOMAIN" ]; then
    printf '%s' "$SMOKE_MAIL_DOMAIN"
    return 0
  fi
  domain="$(smoke_stack_value E2E_MAIL_DOMAIN)" || domain=""
  # Défaut : domaine réel du déploiement (A2 — aucun DNS requis, les comptes
  # admin ne déclenchent aucun email ; à aligner si un sous-domaine est réservé).
  printf '%s' "${domain:-ensemble.jeremymaillot.fr}"
}

# Une création par appel. Le re-run d'un email déjà existant est un 422 nommé,
# jamais un succès silencieux (Pitfall 3 / DS-02).
smoke_accounts_create() {
  run_id="$1"
  index="$2"
  name="${3:-Compte e2e}"
  api="$(smoke_accounts_api)" || return 1
  config="$(smoke_admin_config)" || return 1
  domain="$(smoke_accounts_domain)"
  email="e2e+${run_id}-${index}@${domain}"
  password="${SMOKE_ACCOUNT_PASSWORD:-Mot-de-passe-de-test-2026!}"
  body="{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"data\":{\"full_name\":\"$name\"}}"
  target="$SMOKE_LIB_TMP/creation-body"

  create_once() {
    curl -sS -o "$target" -w '%{http_code}' -X POST "$api/auth/v1/admin/users" \
      -K "$config" -H 'Content-Type: application/json' --data "$body"
  }

  code="$(create_once)"
  if [ "$code" = "429" ]; then
    # DS-02 : pause fixe courte et UN seul retry — jamais de backoff générique
    # qui masquerait une vraie erreur.
    sleep 5
    code="$(create_once)"
  fi

  case "$code" in
    200|201)
      uid="$(smoke_json_string "$(cat "$target")" id)"
      if [ -z "$uid" ]; then
        echo "lib-smoke-accounts: création acceptée ($email) mais aucun id renvoyé : $(cat "$target")" >&2
        return 1
      fi
      printf '%s\t%s\n' "$uid" "$email" >>"$SMOKE_ACCOUNTS_LOG"
      SMOKE_CREATED_EMAIL="$email"
      SMOKE_CREATED_ID="$uid"
      SMOKE_CREATED_PASSWORD="$password"
      return 0
      ;;
    422)
      # 422 = validation GoTrue (email_exists, weak_password…) : échec nommé
      # IMMÉDIAT avec le corps — jamais traité comme du throttling (DS-02).
      echo "lib-smoke-accounts: création refusée pour $email (422, échec immédiat) : $(cat "$target")" >&2
      return 1
      ;;
    *)
      echo "lib-smoke-accounts: création impossible pour $email (code $code) : $(cat "$target")" >&2
      return 1
      ;;
  esac
}

# Purge vérifiée (§2.7 F) : chaque suppression est prouvée par un re-delete
# immédiat dont le 404 est EXIGÉ — un compte qui survit à son run fait échouer
# la purge. Bornée aux uids du fichier du run courant (EE-02 : pas d'effet de
# bord sur un run concurrent).
smoke_accounts_purge() {
  api="$(smoke_accounts_api)" || return 1
  config="$(smoke_admin_config)" || return 1
  status=0
  while IFS='	' read -r uid email; do
    [ -n "$uid" ] || continue
    code="$(curl -sS -o /dev/null -w '%{http_code}' \
      -X DELETE "$api/auth/v1/admin/users/$uid" -K "$config")"
    case "$code" in
      200|204)
        code2="$(curl -sS -o /dev/null -w '%{http_code}' \
          -X DELETE "$api/auth/v1/admin/users/$uid" -K "$config")"
        if [ "$code2" != "404" ]; then
          echo "lib-smoke-accounts: purge NON prouvée pour $email (re-delete: $code2, 404 attendu)" >&2
          status=1
        fi
        ;;
      *)
        echo "lib-smoke-accounts: suppression de $email refusée (code $code)" >&2
        status=1
        ;;
    esac
  done <"$SMOKE_ACCOUNTS_LOG"
  # Purge intégralement prouvée : le run est soldé, on vide la liste pour qu'un
  # second appel ne repasse pas sur des comptes déjà supprimés.
  [ "$status" -eq 0 ] && : >"$SMOKE_ACCOUNTS_LOG"
  return "$status"
}

# Liste les comptes e2e résiduels (EE-02) HORS du run courant, sur stdout.
# Ne supprime JAMAIS : un résidu est un signalement pour action humaine.
# Le filtre porte sur la partie avant le « + » (Pitfall 5 : un « + » nu dans la
# query peut être décodé en espace et rendre le filtre muet — un « aucun
# résidu » faux serait un succès mensonger) ; chaque résultat est re-vérifié
# par son email avant d'être signalé.
smoke_accounts_list() {
  api="$(smoke_accounts_api)" || return 1
  config="$(smoke_admin_config)" || return 1
  emails="$SMOKE_LIB_TMP/emails-tous"
  residus="$SMOKE_LIB_TMP/residus"
  : >"$emails"
  : >"$residus"
  page=1
  while [ "$page" -le 20 ]; do
    code="$(curl -sS -o "$SMOKE_LIB_TMP/liste-body" -w '%{http_code}' \
      "$api/auth/v1/admin/users?filter=e2e&per_page=50&page=$page" -K "$config")"
    if [ "$code" != "200" ]; then
      echo "lib-smoke-accounts: liste des utilisateurs impossible (code $code)" >&2
      return 1
    fi
    grep -o '"email": *"[^"]*"' "$SMOKE_LIB_TMP/liste-body" \
      | sed 's/^"email": *"//; s/"$//' >"$SMOKE_LIB_TMP/page-emails"
    trouves="$(grep -c . "$SMOKE_LIB_TMP/page-emails" || true)"
    cat "$SMOKE_LIB_TMP/page-emails" >>"$emails"
    [ "${trouves:-0}" -gt 0 ] 2>/dev/null || break
    page=$((page + 1))
  done
  while IFS= read -r email; do
    [ -n "$email" ] || continue
    # Re-vérification par l'email (Pitfall 5 : le filtre est une sous-chaîne).
    case "$email" in
      e2e+*) ;;
      *) continue ;;
    esac
    # Hors du run courant uniquement : la purge est bornée à ses propres runids.
    if cut -f2 "$SMOKE_ACCOUNTS_LOG" 2>/dev/null | grep -Fqx "$email"; then
      continue
    fi
    printf '%s\n' "$email" >>"$residus"
  done <"$emails"
  cat "$residus"
  return 0
}

# Session par mot de passe pour un compte confirmé (A1). Un compte créé via
# l'Admin avec email_confirm:true n'a pas besoin d'autoconfirm pour ce grant.
# La clé publiable passe en argv — acceptable, ce n'est pas un secret (§2.7 H).
smoke_accounts_session() {
  email="$1"
  password="$2"
  api="$(smoke_accounts_api)" || return 1
  if [ -z "$SMOKE_PUBLISHABLE_KEY" ]; then
    SMOKE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(smoke_stack_value SUPABASE_PUBLISHABLE_KEY)}" || return 1
  fi
  response="$(curl -sS -w '\n%{http_code}' -X POST "$api/auth/v1/token?grant_type=password" \
    -H "apikey: $SMOKE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
    --data "{\"email\":\"$email\",\"password\":\"$password\"}" 2>/dev/null \
    || printf '\n000')"
  code="$(printf '%s' "$response" | tail -n 1)"
  body="$(printf '%s' "$response" | sed '$d')"
  if [ "$code" != "200" ]; then
    echo "lib-smoke-accounts: session impossible pour $email (code $code) : $body" >&2
    return 1
  fi
  jwt="$(smoke_json_string "$body" access_token)"
  if [ -z "$jwt" ]; then
    echo "lib-smoke-accounts: session acceptée pour $email mais aucun access_token : $body" >&2
    return 1
  fi
  SMOKE_SESSION_JWT="$jwt"
  return 0
}

# État interne de la bibliothèque (jamais exporté vers un sous-processus qui
# ne devrait pas voir la clé).
SMOKE_LIB_TMP=""
SMOKE_ACCOUNTS_LOG=""
SMOKE_SECRET_KEY=""
SMOKE_PUBLISHABLE_KEY=""
SMOKE_CREATED_EMAIL=""
SMOKE_CREATED_ID=""
SMOKE_CREATED_PASSWORD=""
SMOKE_SESSION_JWT=""
