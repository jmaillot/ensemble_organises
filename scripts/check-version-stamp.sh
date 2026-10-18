#!/usr/bin/env sh
# scripts/check-version-stamp.sh
# Contrôle de l'estampille de build (phase 24) : LE preuve de R1/R2.
#
# Ce qu'il PRUVE, sur deux images éphémères construites puis détruites :
#   - les quatre canaux (en-tête HTTP `X-App-Version`, `/version.json`,
#     label OCI `org.opencontainers.image.revision`, bundle Vite) portent la
#     MÊME valeur, non vide, égale au SHA construit (cas A) ;
#   - construite SANS SHA (variable d'environnement absente — cas B1), et
#     construite avec l'argument VIDÉ (cas B2, la voie réelle de Compose qui
#     transmet TOUJOURS `GIT_SHA`, `""` si la variable est absente), l'image
#     porte `unknown` partout et démarre quand même : l'absence ne casse pas
#     le build et ne rend jamais une valeur fausse (R2, D-02) ;
#   - les valeurs des deux familles DIFFÈRENT : si elles étaient égales, le
#     plumbing de l'ARG ne serait jamais lu — assertion conçue pour échouer
#     (AGENTS.md §2.7 B).
#
# Ce qu'il NE prouve PAS : ni le transit de `X-App-Version` à travers Traefik
# en production, ni la consommation du runbook avec `GIT_SHA=… --build` (rôle
# du déploiement, jamais exécuté par ce contrôle).
#
# Il exige Docker : sur une machine sans Docker, son exécution est à DIRE non
# exécutée, jamais à présenter comme verte (AGENTS.md §2.7).
#
# Usage : sh scripts/check-version-stamp.sh   (depuis la racine ou ailleurs)

set -eu

# Les chemins sont ancrés sur l'emplacement du script, pas sur le répertoire
# courant : le script doit être invoquable depuis `supabase-project/` comme
# depuis la racine (motif de scripts/smoke-test.sh).
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

echec() { echo "ECHEC: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 \
  || echec "docker introuvable — ce contrôle ne peut pas s'exécuter sur cette machine."
docker info >/dev/null 2>&1 \
  || echec "démon Docker injoignable — ce contrôle ne peut pas s'exécuter sur cette machine."

SHA="$(git rev-parse HEAD)"

# Arbre sale : le SHA nomme le commit, mais le contexte de build peut contenir
# des modifications non committées — l'estampille serait juste sur le papier,
# fausse en contenu. Avertissement seulement, pas échec : un contrôle sur
# arbre sale n'est pas à pénaliser à tort.
if [ -n "$(git status --porcelain)" ]; then
  echo "AVERTISSEMENT: arbre de travail non propre — le SHA nomme le commit, pas le contenu réellement copié dans l'image." >&2
fi

# Nettoyage garanti par trap sur EXIT/INT/TERM : aucun conteneur ni image
# éphémère ne survit, quel que soit le point de sortie. Un handler piégé sur
# INT/TERM ne TERMINE PAS le script en sh POSIX — l'exécution reprend après
# lui — donc le nettoyage seul y laisserait le contrôle poursuivre sur ses
# conteneurs détruits jusqu'à imprimer « OK » en 0 : une interruption qui se
# termine en succès est un succès inexpliqué (AGENTS.md §2.7 F). D'où
# `exit 130`/`exit 143` après nettoyage (codes conventionnels de SIGINT et
# SIGTERM). L'image ni le conteneur `ensemble-organises-app` ne sont JAMAIS
# touchés : ce contrôle ne déploie rien (la phase rend la preuve possible,
# elle ne la consomme pas).
NETTOYER() {
  # Les noms reprennent les tags de cas (casa, casb1, casb2) : ce sont ceux
  # utilisés au `docker run --name` de chaque cas, pas des noms abrégés.
  # Idempotent : sur INT/TERM il s'exécute deux fois (le handler, puis le
  # trap EXIT déclenché par l'`exit`), sans effet pour autant.
  docker rm -f eo-stamp-casa eo-stamp-casb1 eo-stamp-casb2 >/dev/null 2>&1 || true
  docker rmi -f eo-stamp-check:casa eo-stamp-check:casb1 eo-stamp-check:casb2 >/dev/null 2>&1 || true
}
trap NETTOYER EXIT
trap 'NETTOYER; exit 130' INT
trap 'NETTOYER; exit 143' TERM

# --- Étape 0 : plumbing Compose --------------------------------------------
# Le SHA ne peut venir que du shell opérateur : Compose n'exécute PAS les
# substitutions shell, et le SHA n'est pas calculable dans le build (`.git`
# est exclu du contexte par `.dockerignore`). `.env.app.example` est
# versionné, donc présent partout : `.env.app` n'est PAS requis ici.
if ! GIT_SHA="$SHA" docker compose --env-file .env.app.example -f compose.app.yaml config | grep -q "GIT_SHA: $SHA"; then
  echec "interpolation Compose — compose.app.yaml ne transmet plus GIT_SHA dans build.args (ou plus dans la forme \${GIT_SHA:-})."
fi
echo "etape 0 — interpolation Compose: GIT_SHA=$SHA transmis au build"

# --- Construction et démarrage d'un cas éphémère ---------------------------
# $1 : suffixe de tag/nom ; $2 : mode de transmission du SHA —
#   `avec` (build-arg porteur du SHA), `absente` (aucun build-arg),
#   `vide` (build-arg explicitement vidée : le chemin réel de Compose).
# Les args Vite sont des valeurs PUBLIQUES d'exemple : aucun `.env` requis,
# aucun secret sur la ligne de commande (AGENTS.md §2.7 H).
demarrer_cas() {
  cas_tag="$1"
  cas_mode="$2"
  case "$cas_mode" in
    avec)    set -- --build-arg "GIT_SHA=$SHA" ;;
    absente) set -- ;;
    vide)    set -- --build-arg "GIT_SHA=" ;;
    *)       echec "mode de transmission inconnu: $cas_mode" ;;
  esac
  docker build "$@" \
    --build-arg VITE_SUPABASE_URL=https://example.invalid \
    --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example \
    -t "eo-stamp-check:$cas_tag" app/ >/dev/null
  docker run -d --rm --name "eo-stamp-$cas_tag" -p 127.0.0.1::8080 "eo-stamp-check:$cas_tag" >/dev/null
  sleep 3
  # Le conteneur doit DÉMARRER et servir : une requête `/` répond. Un
  # conteneur mort après un build réussi signale presque toujours une config
  # nginx invalide, c'est-à-dire un placeholder non substitué.
  cas_port="$(docker port "eo-stamp-$cas_tag" 8080/tcp | sed 's/.*://')"
  curl -sSf "http://127.0.0.1:$cas_port/" >/dev/null \
    || echec "cas $cas_tag: le conteneur ne répond pas sur / — config nginx invalide ou placeholder non substitué."
}

