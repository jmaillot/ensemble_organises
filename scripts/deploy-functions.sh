#!/usr/bin/env sh
# scripts/deploy-functions.sh
# Copie les fonctions métier de `supabase/functions` dans le runtime épinglé
# `supabase-project/volumes/functions`.
#
# Règles :
#   * les répertoires fournisseurs `main` et `hello` ne sont jamais touchés ni
#     remplacés : ils appartiennent au snapshot Supabase ;
#   * les fonctions métier obsolètes sont supprimées avant copie, pour qu'un
#     renommage ne laisse pas de code mort déployé ;
#   * le script est idempotent : le résultat ne dépend pas du nombre
#     d'exécutions.
#
# Fonctions métier attendues à ce jour :
#   household-invite, expense-settlement, generate-routine-occurrences.
#
#   sh scripts/deploy-functions.sh
#   sh scripts/deploy-functions.sh --list
#
# Variables d'environnement reconnues :
#   FUNCTIONS_DIR  destination (défaut : supabase-project/volumes/functions)

set -eu

SOURCE_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase/functions" && pwd)"
PROJECT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase-project" && pwd)"
FUNCTIONS_DIR="${FUNCTIONS_DIR:-$PROJECT_DIR/volumes/functions}"
VENDOR_KEEP="main hello"

# Fichiers que le snapshot place à la racine du runtime, hors de tout
# répertoire de fonction. `deno.jsonc` en fait partie : Deno remonte l'arborescence
# pour trouver sa configuration, et le snapshot s'en sert pour celle de ses
# propres fonctions. Ce n'est pas un déchet de déploiement, et le supprimer
# ferait perdre au runtime sa configuration commune.
VENDOR_FILES="deno.jsonc"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "deploy-functions.sh: répertoire source introuvable : $SOURCE_DIR" >&2
  exit 1
fi

# Listes calculées UNE seule fois, sans pipeline : un `find | grep -q` fait
# mourir `find` par SIGPIPE dès que `grep` a trouvé sa ligne, ce qui faisait
# croire que toute fonction métier était une fonction fournisseur et qu'aucune
# n'était copiée. Les tests membership ci-dessous ne lancent aucun sous-processus.
SOURCE_FUNCTIONS=""
for dir in "$SOURCE_DIR"/*; do
  [ -d "$dir" ] || continue
  SOURCE_FUNCTIONS="$SOURCE_FUNCTIONS $(basename "$dir")"
done

# `is_vendor <nom>` : le répertoire appartient au snapshot fournisseur.
# Les variables ne sont pas scoping en POSIX sh : les boucles internes
# utilisent donc des noms distincts de ceux des boucles appelantes.
is_vendor() {
  for kept in $VENDOR_KEEP; do
    [ "$kept" = "$1" ] && return 0
  done
  return 1
}

# `is_business <nom>` : le répertoire est une fonction métier versionnée.
is_business() {
  for kept in $SOURCE_FUNCTIONS; do
    [ "$kept" = "$1" ] && return 0
  done
  return 1
}

if [ "${1:-}" = "--list" ]; then
  echo "Fonctions métier à déployer :"
  for name in $SOURCE_FUNCTIONS; do
    echo "  - $name"
  done
  echo
  echo "Répertoires fournisseurs préservés :"
  for name in $VENDOR_KEEP; do
    echo "  - $name"
  done
  echo "Fichiers fournisseurs à la racine du runtime :"
  for name in $VENDOR_FILES; do
    echo "  - $name"
  done
  echo
  echo "Destination : $FUNCTIONS_DIR"
  exit 0
fi

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "deploy-functions.sh: runtime absent : $FUNCTIONS_DIR" >&2
  echo "                 bootstrapez d'abord la stack (voir docs/BACKEND.md)." >&2
  exit 1
fi

# Contrôle préalable, avant toute suppression : le runtime Deno charge
# `<fonction>/index.ts`. Un répertoire métier sans ce fichier produirait une
# fonction déployée qui répond 500 au premier appel.
for name in $SOURCE_FUNCTIONS; do
  if is_vendor "$name"; then
    continue
  fi
  if [ ! -f "$SOURCE_DIR/$name/index.ts" ]; then
    echo "deploy-functions.sh: la fonction métier '$name' n'a pas de index.ts." >&2
    exit 1
  fi
done

# --- Suppression des fonctions métier obsolètes ------------------------------
stale=0
for dir in "$FUNCTIONS_DIR"/*; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  if is_vendor "$name"; then
    continue
  fi
  if is_business "$name"; then
    continue
  fi
  echo "  - suppression de la fonction obsolète : $name"
  rm -rf "$dir"
  stale=$((stale + 1))
done

# --- Copie des fonctions métier ---------------------------------------------
copied=0
for name in $SOURCE_FUNCTIONS; do
  if is_vendor "$name"; then
    echo "  ! $name est un répertoire fournisseur : ignoré"
    continue
  fi
  rm -rf "$FUNCTIONS_DIR/$name"
  cp -R "$SOURCE_DIR/$name" "$FUNCTIONS_DIR/$name"
  echo "  → déploiement de $name"
  copied=$((copied + 1))
done

# Les fonctions fournies par le snapshot doivent rester en place.
for name in $VENDOR_KEEP; do
  if [ ! -d "$FUNCTIONS_DIR/$name" ]; then
    echo "deploy-functions.sh: la fonction fournisseur '$name' a disparu du runtime." >&2
    echo "                 Réinstallez le snapshot (docs/BACKEND.md, §2)." >&2
    exit 1
  fi
done

# La purge ci-dessus a déjà aligné le runtime : un fichier (et non un
# répertoire) qui traînerait à la racine ne serait pas supprimé, on le signale
# sans faire échouer un déploiement pourtant réussi.
#
# Les fichiers fournis par le snapshot sont attendus, et acceptés en silence ;
# seule une surprise mérite l'avertissement.
for entry in "$FUNCTIONS_DIR"/*; do
  [ -e "$entry" ] || continue
  [ -d "$entry" ] && continue

  entry_name="$(basename "$entry")"
  is_vendor_file=1
  for kept_file in $VENDOR_FILES; do
    if [ "$kept_file" = "$entry_name" ]; then
      is_vendor_file=0
    fi
  done

  if [ "$is_vendor_file" -eq 1 ]; then
    echo "deploy-functions.sh: fichier inattendu à la racine du runtime : $entry_name" >&2
  fi
done

echo
echo "Fonctions déployées : $copied, obsolètes supprimées : $stale."
echo "Contenu du runtime :"
for dir in "$FUNCTIONS_DIR"/*; do
  [ -d "$dir" ] || continue
  echo "  - $(basename "$dir")"
done
