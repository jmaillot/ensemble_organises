#!/usr/bin/env sh
# scripts/send-mail.sh
# Transport de notification par mail des scripts d'exploitation (D-06/D-13).
#
#   sh scripts/send-mail.sh "sujet" corps.txt
#   printf '…\n' | sh scripts/send-mail.sh "sujet"
#
# Le canal est le SMTP de la stack (D-13), celui de GoTrue. Deux transports,
# choisis à l'exécution — jamais configurés à la main :
#
#   · `msmtp` présent sur l'hôte  → envoi local avec la config EO_MAIL_RC ;
#   · sinon                       → conteneur jetable alpine branché sur le
#     réseau Docker de la stack (EO_MAIL_NETWORK), où `SMTP_HOST` de
#     `supabase-project/.env` (`supabase-mail`, nom de réseau Docker interne)
#     est résolvable depuis l'hôte, lui, ne l'est pas. L'arbitrage et sa sonde
#     sont consignés dans docs/DEPLOIEMENT-PROD.md (« Transport mail des
#     checks »).
#
# Variables d'environnement reconnues :
#   EO_MAIL_TO          destinataire du verdict (OBLIGATOIRE — l'opérateur)
#   EO_MAIL_FROM        expéditeur (défaut : EO_MAIL_FROM_FILE, sinon
#                       admin@example.com — à surcharger en prod)
#   EO_MAIL_RC          config msmtp (défaut : /etc/msmtprc), chmod 600 exigé
#
# Mode conteneur — chaque valeur SMTP vit dans un fichier chmod 600 HORS
# dépôt, dont le chemin est donné par une variable (jamais sourcée, jamais en
# argv, jamais journalisée — §2.7 H) :
#   EO_SMTP_HOST_FILE   fichier contenant l'hôte SMTP (défaut : attendu
#                       `supabase-mail`, le service mail de la stack)
#   EO_SMTP_PORT_FILE   fichier contenant le port (défaut : 2500)
#   EO_SMTP_USER_FILE   fichier contenant l'identifiant (optionnel)
#   EO_SMTP_PASS_FILE   fichier contenant le mot de passe (optionnel)
#   EO_MAIL_NETWORK     réseau Docker de la stack (OBLIGATOIRE en mode
#                       conteneur)
#
# Succès : silencieux (le corps du mail parle de lui-même). Échec : cause sur
# stderr, sans jamais répéter le mot de passe. Exit 0/1.
#
# TLS : sur le réseau interne de la stack, le lien est chiffré à un autre
# niveau (traffic isolé par Docker) ; le service mail de la stack écoute en
# clair sur 2500. Un relais EXTERNE exige TLS : c'est le rôle de la config
# msmtp (`tls on`, `tls_trust_file`), pas de ce script.

set -eu

MAIL_TO="${EO_MAIL_TO:-}"
MAIL_FROM="${EO_MAIL_FROM:-}"
MSMTP_RC="${EO_MAIL_RC:-/etc/msmtprc}"

if [ -z "$MAIL_TO" ]; then
  echo "send-mail.sh: EO_MAIL_TO est vide — pas de destinataire pour le verdict." >&2
  exit 1
fi

# secret_file <chemin> : lit une valeur d'un fichier chmod 600, hors dépôt.
# Refuse tout fichier plus permissif, comme backup.sh le fait pour la phrase
# secrète : un secret lisible par le groupe est un secret partagé.
secret_file() {
  f="$1"
  if [ ! -f "$f" ]; then
    echo "send-mail.sh: fichier de creds introuvable : $f" >&2
    exit 1
  fi
  if [ "$(stat -c %a "$f")" != "600" ]; then
    echo "send-mail.sh: permissions trop ouvertes sur $f (exigé : 600)." >&2
    echo "           chmod 600 \"$f\"" >&2
    exit 1
  fi
  # La valeur est la dernière ligne non vide du fichier ; grep + tail, jamais
  # xargs : le contenu est un secret, il ne doit pas être réinterprété par un
  # shell.
  grep -v '^$' "$f" | tail -n 1
}

if [ -z "$MAIL_FROM" ] && [ -n "${EO_MAIL_FROM_FILE:-}" ]; then
  MAIL_FROM="$(secret_file "$EO_MAIL_FROM_FILE")"
fi
MAIL_FROM="${MAIL_FROM:-admin@example.com}"

