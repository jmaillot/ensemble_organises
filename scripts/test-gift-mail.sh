#!/usr/bin/env sh
# scripts/test-gift-mail.sh
# Preuve attribuable de l'envoi d'invitation cadeau via le relais de dev.
#
#   sh scripts/test-gift-mail.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   Il prouve que le RELAIS de développement accepte un message au gabarit
#   sobre (expéditeur fixe, lien à code, expiration bornée, message hôte) et
#   que ce message est lisible dans la boîte locale — le chemin transport.
#   Chaque envoi porte un jeton unique, et le script dit EXPLICITEMENT à
#   quelle tentative de CE script le message observé appartient (attribution,
#   style `test-dispatch-push.sh`) : un message d'un passage précédent ne
#   peut pas passer pour une preuve du passage courant.
#
#   Il ne prouve PAS l'action Edge `send-email` elle-même : celle-ci exige
#   une session utilisateur et un code d'invitation réel, indisponibles en
#   shell. Son câblage est prouvé par `deploy-functions.sh` + la porte du
#   compte `send-email`, son gabarit par la suite Vitest
#   (`email-template.test.ts`), et l'envoi TLS de production reste une étape
#   manuelle supervisée (voir docs/BACKEND.md, relais SMTP).
#
#   Quand le relais ou sa boîte locale est injoignable, le script IMPRIME UN
#   CONSTAT D'ABSENCE EXPLICITE et sort en 2 (ni succès, ni échec silencieux).
#
# SORTIES
#   0  envoi parti ET relu dans la boîte (preuve attribuée)
#   1  échec (envoi refusé, message introuvable, contenu non conforme)
#   2  absence : relais ou boîte injoignable (à dire, pas à faire taire)
#
# VARIABLES D'ENVIRONNEMENT
#   SMTP_RELAY_HOST  hôte SMTP de dev (défaut : 127.0.0.1)
#   SMTP_RELAY_PORT  port SMTP de dev (défaut : 2500, Inbucket sans auth)
#   INBUCKET_URL     base de l'API boîte locale (défaut : http://127.0.0.1:9000)
#   ATTENTE          secondes d'attente du message (défaut : 20)

set -eu

SMTP_RELAY_HOST="${SMTP_RELAY_HOST:-127.0.0.1}"
SMTP_RELAY_PORT="${SMTP_RELAY_PORT:-2500}"
INBUCKET_URL="${INBUCKET_URL:-http://127.0.0.1:9000}"
ATTENTE="${ATTENTE:-20}"

# Destinataire fixe de la preuve (boîte locale `proche`, adresse complète
# dans l'enveloppe). L'API Inbucket v3 expose la boîte PAR ADRESSE :
# `GET /api/v1/mailbox/{nom}` (liste) puis `/{nom}/{id}` (détail + corps).
DEST_LOCAL="proche"
DEST_MAIL="proche@exemple.fr"

# Jeton unique de cette tentative : l'attribution repose sur lui.
RUN="giftmail-$(date +%s)-$$"

# --- Boîte locale joignable ? -----------------------------------------------
# Sans elle, aucun constat n'est possible : le dire (sortie 2), pas le taire.
# Une boîte inconnue rend 200 + `[]` : c'est le signal de joignabilité.
boite="$(python3 - "$INBUCKET_URL" "$RUN" <<'PYEOF' 2>/dev/null || true
import json
import sys
import urllib.request
base, run = sys.argv[1].rstrip('/'), sys.argv[2]
try:
    with urllib.request.urlopen(base + '/api/v1/mailbox/sonde-' + run, timeout=5) as response:
        status, payload = response.status, response.read().decode('utf-8', 'replace')
except Exception as exc:
    print('INJOIGNABLE: ' + str(exc))
    sys.exit(0)
if status == 200:
    print('JOIGNABLE')
else:
    print('INJOIGNABLE: HTTP ' + str(status))
PYEOF
)"
case "$boite" in
  JOIGNABLE*)
    echo "  Boite         $INBUCKET_URL (boîte $DEST_LOCAL joignable)"
    ;;
  *)
    echo "test-gift-mail.sh: ABSENCE — la boîte locale est injoignable : $INBUCKET_URL" >&2
    echo "  Détail : ${boite:-aucune réponse (connexion refusée ou délai dépassé)}" >&2
    echo "  Démarrer le relais de dev (Inbucket SMTP :2500, API :9000)," >&2
    echo "  puis relancer. Le régime de production (TLS supervisé) reste" >&2
    echo "  hors de portée de ce script (voir docs/BACKEND.md, relais SMTP)." >&2
    exit 2
    ;;
esac

