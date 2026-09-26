#!/usr/bin/env sh
# scripts/set-push-secrets.sh
# Dépose dans Vault les deux secrets dont les jobs de notification push ont
# besoin, en les lisant dans le `.env` de la stack sans jamais les afficher.
#
#   sh scripts/set-push-secrets.sh
#   sh scripts/set-push-secrets.sh --check     # vérifie sans écrire
#
# POURQUOI CE SCRIPT, ET PAS UNE LIGNE DE SQL TYPÉE
#   Les deux secrets sont `SUPABASE_PUBLIC_URL` et `SUPABASE_SECRET_KEY` du
#   `.env` de la stack. Les taper dans un `psql -c` les mettrait dans
#   l'historique du shell et dans la liste des processus — c'est-à-dire dans
#   deux endroits où ils se lisent sans privilege. Ici ils sont lus par `sed`,
#   interpolés dans un fichier temporaire en 600, supprimé à la sortie, et le
#   fichier n'est jamais écrit sur le disque en clair ailleurs.
#
#   Comme `init-app-env.sh`, qui recopie la clé publiable sans l'afficher.
#
# POURQUOI LE SILENCE EST LE PIRE ENNUIS
#   `private.post_push_dispatch()` lève un `warning` et retourne `false` si un
#   secret manque. Aucun job n'échoue, aucune ligne de log n'est rouge, et aucun
#   push ne part : le calcul des rappels, lui, fonctionne. Un secret absent se
#   remarque donc au bout de plusieurs jours, en croyant que le foyer a coupé
#   ses notifications. C'est pourquoi `--check` existe et affiche les NOMS.
#
# IDEMPOTENCE
#   Le secret est supprimé puis recréé : la commande peut être rejouée sans
#   jamais échouer sur « le secret existe déjà », et sans dépendre de la
#   signature de `vault.update_secret()`, qui a changé entre les versions.
#
# PAS DE `--rollback`, CONTRAIREMENT AUX AUTRES SCRIPTS
#   `psql.sh --rollback` encadre la requête dans BEGIN/ROLLBACK : ici, le dépôt
#   serait annulé, les jobs liraient l'absence de secret, et le script
#   annoncerait un succès. La transaction est ici celle du bloc `DO`, qui
#   supprime et recrée les deux secrets ensemble et lève si le compte est
#   incomplet : l'écriture est atomique sans avoir besoin de l'annuler.
#
# APRÈS CE SCRIPT
#   `sh scripts/migrate.sh` installe les jobs `eo-push-dispatch` et
#   `eo-birthday-alerts`, qui liront ces secrets au moment de l'exécution.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"
SQL_FILE="${TMPDIR:-/tmp}/eo-vault-$$.sql"

CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "set-push-secrets.sh: option inconnue : $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ ! -f "$STACK_ENV" ]; then
  echo "set-push-secrets.sh: .env de la stack introuvable : $STACK_ENV" >&2
  echo "  STACK_ENV=/chemin/vers/.env sh scripts/set-push-secrets.sh" >&2
  exit 1
fi

# Lecture sans affichage : la valeur ne quitte jamais cette variable du shell.
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

PROJECT_URL="$(stack_value SUPABASE_PUBLIC_URL)"
SERVICE_KEY="$(stack_value SUPABASE_SECRET_KEY)"

# --- Vérification seule ------------------------------------------------------
if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "Secrets de notification dans Vault :"
  sh "$SCRIPT_DIR/psql.sh" -c "
    select name,
           case when created_at = updated_at then 'jamais modifié' else 'modifié' end as etat,
           to_char(updated_at, 'DD/MM/YYYY HH24:MI') as mis_a_jour
      from vault.secrets
     where name in ('project_url', 'service_role_key')
     order by name;"
  echo
  echo "Attendu : deux lignes, project_url et service_role_key."
  echo "Si project_url est absente ou fausse, les jobs calculent les rappels"
  echo "et n'envoient rien — sans lever la moindre erreur."
  exit 0
fi

if [ -z "$PROJECT_URL" ]; then
  echo "set-push-secrets.sh: SUPABASE_PUBLIC_URL absent de $STACK_ENV." >&2
  echo "  C'est l'URL de la gateway API, par exemple https://api.votredomaine.fr" >&2
  exit 1
fi
if [ -z "$SERVICE_KEY" ]; then
  echo "set-push-secrets.sh: SUPABASE_SECRET_KEY absent de $STACK_ENV." >&2
  echo "  sh supabase-project/utils/generate-keys.sh --update-env" >&2
  exit 1
