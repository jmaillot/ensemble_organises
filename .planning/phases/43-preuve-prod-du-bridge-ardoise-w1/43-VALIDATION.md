---
phase: "43"
slug: "preuve-prod-du-bridge-ardoise-w1"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-11"
validated: "2026-11-11"
---

# Phase 43 — Validation (Nyquist audit, post-exécution)

Audit des gaps de validation pour les exigences PROOF-01..07 (.planning/REQUIREMENTS.md, toutes [x]).
Rôle de cette phase : **preuve**, pas code produit — le livrable est `scripts/test-ardoise-bridge-real.sh`
+ `docs/BRIDGE-ARDOISE-PREUVE.md` (auto-rédigé). Vérifié : aucun `app/` ni migration touchée
(`git log --name-only 7f74132^..4027d2c` → uniquement `scripts/`, `docs/`, `.planning/`) ;
`python3 scripts/check-sql-statique.py` vert (231 fonctions, aucun défaut).

## Exécution de l'audit

- Contrôles structurels (statiques, passés) : `bash -n` OK ; `curl -K` ×2 ; sonde `auth/v1/health` ;
  signal `DÉCALAGE CHEMIN APP` ; canal `household-token` + `functions/v1/household-invite` ;
  aucun appel direct RPC `redeem_ardoise_invite` ; `participant_type = 'guest'` ; aucune falsification
  SQL d'`expires_at` ; section « Ce qui n'est PAS prouvé » ; purge `DELETE FROM public.households`.
- **Run comportemental réel lancé par l'audit** (18:30–18:48) : rendu ROUGE sur un assert SQL —
  cause racine identifiée : le script a été édité PENDANT l'exécution (fix review `dcb3f70` committé
  à 18:37 ; bash lit par offset d'octets → lectures corrompues). Artefact d'intervention, pas un
  défaut produit. Sa purge est restée verte (2 foyers cascade → 0 lignes, comptes re-delete → 404).
- **Re-run propre vert** : `/tmp/opencode/43-01-run11-postreview.log` — EXIT=200, 18 étapes HTTP,
  12 verdicts NÉGATIF OK / 0 KO (4 négatifs red-team + 9 asserts SQL exacts + purge),
  doc réécrit par le run 11 (comportement D-07/D-08 attendu).

## Couverture par exigence

| Req | Exigence | Verdict | Preuve |
|-----|----------|---------|--------|
| PROOF-01 | Happy path HTTP attribuable (méthode, statut, champs, estampille), jamais SQL seul | **COVERED** | Runs 9/10/11 : 18 lignes `ÉTAPE n \| VERB <url> \| HTTP <statut> \| champs \| estampille` ; canal Edge `household-token` → Edge `household-invite redeem`, zéro appel RPC direct. Caveat : estampille `/version.json` code 000 (conteneur frontend arrêté) — nommée à chaque étape, jamais silencieuse, non requise par PROOF-01..07 |
| PROOF-02 | ≥ 3 négatifs red-team vus rouges sur le vrai fil | **COVERED** | 4 négatifs vus rouges sur les 3 runs : replay → 410 « Ce token a été révoqué. », token muté → 404 « introuvable », expiré → 410 « expiré » après **attente réelle 1020 s** (aucun UPDATE d'`expires_at`), cross-household → 0 part du foyer B convertie (`parts_membre_converties_foyer_b = 0`) |
| PROOF-03 | Réconciliation bornée par foyer + single-use en assert positif | **COVERED** | 9 asserts SQL `psql.sh < stdin`, chaque lecture bornée `household_id = :'foyer'` ; identifiants du pont capturés AVANT redeem (sinon tautologie) ; replay 410 = assert single-use positif ; `parts_membre_converties = 1`, `depenses_dupliquees_membre = 0` |
| PROOF-04 | Secrets `curl -K` 0600, jamais argv/env ; purge vérifiée (re-delete → 404) | **COVERED** | `curl -K` ×2 vérifié statiquement ; jetons/codes/JWT scellés en fichiers 0600 (`mktemp`) ; comptes via `lib-smoke-accounts.sh` ; purge des 3 runs : foyers cascade → 0 ligne + re-delete → 404. Post-review `dcb3f70`/`4027d2c` : pagination GoTrue clampée (résiduels listés 2×), échec de sonde résiduel nommé, extraction email jq root-field (GoTrue duplique dans `user_metadata.email`) |
| PROOF-05 | Doc de consignation daté, verdict par étape, jamais de succès muet | **COVERED** | `docs/BRIDGE-ARDOISE-PREUVE.md` réécrit à chaque run (run 11 : 18:12:19 UTC), 5 sections dont « Ce qui n'est PAS prouvé » ; verdicts citant leur sortie |
| PROOF-06 | Idempotence + teardown automatique sans accumulation | **COVERED** | Run 10 = réexécution idempotence verte ; run 11 = 3ᵉ run vert consécutif ; doc réécrit (pas accumulé), foyers → 0 ligne, comptes purgés à chaque run |
| PROOF-07 | E2E navigateur du seam client — déclenché par besoin, jamais préventif | **COVERED** | 0 signal « DÉCALAGE CHEMIN APP » sur les runs 9/10/11 → non déclenché ; **UAT-1 PASS** (verdict humain 2026-11-11) tranche PROOF-07 satisfait sans e2e navigateur |

## Résidus consignés (hors exigences, non bloquants)

- Comptes e2e résiduels de runs antérieurs à la phase (17xx…) listés nommément à la purge —
  filet `DELETE 0` (hors du run courant), traitement manuel restant.
- Estampille Edge : pas de canal dédié ; `/version.json` indisponible sur les runs — consigné
  dans le doc §4, pas une exigence PROOF.

## Sign-off

- 7/7 exigences COVERED, 0 MISSING, 0 PARTIAL.
- Preuve par exécution réelle (3 runs prod complets verts : 9, 10, 11) + contrôles statiques.
- `nyquist_compliant: true` — feedback latency respectée (contrôles statiques < 5 s ; run prod ~20 min assumé D-03).