# --- Envoi réel via le relais ------------------------------------------------
# Le message suit le gabarit sobre mot pour mot (expéditeur fixe, lien à
# code, expiration bornée, section du message hôte) + le jeton de la
# tentative, seul lien entre l'envoi et la lecture qui suit.
envoi="$(python3 - "$SMTP_RELAY_HOST" "$SMTP_RELAY_PORT" "$RUN" "$DEST_MAIL" <<'PYEOF' 2>&1 || true
import smtplib
import sys
from email.message import EmailMessage
host, port, run, dest = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
message = EmailMessage()
message['From'] = 'Ensemble & Organises <ne-pas-repondre@exemple.fr>'
message['To'] = dest
message['Subject'] = 'Marie vous partage sa liste \u00ab No\u00ebl de L\u00e9o \u00bb [' + run + ']'
message.set_content('\n'.join([
    'Marie (Les Martin) vous partage sa liste \u00ab No\u00ebl de L\u00e9o \u00bb.',
    'Ouvrir la liste : https://app.votredomaine.fr/invitation/cadeau?code=' + run,
    'Ce lien expire le 2026-12-25.',
    '',
    'Message de Marie :',
    'Pensez aux piles !',
]))
try:
    with smtplib.SMTP(host, port, timeout=10) as relay:
        relay.send_message(message)
except Exception as exc:
    print('ENVOI-REFUSE: ' + str(exc))
    sys.exit(0)
print('ENVOI-PARTI ' + run)
PYEOF
)"
case "$envoi" in
  ENVOI-PARTI*)
    echo "  Envoi         parti vers $SMTP_RELAY_HOST:$SMTP_RELAY_PORT (jeton $RUN)"
    ;;
  *)
    echo "test-gift-mail.sh: ÉCHEC — le relais a refusé l'envoi." >&2
    echo "  Détail : ${envoi:-aucune réponse du relais}" >&2
    exit 1
    ;;
esac

# --- Lecture attribuée --------------------------------------------------------
# Le message lu ensuite DOIT porter le jeton de CET envoi : sans lui, ce
# serait un reste d'un passage précédent, pas une preuve. La liste rend
# l'objet + le détail (`body.text`) pour le verdict de sobriété.
trouve=0
i=0
while [ "$i" -lt "$ATTENTE" ]; do
  contenu="$(python3 - "$INBUCKET_URL" "$DEST_LOCAL" "$RUN" <<'PYEOF' 2>/dev/null || true
import json
import sys
import urllib.request
base, name, run = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]
try:
    with urllib.request.urlopen(base + '/api/v1/mailbox/' + name, timeout=5) as response:
        listing = json.loads(response.read().decode('utf-8', 'replace'))
except Exception:
    sys.exit(0)
if not isinstance(listing, list):
    sys.exit(0)
for entry in listing:
    if run not in json.dumps(entry, ensure_ascii=False):
        continue
    mid = entry.get('id', '')
    try:
        with urllib.request.urlopen(base + '/api/v1/mailbox/' + name + '/' + str(mid), timeout=5) as detail_response:
            detail = json.loads(detail_response.read().decode('utf-8', 'replace'))
    except Exception:
        sys.exit(0)
    body = (detail.get('body') or {}).get('text', '')
    print('TROUVE ' + str(mid) + ' SUJET=' + str(detail.get('subject', '')))
    print('CORPS-BEGIN')
    print(body)
    print('CORPS-END')
    break
PYEOF
)"
  case "$contenu" in
    TROUVE*)
      trouve=1
      break
      ;;
  esac
  i=$((i + 2))
  sleep 2
done

if [ "$trouve" -eq 0 ]; then
  echo "test-gift-mail.sh: ÉCHEC — aucun message au jeton $RUN après ${ATTENTE}s." >&2
  echo "  L'envoi est parti mais la boîte ne le montre pas : relais et boîte" >&2
  echo "  sont-ils le même Inbucket ? (voir $INBUCKET_URL)" >&2
  exit 1
fi

echo "  Lecture       le message ci-dessous appartient à CET envoi (jeton $RUN) :"
echo "$contenu" | sed 's/^/                /'

# --- Sobriété du contenu -------------------------------------------------------
# Le verdict porte sur le CORPS relu (pas sur un reste) : expéditeur fixe,
# lien à code, expiration bornée, section du message hôte.
echec=0
for marque in 'Marie (Les Martin)' 'Ouvrir la liste :' 'Ce lien expire le 2026-12-25.' 'Message de Marie :' 'Pensez aux piles !'; do
  corps_seul="$(echo "$contenu" | sed -n '/^CORPS-BEGIN$/,/^CORPS-END$/p')"
  case "$corps_seul" in
    *"$marque"*)
      echo "  Contenu       « $marque » présent"
      ;;
    *)
      echo "  Contenu       « $marque » MANQUANT dans le corps relu" >&2
      echec=1
      ;;
  esac
done

echo
if [ "$echec" -eq 0 ]; then
  echo "  OK            envoi $RUN parti via le relais ET relu dans la boîte locale."
else
  echo "  ÉCHEC         voir ci-dessus."
fi
exit "$echec"
