#!/usr/bin/env sh
# scripts/generate-vapid-keys.sh
# Génère la paire de clés VAPID des notifications push, et l'écrit dans un
# fichier `.env.vapid` en permissions 600.
#
#   sh scripts/generate-vapid-keys.sh
#   sh scripts/generate-vapid-keys.sh --force              # écrase un fichier existant
#   sh scripts/generate-vapid-keys.sh --subject mailto:contact@votredomaine.fr
#
# POURQUOI UN SCRIPT ET NON `npx web-push generate-vapid-keys`
#   Cette commande existe et fait exactement ce travail. Elle viendrait
#   cependant avec une dépendance à installer et à versionner, pour un besoin
#   ponctuel : deux lignes de WebCrypto font la même chose avec la seule
#   dépendance que le projet a déjà, Node.
#
# LA CLÉ PRIVÉE N'EST JAMAIS AFFICHÉE
#   Elle est écrite dans un fichier ignoré par Git (`.env*`), en 600. L'afficher
#   la ferait passer par le journal du terminal et l'historique du shell, ce
#   qu'AGENTS.md §8.4 interdit pour les secrets. Seule la clé PUBLIQUE est
#   affichée : elle est publique par conception, et c'est elle que l'Edge
#   Function `push-subscribe` renvoie au navigateur.
#
# OÙ LA CLÉ PRIVÉE EST-ELLE UTILISÉE
#   Uniquement par l'Edge Function `push-notify`, pour signer le jeton VAPID
#   (RFC 8292) des envois. Elle est lue dans l'environnement du conteneur
#   `functions` — voir `docs/BACKEND.md` §6.4. Elle n'est jamais écrite en base,
#   et le job pg_cron n'a pas besoin de la connaître : il ne fait qu'appeler
#   `push-notify` avec la clé secrète du projet, lue dans Vault.
#
# ROTATION
#   Générer une nouvelle paire invalide les abonnements existants : le
#   navigateur en conserve un pour l'ancienne clé, et le service Push refusera
#   les envois. Il faut donc, après rotation, demander à chaque membre de
#   réenregistrer ses appareils — ce que le bouton « Synchroniser cet appareil »
#   du panneau des notifications fait en résiliant l'abonnement périmé.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"
OUT_FILE="${OUT_FILE:-$REPO_DIR/.env.vapid}"

FORCE=0
SUBJECT=''

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --subject) shift; SUBJECT="${1:-}" ;;
    --out) shift; OUT_FILE="${1:-$OUT_FILE}" ;;
    -h|--help)
      sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "generate-vapid-keys.sh: option inconnue : $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ -f "$OUT_FILE" ] && [ "$FORCE" -ne 1 ]; then
  echo "generate-vapid-keys.sh: $OUT_FILE existe déjà." >&2
  echo "  Une nouvelle paire invalide les abonnements push enregistrés." >&2
  echo "  Comparez les deux clés publiques avant d'écraser :" >&2
  echo "    grep VAPID_PUBLIC_KEY $OUT_FILE" >&2
  echo "  puis relancez avec --force." >&2
  exit 1
fi

# `sub` doit être une adresse joignable par l'exploitant du service Push
# (RFC 8292 §2.1). À défaut, on dérive `contact@` de l'hôte public du backend.
if [ -z "$SUBJECT" ]; then
  HOST=''
  if [ -f "$STACK_ENV" ]; then
    HOST="$(sed -n 's/^[[:space:]]*SUPABASE_PUBLIC_URL[[:space:]]*=[[:space:]]*//p' "$STACK_ENV" \
      | head -n 1 | sed -e 's|^[a-zA-Z][a-zA-Z0-9+.-]*://||' -e 's|/.*$||' -e 's|:.*$||')"
  fi
  if [ -n "$HOST" ]; then
    SUBJECT="mailto:contact@$HOST"
  else
    echo "generate-vapid-keys.sh: hôte public introuvable dans $STACK_ENV." >&2
    echo "  Indiquez le contact du service Push :" >&2
    echo "    sh scripts/generate-vapid-keys.sh --subject mailto:contact@votredomaine.fr" >&2
    exit 1
  fi
fi

case "$SUBJECT" in
  mailto:*|https://*) ;;
  *)
    echo "generate-vapid-keys.sh: 'sub' doit commencer par mailto: ou https:// — $SUBJECT" >&2
    exit 1
    ;;
esac

command -v node >/dev/null 2>&1 || {
  echo "generate-vapid-keys.sh: node est requis pour générer une paire P-256." >&2
  exit 1
}

umask 077
# La clé privée est écrite dans le fichier, jamais renvoyée sur stdout : le
# script l'affiche ? non. Node écrit les DEUX clés sur stdout, on n'en relit
# qu'une, et la privée est réinjectée ici sans être imprimée.
PUBLIC_KEY="$(node --input-type=module -e '
  const { publicKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  process.stdout.write(Buffer.from(raw).toString("base64url"));
')"

PRIVATE_KEY="$(node --input-type=module -e '
  const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  process.stdout.write(Buffer.from(pkcs8).toString("base64url"));
')"

if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
  echo "generate-vapid-keys.sh: génération vide, abandon." >&2
  exit 1
fi

# Une clé P-256 non compressée fait 65 octets, donc 87 caractères base64url, et
# son PKCS8 138 octets, donc 184 caractères. Un format inattendu produirait ici
# une fonction incapable de signer, sans le moindre signe avant le premier envoi.
if [ "${#PUBLIC_KEY}" -ne 87 ] || [ "${#PRIVATE_KEY}" -ne 184 ]; then
  echo "generate-vapid-keys.sh: format de clé inattendu" >&2
  echo "  clé publique : ${#PUBLIC_KEY} caractères (87 attendus)" >&2
  echo "  clé privée   : ${#PRIVATE_KEY} caractères (184 attendus, PKCS8 base64url)" >&2
  exit 1
fi

cat > "$OUT_FILE" <<EOF
# Généré par scripts/generate-vapid-keys.sh le $(date '+%Y-%m-%d %H:%M').
# Ne pas versionner. VAPID_PRIVATE_KEY n'est lue que par l'Edge Function
# push-notify, dans l'environnement du conteneur `functions`.

VAPID_PUBLIC_KEY=$PUBLIC_KEY
VAPID_PRIVATE_KEY=$PRIVATE_KEY
VAPID_SUBJECT=$SUBJECT
EOF
chmod 600 "$OUT_FILE"
umask 022

echo "Clé VAPID écrite dans $OUT_FILE (600)."
echo "  VAPID_PUBLIC_KEY  = $PUBLIC_KEY"
echo "  VAPID_PRIVATE_KEY = <${#PRIVATE_KEY} caractères, masquée>"
echo "  VAPID_SUBJECT     = $SUBJECT"
echo
echo "Étapes suivantes :"
echo "  1. Conservez $OUT_FILE dans votre gestionnaire de secrets."
echo "  2. Injectez VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT dans"
echo "     l'environnement du service functions (docs/BACKEND.md §6.4)."
echo "  3. sh scripts/deploy-functions.sh && (cd supabase-project && sh run.sh recreate functions)"
echo
echo "La clé publique n'a pas à être ajoutée au frontend : l'Edge Function"
echo "push-subscribe la renvoie au navigateur via action=config."
