#!/usr/bin/env sh
# scripts/test-dispatch-push.sh
# Validation du chemin « base → Edge Function », que la suite SQL ne peut pas faire.
#
#   sh scripts/test-dispatch-push.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   `test-db.sh` vérifie que les fonctions sont correctes. Il ne peut pas
#   vérifier qu'elles JOIGNENT la Edge Function : cela exige pg_net, Vault, les
#   secrets, un runtime `functions` démarré, et un endpoint de push réel. La
#   suite le signale et s'arrête, ce qui est la bonne conduite.
#
#   Ce script va jusqu'au bout. Il sème un rappel dû, appelle le dispatch, puis
#   lit la réponse que CET APPEL a provoquée dans `net._http_response`. Trois
#   faits sont vérifiés, et chacun peut échouer seul :
#
#     1. le dispatch annonce `due ≥ 1` — le rappel semé par ce script a été vu
#        par ce dispatch, et pas consommé par un job antérieur ;
#     2. la réponse est `200` et porte `consumed = 1` ;
#     3. la ligne de rappel a disparu de `public.task_reminders`.
#
#   Le troisième est le seul qui distingue « distribué » de « distribué ET
#   consommé ». Un `delivered: 1` avec la ligne encore là prouverait que la
#   notification part, mais que la boucle recommencera à l'infini.
#
#   Il ne prouve PAS que le service Push a affiché quoi que ce soit : cela se
#   voit sur l'appareil. `delivered` signifie « accepté par le service », pas
#   « lu par quelqu'un ».
#
# VARIABLES D'ENVIRONNEMENT
#   ATTENTE   secondes d'attente de la réponse HTTP (défaut : 45)
#
# AUCUN SECRET N'EST AFFICHÉ. Le script lit des identifiants, des compteurs, et
# le corps de la réponse de la fonction, qui ne contient ni clé ni endpoint.
# L'endpoint n'est jamais imprimé : il est seulement compté.

set -eu

. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

ATTENTE="${ATTENTE:-45}"

db_require_runtime || exit 1
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "test-dispatch-push.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  exit 1
fi
db_resolve

# --- Outils ------------------------------------------------------------------

# Une valeur scalaire, sans en-tête ni alignement.
#
# PAS DE PIPELINE AUTOUR DE `db_exec`. Un shell POSIX n'a pas de `pipefail` :
# dans `db_exec | tr | head`, c'est le statut de `head` qui ressort, donc un
# psql en échec donnerait une chaîne vide et un SUCCÈS. C'est le défaut le plus
# dangereux du script, parce qu'un dispatch non parti se lirait comme un
# simple « aucune réponse ». La sortie est donc capturée d'abord, et le
# pipeline ne travaille plus que sur une chaîne déjà obtenue.
un() {
  sortie="$(db_exec -t -A -c "$1")"
  printf '%s' "$sortie" | tr -d '\r' | head -n 1
}

# --- Préalables --------------------------------------------------------------

# Le chemin a été établi par la 0025 : la clé secrète part en `apikey`, pas en
# `Authorization`. Sans elle, le dispatch part quand même et reçoit un
# `401 UNUSABLE_CREDENTIAL` — mieux vaut le dire avant de semer un rappel.
prevoluble() {
  r="$(un "select (to_regproc('net.http_post') is not null)::text
              || ' ' || (to_regclass('vault.decrypted_secrets') is not null)::text")"
  if [ "$r" != "true true" ]; then
    echo "test-dispatch-push.sh: pg_net ou Vault absent de cette instance." >&2
    echo "  Le dispatch est alors inerte par construction : rien à vérifier." >&2
    echo "  Voir supabase/migrations/0024_dispatch_predicat.sql." >&2
    exit 1
  fi

  # Les NOMS des secrets, jamais leurs valeurs. `post_push_dispatch` les lit
  # par `vault.decrypted_secrets` ; un nom manquant se traduit par un 401 forty
  # secondes plus tard, et le diagnostic est bien moins utile ici.
  r="$(un "select count(*)::text
           from vault.decrypted_secrets
          where name in ('project_url', 'service_role_key')")"
  if [ "$r" != "2" ]; then
    echo "test-dispatch-push.sh: Vault ne contient pas project_url ET service_role_key" >&2
    echo "  ($r/2 présents). Le dispatch partirait sans credentials." >&2
    echo "  Les inscrire avec sh scripts/set-push-secrets.sh." >&2
    exit 1
  fi
}

