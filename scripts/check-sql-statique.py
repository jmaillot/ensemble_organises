#!/usr/bin/env python3
"""Contrôles statiques sur le SQL du dépôt.

Trois défauts que la relecture, `migrate.sh` et le test de contrat n'ont pas
vus, et que seule l'exécution a révélés. Ils sont tous de la même famille : le
code est accepté à la création, et refusé à l'appel. Un contrôle automatique
est donc le seul moyen fiable de les voir avant la recette.

Les vérifications
-----------------
1. NOM NON QUALIFIÉ — un `from X` / `join X` sans schéma, où X n'est ni un CTE
   de la clause `with`, ni un appel de fonction (`from unnest(...)`), ni une
   variable (`extract(dow from p_day)`).
2. CTE OMBRANT SON PROPRE NOM — `with tasks as (select … from task_reminders
   join tasks t on …)` joint le CTE à lui-même. PostgreSQL refuse un
   « recursive reference to query "tasks" must not appear within a non-recursive
   CTE » : à l'exécution, comme le reste.
3. LITTÉRAL NON FERMÉ — un `'` simple laissé ouvert en fin de ligne. SQL ne
   permet pas de littéral sur plusieurs lignes ; PostgreSQL répond alors
   « unterminated quoted string », ou, quand le guillemet refermant est mal
   placé, une erreur de dollar-quoting qui désigne le `$` d'une variable
   interpolée et envoie le lecteur chercher au mauvais endroit.

    python3 scripts/check-sql-statique.py            # tout le dépôt
    python3 scripts/check-sql-statique.py 0006        # un seul fichier
"""
from __future__ import annotations

import pathlib
import re
import sys

MIGRATIONS = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "migrations"
TESTS = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "tests"

# `from`/`join` suivis de ce mot n'introduisent pas une table.
CONNECTEURS = {
    "lateral", "only", "select", "unnest", "values", "generate_series",
    "jsonb_array_elements", "jsonb_to_recordset", "jsonb_each",
}

RE_FONCTION = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+"
    r"(?P<nom>[\w.]+\s*\([^)]*\))"
    r"(?P<corps>.*?)\n\$\$;\n",
    re.S | re.I,
)
RE_SEARCH_PATH = re.compile(r"set\s+search_path\s*=\s*''", re.I)
RE_TABLE = re.compile(r"\b(?:from|join)\s+(?:lateral\s+)?([\w.]+)\s*(\(?)", re.I)

# `extract(dow from p_day)` et `overlay(a placing b from 1 for 2)` contiennent un
# `from` qui n'introduit aucune table. On ne les repère pas par analyse
# syntaxique — trop coûteux pour ce que le contrôle doit prouver — mais par la
# convention de nom du dépôt : `p_` pour un paramètre, `v_` pour une variable
# locale. Aucun objet ne porte ces préfixes.
RE_VARIABLE = re.compile(r"^[pv]_", re.I)


