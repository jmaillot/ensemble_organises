#!/usr/bin/env sh
# scripts/test-realtime-subscription.sh
# Preuve D-09 (MSG-05, critère 4 du roadmap) : la publication Realtime est
# non seulement inscrite, mais LIVRÉE — un client WebSocket réel reçoit
# l'événement INSERT.
#
#   sh scripts/test-realtime-subscription.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   `test-db.sh` s'arrête à la frontière SQL, et la lecture de
#   `pg_publication_tables` prouve au mieux l'INSCRIPTION d'une table dans
#   `supabase_realtime` — pas sa livraison. Une publication mal câblée côté
#   service (wal_level, listener CDC, auth WS) resterait verte sur une simple
#   lecture SQL. Ce script va jusqu'au bout :
#
#     1. il connecte un VRAI client WebSocket (Node natif, ≥ 22, aucune
#        dépendance npm nouvelle — T-29-SC) au service `realtime` de la
#        stack, par le chemin de production : la gateway api-gw (Envoy),
#        qui route `/realtime/v1/` vers le conteneur realtime avec le
#        `Host: realtime-dev.supabase-realtime` dont la négociation du
#        tenant a besoin ;
#     2. il joint le canal `realtime:public:messages` en config
#        `postgres_changes` event INSERT (protocole Phoenix), puis envoie
#        `access_token` (rôle service, utilisé UNIQUEMENT comme jeton WS
#        exporté en variable d'environnement — jamais en argv, §2.7-H,
#        T-29-06) ;
#     3. il sème un message marqué via psql (stdin, jamais -f, jamais
#        secret en -c — §2.7-C) ;
#     4. il attend l'événement `postgres_changes` avec un délai borné, et
#        vérifie que le `id` ET la marque du record reçu sont bien ceux du
#        message semé ICI (preuve attribuable, comme la fenêtre
#        `net._http_response` de test-dispatch-push.sh) ;
#     5. il nettoie, et le nettoyage est VÉRIFIÉ par comptage (§2.7-F —
#        aucun résidu de test en base, T-29-07).
#
#   Il ne prouve PAS que l'application du navigateur reçoit quoi que ce
#   soit : la clé employée est celle du service, et l'app, elle, porte un
#   JWT utilisateur soumis à la RLS. La livraison côté client applicatif se
#   voit dans l'app.
#
# VARIABLES D'ENVIRONNEMENT
#   ATTENTE    secondes d'attente de l'événement (défaut : 30)
#
# AUCUN SECRET N'EST AFFICHÉ. Le script lit l'id du message semé, la marque
# de test, et le payload de l'événement, qui ne contient ni clé ni endpoint.

set -eu

. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

ATTENTE="${ATTENTE:-30}"
RT_SERVICE="realtime"
RT_CONTAINER="realtime-dev.supabase-realtime"

db_require_runtime || exit 1
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "test-realtime-subscription.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  exit 1
fi
db_resolve

# --- Outils ------------------------------------------------------------------

# Une valeur scalaire, sans en-tête ni alignement.
#
# PAS DE PIPELINE AUTOUR DE `db_exec`. Un shell POSIX n'a pas de `pipefail` :
# dans `db_exec | tr | head`, c'est le statut de `head` qui ressort, donc un
# psql en échec donnerait une chaîne vide et un SUCCÈS (§2.7-B). La sortie
# est capturée d'abord, et le pipeline ne travaille plus que sur une chaîne
# déjà obtenue.
un() {
  sortie="$(db_exec -t -A -c "$1")"
  printf '%s' "$sortie" | tr -d '\r' | head -n 1
}

# --- Préalables --------------------------------------------------------------

# Le service realtime doit tourner. S'il est absent de la stack ou arrêté,
# on s'arrête et on le DIT : une preuve D-09 sans service Realtime n'a pas
# de repli honnête, et un vert silencieux serait un mensonge (A2).
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "$RT_SERVICE"; then
  echo "test-realtime-subscription.sh: le service '$RT_SERVICE' n'est pas démarré." >&2
  echo "  Critère 4 (souscription recevant réellement l'événement) impossible à" >&2
  echo "  prouver sans lui. Le démarrer : cd supabase-project && sh run.sh start $RT_SERVICE" >&2
  echo "  S'il n'apparaît pas dans run.sh ps, c'est bloquant pour MSG-05." >&2
  exit 1
