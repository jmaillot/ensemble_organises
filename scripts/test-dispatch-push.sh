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
#     2. la réponse est `200` et porte `consumed ≥ 1` ;
#     3. la ligne de rappel a disparu de `public.task_reminders`.
#
#   Le troisième est le seul qui distingue « distribué » de « distribué ET
#   consommé ». Un `delivered: 1` avec la ligne encore là prouverait que la
#   notification part, mais que la boucle recommencera à l'infini.
#
# DEPUIS 0172 — PREUVE DU GROUPE DE MESSAGES (D-06/D-07)
#   Trois messages sont semés dans UNE conversation pour le membre abonné.
#   Le dispatch des messages doit n'émettre qu'UNE notification, compteur
#   « 3 nouveaux messages de … » au titre, tag `message-<conversation>`, et
#   AUCUNE marque de contenu semée dans le titre ni le corps (règle
#   verrouillée : les notifications ne portent jamais le contenu d'un
#   message). La preuve du payload est lue dans `due_push_notifications`
#   (ce que l'Edge chiffrera), filtrée par le tag de la conversation créée
#   ici ; la preuve de la consommation est attribuable à l'appel de dispatch
#   du script (fenêtre `net._http_response` ouverte sur max(id) avant
#   l'appel), et la file doit être vidée pour la conversation semée.
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

  # --- Sonde d'authentification Edge (gap G-29-1, UAT 29) ---------------------
  #
  # Le 401 INVALID_API_KEY de l'UAT 2026-10-30 venait d'un conteneur functions
  # dont l'env ne connaissait pas la clé sb_secret_ du Vault : SUPABASE_SECRET_KEYS
  # (docker-compose.yml:463) retombe silencieusement sur {"default":""} quand la
  # variable manque du contexte Compose, et un `docker restart` ne ré-interpole
  # JAMAIS le .env — seul `recreate` le fait. La sonde interroge push-notify avec
  # la clé du Vault AVANT toute semure, pour que la classe de défaut devienne
  # diagnostiquable au lieu d'être reconstituée à la main.
  #
  # La sonde est émise PAR LE MÊME CHEMIN que le dispatch : un net.http_post avec
  # l'en-tête `apikey` portant la clé Vault (contrat 0025 — jamais Authorization).
  # La fenêtre `net._http_response` est ouverte sur max(id) AVANT l'émission, pour
  # l'attribuabilité ; la sonde consomme une ligne, et les fenêtres du dispatch
  # réel (ouvertes plus bas, après prevoluble) partent du nouveau max(id).
  SondeAvant="$(un 'select coalesce(max(id), 0) from net._http_response')"
  SondeId="$(un "with s as materialized (
                  select net.http_post(
                           url     := (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'project_url') || '/functions/v1/push-notify',
                           headers := jsonb_build_object(
                                        'content-type', 'application/json',
                                        'apikey',
                                        (select decrypted_secret from vault.decrypted_secrets
                                          where name = 'service_role_key')),
                           body    := jsonb_build_object('scope', 'sonde'),
                           timeout_milliseconds := 30000
                         ) as id)
                select id::text from s")"
  if [ -z "$SondeId" ]; then
    echo "test-dispatch-push.sh: l'émission de la sonde Edge n'a rien produit." >&2
    exit 1
  fi

  # Même attente bornée que pour le dispatch : pg_net est asynchrone.
  sonde_trouve=0
  i=0
  while [ "$i" -lt "$ATTENTE" ]; do
    if [ -n "$(un "select content from net._http_response where id > $SondeAvant limit 1")" ]; then
      sonde_trouve=1
      break
    fi
    i=$((i + 3))
    sleep 3
  done
  if [ "$sonde_trouve" -eq 0 ]; then
    echo "  ÉCHEC         aucune réponse de la sonde Edge après ${ATTENTE}s." >&2
    echo "                cd supabase-project && sh run.sh logs functions" >&2
    exit 1
  fi
  SondeCode="$(un "select status_code::text from net._http_response where id > $SondeAvant order by id limit 1")"
  SondeCorps="$(un "select content from net._http_response where id > $SondeAvant order by id limit 1")"

  if [ "$SondeCode" = "401" ]; then
    # Le runtime ne connaît PAS la clé du Vault. Distinguer les deux causes sans
    # afficher de secret : la comparaison passe par des empreintes md5, jamais
    # par les valeurs.
    EmpreinteVault="$(un "select md5(decrypted_secret) from vault.decrypted_secrets
                           where name = 'service_role_key'")"
    EnvBrut="$(db_compose exec -T functions printenv SUPABASE_SECRET_KEYS </dev/null 2>/dev/null || true)"
    EnvCle="$(printf '%s' "$EnvBrut" | sed -n 's/.*"default":"\([^"]*\)".*/\1/p')"
    if [ -z "$EnvCle" ]; then
      echo "  ÉCHEC         la sonde Edge a reçu 401 INVALID_API_KEY." >&2
      echo "                SUPABASE_SECRET_KEYS est absente ou vide dans le conteneur" >&2
      echo "                functions — la retombée silencieuse {\"default\":\"\"} du" >&2
      echo "                compose (docker-compose.yml:463). Le .env n'a pas été" >&2
      echo "                interpolé à la création du conteneur." >&2
      echo "                  cd supabase-project && sh run.sh recreate functions" >&2
      echo "                (un docker restart ne ré-interpole JAMAIS le .env)" >&2
      exit 1
    fi
    EmpreinteEnv="$(printf '%s' "$EnvCle" | md5sum | cut -d' ' -f1)"
    echo "  ÉCHEC         la sonde Edge a reçu 401 INVALID_API_KEY (corps : $SondeCorps)." >&2
    if [ "$EmpreinteEnv" = "$EmpreinteVault" ]; then
      echo "                L'env du conteneur functions porte la bonne clé (empreintes" >&2
      echo "                identiques) mais le runtime qui a répondu ne l'appliquait" >&2
      echo "                pas : runtime functions en retard sur le .env." >&2
      echo "                  cd supabase-project && sh run.sh recreate functions" >&2
      echo "                (un docker restart ne ré-interpole JAMAIS le .env)" >&2
    else
      echo "                La clé du Vault diffère de celle de l'env du conteneur" >&2
      echo "                (empreintes distinctes)." >&2
      echo "                  sh scripts/set-push-secrets.sh puis sh run.sh recreate functions" >&2
    fi
    exit 1
  elif [ -z "$SondeCode" ]; then
    echo "  ÉCHEC         réponse de sonde Edge illisible (statut vide)." >&2
    echo "                corps : $SondeCorps" >&2
    exit 1
  fi

  # Auth OK : tout statut ≠ 401 signifie que le runtime a accepté la clé du
  # Vault (400 « Portée inconnue » = refus métier attendu pour la portée sonde).
  # Preuve visible du passage, jamais un silence (§2.7 F).
  echo "  Sonde Edge    auth OK ($SondeCode métier attendu)"
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

# --- Sémure, et nettoyage vérifié ---------------------------------------------
#
# Le script ne doit rien laisser dans la base de l'utilisateur. Une suppression
# qui échoue en silence est un ÉCHEC MUET : le script a fait ce qu'il avait à
# faire, annonce « OK », et la tâche « Rappel de test push » s'accumule à
# chaque passage, dans la liste de tâches de quelqu'un.
#
# Le nettoyage est donc DÉCLARÉ et VÉRIFIÉ par un comptage, et non délégué à un
# trap que personne ne voit. Le trap reste, pour une sortie en erreur, et il
# prévient alors lui aussi.
TacheCreee=0
Tache=""
Rappel=""
Conv=""
Expéditeur=""
Marque=""
NettoyerVerifie=0

nettoyer() {
  # Le rappel a déjà été consommé par l'Edge Function dans le cas normal : sa
  # suppression est sans objet, et `|| true` évite qu'un DELETE sans ligne
  # affected ne soit pris pour un échec. Ce qui compte n'est pas le statut du
  # DELETE, c'est le comptage qui suit.
  if [ -n "$Rappel" ]; then
    db_exec -q -c "delete from public.task_reminders where id = '$Rappel'" >/dev/null 2>&1 || true
  fi
  if [ "$TacheCreee" -eq 1 ] && [ -n "$Tache" ]; then
    db_exec -q -c "delete from public.tasks where id = '$Tache'" >/dev/null 2>&1 || true
  fi
  # Groupe de messages (0172) : la conversation d'abord (cascade messages et
  # file), puis le membre expéditeur (cascade de ses messages restants).
  if [ -n "$Conv" ]; then
    db_exec -q -c "delete from public.conversations where id = '$Conv'" >/dev/null 2>&1 || true
  fi
  if [ -n "$Expéditeur" ]; then
    db_exec -q -c "delete from public.household_members where id = '$Expéditeur'" >/dev/null 2>&1 || true
  fi
}

# Un comptage, pas le statut du DELETE : c'est l'etat de la table qui compte.
reste_a_nettoyer() {
  un "select ((select count(*) from public.tasks where id = '$Tache')
               + (select count(*) from public.task_reminders where id = '$Rappel')
               + (select count(*) from public.conversations where id = '$Conv')
               + (select count(*) from public.household_members where id = '$Expéditeur'))::text"
}

signaler_reste() {
  r="$(reste_a_nettoyer)"
  if [ "$r" = "0" ]; then
    return 0
  fi
  echo "  ÉCHEC         $r ligne(s) de test subsiste(nt) après nettoyage." >&2
  echo "                Tâche $Tache, rappel $Rappel. À supprimer à la main :" >&2
  echo "                  sh scripts/psql.sh -c \"delete from public.tasks" >&2
  echo "                    where id = '$Tache';\"" >&2
  return 1
}

# Sortie en erreur : on nettoie, et on prévient si le nettoyage échoue.
trap 'nettoyer; signaler_reste >&2 || true' EXIT

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
elif ! echo "$Corps" | grep -Eq '"consumed":[1-9][0-9]*'; then
  echo "  ÉCHEC         la réponse ne porte aucun rappel consommé : la boucle ne se ferme pas." >&2
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

# --- Nettoyage ----------------------------------------------------------------
#
# Déclaré, donc vérifié. Une tâche de test laissée derrière n'est pas un détail :
# elle apparaît dans la liste de tâches de l'utilisateur, et le script s'exécute
# à chaque nouveau diagnostic.
nettoyer
NettoyerVerifie=1
if ! signaler_reste; then
  # Un test qui salit l'état n'est pas un test réussi. Le code de sortie le dit,
  # pour qu'un enchaînement de scripts ne l'ignore pas.
  echec=1
else
  echo "  Nettoyage     tâche et rappel supprimés."
fi

# ===========================================================================
# Groupe de messages (0172) : D-06/D-07, compteur et silence du contenu.
# ===========================================================================
# Trois messages semés dans UNE conversation pour le membre abonné : le
# dispatch des messages doit n'émettre qu'UNE notification « 3 nouveaux
# messages de … », tag `message-<conversation>`, et AUCUNE marque de contenu
# semée ne doit traverser le titre ni le corps (règle verrouillée ; T-29-04).
#
# La preuve du PAYLOAD est attribuable à ce passage : la ligne lue est celle
# de `due_push_notifications('messages')` dont le tag vise la conversation
# créée ICI — c'est exactement ce que l'Edge chiffrera et enverra. La preuve
# de la CONSOMMATION est attribuable à l'appel de dispatch du script : fenêtre
# `net._http_response` ouverte sur max(id) AVANT l'appel, comme plus haut.
#
# L'expéditeur est une ligne membre sans compte (profil géré, 0145) : l'auteur
# est exclu du ventilateur par membre, jamais par compte.
Marque="MARQUEPUSH-$(date +%s)-$$"

Expéditeur="$(un "insert into public.household_members (household_id, user_id, display_name, color_tag, role)
  values ('$Foyer', null, 'Semure Test', 'ink', 'enfant') returning id")"
if [ -z "$Expéditeur" ]; then
  echo "  ÉCHEC         la semure de l'expéditeur de test n'a rien produit." >&2
  echec=1
fi

if [ -n "$Expéditeur" ]; then
  Conv="$(un "insert into public.conversations (household_id, type)
    values ('$Foyer', 'direct') returning id")"
  db_exec -q -c "insert into public.conversation_members (conversation_id, member_id)
    values ('$Conv', '$Membre'), ('$Conv', '$Expéditeur')" >/dev/null
  i=1
  while [ "$i" -le 3 ]; do
    db_exec -q -c "insert into public.messages (conversation_id, household_id, sender_id, content)
      values ('$Conv', '$Foyer', '$Expéditeur', '$Marque message $i sur trois')" >/dev/null
    i=$((i + 1))
  done
  echo "  Messages      3 semés pour le membre (marque $Marque)"

  # Ce que l'Edge enverra : la ligne de `due_push_notifications` vise la
  # conversation semée. Avant tout dispatch, rien n'a consommé la file.
  Titre="$(un "select n.value ->> 'title'
     from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-$Conv' limit 1")"
  CorpsPush="$(un "select n.value ->> 'body'
     from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-$Conv' limit 1")"
  Groupe="$(un "select jsonb_array_length(n.value -> 'reminder_ids')::text
     from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-$Conv' limit 1")"
  echo "  Titre dû      $Titre"
  echo "  Corps dû      $CorpsPush"

  # 1. Le compteur est au titre, avec le prénom de l'expéditeur semé.
  if [ "$Titre" != "3 nouveaux messages de Semure" ]; then
    echo "  ÉCHEC         le titre du groupe n'est pas « 3 nouveaux messages de Semure »." >&2
    echec=1
  fi

  # 2. Le corps est le gabarit prénoms des autres membres, JAMAIS un contenu.
  case "$CorpsPush" in
    'Conversation avec '*) ;;
    *)
      echo "  ÉCHEC         le corps n'est pas le gabarit « Conversation avec … » : $CorpsPush" >&2
      echec=1
      ;;
  esac

  # 3. T-29-04 : la marque semée ne traverse NI le titre NI le corps.
  case "$Titre$CorpsPush" in
    *MARQUEPUSH*)
      echo "  ÉCHEC         le contenu d'un message semé a traversé le push (règle verrouillée)." >&2
      echec=1
      ;;
  esac

  # 4. Le groupe porte les trois ids de file à consommer d'un coup.
  if [ "$Groupe" != "3" ]; then
    echo "  ÉCHEC         reminder_ids ne compte pas les trois messages ($Groupe)." >&2
    echec=1
  fi

  # Dispatch des messages : fenêtre attribuable propre à cet appel.
  AvantMsg="$(un 'select coalesce(max(id), 0) from net._http_response')"
  BrutMsg="$(un "with r as materialized (select private.dispatch_message_notifications() as j)
             select (j ->> 'due') || '|' || (j ->> 'dispatched') || '|' || j::text
               from r")"
  DuesMsg="${BrutMsg%%|*}"
  reste="${BrutMsg#*|}"
  DispatchedMsg="${reste%%|*}"

  # Même attente que plus haut : pg_net travaille en asynchrone.
  trouve=0
  i=0
  while [ "$i" -lt "$ATTENTE" ]; do
    if [ -n "$(un "select content from net._http_response where id > $AvantMsg limit 1")" ]; then
      trouve=1
      break
    fi
    i=$((i + 3))
    sleep 3
  done

  if [ "$trouve" -eq 0 ]; then
    echo "  ÉCHEC         aucune réponse de la fonction pour les messages après ${ATTENTE}s." >&2
    echo "                cd supabase-project && sh run.sh logs functions" >&2
    echec=1
  else
    CodeMsg="$(un "select status_code::text from net._http_response where id > $AvantMsg order by id limit 1")"
    CorpsMsg="$(un "select content from net._http_response where id > $AvantMsg order by id limit 1")"
    echo "  Réponse msg   $CodeMsg  $CorpsMsg"
    RestantConv="$(un "select count(*)::text from public.message_notifications mn
      join public.messages msg on msg.id = mn.message_id
     where msg.conversation_id = '$Conv'")"

    if [ -z "$DuesMsg" ] || [ "$DuesMsg" = "0" ]; then
      echo "  ÉCHEC         le dispatch de messages n'a vu aucun groupe, alors que la" >&2
      echo "                conversation semée est due. Un job l'a consommée entre-temps." >&2
      echec=1
    elif [ "$DispatchedMsg" != "true" ]; then
      echo "  ÉCHEC         due = $DuesMsg mais dispatched = ${DispatchedMsg:-inconnu} (messages)." >&2
      echec=1
    elif [ "$CodeMsg" != "200" ]; then
      echo "  ÉCHEC         statut $CodeMsg au dispatch des messages." >&2
      echec=1
    else
      Consomme="$(printf '%s' "$CorpsMsg" | sed -n 's/.*"consumed":\([0-9][0-9]*\).*/\1/p')"
      if ! [ "${Consomme:-0}" -ge 3 ] 2>/dev/null; then
        echo "  ÉCHEC         la réponse ne porte pas consumed ≥ 3 : le groupe ne se vide pas ($Consomme)." >&2
        echec=1
      fi
      if [ "$RestantConv" != "0" ]; then
        echo "  ÉCHEC         $RestantConv ligne(s) de file restent pour la conversation semée :" >&2
        echo "                le groupe sera renvoyé à chaque dispatch, indéfiniment." >&2
        echec=1
      fi
    fi
  fi
fi

echo
if [ "$echec" -eq 0 ]; then
  echo "  OK            base → Edge Function → service Push, retour consommé,"
  echo "                groupe de messages compté au titre et SANS contenu."
else
  echo "  ÉCHEC         voir ci-dessus."
fi
exit "$echec"