def _litteraux_ouverts(texte: str) -> list[tuple[int, int, str]]:
    """Lignes où un littéral ou un dollar-quote nommé n'est pas refermé.

    SQL n'autorise pas un littéral `'` sur plusieurs lignes.

    L'important est que le corps `$$ … $$` soit lexicalisé À L'INTÉRIEUR : c'est
    du plpgsql, et c'est là que vivent les `do $$ … $$` des tests. Un contrôleur
    qui saute le corps ne voit rien de ce qui le concerne — il a rapporté zéro
    défaut sur un fichier qui, lui, en comptait un.

    Un dollar-quote `$$` peut legitimement s'ouvrir sur une ligne et se fermer
    sur une autre : c'est la convention du dépôt pour les corps de fonction. Un
    tag NOMMÉ (`$v_birthday$`) ne peut pas, et n'a aucune raison de le faire :
    il entre en collision avec la syntaxe de PostgreSQL. Si le guillemet fermant
    d'une chaîne est mal placé, le lexer sort du littéral, prend `$v_birthday$`
    pour une ouverture, avale le reste du fichier, et annonce « unterminated
    dollar-quoted string » — une erreur qui désigne le `$` d'une variable au
    lieu du guillemet qui manque.
    """
    corps = False          # dans un `$$ … $$`
    chaine = False
    nomme = False          # dans un dollar-quote à tag nommé
    tag = ""
    # Une seule cause par fichier : voir la sortie de la boucle.

    for n, ligne in enumerate(texte.splitlines(), 1):
        i, colonne = 0, 0
        while i < len(ligne):
            c = ligne[i]

            if nomme:                     # dollar-quote nommé : seeks its closing tag
                if ligne.startswith(tag, i):
                    i += len(tag)
                    nomme = False
                    continue
                i += 1
                continue

            if chaine:                    # littéral simple
                if c == "'":
                    if ligne[i + 1:i + 2] == "'":
                        i += 2
                        continue
                    chaine = False
                i += 1
                continue

            # hors de tout littéral
            if c == "-" and ligne[i:i + 2] == "--":
                break                     # commentaire : rien à analyser

            if c == "'":
                chaine, colonne = True, i
                i += 1
                continue

            if c == "$":
                # `$$` se teste AVANT la détection d'un tag nommé : sans cela,
                # `$$` est pris pour un tag de longueur nulle, le corps n'est
                # jamais ouvert, et tout le fichier passe en état « littéral
                # ouvert » — hundreds de signalements sur un fichier sain.
                if ligne[i:i + 2] == "$$":
                    corps = not corps
                    i += 2
                    continue
                fin = ligne.find("$", i + 1)
                if fin > 0:
                    tag, nomme, colonne = ligne[i:fin + 1], True, i
                    i = fin + 1
                    continue
            i += 1

        if chaine or nomme:
            # Une seule cause par fichier. Tout ce qui suit est la conséquence
            # de ce guillemet mal placé : rapporter chaque ligne aval|—
            # parfois la totalité du fichier — noierait la vraie cause sous
            # cent signalements, et le contrôle deviendrait illisible.
            return [(n, colonne, ligne)]

    n = len(texte.splitlines())
    if chaine:
        return [(n, -1, "<littéral `'` jamais fermé en fin de fichier>")]
    if nomme:
        return [(n, -1, f"<dollar-quote {tag} jamais fermé en fin de fichier>")]
    if corps:
        return [(n, -1, "<corps `$$ … $$` jamais fermé en fin de fichier>")]
    return []