fi

# Le chemin de production passe par la gateway api-gw (Envoy) : c'est elle
# qui pose le `Host: realtime-dev.supabase-realtime` exigé par la
# négociation du tenant du service realtime. Une connexion directe au
# conteneur répond 404 — le défaut a été vu lors de la mise au point.
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "api-gw"; then
  echo "test-realtime-subscription.sh: la gateway 'api-gw' n'est pas démarrée." >&2
  echo "  La souscription passe par son routage /realtime/v1/ (Host de tenant)." >&2
  exit 1
fi

# Node ≥ 22 : le client WebSocket est natif (global WebSocket), donc aucune
# dépendance npm nouvelle (T-29-SC).
NodeMajeur="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || NodeMajeur=""
if [ -z "$NodeMajeur" ] || [ "$NodeMajeur" -lt 22 ] 2>/dev/null; then
  echo "test-realtime-subscription.sh: Node >= 22 requis (client WebSocket natif)." >&2
  exit 1
fi

# La clé du service est lue du .env de la stack et passée au client par
# variable d'environnement — JAMAIS en ligne de commande, où elle serait
# lisible dans la liste des processus (§2.7-H, T-29-06). Elle n'est jamais
# imprimée : elle est seulement testée présente.
EO_ENV="$(CDPATH='' cd -- "${EO_PROJECT_DIR}" && pwd)/.env"
if [ ! -f "$EO_ENV" ]; then
  echo "test-realtime-subscription.sh: ${EO_ENV} introuvable." >&2
  exit 1
fi
RT_KEY="$(grep '^SERVICE_ROLE_KEY=' "$EO_ENV" | head -n 1 | cut -d= -f2- | tr -d '\r')"
if [ -z "$RT_KEY" ]; then
  echo "test-realtime-subscription.sh: SERVICE_ROLE_KEY absente du .env de la stack." >&2
  exit 1
fi

# --- Inscription de la publication : nécessaire, NON suffisante --------------
#
# C'est la lecture SQL que test-db.sh couvre déjà. Elle est refaite ici comme
# précondition explicite, mais elle n'est JAMAIS présentée comme le verdict :
# un script qui s'arrêterait ici rendrait un vert pour une preuve qui n'a pas
# eu lieu (Pitfall 4 du plan).
Publications="$(un "select string_agg(schemaname || '.' || tablename, ', ' order by tablename)
                     from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public'
                      and tablename in ('messages', 'conversations', 'conversation_members', 'notification_reads')")"
echo "  Publication   $Publications"
n_publies="$(printf '%s' "$Publications" | awk -F', ' '{print NF}')"
if [ "$n_publies" -ne 4 ] 2>/dev/null; then
  echo "  ÉCHEC         la publication supabase_realtime ne couvre pas les 4 tables" >&2
  echo "                attendues ($n_publies/4). Compléter par une migration" >&2
  echo "                « alter publication supabase_realtime add table public.<table> »." >&2
  exit 1
fi

# --- Client WebSocket éphémère ------------------------------------------------
#
# Écrit dans /tmp/opencode, jamais versionné, jamais avec une clé dedans : la
# clé voyage par l'environnement du processus (RT_KEY). Le client joint le
# canal, annonce SOUSCRIPTION_OK, puis écoute ; à l'événement postgres_changes
# il imprime EVENEMENT_RECU avec le record et rend 0. Tout le reste est rouge.
RepTravail="$(mktemp -d /tmp/opencode/realtime.XXXXXX)"
chmod 700 "$RepTravail"
Client="$RepTravail/client.mjs"
Journal="$RepTravail/journal.log"

