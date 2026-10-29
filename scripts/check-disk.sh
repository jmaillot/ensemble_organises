#!/usr/bin/env sh
# scripts/check-disk.sh
# Alerte disque des points de montage de la stack (OPS-03, D-12).
#
# Un disque plein tue la stack sans bruit : PostgreSQL refuse les écritures,
# Storage rejette les uploads, et rien ne redémarre tout seul. Ce check lit
# `df -P` (sortie portable) sur les points de montage de la stack et maile si
# un taux de remplissage franchit le seuil.
#
#   EO_DISK_PATHS        points de montage surveillés, séparés par des
#                        espaces (défaut : « / » — ajouter le volume Docker
#                        s'il vit sur une partition dédiée, ex.
#                        « / /var/lib/docker/volumes »)
#   EO_DISK_THRESHOLD    seuil en % de remplissage (défaut : 85)
#
# Un mail [EO-disque] part UNIQUEMENT si le seuil est franchi (EO_MAIL_TO) ;
# silence et exit 0 sinon. Un mail par exécution au plus (T-28-08).
#
# Codes de sortie : 0 sous le seuil · 1 seuil franchi (ou chemin absent).

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

THRESHOLD="${EO_DISK_THRESHOLD:-85}"
PATHS="${EO_DISK_PATHS:-/}"

case "$THRESHOLD" in
  *[!0-9]*) echo "check-disk.sh: EO_DISK_THRESHOLD doit être numérique." >&2; exit 1 ;;
esac

alerts=0
alert_body=""
echo "Remplissage disque (seuil : ${THRESHOLD} %)"
echo

for path in $PATHS; do
  if [ ! -d "$path" ]; then
    echo "  ✗ chemin introuvable : $path" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $path : chemin introuvable"
    continue
  fi
  # df -P <point de montage> : la ligne rend Use% au 5e champ.
  pct="$(df -P "$path" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
  if [ -z "$pct" ]; then
    echo "  ✗ lecture df impossible : $path" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $path : sortie df illisible"
    continue
  fi
  if [ "$pct" -ge "$THRESHOLD" ]; then
    echo "  ✗ $path : ${pct} % rempli (seuil ${THRESHOLD} %)" >&2
    alerts=$((alerts + 1))
    alert_body="$alert_body
- $path : ${pct} % rempli (seuil ${THRESHOLD} %)"
  else
    echo "  ✓ $path : ${pct} %"
  fi
done
echo

if [ "$alerts" -eq 0 ]; then
  echo "Disque vérifié : sous le seuil partout."
  exit 0
fi

echo "ALERTE : $alerts point(s) de montage au-delà du seuil." >&2

if [ -n "${EO_MAIL_TO:-}" ]; then
  {
    echo "Espace disque : $alerts point(s) de montage au-delà de ${THRESHOLD} %."
    echo
    printf '%s\n' "$alert_body"
    echo
    echo "Vérifier : df -h sur l'hôte. Vider les volumes de logs/imgproxy,"
    echo "puis relancer sh scripts/check-disk.sh pour confirmer le retour au vert."
  } | sh "$SCRIPT_DIR/send-mail.sh" "[EO-disque] ${THRESHOLD} % franchi sur $alerts point(s)" || \
    echo "check-disk.sh: l'envoi du mail d'alerte a échoué." >&2
fi

exit 1