def _sans_commentes(texte: str) -> str:
    """Neutralise les commentaires `--` et `/* */`, en préservant les offsets.

    Indispensable : le commentaire qui explique le défaut contient le code fautif.
    « Le premier jet employait ce nom : `with window as (…)` » faisait de
    `window` un faux CTE, et le contrôleur s'écriait ensuite sur sa propre
    explication. Les caractères remplacés sont des espaces, ligne pour ligne :
    les numéros de ligne rapportés restent justes.
    """
    out: list[str] = []
    i, n = 0, len(texte)
    while i < n:
        c = texte[i]
        if c == "'":                        # littéral : à ne jamais découper
            j = i + 1
            while j < n:
                if texte[j] == "'":
                    if j + 1 < n and texte[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            out.append(texte[i : j + 1])
            i = j + 1
            continue
        if c == "-" and texte.startswith("--", i):
            j = texte.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        if c == "/" and texte.startswith("/*", i):
            j = texte.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(" " + re.sub(r"[^\n]", " ", texte[i + 1 : j]))
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _decouper_ctes(corps: str) -> dict[str, str]:
    """Renvoie {nom de CTE: corps du CTE} pour la clause `with` de premier niveau.

    Le découpage se fait sur les virgules de profondeur 0, chaque parenthèse
    étant consommée par comptage. C'est suffisant pour les requêtes de ces
    migrations, où une virgule entre CTE n'apparaît jamais dans un littéral.
    """
    m = re.search(r"\bwith\b", corps, re.I)
    if not m:
        return {}

    ctes: dict[str, str] = {}
    debut = m.end()                       # début du nom du premier CTE
    i = debut
    n = len(corps)
    while i < n:
        while i < n and corps[i] != "(":
            if corps[i] == ";":
                return ctes
            i += 1
        if i >= n:
            break
        profondeur = 0
        while i < n:
            if corps[i] == "(":
                profondeur += 1
            elif corps[i] == ")":
                profondeur -= 1
                if profondeur == 0:
                    break
            i += 1
        i += 1                             # juste après la parenthèse fermante
        tete = corps[debut:i]              # « bounds as ( … ) »
        nom = re.match(r"\s*([\w]+)\s+as\s*\(", tete, re.I | re.S)
        if nom:
            ctes[nom.group(1).lower()] = tete[tete.index("(") + 1 : -1]
        while i < n and corps[i] in " \t\n":
            i += 1
        if i < n and corps[i] == ",":
            i += 1
            while i < n and corps[i] in " \t\n":
                i += 1
            debut = i
            continue
        break
    return ctes


def _controler(corps: str) -> tuple[list[str], list[str]]:
    """Renvoie (noms non qualifiés, auto-références de CTE) pour un corps.

    Les commentaires sont neutralisés avant tout : une explication qui cite le
    code fautif — « le premier jet employait `with window as (…)` » — serait
    sinon analysée comme si c'était du SQL.
    """
    corps = _sans_commentes(corps)
    ctes = _decouper_ctes(corps)

    auto_refs: list[str] = []
    for nom, corps_cte in ctes.items():
        if re.search(rf"\b(?:from|join)\s+{re.escape(nom)}\b", corps_cte, re.I):
            auto_refs.append(nom)

    non_qualifies: list[str] = []
    for m in RE_TABLE.finditer(corps):
        nom, parenthesis = m.group(1), m.group(2)
        if "." in nom:                       # déjà qualifié
            continue
        if nom.lower() in CONNECTEURS:       # `from lateral (…)`, `from unnest(…)`
            continue
        if nom.lower() in ctes:             # un CTE de la clause `with`
            continue
        if RE_VARIABLE.match(nom):           # `extract(dow from p_day)`
            continue
        if parenthesis:                      # `from une_fonction(…)`
            continue
        ligne = corps[: m.start()].count("\n") + 1
        non_qualifies.append(f"{nom} (ligne {ligne})")

    return non_qualifies, sorted(auto_refs)


def _definitions(fichiers: list[pathlib.Path]) -> list[tuple[pathlib.Path, str, str, str, bool]]:
    """(fichier, nom, corps, langage, est_effective) pour chaque fonction définie.

    Seule la DERNIÈRE définition d'un nom de fonction est effective : c'est
    celle que la base contient, donc la seule dont l'exécution peut échouer.
    Une migration appliquée n'est plus réécrite — le dépôt garde donc son code
    fautif, et 0019 restera dans l'historique pour toujours. Sans cette
    distinction, le contrôleur condamnerait indéfiniment une faute déjà
    corrigée, et son propre rouge deviendrait le bruit que l'on n'écoute plus.
    """
    toutes: list[tuple[pathlib.Path, str, str, str, str]] = []
    for f in fichiers:
        for m in RE_FONCTION.finditer(f.read_text()):
            corps = m.group("corps")
            signature = " ".join(m.group("nom").split())
            langage = re.search(r"\blanguage\s+(\w+)", corps, re.I)
            toutes.append((
                f,
                signature,
                corps,
                langage.group(1).lower() if langage else "plpgsql",
                signature.split("(")[0].strip(),
            ))

    # Une définition est effective si aucune migration plus récente ne
    # redéfinit le même nom de fonction.
    dernier: dict[str, int] = {}
    for i, d in enumerate(toutes):
        dernier[d[4]] = i

    return [(*d[:4], dernier[d[4]] == i) for i, d in enumerate(toutes)]


def _controler(corps: str) -> tuple[list[str], list[str]]:
    """Renvoie (noms non qualifiés, auto-références de CTE) pour un corps."""
    corps = _sans_commentes(corps)
    ctes = _decouper_ctes(corps)

    auto_refs: list[str] = []
    for nom, corps_cte in ctes.items():
        if re.search(rf"\b(?:from|join)\s+{re.escape(nom)}\b", corps_cte, re.I):
            auto_refs.append(nom)

    non_qualifies: list[str] = []
    for m in RE_TABLE.finditer(corps):
        nom, parenthesis = m.group(1), m.group(2)
        if "." in nom:                       # déjà qualifié
            continue
        if nom.lower() in CONNECTEURS:       # `from lateral (…)`, `from unnest(…)`
            continue
        if nom.lower() in ctes:             # un CTE de la clause `with`
            continue
        if RE_VARIABLE.match(nom):           # `extract(dow from p_day)`
            continue
        if parenthesis:                      # `from une_fonction(…)`
            continue
        non_qualifies.append(f"{nom} (ligne {corps[: m.start()].count(chr(10)) + 1})")

    return non_qualifies, sorted(auto_refs)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    migrations = sorted(MIGRATIONS.glob(f"*{args[0]}*.sql")) if args else sorted(MIGRATIONS.glob("*.sql"))
    if not migrations:
        print("check-sql-statique: aucun fichier de migration trouvé", file=sys.stderr)
        return 2
    tests = sorted(TESTS.glob(f"*{args[0]}*.sql")) if args else sorted(TESTS.glob("*.sql"))

    defauts: list[str] = []
    obsolete: list[str] = []
    n_effective = 0

    for f, signature, corps, langage, effective in _definitions(migrations):
        if not effective:
            # Définition dépassée : sans effet sur la base, on ne la condamne pas.
            non_q, auto = _controler(corps)
            if non_q or auto:
                obsolete.append(f"    {f.name}  {signature} ({langage})")
            continue

        n_effective += 1
        if not RE_SEARCH_PATH.search(corps):
            defauts.append(
                f"{f.name}  {signature}\n"
                f"      search_path non fixé : une fonction security definer sans\n"
                f"      search_path explicite est détournable par un objet placé dans\n"
                f"      un schéma choisi par l'appelant."
            )
            continue

        non_qualifies, auto_refs = _controler(corps)
        if non_qualifies:
            defauts.append(
                f"{f.name}  {signature}\n"
                f"      search_path = '' mais nom non qualifié : {', '.join(non_qualifies)}\n"
                f"      → préfixez par le schéma (`public.`). Ni migrate.sh, ni la\n"
                f"        création de la fonction, ni le test de contrat ne le voient :\n"
                f"        le défaut n'apparaît qu'à l'exécution."
            )
        if auto_refs:
            defauts.append(
                f"{f.name}  {signature}\n"
                f"      CTE qui se rejoint lui-même : {', '.join(auto_refs)}\n"
                f"      → PostgreSQL refuse un « recursive reference to query » dans un\n"
                f"        CTE non récursif, à l'exécution. Renommez le CTE."
            )

    # Le troisième contrôle ne porte pas sur les fonctions mais sur les
    # fichiers entiers : un littéral mal fermé dans un test est aussi invisible
    # à la migration, puisque le test n'est pas rejoué avant la recette.
    n_litteraux = 0
    for f in [*migrations, *tests]:
        for ligne, colonne, texte in _litteraux_ouverts(f.read_text()):
            n_litteraux += 1
            ou = f"colonne {colonne + 1}" if colonne >= 0 else "fin de fichier"
            defauts.append(
                f"{f.name}:{ligne}  littéral `'` non fermé ({ou})\n"
                f"      | {texte.strip()}\n"
                f"      → SQL n'autorise pas un littéral sur plusieurs lignes. Si le\n"
                f"        guillemet fermant est mal placé, PostgreSQL complain d'un\n"
                f"        dollar-quoting et désigne le `$` d'une variable interpolée."
            )

    if obsolete:
        print("Définitions dépassées, sans effet sur la base (corrigées plus loin) :")
        print("\n".join(obsolete) + "\n")

    if not defauts:
        print(
            f"check-sql-statique : {n_effective} fonction(s) effective(s) sur "
            f"{len(migrations)} migration(s) et {len(tests)} test(s), aucun défaut"
        )
        return 0

    print(f"check-sql-statique : {len(defauts)} défaut(s)\n")
    for d in defauts:
        print(d + "\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
