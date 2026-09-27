#!/usr/bin/env sh
# scripts/test-dispatch-anniversaires.sh
# Validation du chemin « anniversaires → Edge Function », que la suite SQL ne
# peut pas faire.
#
#   sh scripts/test-dispatch-anniversaires.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   `test-db.sh` (suite 0006) vérifie que la logique des anniversaires est
#   correcte : prochaine occurrence (29 février compris), périmètre « jour
#   même », isolation entre foyers, job `eo-birthday-alerts` à 06 h 40. Il ne
#   peut pas vérifier que le dispatch JOINT la Edge Function : cela exige
#   pg_net, Vault, les secrets, un runtime `functions` démarré, et un endpoint
#   de push réel.
#
#   Ce script va jusqu'au bout. Il sème un anniversaire daté du jour, appelle
#   le dispatch DEUX fois, puis lit les réponses que CES APPELS ont provoquées
#   dans `net._http_response`. Quatre faits sont vérifiés, et chacun peut
#   échouer seul :
#
#     1. l'anniversaire semé par ce script est vu par ce dispatch (son tag
#        `anniversaire-<id>` figure dans la liste due AVANT l'appel) ;
#     2. la réponse est `200` et porte `delivered >= 1` ;
#     3. un SECOND dispatch réannonce le même anniversaire (`200` et
#        `delivered >= 1` à nouveau) ;
#     4. la ligne d'anniversaire semée a disparu après nettoyage vérifié.
#
#   Le troisième est la propriété INVERSÉE du chemin des rappels
#   (`test-dispatch-push.sh` prouve par DISPARITION de ligne) : un anniversaire
#   n'a rien à consommer — `consume_push_reminders` ne connaît que `tache`,
#   `evenement` et `routine` — il est recalculé chaque matin, donc une relance
#   le réannonce, et c'est le comportement voulu. Exiger une disparition ici
#   serait exiger l'inverse du contrat.
#
#   Il ne prouve PAS que le service Push a affiché quoi que ce soit : cela se
#   voit sur l'appareil. `delivered` signifie « accepté par le service », pas
#   « lu par quelqu'un ».
#
# CONCURRENCE AVEC LE JOB `eo-birthday-alerts` (06 h 40)
#   Le job ne consomme rien : un passage entre la semure et l'appel ne vole
#   aucun anniversaire, contrairement au chemin des rappels. L'attribution
#   reste assurée par les marqueurs `Avant`/`Avant2` sur `net._http_response` :
#   chaque réponse lue est nécessairement celle de l'appel du script.
#
# PORTEE GLOBALE
#   `due_push_notifications('anniversaires')` couvre tous les foyers, par
#   conception (contrôle 7 de `check-sql-statique.py`). Le `due` du rapport et
#   le `delivered` de la réponse sont donc des totaux, pas des compteurs du
#   foyer de test. L'ancrage spécifique à ce script est le TAG
#   `anniversaire-<id>` : présent dans la liste due avant chaque dispatch, il
#   prouve que l'anniversaire semé ICI faisait partie de ce qui a été annoncé.
#
# VARIABLES D'ENVIRONNEMENT
#   ATTENTE   secondes d'attente de chaque réponse HTTP (défaut : 45)
#
# AUCUN SECRET N'EST AFFICHÉ. Le script lit des identifiants, des compteurs, et
# le corps des réponses de la fonction, qui ne contiennent ni clé ni endpoint.
# L'endpoint n'est jamais imprimé : il est seulement compté.

set -eu

. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

ATTENTE="${ATTENTE:-45}"

db_require_runtime || exit 1
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "test-dispatch-anniversaires.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  exit 1
fi
db_resolve

# --- Outils ------------------------------------------------------------------

# Une valeur scalaire, sans en-tête ni alignement.
#
# PAS DE PIPELINE AUTOUR DE `db_exec`. Un shell POSIX n'a pas de `pipefail` :
# dans `db_exec | tr | head`, c'est le statut de `head` qui ressort, donc un
# psql en échec donnerait une chaîne vide et un SUCCÈS. La sortie est donc
# capturée d'abord, et le pipeline ne travaille plus que sur une chaîne déjà
# obtenue.
un() {
  sortie="$(db_exec -t -A -c "$1")"
  printf '%s' "$sortie" | tr -d '\r' | head -n 1
}

