#!/usr/bin/env sh
# scripts/check-edge-errors.sh
# Alerte sur les réponses 4xx/5xx des Edge Functions (OPS-03, D-12).
#
# pg_net journalise chaque réponse HTTP de la base dans `net._http_response`.
# Une cascade d'erreurs Edge (fonction 404 après un déploiement raté, 500 sur
# une régression, timeout) n'apparaît nulle part ailleurs sans fouiller les
# logs. Ce check compte les réponses status_code >= 400 sur une fenêtre et
# maile si le seuil est franchi.
#
# DÉLTA contre la recherche (A4, colonnes réelles — docs/EXPLOITATION.md) :
# la table n'a PAS de colonne chemin/URL. Le rapport d'alerte porte donc
# status_code + horodatage + error_msg TRONQUÉ (120 car, retours à la ligne
# écrasés) — le `content` d'une réponse d'erreur peut recopier des fragments
# de requête, il n'est jamais inclus entier (T-28-06 : aucun secret dans les
# mails d'alerte).
#
#   EO_EDGE_ERROR_THRESHOLD  nombre d'erreurs tolérées sur la fenêtre (défaut 0)
#   EO_EDGE_WINDOW_HOURS     fenêtre d'observation en heures (défaut : 24)
#
# Les requêtes passent par psql.sh stdin (§2.7-C) et sont en LECTURE SEULE.
# Un mail [EO-edge] part UNIQUEMENT si le seuil est franchi (EO_MAIL_TO) ;
# silence et exit 0 sinon (T-28-08).
#
# Codes de sortie : 0 sous le seuil · 1 seuil franchi.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

THRESHOLD="${EO_EDGE_ERROR_THRESHOLD:-0}"
WINDOW_HOURS="${EO_EDGE_WINDOW_HOURS:-24}"

case "$THRESHOLD$WINDOW_HOURS" in
  *[!0-9]*)
    echo "check-edge-errors.sh: EO_EDGE_ERROR_THRESHOLD et EO_EDGE_WINDOW_HOURS" >&2
    echo "  doivent être numériques." >&2
    exit 1
    ;;
esac

psql_sql() {
  printf '%s\n' "$1" | sh "$SCRIPT_DIR/psql.sh" -A -t
}

echo "Erreurs Edge (status >= 400, fenêtre : ${WINDOW_HOURS} h, seuil : ${THRESHOLD})"
echo

count="$(psql_sql "select count(*) from net._http_response where status_code >= 400 and created > now() - interval '${WINDOW_HOURS} hours';")"

if [ -z "$count" ]; then
  echo "  ✗ lecture impossible de net._http_response (base injoignable ?)" >&2
  exit 1
fi

echo "  count = $count"
echo

if [ "$count" -le "$THRESHOLD" ]; then
  echo "Erreurs Edge vérifiées : sous le seuil."
  exit 0
fi

# Détail des dernières erreurs : status_code + created + error_msg sanitisé
# (retours à la ligne écrasés) et tronqué à 120 caractères.
detail="$(psql_sql "select id, status_code, to_char(created, 'YYYY-MM-DD HH24:MI'), left(regexp_replace(coalesce(error_msg, content, ''), E'[\\\\n\\\\r]+', ' ', 'g'), 120) from net._http_response where status_code >= 400 and created > now() - interval '${WINDOW_HOURS} hours' order by created desc limit 10;")"

echo "Dernières erreurs :" >&2
printf '%s\n' "$detail" | while IFS='|' read -r rid sc created msg; do
  echo "  #$rid [$sc] $created — ${msg:-<sans message>}" >&2
done
echo "ALERTE : $count erreur(s) Edge sur ${WINDOW_HOURS} h (seuil ${THRESHOLD})." >&2

if [ -n "${EO_MAIL_TO:-}" ]; then
  {
    echo "Erreurs Edge : $count réponse(s) status >= 400 sur les ${WINDOW_HOURS} dernières heures (seuil ${THRESHOLD})."
    echo
    echo "Détail (10 dernières) :"
    printf '%s\n' "$detail" | while IFS='|' read -r rid sc created msg; do
      echo "  #$rid [$sc] $created — ${msg:-<sans message>}"
    done
    echo
    echo "Le détail complet (avec le corps de réponse) se lit dans la base :"
    echo "select id, status_code, content from net._http_response where status_code >= 400"
    echo "and created > now() - interval '${WINDOW_HOURS} hours' order by created desc;"
  } | sh "$SCRIPT_DIR/send-mail.sh" "[EO-edge] $count erreur(s) Edge sur ${WINDOW_HOURS} h" || \
    echo "check-edge-errors.sh: l'envoi du mail d'alerte a échoué." >&2
fi

exit 1