# --- Abonnement réel --------------------------------------------------------
#
# Un endpoint de push ne se fabrique pas : les clés sont publiques, et le
# service distant refuse une paire valide si l'endpoint n'est pas le sien. Un
# endpoint factice serait `dropped`, pas `delivered` — le test afficherait un
# chiffre juste et une preuve fausse. On exige donc un abonnement réel.
#
# Les endpoints des suites SQL sont exclus : ils se terminent par une longue
# suite de `a`, ce qu'aucun endpoint de FCM, d'Autopush ou de Firefox n'a.
abonnement() {
  un "select m.id || '|' || m.household_id || '|' || coalesce(s.user_agent, 'appareil inconnu')
        from public.push_subscriptions s
        join public.household_members m on m.user_id = s.user_id
        where s.endpoint !~ 'a{50,}\$'
        order by s.created_at
        limit 1"
}

prevoluble

ligne="$(abonnement)"
if [ -z "$ligne" ]; then
  echo "test-dispatch-push.sh: aucun abonnement de push réel sur cette instance." >&2
  echo "  Ouvrir l'application sur un appareil, autoriser les notifications," >&2
  echo "  puis relancer. Un endpoint factice ne prouverait rien." >&2
  exit 1
fi
# Le dernier champ est pris par le reste de la chaîne : un `|` improbable dans
# un user_agent ne casserait donc pas la lecture.
Membre="${ligne%%|*}"
reste="${ligne#*|}"
Foyer="${reste%%|*}"
Appareil="${reste#*|}"

echo "  Abonnement    $Appareil"
echo "  Membre        $Membre  (foyer $Foyer)"

# --- Sémure -----------------------------------------------------------------
#
# La tâche est supprimée en sortie : le script ne laisse pas de donnée de test
# dans la base de l'utilisateur. Le rappel part avec, par construction, puisque
# `task_reminders.task_id` est `on delete cascade`.
TacheCreee=0
Tache=""
Rappel=""
nettoyer() {
  if [ -n "$Rappel" ]; then
    db_exec -q -c "delete from public.task_reminders where id = '$Rappel'" >/dev/null 2>&1 || true
  fi
  if [ "$TacheCreee" -eq 1 ] && [ -n "$Tache" ]; then
    db_exec -q -c "delete from public.tasks where id = '$Tache'" >/dev/null 2>&1 || true
  fi
}
trap nettoyer EXIT

# `remind_at` est placé une minute dans le passé : la fenêtre de
# `private.push_reminder_window()` est `(now() - 24h, now()]`, et une échéance à
# la seconde exacte tomberait sur la borne ouverte.
#
# Le `returning id` du haut est celui du RAPPEL : la CTE insère la tâche, et
# l'instruction principale insère le rappel en s'en servant. Le Rappel est donc
# connu, et sa disparition mesurable.
Rappel="$(un "with t as (
             insert into public.tasks (household_id, name, description, created_by)
             values ('$Foyer', 'Rappel de test push', 'Semé par test-dispatch-push.sh', '$Membre')
             returning id
           )
           insert into public.task_reminders (task_id, remind_at)
           select t.id, now() - interval '1 minute' from t
           returning id")"
if [ -z "$Rappel" ]; then
  echo "test-dispatch-push.sh: la semure du rappel n'a rien produit." >&2
  exit 1
fi
Tache="$(un "select task_id from public.task_reminders where id = '$Rappel'")"
TacheCreee=1
echo "  Rappel        $Rappel  (tâche $Tache)"

# `max(id)` AVANT l'appel : le rapport lu ensuite est nécessairement le sien.
Avant="$(un 'select coalesce(max(id), 0) from net._http_response')"

# --- Dispatch ----------------------------------------------------------------
#
# Le rapport est décomposé par PostgreSQL, pas par un `grep` ou un `sed` de
# shell : `due` et `dispatched` sont lus comme du jsonb, donc le test ne
# dépend ni de l'espacement de la sortie, ni du format de jsonb_build_object.
#
# `as materialized` n'est pas décoratif. Le dispatch émet une requête HTTP et
# consomme des lignes : il est VOLATILE, donc PostgreSQL ne peut pas le
# fusionner dans la requête externe. Le CTE materialized rend l'appel unique
# explicite, plutôt que de le laisser à l'optimiseur.
Brut="$(un "with r as materialized (select private.dispatch_push_notifications() as j)
           select (j ->> 'due') || '|' || (j ->> 'dispatched') || '|' || j::text
             from r")"