fi

case "$PROJECT_URL" in
  https://*) ;;
  *)
    echo "set-push-secrets.sh: SUPABASE_PUBLIC_URL n'est pas en HTTPS : $PROJECT_URL" >&2
    echo "  Un cron qui appelle http:// en clair est un secret qui traverse le réseau." >&2
    exit 1
    ;;
esac

case "$SERVICE_KEY" in
  sb_secret_*) ;;
  *)
    echo "set-push-secrets.sh: SUPABASE_SECRET_KEY ne ressemble pas à une clé secrète (sb_secret_…)." >&2
    echo "  Une clé publiable suffirait à l'API mais pas au mode \`secret\` des Edge Functions." >&2
    exit 1
    ;;
esac

command -v psql >/dev/null 2>&1 || true

# Le fichier SQL contient les secrets en clair : 600, et supprimé à la sortie,
# quoi qu'il arrive (le `trap` couvre aussi l'échec du script suivant).
umask 077
trap 'rm -f "$SQL_FILE"' EXIT INT TERM

cat > "$SQL_FILE" <<SQL
-- Écrit par scripts/set-push-secrets.sh le $(date '+%Y-%m-%d %H:%M').
-- Ne pas versionner, ne pas laisser dans l'historique d'un shell.
do \$\$
declare
  v_url text := '$PROJECT_URL';
  v_key text := '$SERVICE_KEY';
  v_existing integer;
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'extension Vault absente : les jobs de notification ne pourront pas lire leurs secrets';
  end if;

  -- Suppression puis recréation : idempotent quelles que soient les versions
  -- de vault.update_secret(), dont la signature a changé.
  delete from vault.secrets where name = 'project_url';
  perform vault.create_secret(v_url, 'project_url', 'URL publique de la stack, pour les jobs de notification');

  delete from vault.secrets where name = 'service_role_key';
  perform vault.create_secret(v_key, 'service_role_key', 'Clé secrète du projet, pour le mode secret des Edge Functions');

  select count(*) into v_existing from vault.secrets where name in ('project_url', 'service_role_key');
  if v_existing <> 2 then
    raise exception 'dépôt incomplet : % secret(s) sur 2', v_existing;
  end if;
end
\$\$;
SQL

chmod 600 "$SQL_FILE"

echo "Dépôt des secrets de notification dans Vault (valeurs non affichées)…"
# Ni `--rollback` ni affichage : voir la note « PAS DE --rollback » en tête.
#
# Le SQL passe par l'ENTRÉE STANDARD, et c'est délibéré à deux titres :
#
#   * `-c "$SQL_FILE"` mettrait le chemin — donc, pour `-c`, le contenu — dans
#     la ligne de commande, donc dans la liste des processus. Les secrets y
#     seraient lisibles par quiconque peut voir les processus de la machine.
#   * `-f "$SQL_FILE"` paraît plus sûr, et ne l'est pas : `psql.sh` exécute
#     psql DANS le conteneur `db`, où le dépôt et le /tmp de l'hôte n'existent
#     pas. Le premier jet de ce script faisait ainsi `-f`, et échouait sur
#     « /tmp/eo-vault-….sql: No such file or directory » — un fichier bien
#     écrit, en 600, que personne ne pouvait lire depuis le conteneur.
#
# L'entrée standard est le seul canal qui traverse la frontière. Elle suppose
# que la résolution de contexte de `psql.sh` ne la consomme pas : c'est
# exactement ce que `< /dev/null` sur `db_printenv` garantit (scripts/lib-db.sh).
sh "$SCRIPT_DIR/psql.sh" <"$SQL_FILE" >/dev/null

rm -f "$SQL_FILE"
trap - EXIT INT TERM
umask 022

# On confirmation, par le NOM et la LONGUEUR seulement : la valeur ne doit
# jamais atteindre un terminal, un journal ou une capture d'écran.
printf 'Déposé dans Vault :\n'
printf '  project_url       = %s (%s caractères)\n' "$PROJECT_URL" "${#PROJECT_URL}"
printf '  service_role_key  = <%s caractères, masquée>\n' "${#SERVICE_KEY}"
echo
echo "Contrôle :"
echo "  sh scripts/set-push-secrets.sh --check"
echo
echo "Les jobs eo-push-dispatch et eo-birthday-alerts liront ces secrets au"
echo "moment de l'exécution. Ils ne sont planifiés qu'après sh scripts/migrate.sh."