# --- Relevage des quatre canaux d'un cas -----------------------------------
# Écrit CANAL_ENTETE, CANAL_JSON, CANAL_LABEL, CANAL_BUNDLE. Chaque valeur
# est relevée par sa propre lecture (curl, docker inspect, grep du bundle) :
# rien n'est supposé. $1 : suffixe du cas.
relever_canaux() {
  cas_tag="$1"
  cas_port="$(docker port "eo-stamp-$cas_tag" 8080/tcp | sed 's/.*://')"
  CANAL_ENTETE="$(curl -sSI "http://127.0.0.1:$cas_port/" \
    | sed -n 's/^[Xx]-[Aa]pp-[Vv]ersion: *//p' | tr -d '\r' | head -n 1)"
  CANAL_JSON="$(curl -sS "http://127.0.0.1:$cas_port/version.json" \
    | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  CANAL_LABEL="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "eo-stamp-$cas_tag")"
  if docker run --rm "eo-stamp-check:$cas_tag" sh -c 'grep -q "$1" /usr/share/nginx/html/assets/*.js' _ "$SHA"; then
    CANAL_BUNDLE="$SHA"
  elif docker run --rm "eo-stamp-check:$cas_tag" sh -c 'grep -q "unknown" /usr/share/nginx/html/assets/*.js'; then
    CANAL_BUNDLE="unknown"
  else
    CANAL_BUNDLE=""
  fi
}

# --- Comparaison d'un canal ------------------------------------------------
# Impressionne chaque valeur relevée : un contrôle qui n'imprime rien ne
# prouve rien (AGENTS.md §2.7 F — preuve de sa propre efficacité). Échoue
# bruyamment sur tout écart ou valeur vide.
canal_egal() {
  canal_nom="$1"
  attendue="$2"
  observee="$3"
  echo "  $canal_nom = ${observee:-<vide>} (attendu: $attendue)"
  if [ -z "$observee" ]; then
    echec "canal $canal_nom relevé VIDE — un \${GIT_SHA:-} manque à un point d'usage du Dockerfile ; la chaîne partirait en production."
  fi
  if [ "$observee" != "$attendue" ]; then
    echec "canal $canal_nom diverge — attendu '$attendue', relevé '$observee' (D-01 : une seule source alimente les quatre canaux)."
  fi
}

