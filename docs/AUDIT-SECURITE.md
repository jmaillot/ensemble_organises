# Audit sécurité — consolidation du jalon v1.5 (phase 52)

Recopie par référence (mécanisme D-07 de la phase 46) : chaque fiche est citée
par son ID, sa sévérité et sa disposition verbatim, avec la preuve pointée
vers son rapport source — jamais réinterprétée. Les rapports sources vivent
sous `.planning/phases/` (gitignés : preuve par leur contenu, jamais
`git add -f`).

État consolidé : **état FINAL du jalon** (D-08 de la phase 52) — les fixes
précèdent le closing, la preuve citée ci-dessous est celle du jour du closing.

Source principale : `.planning/phases/45-audit-s-curit-rls/45-AUDIT.md`
(rapport unique de la phase 45, audit + matrice RLS + constats + preuves lints),
section « Consolidation phase 52 » (D-07, pointeurs prêts à recopier).

## Rappel de clôture SEC-03

**Zéro fiche majeure** dans le rapport 45 : SEC-03 (« tout constat majeur de
sécurité est corrigé ») est satisfaite **par preuve d'absence** (§2.7-I). Les
2 fiches du rapport sont toutes deux mineures (45-AUDIT, rappel D-01).

## Fiches

### SEC-45-01 — Politiques permissives multiples superposées (lint 0006) — **FIXÉ**

- **Surface** : tables `ardoise_guests` et `ardoise_members` (public) —
  plusieurs politiques RLS permissives pour le même rôle et la même action
  (`ardoise_*_admin` + `ardoise_*_select`, action SELECT, 5 rôles).
- **Sévérité** : mineur (catégorie PERFORMANCE du lint officiel, aucune
  violation §2.6 prouvée — 45-SPEC §1).
- **Preuve d'origine** : lint 0006 `multiple_permissive_policies` → 10 lignes
  (2 tables × 5 rôles) — preuve : 45-AUDIT.md §5 fiche SEC-45-01 (l. 528-534)
  + ré-exécution fraîche phase 46 (lint 0006 → 10 rows,
  2026-11-12T16:47:02Z, addendum « Clôture SEC-03 » de 45-AUDIT.md).
- **Disposition d'origine** : backlog (D-02/D-03) — fix = fusion des
  politiques permissives par table en une seule politique, migration
  forward-only 0182+ ; candidat naturel phase 52.
- **Disposition finale (jalon v1.5, D-08) : fix 52** — migration
  forward-only `supabase/migrations/0183_ardoise_single_permissive_policy.sql`
  : SELECT merged (`can_write_household OR is_household_admin`) + écritures
  admin exclusives par commande (forme lint-0006-safe), garde `do $$` de
  non-escalade en fin de migration ; cas négatifs §2.6 par testkit
  (`supabase/tests/0183_ardoise_single_permissive_policy.test.sql`).
- **Preuve du fix (datée)** : `sh scripts/psql.sh <
  supabase/tests/lints/0006_multiple_permissive_policies.sql` → **0 rows**
  sur tout le schéma public (ardoise incluses), **2026-11-14** — après
  migration appliquée à 10:46:14 UTC et enregistrée dans `schema_migrations` ;
  `sh scripts/test-db.sh` → exit 0, `OK 0183_…test.sql` (non-escalade :
  le membre lit, n'écrit pas ; l'admin écrit tout). Commits `7795b03`
  (migration) et `ba4b30d` (test). Preuve lint 0006 → 0 rows datée du
  **2026-11-14**, plan 52-01 de la phase 52.

### SEC-45-02 — faux positifs lint 0008 — **verrouillé — hors périmètre**

- **Sévérité** : moyen (cohérence sans preuve d'exécution d'impact,
  classification tranchée par la matrice du plan 03).
- **Disposition** : verrouillé — hors périmètre (comportement conforme,
  aucune action). Preuve : 45-AUDIT.md §5 (l. 524) et clôture l. 218.

## Preuves fraîches de la phase 46 (mémoire de la consolidation)

Lint 0006 : 10 lignes = valeur de référence avant fix ; lint 0008 : 10 tables
= faux positifs confirmés ; lints 0011/0013 : 0 ligne ; harnais complet
`sh scripts/test-db.sh lints/` → 9 fichiers, tous verts
(2026-11-12T16:47:24Z). Addendum « Clôture SEC-03 » de 45-AUDIT.md +
journal `.planning/phases/46-fixes-rls-majeurs/46-preuves-fraiches.md`.

## Contrôle anti-fuite

Contrôle des motifs de valeurs de secrets (clés secrètes Supabase au format
secret — préfixe `sb_secret` suivi d'une charge longue — et mot de passe
PostgreSQL) exécuté avant commit sur ce fichier → 0 occurrence
(menace T-52-06 du plan 52-05) : aucune valeur de secret dans ce fichier
versionné — les secrets vivent dans le `.env` de la stack et Vault, jamais
en base ni ici (AGENTS.md §2.7-H).
