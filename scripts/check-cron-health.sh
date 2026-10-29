#!/usr/bin/env sh
# scripts/check-cron-health.sh
# Santé des jobs pg_cron de la stack — trois axes (OPS-04, Pitfall 5).
#
# Un check qui ne lit que `cron.job` ne voit rien tourner : la rotation d'un
# secret ratée laisse le job présent et actif, et chaque exécution échoue sans
# que `cron.job` ne change. Le contrôle porte donc sur TROIS axes, chacun
# capable d'attraper un sinistre différent :
#
#   (a) PRÉSENCE/ACTIVITÉ : chaque job eo-* attendu existe dans `cron.job`
#       avec active=true. Un job supprimé ou désactivé = alerte.
#   (b) RÉCENCE : pour chaque job, max(start_time) de `cron.job_run_details`
#       plus récent que N × SA période propre. Un job sans exécution récente
#       = alerte (cron mort, base restaurée sans jobs, scheduler arrêté).
#   (c) ÉCHECS : toute exécution status='failed' sur la fenêtre (24 h défaut)
#       = alerte avec jobname et return_message TRONQUÉ — le return_message
#       peut contenir des fragments d'URL, il n'est jamais recopié en entier
#       (T-28-06, aucun secret dans les mails d'alerte).
#
# La liste des jobs attendus et leurs périodes sont relevées sur la base
# vivante (docs/EXPLOITATION.md, « Sources des checks ») — pas déduites de la
# recherche. Les jobs annuels eo-calendrier-refresh-* ont une période d'un an :
# une fenêtre fixe les mettrait en alerte permanente, d'où le facteur × période.
#
# Sur une base de développement (machine éteinte la nuit, pg_cron ne rattrape
# pas les créneaux manqués), la liste complète crie au loup. EO_CRON_JOBS
# remplace le catalogue pour un test local — format : « nom:période_s »
# séparés par des espaces. En production, la variable reste vide : le
# catalogue par défaut s'applique.
#
#   EO_CRON_JOBS                catalogue attendu (défaut : le relevé réel)
#   EO_CRON_RECENCY_FACTOR      facteur de récence (défaut : 3)
#   EO_CRON_FAIL_WINDOW_HOURS   fenêtre des échecs en heures (défaut : 24)
#
# Les requêtes SQL passent par psql.sh sur l'entrée standard (§2.7-C) et sont
# en LECTURE SEULE : ce check n'écrit jamais dans la base.
#
#   EO_MAIL_TO  destinataire ; un mail [EO-cron] part UNIQUEMENT si au moins
#               un axe alerte (silence en état normal, T-28-08 : un mail par
#               exécution d'alerte au plus). Sans EO_MAIL_TO, l'alerte reste
#               sur stderr et le code de sortie — utile au test.
#
# Codes de sortie : 0 aucun axe en alerte · 1 au moins une alerte.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

RECENCY_FACTOR="${EO_CRON_RECENCY_FACTOR:-3}"
FAIL_WINDOW_HOURS="${EO_CRON_FAIL_WINDOW_HOURS:-24}"

# Garde-fou : les deux seuils sont numériques, sans quoi ils finiraient
# interpolés dans le SQL par l'environnement de l'appelant.
case "$RECENCY_FACTOR$FAIL_WINDOW_HOURS" in
  *[!0-9]*)
    echo "check-cron-health.sh: EO_CRON_RECENCY_FACTOR et EO_CRON_FAIL_WINDOW_HOURS" >&2
    echo "  doivent être numériques (reçus : $RECENCY_FACTOR / $FAIL_WINDOW_HOURS)." >&2
    exit 1
    ;;
esac

# --- Catalogue attendu : jobname et période en secondes ----------------------
# Relevé réel du 2026-10-29 (docs/EXPLOITATION.md). Un job présent dans la
# base mais absent de cette liste ne déclenche RIEN : ajouter un job côté base
# suppose de l'inscrire ici, sinon il vivrait sans surveillance.
EXPECTED_JOBS="eo-routine-maintenance:86400
eo-invite-token-prune:86400
eo-birthday-alerts:86400
eo-push-prune:86400
eo-push-messages:300
eo-push-dispatch:60
eo-gdpr-export-run:60
eo-gdpr-export-purge:86400
eo-push-exports:300
eo-account-deletion-purge-medias:86400
eo-account-deletion-reminder:86400
eo-account-deletion-purge:86400
eo-calendrier-refresh-jan:31536000
eo-calendrier-refresh-sept:31536000"

EXPECTED_JOBS="${EO_CRON_JOBS:-$EXPECTED_JOBS}"

period_of() {
  name="$1"
  printf '%s\n' "$EXPECTED_JOBS" | while IFS=: read -r j p; do
    if [ "$j" = "$name" ]; then
      echo "$p"
      break
    fi
  done
}

# psql_sql <requête> : sortie unaligned tuples-only, une ligne par tuple.
psql_sql() {
  printf '%s\n' "$1" | sh "$SCRIPT_DIR/psql.sh" -A -t
}

alerts=0
alert_body=""

note_alert() {
  echo "  ✗ $1" >&2
  alerts=$((alerts + 1))
  alert_body="$alert_body
- $1"
}

