#!/usr/bin/env sh
# scripts/check-certs.sh
# Alerte expiration des certificats TLS des hôtes publiés (OPS-03, D-12).
#
# Un certificat expiré bloque l'accès au site ET le callback OAuth, sans rien
# dire dans les logs de la stack : la panne est côté TLS. Ce check sonde
# directement chaque hôte publié en 443 — indépendant de l'emplacement du
# certificat sur le disque (acme.json, Traefik, certbot : peu importe), la
# vérité est ce que sert le port 443, comme un navigateur la voit.
#
#   EO_CERT_HOSTS           hôtes à sonder, séparés par des espaces
#                           (OBLIGATOIRE — jamais codé en dur, la liste vit
#                           dans l'environnement du cron hôte, ex.
#                           « app.exemple.fr api.exemple.fr studio.exemple.fr »)
#   EO_CERT_THRESHOLD_DAYS  alerte si expiration dans moins de N jours
#                           (défaut : 21 — deux cycles de renouvellement)
#
# Un mail [EO-certificats] part UNIQUEMENT si un certificat expire bientôt
# (EO_MAIL_TO) ; silence et exit 0 sinon.
#
# Codes de sortie : 0 tous les certificats valides · 1 alerte ou hôte injoignable.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

HOSTS="${EO_CERT_HOSTS:-}"
THRESHOLD_DAYS="${EO_CERT_THRESHOLD_DAYS:-21}"

if [ -z "$HOSTS" ]; then
  echo "check-certs.sh: EO_CERT_HOSTS est vide — aucune liste d'hôtes à sonder." >&2
  exit 1
fi
case "$THRESHOLD_DAYS" in
  *[!0-9]*) echo "check-certs.sh: EO_CERT_THRESHOLD_DAYS doit être numérique." >&2; exit 1 ;;
esac

now_epoch="$(date +%s)"

alerts=0
alert_body=""
echo "Expiration des certificats (seuil : ${THRESHOLD_DAYS} jours)"
echo

for host in $HOSTS; do
  # `echo |` ferme l'entrée standard : openssl s_client rend la main après la
  # poignée de main, sans rester suspendu sur la session.
  end_date="$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')" || end_date=""
  if [ -z "$end_date" ]; then
    echo "  ✗ $host : TLS injoignable ou certificat illisible" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $host : TLS injoignable sur le port 443 (hôte down, certificat cassé, pare-feu)"
    continue
  fi
  # GNU date sur l'hôte : parse « Mon DD HH:MM:SS YYYY GMT ».
  end_epoch="$(date -d "$end_date" +%s 2>/dev/null)" || end_epoch=""
  if [ -z "$end_epoch" ]; then
    echo "  ✗ $host : date d'expiration illisible ($end_date)" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $host : date d'expiration illisible"
    continue
  fi
  days_left=$(((end_epoch - now_epoch) / 86400))
  if [ "$days_left" -lt "$THRESHOLD_DAYS" ]; then
    echo "  ✗ $host : expire dans ${days_left} jours (< ${THRESHOLD_DAYS}) — $end_date" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $host : certificat expire dans ${days_left} jours (le $end_date)"
  else
    echo "  ✓ $host : ${days_left} jours restants"
  fi
done
echo

if [ "$alerts" -eq 0 ]; then
  echo "Certificats vérifiés : tous au-delà du seuil."
  exit 0
fi

echo "ALERTE : $alerts certificat(s) à renouveler ou hôte(s) injoignable(s)." >&2

if [ -n "${EO_MAIL_TO:-}" ]; then
  {
    echo "Certificats TLS : $alerts anomalie(s) (seuil : ${THRESHOLD_DAYS} jours)."
    echo
    printf '%s\n' "$alert_body"
    echo
    echo "Vérifier : echo | openssl s_client -servername <hôte> -connect <hôte>:443"
    echo "| openssl x509 -noout -enddate — puis relancer sh scripts/check-certs.sh."
  } | sh "$SCRIPT_DIR/send-mail.sh" "[EO-certificats] $alerts anomalie(s) TLS" || \
    echo "check-certs.sh: l'envoi du mail d'alerte a échoué." >&2
fi

exit 1