cat > "$Client" <<'NOEUD'
const cle = process.env.RT_KEY;
const attente = Number(process.env.RT_ATTENTE || '30') * 1000;
const url = `ws://localhost:8000/realtime/v1/websocket?apikey=${encodeURIComponent(cle)}&vsn=1.0.0`;
const ws = new WebSocket(url);
let joint = false;
const timeoutMinuteur = setTimeout(() => { console.log('TEMPS_DEPASSE'); process.exit(2); }, attente);
ws.onopen = () => {
  ws.send(JSON.stringify({
    topic: 'realtime:public:messages', event: 'phx_join', ref: '1',
    payload: { config: { postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'messages' }] } }
  }));
  setInterval(() => {
    try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', ref: 'hb', payload: {} })); } catch {}
  }, 10000);
};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (!joint && m.event === 'phx_reply' && m.payload?.status === 'ok'
      && m.topic === 'realtime:public:messages') {
    ws.send(JSON.stringify({
      topic: 'realtime:public:messages', event: 'access_token', ref: '3',
      payload: { access_token: cle }
    }));
    console.log('SOUSCRIPTION_OK');
    joint = true;
    return;
  }
  if (!joint && m.event === 'phx_reply' && m.payload?.status === 'error') {
    console.log('SOUSCRIPTION_REFUSEE ' + JSON.stringify(m.payload?.response ?? {}));
    clearTimeout(timeoutMinuteur); process.exit(4);
  }
  if (m.event === 'postgres_changes') {
    console.log('EVENEMENT_RECU ' + JSON.stringify(m.payload?.data?.record ?? {}));
    clearTimeout(timeoutMinuteur); process.exit(0);
  }
};
ws.onerror = () => console.log('WS_ERREUR');
ws.onclose = (e) => {
  if (!joint) { console.log('FERME_AVANT_SOUSCRIPTION code=' + e.code); clearTimeout(timeoutMinuteur); process.exit(3); }
};
NOEUD

# --- Semure, et nettoyage vérifié ---------------------------------------------
#
# Même discipline que test-dispatch-push.sh : le nettoyage est DÉCLARÉ et
# VÉRIFIÉ par comptage, pas délégué à un trap que personne ne voit.
Conv=""
Message=""
Expediteur=""
Marque="MARQUEWS-$(date +%s)-$$"
NettoyerVerifie=0

nettoyer() {
  if [ -n "$Message" ]; then
    db_exec -q -c "delete from public.messages where id = '$Message'" >/dev/null 2>&1 || true
  fi
  if [ -n "$Conv" ]; then
    db_exec -q -c "delete from public.conversations where id = '$Conv'" >/dev/null 2>&1 || true
  fi
  if [ -n "$Expediteur" ]; then
    db_exec -q -c "delete from public.household_members where id = '$Expediteur'" >/dev/null 2>&1 || true
  fi
}

reste_a_nettoyer() {
  un "select ((select count(*) from public.messages where id = '$Message')
               + (select count(*) from public.conversations where id = '$Conv')
               + (select count(*) from public.household_members where id = '$Expediteur'))::text"
}

signaler_reste() {
  r="$(reste_a_nettoyer)"
  if [ "$r" = "0" ]; then
    return 0
  fi
  echo "  ÉCHEC         $r ligne(s) de test subsiste(nt) après nettoyage." >&2
  echo "                Conversation $Conv, message $Message. À supprimer à la main :" >&2
  echo "                  sh scripts/psql.sh -c \"delete from public.conversations" >&2
  echo "                    where id = '$Conv';\"" >&2
  return 1
}

trap 'nettoyer; signaler_reste >&2 || true' EXIT

# Un foyer réel, un expéditeur semé sans compte (profil géré, 0145), une
# conversation directe : même forme que le groupe de messages de
# test-dispatch-push.sh. La marque est reconnaissable (§2.7-D).
Foyer="$(un 'select household_id from public.conversations limit 1')"
if [ -z "$Foyer" ]; then
  echo "test-realtime-subscription.sh: aucun foyer existant pour semer la conversation." >&2
  exit 1
fi
Expediteur="$(un "insert into public.household_members (household_id, user_id, display_name, color_tag, role)
  values ('$Foyer', null, 'Semure WS', 'ink', 'enfant') returning id")"