# --- Préalables --------------------------------------------------------------

# Même chemin d'envoi que les rappels (`post_push_dispatch`), mêmes exigences :
# pg_net, Vault, et les deux noms de secrets. Sans eux, le dispatch part quand
# même et reçoit un `401 UNUSABLE_CREDENTIAL` — mieux vaut le dire avant de
# semer un anniversaire.
prevoluble() {
  r="$(un "select (to_regproc('net.http_post') is not null)::text
              || ' ' || (to_regclass('vault.decrypted_secrets') is not null)::text")"
  if [ "$r" != "true true" ]; then
    echo "test-dispatch-anniversaires.sh: pg_net ou Vault absent de cette instance." >&2
    echo "  Le dispatch est alors inerte par construction : rien à vérifier." >&2
    echo "  Voir supabase/migrations/0024_dispatch_predicat.sql." >&2
    exit 1
  fi

  r="$(un "select count(*)::text
           from vault.decrypted_secrets
          where name in ('project_url', 'service_role_key')")"
  if [ "$r" != "2" ]; then
    echo "test-dispatch-anniversaires.sh: Vault ne contient pas project_url ET service_role_key" >&2
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
  echo "test-dispatch-anniversaires.sh: aucun abonnement de push réel sur cette instance." >&2
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

# --- Sémure, et nettoyage vérifié ---------------------------------------------
#
# Le script ne doit rien laisser dans la base de l'utilisateur. Une suppression
# qui échoue en silence est un ÉCHEC MUET : le script annonce « OK », et
# l'anniversaire « Anniversaire de test dispatch » s'accumule dans le module
# `/anniversaires` de quelqu'un, et sera réannoncé chaque matin.
#
# Le nettoyage est donc DÉCLARÉ et VÉRIFIÉ par un comptage, et non délégué à un
# trap que personne ne voit. Le trap reste, pour une sortie en erreur, et il
# prévient alors lui aussi.
Anniv=""
NettoyerVerifie=0

nettoyer() {
  if [ -n "$Anniv" ]; then
    db_exec -q -c "delete from public.birthdays where id = '$Anniv'" >/dev/null 2>&1 || true
  fi
}

# Un comptage, pas le statut du DELETE : c'est l'etat de la table qui compte.
reste_a_nettoyer() {
  un "select count(*)::text from public.birthdays where id = '$Anniv'"
}

signaler_reste() {
  r="$(reste_a_nettoyer)"
  if [ "$r" = "0" ]; then
    return 0
  fi
  echo "  ÉCHEC         la ligne d'anniversaire subsiste après nettoyage." >&2
  echo "                Anniversaire $Anniv. À supprimer à la main :" >&2
  echo "                  sh scripts/psql.sh -c \"delete from public.birthdays" >&2
  echo "                    where id = '$Anniv';\"" >&2
  return 1
}

# Sortie en erreur : on nettoie, et on prévient si le nettoyage échoue.
trap 'nettoyer; signaler_reste >&2 || true' EXIT

# Anniversaire du jour même : même mois et même jour que la date courante en
# `Europe/Paris`, année décalée de 30 ans. Le 29 février n'existe que les
# années bissextiles, et année − 30 ne l'est jamais quand l'année courante
# l'est (30 mod 4 = 2) : ce jour-là seulement, reculer de 32 ans (32 mod 4 =
# 0), qui est toujours bissextile. Sans ce cas, `make_date` refuserait la
# semure un jour tous les quatre ans, et le script accuserait le dispatch.
Anniv="$(un "insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
            select private.new_id('birthday'), '$Foyer', 'Anniversaire de test dispatch',
              case
                when extract(month from today) = 2 and extract(day from today) = 29
                then make_date(extract(year from today)::integer - 32, 2, 29)
                else make_date(extract(year from today)::integer - 30,
                               extract(month from today)::integer,
                               extract(day from today)::integer)
              end,
              '$Membre'
              from (select (now() at time zone 'Europe/Paris')::date as today) p
            returning id")"
if [ -z "$Anniv" ]; then
  echo "test-dispatch-anniversaires.sh: la semure de l'anniversaire n'a rien produit." >&2
  exit 1
fi
Tag="anniversaire-$Anniv"
echo "  Anniversaire  $Anniv  (tag $Tag)"

# --- Attribution semure → dispatch --------------------------------------------
#
# Le tag de l'anniversaire semé doit figurer dans la liste due AVANT chaque
# appel : c'est ce qui prouve que le dispatch a vu CET anniversaire, et pas
# seulement qu'un total `due >= 1` venait d'un autre foyer (la source est
# globale par conception).
vu_par_le_dispatch() {
  un "select count(*)::text
        from jsonb_array_elements(public.due_push_notifications('anniversaires')) as n(notification jsonb)
       where n.notification ->> 'tag' = '$Tag'"
}

Vu="$(vu_par_le_dispatch)"
if [ "$Vu" = "0" ]; then
  echo "  ÉCHEC         l'anniversaire semé n'est pas dans la liste due." >&2
  echo "                days_until <> 0, ou aucun abonné sur ce foyer." >&2
  exit 1
fi
echo "  Liste due     l'anniversaire semé est annoncé (avant dispatch 1)"

# `max(id)` AVANT chaque appel : chaque rapport lu est nécessairement le sien.
Avant="$(un 'select coalesce(max(id), 0) from net._http_response')"

# --- Dispatch 1 ---------------------------------------------------------------
#
# Le rapport est décomposé par PostgreSQL, pas par un `grep` ou un `sed` de
# shell : `due` et `dispatched` sont lus comme du jsonb, donc le test ne
# dépend ni de l'espacement de la sortie, ni du format de jsonb_build_object.
#
# `as materialized` n'est pas décoratif. Le dispatch émet une requête HTTP :
# il est VOLATILE, donc PostgreSQL ne peut pas le fusionner dans la requête
# externe. Le CTE materialized rend l'appel unique explicite, plutôt que de le
# laisser à l'optimiseur.
Brut="$(un "with r as materialized (select private.dispatch_birthday_alerts() as j)
           select (j ->> 'due') || '|' || (j ->> 'dispatched') || '|' || j::text
             from r")"
Dues="${Brut%%|*}"
reste="${Brut#*|}"
Dispatched="${reste%%|*}"
Brut="${reste#*|}"
echo "  Rapport 1     $Brut"

attendre_reponse() {
  # $1 = id plancher dans net._http_response. Rend 0 si une réponse arrive
  # dans ATTENTE secondes, 1 sinon.
  i=0
  while [ "$i" -lt "$ATTENTE" ]; do
    if [ -n "$(un "select content from net._http_response where id > $1 limit 1")" ]; then
      return 0
    fi
    i=$((i + 3))
    sleep 3
  done
  return 1
}

# pg_net travaille en asynchrone : le dispatch rend la main avant que la
# fonction ait répondu. Une absence de réponse n'est pas un verdict, seulement
# une absence de réponse.
if ! attendre_reponse "$Avant"; then
  echo "  ÉCHEC         aucune réponse de la fonction après ${ATTENTE}s (dispatch 1)." >&2
  echo "                Le dispatch est-il parti de la base ?" >&2
  echo "                  cd supabase-project && sh run.sh logs functions" >&2
  exit 1
fi

Code="$(un "select status_code::text from net._http_response where id > $Avant order by id limit 1")"
Corps="$(un "select content from net._http_response where id > $Avant order by id limit 1")"
echo "  Réponse 1     $Code  $Corps"

# --- Dispatch 2 : la propriété inversée ----------------------------------------
#
# Rien n'est consommé : le même anniversaire doit être annoncé une seconde
# fois. Si le second appel ne le voit plus, c'est que quelque chose l'a
# consommé — l'inverse du contrat.
Vu="$(vu_par_le_dispatch)"
if [ "$Vu" = "0" ]; then
  echo "  ÉCHEC         l'anniversaire n'est plus dû après le premier envoi." >&2
  echo "                Un anniversaire se réannonce : quelque chose l'a consommé." >&2
  exit 1
fi
echo "  Liste due     l'anniversaire semé est annoncé (avant dispatch 2)"

Avant2="$(un 'select coalesce(max(id), 0) from net._http_response')"

Brut2="$(un "with r as materialized (select private.dispatch_birthday_alerts() as j)
            select (j ->> 'due') || '|' || (j ->> 'dispatched') || '|' || j::text
              from r")"
Dues2="${Brut2%%|*}"
reste2="${Brut2#*|}"
Dispatched2="${reste2%%|*}"
Brut2="${reste2#*|}"
echo "  Rapport 2     $Brut2"

if ! attendre_reponse "$Avant2"; then
  echo "  ÉCHEC         aucune réponse de la fonction après ${ATTENTE}s (dispatch 2)." >&2
  echo "                  cd supabase-project && sh run.sh logs functions" >&2
  exit 1
fi

Code2="$(un "select status_code::text from net._http_response where id > $Avant2 order by id limit 1")"
Corps2="$(un "select content from net._http_response where id > $Avant2 order by id limit 1")"
echo "  Réponse 2     $Code2  $Corps2"

# --- Les faits ----------------------------------------------------------------

echec=0

# 1. La semure est attribuable aux deux appels (vérifié avant chacun).
#    `dispatched` doit être vrai les deux fois : un secret manquant dans Vault
#    ou une Edge Function injoignable se lit ici, pas dans la réponse.
if [ "$Dispatched" != "true" ]; then
  echo "  ÉCHEC         dispatch 1 : due = ${Dues:-inconnu} mais dispatched = ${Dispatched:-inconnu}." >&2
  echo "                Le rappel est vu et aucune requête n'a été émise." >&2
  echec=1
fi
if [ "$Dispatched2" != "true" ]; then
  echo "  ÉCHEC         dispatch 2 : due = ${Dues2:-inconnu} mais dispatched = ${Dispatched2:-inconnu}." >&2
  echec=1
fi

# 2 et 3. Chaque réponse est un `200` portant `delivered >= 1`.
#    Contrairement aux rappels, `consumed` DOIT valoir 0 ici : exiger
#    `consumed = 1` serait exiger l'inverse du contrat. Et contrairement au
#    script des rappels, `delivered = 0` n'est pas un simple avertissement :
#    sans consommation, la livraison acceptée est la seule preuve d'envoi.
for n in 1 2; do
  if [ "$n" = "1" ]; then C="$Code"; B="$Corps"; else C="$Code2"; B="$Corps2"; fi
  if [ "$C" != "200" ]; then
    echo "  ÉCHEC         dispatch $n : statut $C au lieu de 200." >&2
    case "$B" in
      *UNUSABLE_CREDENTIAL*)
        echo "                La clé secrète n'a pas été acceptée. La 0025 est-elle" >&2
        echo "                appliquée ? (en-tête apikey, et non Authorization)" >&2
        ;;
      *) echo "                corps : $B" >&2 ;;
    esac
    echec=1
  elif ! echo "$B" | grep -q '"delivered":[1-9]'; then
    echo "  ÉCHEC         dispatch $n : delivered = 0. La fonction a répondu mais le" >&2
    echo "                service Push n'a rien accepté. L'abonnement est peut-être" >&2
    echo "                expiré : le réinscrire depuis l'appareil." >&2
    echec=1
  fi
done

# --- Nettoyage ----------------------------------------------------------------
#
# Déclaré, donc vérifié. Un anniversaire de test laissé derrière n'est pas un
# détail : il apparaît dans le module `/anniversaires` de l'utilisateur, et il
# sera réannoncé chaque matin.
nettoyer
NettoyerVerifie=1
if ! signaler_reste; then
  # Un test qui salit l'état n'est pas un test réussi. Le code de sortie le dit,
  # pour qu'un enchaînement de scripts ne l'ignore pas.
  echec=1
else
  echo "  Nettoyage     anniversaire de test supprimé."
fi

echo
if [ "$echec" -eq 0 ]; then
  echo "  OK            base → Edge Function → service Push, réannoncé au second appel."
else
  echo "  ÉCHEC         voir ci-dessus."
fi
exit "$echec"