# Corps du message : par fichier, ou stdin — jamais en argument, il porte du
# contenu variable (tailles, verdicts) qui finirait dans la liste des
# processus.
if [ $# -ge 2 ]; then
  body_file="$2"
  # /dev/null (corps vide) est un cas légitime : existence, pas type fichier.
  if [ ! -e "$body_file" ]; then
    echo "send-mail.sh: corps introuvable : $body_file" >&2
    exit 1
  fi
  if [ ! -r "$body_file" ] || [ "$body_file" = "-" ]; then
    cat
  else
    cat "$body_file"
  fi
else
  cat
fi > "${TMPDIR:-/tmp}/send-mail.$$.body"
body="${TMPDIR:-/tmp}/send-mail.$$.body"
# smtp_envfile est déclaré ici (pas seulement en mode conteneur) pour que le
# trap FINAL référence une variable toujours définie : un trap évaluant une
# variable vide ferait rm -f sur un chemin relatif imprévisible.
smtp_envfile=""
trap 'rm -f "$body" ${smtp_envfile:+"$smtp_envfile"}' EXIT INT TERM

subject="$1"
headers="From: ${MAIL_FROM}
To: ${MAIL_TO}
Subject: ${subject}
Content-Type: text/plain; charset=utf-8"

# --- Mode msmtp --------------------------------------------------------------
# msmtp lit le message complet (en-têtes + corps) sur stdin, le destinataire
# est repris de l'en-tête To:. La config porte les identifiants et le TLS.
if command -v msmtp >/dev/null 2>&1; then
  if [ ! -f "$MSMTP_RC" ]; then
    echo "send-mail.sh: msmtp présent mais config introuvable : $MSMTP_RC" >&2
    echo "           Renseignez EO_MAIL_RC ou créez le fichier (chmod 600)." >&2
    exit 1
  fi
  if [ "$(stat -c %a "$MSMTP_RC")" != "600" ]; then
    echo "send-mail.sh: permissions trop ouvertes sur $MSMTP_RC (exigé : 600)." >&2
    exit 1
  fi
  if ! { printf '%s\n\n' "$headers"; cat "$body"; } \
      | msmtp --file="$MSMTP_RC" --read-recipients 2>/dev/null; then
    echo "send-mail.sh: l'envoi msmtp a échoué (config : $MSMTP_RC, message d'erreur de msmtp masqué)." >&2
    exit 1
  fi
  exit 0
fi

# --- Mode conteneur jetable --------------------------------------------------
# Le service mail n'est résolvable que sur le réseau Docker de la stack :
# même mécanisme que les tars de backup.sh, un conteneur éphémère branché sur
# ce réseau.
if [ -z "${EO_MAIL_NETWORK:-}" ]; then
  echo "send-mail.sh: ni msmtp, ni EO_MAIL_NETWORK — aucun transport disponible." >&2
  echo "           Renseignez EO_MAIL_NETWORK (réseau Docker de la stack) ou" >&2
  echo "           installez msmtp (arbitrage : docs/DEPLOIEMENT-PROD.md," >&2
  echo "           « Transport mail des checks »)." >&2
  exit 1
fi

smtp_host="${SMTP_HOST:-supabase-mail}"
smtp_port="${SMTP_PORT:-2500}"
if [ -n "${EO_SMTP_HOST_FILE:-}" ]; then smtp_host="$(secret_file "$EO_SMTP_HOST_FILE")"; fi
if [ -n "${EO_SMTP_PORT_FILE:-}" ]; then smtp_port="$(secret_file "$EO_SMTP_PORT_FILE")"; fi

smtp_user=""
smtp_pass=""
# Chaque fichier de creds présent est vérifié INDIVIDUELLEMENT : refuser un
# fichier 644, même si son binôme manque, plutôt que d'ignorer en silence un
# secret mal protégé.
if [ -n "${EO_SMTP_USER_FILE:-}" ]; then smtp_user="$(secret_file "$EO_SMTP_USER_FILE")"; fi
if [ -n "${EO_SMTP_PASS_FILE:-}" ]; then smtp_pass="$(secret_file "$EO_SMTP_PASS_FILE")"; fi
if [ -n "$smtp_user" ] && [ -n "$smtp_pass" ]; then
  # Les identifiants passent par un env-file chmod 600 assemblé dans un
  # fichier temporaire privé : ni argv, ni `--env VAR=valeur`. La forme
  # `--env VAR=$secret` place la valeur dans la ligne de commande de
  # `docker run` — lisible par ps / /proc/<pid>/cmdline pour tout utilisateur
  # de l'hôte, et persistée dans les métadonnées du conteneur (`docker
  # inspect`) — exactement ce que §2.7-H interdit. Le fichier est détruit par
  # le trap EXIT posé plus haut, quel que soit le chemin de sortie.
  smtp_envfile="$(mktemp "${TMPDIR:-/tmp}/eo-smtp.XXXXXX")"
  umask 077
  {
    printf 'SMTP_USER=%s\n' "$smtp_user"
    printf 'SMTP_PASS=%s\n' "$smtp_pass"
  } > "$smtp_envfile"
fi

if ! { printf '%s\n\n' "$headers"; cat "$body"; } \
    | docker run --rm --interactive \
        --network "$EO_MAIL_NETWORK" \
        ${smtp_envfile:+"--env-file" "$smtp_envfile"} \
        --env MAIL_FROM="$MAIL_FROM" --env MAIL_TO="$MAIL_TO" \
        --env SMTP_HOST="$smtp_host" --env SMTP_PORT="$smtp_port" \
        alpine:3.21 sh -c '
          if [ -n "$SMTP_USER" ]; then
            sendmail -S "$SMTP_HOST:$SMTP_PORT" \
              -au "$SMTP_USER" -ap "$SMTP_PASS" \
              -f "$MAIL_FROM" "$MAIL_TO"
          else
            sendmail -S "$SMTP_HOST:$SMTP_PORT" \
              -f "$MAIL_FROM" "$MAIL_TO"
          fi
        ' 2>/dev/null; then
  echo "send-mail.sh: l'envoi via le conteneur sur le réseau $EO_MAIL_NETWORK a échoué." >&2
  echo "           Causes possibles : réseau Docker absent (docker network ls)," >&2
  echo "           service mail arrêté (sh run.sh logs mail), port erroné." >&2
  exit 1
fi