Dues="${Brut%%|*}"
reste="${Brut#*|}"
Dispatched="${reste%%|*}"
Brut="${reste#*|}"
echo "  Rapport       $Brut"

# --- Attente de la réponse ---------------------------------------------------
#
# pg_net travaille en asynchrone : le dispatch rend la main avant que la
# fonction ait répondu. Une absence de réponse n'est pas un verdict, seulement
# une absence de réponse.
#
# Un `psql` en échec dans la condition ci-dessous est indistinguable d'une
# ligne absente, et se traduirait par un délai dépassé. Le message de délai
# dépassé renvoie donc aussi vers les logs du runtime.
trouve=0
i=0
while [ "$i" -lt "$ATTENTE" ]; do
  if [ -n "$(un "select content from net._http_response where id > $Avant limit 1")" ]; then
    trouve=1
    break
  fi
  i=$((i + 3))
  sleep 3
done

if [ "$trouve" -eq 0 ]; then
  echo "  ÉCHEC         aucune réponse de la fonction après ${ATTENTE}s." >&2
  echo "                Le dispatch est-il parti de la base ?" >&2
  echo "                  cd supabase-project && sh run.sh logs functions" >&2
  exit 1
fi

# --- Les trois faits ---------------------------------------------------------

Code="$(un "select status_code::text from net._http_response where id > $Avant order by id limit 1")"
Corps="$(un "select content from net._http_response where id > $Avant order by id limit 1")"
Restant="$(un "select count(*)::text from public.task_reminders where id = '$Rappel'")"
echo "  Réponse       $Code  $Corps"
echo "  Rappel restant : $Restant"

echec=0

# 1. La semure est attribuable à cet appel.
if [ -z "$Dues" ] || [ "$Dues" = "0" ]; then
  echo "  ÉCHEC         le dispatch n'a vu aucun rappel, alors que ce script en a" >&2
  echo "                semé un. Un job l'a consommé entre-temps, ou la fenêtre" >&2
  echo "                de push_reminder_window() ne couvre pas cette échéance." >&2
  echec=1
elif [ "$Dispatched" != "true" ]; then
  echo "  ÉCHEC         due = $Dues mais dispatched = ${Dispatched:-inconnu}." >&2
  echo "                Le rappel est vu et aucune requête n'a été émise." >&2
  echec=1
fi

# 2. La fonction a répondu, et elle a consommé.
if [ "$Code" != "200" ]; then
  echo "  ÉCHEC         statut $Code au lieu de 200." >&2
  case "$Corps" in
    *UNUSABLE_CREDENTIAL*)
      echo "                La clé secrète n'a pas été acceptée. La 0025 est-elle" >&2
      echo "                appliquée ? (en-tête apikey, et non Authorization)" >&2
      ;;
    *) echo "                corps : $Corps" >&2 ;;
  esac
  echec=1
elif ! echo "$Corps" | grep -q '"consumed":1'; then
  echo "  ÉCHEC         la réponse ne porte pas consumed=1 : la boucle ne se ferme pas." >&2
  echec=1
elif ! echo "$Corps" | grep -q '"delivered":[1-9]'; then
  echo "  AVERTISSEMENT delivered=0. La fonction a répondu et consommé, mais le" >&2
  echo "                service Push n'a rien accepté. L'abonnement est peut-être" >&2
  echo "                expiré : le réinscrire depuis l'appareil." >&2
fi

# 3. La ligne a disparu. Seul ce fait distingue « distribué » de « distribué ET
#    consommé ».
if [ "$Restant" != "0" ]; then
  echo "  ÉCHEC         la ligne de rappel est toujours là. Le rappel sera renvoyé" >&2
  echo "                à chaque dispatch, indéfiniment." >&2
  echec=1
fi

echo
if [ "$echec" -eq 0 ]; then
  echo "  OK            base → Edge Function → service Push, et retour consommé."
else
  echo "  ÉCHEC         voir ci-dessus."
fi
exit "$echec"