Conv="$(un "insert into public.conversations (household_id, type) values ('$Foyer', 'direct') returning id")"
if [ -z "$Expediteur" ] || [ -z "$Conv" ]; then
  echo "test-realtime-subscription.sh: la semure de la conversation n'a rien produit." >&2
  exit 1
fi

# --- Souscription réelle ------------------------------------------------------

rm -f "$Journal"
export RT_KEY RT_ATTENTE
node "$Client" >"$Journal" 2>&1 &
ClientPid=$!

# La souscription doit être confirmée AVANT le semis : sinon un démarrage
# trop lent ferait rater l'INSERT, et le rouge qui suivrait documenterait un
# défaut du script, pas du service.
joint=0
i=0
while [ "$i" -lt 15 ]; do
  if grep -q '^SOUSCRIPTION_OK$' "$Journal" 2>/dev/null; then
    joint=1
    break
  fi
  if ! kill -0 "$ClientPid" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$joint" -ne 1 ]; then
  echo "  ÉCHEC         la souscription WebSocket n'a pas abouti en 15s." >&2
  echo "  Journal du client (sans secret) :" >&2
  cat "$Journal" >&2 || true
  exit 1
fi
echo "  Souscription  canal realtime:public:messages (postgres_changes INSERT) — ok"

# --- Semis, et attente bornée ---------------------------------------------------

InstantSemis="$(date +%s)"
Message="$(un "insert into public.messages (household_id, conversation_id, sender_id, content)
  values ('$Foyer', '$Conv', '$Expediteur', '$Marque') returning id")"
if [ -z "$Message" ]; then
  echo "test-realtime-subscription.sh: le semis du message n'a rien produit." >&2
  exit 1
fi
echo "  Message semé  $Message  (marque $Marque)"

i=0
while kill -0 "$ClientPid" 2>/dev/null && [ "$i" -lt "$ATTENTE" ]; do
  i=$((i + 1))
  sleep 1
done
AttenteReelle=$(( $(date +%s) - InstantSemis ))
ClientRc=0
wait "$ClientPid" || ClientRc=$?

# --- Les faits ------------------------------------------------------------------

echec=0

Record="$(sed -n 's/^EVENEMENT_RECU //p' "$Journal" | head -n 1)"

if [ "$ClientRc" -ne 0 ] || [ -z "$Record" ]; then
  echo "  ÉCHEC         aucun événement postgres_changes reçu après ${AttenteReelle}s" >&2
  echo "                (code client $ClientRc). La publication est inscrite mais" >&2
  echo "                l'événement n'est pas LIVRÉ — défaut de service Realtime :" >&2
  echo "                  cd supabase-project && sh run.sh logs realtime" >&2
  echo "  Journal du client (sans secret) :" >&2
  cat "$Journal" >&2 || true
  echec=1
else
  echo "  Événement     reçu en ${AttenteReelle}s"
  echo "  Record        $Record"
  # La preuve est attribuable : le record reçu est bien le message semé ICI,
  # par son id ET par sa marque — pas un message d'un autre client (§2.7-D).
  case "$Record" in
    *"\"id\":\"$Message\""*) ;;
    *)
      echo "  ÉCHEC         l'événement reçu n'est pas le message semé ($Message)." >&2
      echec=1
      ;;
  esac
  case "$Record" in
    *"$Marque"*) ;;
    *)
      echo "  ÉCHEC         la marque de test ne traverse pas le payload reçu." >&2
      echec=1
      ;;
  esac
fi

# --- Nettoyage ------------------------------------------------------------------

nettoyer
NettoyerVerifie=1
if ! signaler_reste; then
  echec=1
else
  echo "  Nettoyage     conversation, message et expéditeur supprimés (compté 0)."
fi
rm -rf "$RepTravail"

echo
if [ "$echec" -eq 0 ]; then
  echo "  OK            souscription WebSocket réelle → événement INSERT livré,"
  echo "                attribuable au message semé, nettoyage vérifié."
else
  echo "  ÉCHEC         voir ci-dessus."
fi
exit "$echec"
