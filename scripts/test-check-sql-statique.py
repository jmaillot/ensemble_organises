#!/usr/bin/env python3
"""Preuves du contrôle 3 de `check-sql-statique.py` (littéraux et dollar-quotes).

Un contrôle qui n'a jamais rien refusé n'a pas été exercé (AGENTS.md §2.7 B).
Ce script donne au contrôle 3 les cas qui DOIVENT échouer — et le cas qui
doit passer, qui est celui qui l'a fait tomber par erreur le 2026-10-22.

LE CAS QUI DOIT PASSER
---------------------
Un tag nommé (`$q$`) peut traverser une ligne : PostgreSQL l'autorise, et le
dépôt l'emploie pour passer un SQL multi-lignes à une assertion
(`testkit.expect_denied($q$insert … $q$, '…')`). Le premier jet du contrôle
traitait l'ouverture d'un tag nommé comme un défaut dès la fin de sa ligne
d'ouverture : il refusait donc le test `0138`, qui est sain, et signalait un
faux positif là où il n'y avait rien.

LES CAS QUI DOIVENT ÉCHOUER
---------------------------
* un tag nommé jamais refermé (le symptôme d'un guillemet mal placé en amont) ;
* un littéral simple laissé ouvert en fin de ligne ;
* un corps `$$` jamais refermé.

    python3 scripts/test-check-sql-statique.py
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
CHECKER = RACINE / "scripts" / "check-sql-statique.py"


def _charger():
    spec = importlib.util.spec_from_file_location("check_sql_statique", CHECKER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


c = _charger()


def _defauts(texte: str):
    return c._litteraux_ouverts(texte)


def _cas_sain() -> None:
    """Un tag nommé qui traverse une ligne est légitime."""
    texte = (
        "select testkit.expect_denied(\n"
        "  $q$insert into public.event_categories (household_id, name)\n"
        "     values ('hh_t138', 'Bord espace')$q$,\n"
        "  'un bord espace est refusé');\n"
    )
    assert _defauts(texte) == [], f"un tag nommé multi-lignes a été refusé : {_defauts(texte)}"


def _cas_reel() -> None:
    """Le fichier du dépôt qui a fait tomber le contrôle est sain."""
    fichier = RACINE / "supabase" / "tests" / "0138_calendrier_emoji_categorie.sql"
    if not fichier.exists():
        return
    defauts = _defauts(fichier.read_text())
    assert defauts == [], f"{fichier.name} est sain et ne doit pas être signalé : {defauts}"


def _cas_tag_nomme_jamais_ferme() -> None:
    """Un tag nommé jamais refermé est un défaut, et il est situé."""
    texte = (
        "select testkit.expect_denied(\n"
        "  $q$insert into public.event_categories (household_id, name)\n"
        "     values ('hh_t138', 'Bord espace')\n"
    )
    defauts = _defauts(texte)
    assert len(defauts) == 1, f"un dollar-quote jamais refermé n'est pas signalé : {defauts}"
    defaut = defauts[0]
    assert defaut.ligne == 2, f"le défaut n'est pas situé sur la ligne d'ouverture : {defaut}"
    assert "jamais fermé" in defaut.nature, f"la nature du défaut n'est pas dite : {defaut}"


def _cas_litteral_ouvert() -> None:
    """Un littéral simple laissé ouvert en fin de ligne est un défaut."""
    texte = "select 'un texte jamais fermé\n"
    defauts = _defauts(texte)
    assert len(defauts) == 1, f"un littéral ouvert n'est pas signalé : {defauts}"
    defaut = defauts[0]
    assert defaut.ligne == 1, f"le défaut n'est pas situé : {defaut}"
    assert defaut.colonne == 7, f"la colonne du guillemet ouvrant n'est pas dite : {defaut}"


def _cas_corps_jamais_ferme() -> None:
    """Un corps `$$` jamais refermé est un défaut."""
    texte = "do $$\nbegin\n  perform 1;\n"
    defauts = _defauts(texte)
    assert len(defauts) == 1, f"un corps jamais refermé n'est pas signalé : {defauts}"
    assert "corps" in defauts[0].nature, f"la nature du défaut n'est pas dite : {defauts[0]}"


def _cas_guillemet_mal_place() -> None:
    """Un guillemet mal placé avale la suite : le défaut est signalé quand même.

    Le symptôme que PostgreSQL rend — « unterminated dollar-quoted string » —
    vient de là : le lexer sort du littéral trop tôt, prend le `$q$` qui suit
    pour une ouverture de dollar-quote, et avale le reste du fichier. Le
    contrôle doit le voir, quelle que soit la règle qui le voie.
    """
    texte = (
        "insert into public.notes (id, title)\n"
        "values ('n-1', 'titre$q$suite);\n"
    )
    defauts = _defauts(texte)
    assert len(defauts) == 1, f"un guillemet mal placé n'est pas signalé : {defauts}"
    assert defauts[0].ligne == 2, f"le défaut n'est pas situé : {defauts[0]}"


CAS = [
    _cas_sain,
    _cas_reel,
    _cas_tag_nomme_jamais_ferme,
    _cas_litteral_ouvert,
    _cas_corps_jamais_ferme,
    _cas_guillemet_mal_place,
]


def main() -> int:
    echecs = 0
    for cas in CAS:
        try:
            cas()
            print(f"  ok   {cas.__name__}")
        except AssertionError as erreur:
            echecs += 1
            print(f"  ÉCHEC {cas.__name__} : {erreur}")
    if echecs:
        print(f"test-check-sql-statique : {echecs} cas en échec", file=sys.stderr)
        return 1
    print(f"test-check-sql-statique : {len(CAS)} cas, tous verts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