# --- Auto-exercice du contrôle ---------------------------------------------
# Un contrôle se prouve sur un cas qui DOIT échouer (AGENTS.md §2.7 B) :
# `canal_egal` doit REFUSER une valeur fausse. Si la comparaison l'acceptait,
# le contrôle lui-même échouerait.
if ( canal_egal "auto-exercice" "$SHA" "0000000000000000000000000000000000000000" ) >/dev/null 2>&1; then
  echec "l'auto-exercice de canal_egal a ACCEPTÉ une valeur fausse — le contrôle lui-même est cassé."
fi
echo "auto-exercice de canal_egal: refus d'une valeur fausse, OK"

# --- Cas A : avec SHA -------------------------------------------------------
echo "cas A — avec SHA ($SHA)"
demarrer_cas casa avec
relever_canaux casa
A_ENTETE="$CANAL_ENTETE"; A_JSON="$CANAL_JSON"; A_LABEL="$CANAL_LABEL"; A_BUNDLE="$CANAL_BUNDLE"
canal_egal "cas A entete"    "$SHA" "$A_ENTETE"
canal_egal "cas A json"      "$SHA" "$A_JSON"
canal_egal "cas A label"     "$SHA" "$A_LABEL"
canal_egal "cas A bundle"    "$SHA" "$A_BUNDLE"

# --- Cas B1 : variable absente (aucun build-arg GIT_SHA) --------------------
echo "cas B1 — variable absente (aucun --build-arg GIT_SHA)"
demarrer_cas casb1 absente
relever_canaux casb1
B1_ENTETE="$CANAL_ENTETE"; B1_JSON="$CANAL_JSON"; B1_LABEL="$CANAL_LABEL"; B1_BUNDLE="$CANAL_BUNDLE"
canal_egal "cas B1 entete"   "unknown" "$B1_ENTETE"
canal_egal "cas B1 json"     "unknown" "$B1_JSON"
canal_egal "cas B1 label"    "unknown" "$B1_LABEL"
canal_egal "cas B1 bundle"   "unknown" "$B1_BUNDLE"

# --- Cas B2 : argument explicitement vidée (la voie réelle de Compose) ------
# Compose passe TOUJOURS GIT_SHA, `""` quand la variable est absente : c'est
# cette variante qui représente l'opérateur qui oublie le préfixe shell.
echo "cas B2 — argument vidée (--build-arg GIT_SHA=)"
demarrer_cas casb2 vide
relever_canaux casb2
B2_ENTETE="$CANAL_ENTETE"; B2_JSON="$CANAL_JSON"; B2_LABEL="$CANAL_LABEL"; B2_BUNDLE="$CANAL_BUNDLE"
canal_egal "cas B2 entete"   "unknown" "$B2_ENTETE"
canal_egal "cas B2 json"     "unknown" "$B2_JSON"
canal_egal "cas B2 label"    "unknown" "$B2_LABEL"
canal_egal "cas B2 bundle"   "unknown" "$B2_BUNDLE"

# --- L'assertion conçue pour échouer ---------------------------------------
# Les deux familles doivent DIFFÉRER. Si elles portaient la même valeur, le
# plumbing de l'ARG GIT_SHA n'est jamais lu : le contrôle s'arrête en nommant
# cette cause plutôt que de conclure à rien.
if [ "$A_ENTETE" = "$B1_ENTETE" ]; then
  echec "cas A et cas B1 portent la même valeur '$A_ENTETE' — le plumbing de l'ARG GIT_SHA n'est jamais lu (le défaut d'ARG masquerait l'absence)."
fi
if [ "$A_ENTETE" = "$B2_ENTETE" ]; then
  echec "cas A et cas B2 portent la même valeur '$A_ENTETE' — le plumbing de l'ARG GIT_SHA n'est jamais lu (la chaîne vide ne serait pas convertie en unknown)."
fi
echo "inegalite des deux familles: OK (A=$A_ENTETE, B1=$B1_ENTETE, B2=$B2_ENTETE)"

echo "ESTAMPILLE DE BUILD: OK — quatre canaux egaux au SHA avec estampille, quatre canaux a unknown sans, les deux familles differentes."