echo "Santé des jobs pg_cron (fenêtre échecs : ${FAIL_WINDOW_HOURS} h, récence : ×${RECENCY_FACTOR} la période)"
echo

# --- Axe (a) : présence et activité ------------------------------------------
# Une jointure en sh : la base rend `jobname|active` pour tous les jobs eo-*,
# on attend chaque nom du catalogue avec active=t.
present="$(psql_sql "select jobname, active from cron.job where jobname like 'eo-%' order by jobname;" || true)"

for entry in $EXPECTED_JOBS; do
  name="${entry%%:*}"
  row="$(printf '%s\n' "$present" | grep "^$name|" | head -n 1 || true)"
  if [ -z "$row" ]; then
    note_alert "axe présence : job '$name' ABSENT de cron.job"
  else
    active="${row##*|}"
    if [ "$active" != "t" ]; then
      note_alert "axe activité : job '$name' désactivé (active=$active)"
    fi
  fi
done

if [ "$alerts" -eq 0 ]; then
  set -- $EXPECTED_JOBS
  echo "  ✓ les $# jobs attendus sont présents et actifs"
fi
echo

# --- Axe (b) : récence de la dernière exécution vs N × période ---------------
# Age en secondes depuis la dernière exécution, par job. left join : un job
# sans AUCUNE exécution rend NULL — alerte aussi (cron jamais parti). Les
# orphelins (jobid disparu de cron.job) ne sortent pas : la jointure part de
# cron.job.
ages="$(psql_sql "select c.jobname, extract(epoch from (now() - max(d.start_time)))::bigint from cron.job c left join cron.job_run_details d on d.jobid = c.jobid where c.jobname like 'eo-%' group by c.jobname order by c.jobname;" || true)"

for entry in $EXPECTED_JOBS; do
  name="${entry%%:*}"
  period="${entry#*:}"
  max_age=$((period * RECENCY_FACTOR))
  row="$(printf '%s\n' "$ages" | grep "^$name|" | head -n 1 || true)"
  if [ -z "$row" ]; then
    note_alert "axe récence : job '$name' absent du relevé d'âge (cron.job vide ?)"
    continue
  fi
  age="${row##*|}"
  if [ "$age" = "" ] || [ "$age" = "NULL" ]; then
    note_alert "axe récence : job '$name' n'a JAMAIS été exécuté"
  elif [ "$age" -gt "$max_age" ] 2>/dev/null; then
    note_alert "axe récence : job '$name' sans exécution depuis ${age} s (seuil ${max_age} s) — cron mort ?"
  fi
done

if [ "$alerts" -eq 0 ]; then
  echo "  ✓ toutes les dernières exécutions sont plus récentes que ×${RECENCY_FACTOR} la période"
fi
echo

# --- Axe (c) : échecs sur la fenêtre ------------------------------------------
# return_message tronqué à 120 caractères : il peut porter des fragments d'URL
# d'erreur Edge, jamais recopiés en entier dans un mail d'alerte (T-28-06).
failures="$(psql_sql "select c.jobname, left(regexp_replace(d.return_message, E'[\\\\n\\\\r]+', ' ', 'g'), 120) from cron.job_run_details d join cron.job c on c.jobid = d.jobid where d.status = 'failed' and d.start_time > now() - interval '${FAIL_WINDOW_HOURS} hours' order by d.start_time desc;" || true)"

if [ -n "$failures" ]; then
  printf '%s\n' "$failures" | while IFS='|' read -r jname rmsg; do
    echo "  échec : $jname — ${rmsg:-<sans message>}" >&2
  done
  failed_count="$(printf '%s\n' "$failures" | wc -l | tr -d ' ')"
  note_alert "axe échecs : $failed_count exécution(s) 'failed' sur les ${FAIL_WINDOW_HOURS} dernières heures (détail sur stderr)"
else
  echo "  ✓ aucune exécution 'failed' sur la fenêtre"
fi
echo

# --- Verdict ------------------------------------------------------------------
if [ "$alerts" -eq 0 ]; then
  echo "Santé pg_cron vérifiée : les trois axes sont au vert."
  exit 0
fi

echo "ALERTE : $alerts anomalie(s) pg_cron détectée(s)." >&2

# Un seul mail par exécution, tous les axes confondus (T-28-08).
if [ -n "${EO_MAIL_TO:-}" ]; then
  {
    echo "Santé pg_cron : $alerts anomalie(s)."
    echo "Fenêtre d'échecs : ${FAIL_WINDOW_HOURS} h — récence : ×${RECENCY_FACTOR} la période propre de chaque job."
    echo
    echo "Anomalies :"
    printf '%s\n' "$alert_body"
    echo
    echo "Détail complet : sh scripts/check-cron-health.sh (sortie stderr),"
    echo "ou psql : select * from cron.job_run_details where status = 'failed'"
    echo "and start_time > now() - interval '${FAIL_WINDOW_HOURS} hours' order by start_time desc;"
  } | sh "$SCRIPT_DIR/send-mail.sh" "[EO-cron] santé pg_cron : $alerts anomalie(s)" || \
    echo "check-cron-health.sh: l'envoi du mail d'alerte a échoué (voir send-mail.sh)." >&2
fi

exit 1
