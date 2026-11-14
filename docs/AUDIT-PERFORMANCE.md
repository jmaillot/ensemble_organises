# Audit performance — consolidation du jalon v1.5 (phase 52)

Recopie par référence (mécanisme D-07 de la phase 46) : fiches citées par ID,
sévérité et disposition verbatim, preuves pointées vers leurs rapports
sources (gitignés : preuve par leur contenu). État consolidé : **état FINAL
du jalon** (D-08) — PERF-47-09 fixé en phase 48, les causes transverse
`useResource` arbitrées en phase 52 (D-04).

Sources principales :
`.planning/phases/47-audit-performance-requ-tes/47-AUDIT.md` (récapitulatif
axe 2 — SQL/requêtes) et
`.planning/phases/48-fixes-perf-majeurs/48-SOUS-RAPPORT.md` (récap final —
re-renders mesurés + PERF-48-CROISE-01).

## Axe 2 — SQL / requêtes (47-AUDIT)

| ID | Parcours | Surface | Sévérité (cité 45-SPEC §1) | Disposition finale |
|----|----------|---------|-----------------------------|---------------------|
| PERF-47-02 | hors parcours (bundle) | chunk `notes-page` 179,6 KiB (× 3,5 la médiane) | mineur (aucun impact démontré) | backlog → docs/TODO.md |
| PERF-47-03 | connexion | `session-store.ts:218-224` — N+1 borné `households` | mineur (volumétrie datée sous seuil, D-03) | backlog → docs/TODO.md |
| PERF-47-04 | rejoindre | preuve d'absence de constat (3 fichiers revus datés) | aucun constat | aucun fix requis — baseline consignée |
| PERF-47-05 | dashboard | double lecture `expenses` (use-dashboard.ts:119-128) + upserts widgets en boucle (l. 142-170) | mineur (EXPLAIN daté 2026-11-12T20:07Z : ~15 ms redondantes/montage, facteur 2 ≠ plan) | backlog → docs/TODO.md |
| PERF-47-06 | tâches | « index manquant » `task_assignees(task_id)` — RÉFUTÉ par EXPLAIN daté (PK en colonne de tête) | non fondé | verrouillé — hors périmètre (aucun index à créer) |
| PERF-47-07 | tâches | `updateTaskOrders` — 1 update HTTP/tâche (api.ts:64-69) | mineur (N = 1-3) | backlog → docs/TODO.md |
| PERF-47-08 | ardoise (client) | `expense_participants` sans filtre + jointure client O(n×m) (api.ts:115-126) | mineur | backlog → docs/TODO.md |
| PERF-47-09 | ardoise (SQL serveur) | `ardoise_balances` recalculé 3× par settlement (0058/0064/0069) — EXPLAIN daté : 527 ms/exécution à 600 dépenses, ≈ 1,6 s redondants/appel | **majeur** (impact démontré à la volumétrie cible) | **fixé en 48** — plan 48-02, commit `d413769` (migration 0182) : appel complet 31,064 → 10,343 ms (−67 %) |
| PERF-47-10 | transverse | `select *` systématique (supabase-adapter.ts:137) | mineur (aucune preuve d'impact) | backlog → docs/TODO.md |

Les fiches « backlog » détaillées (quoi / pourquoi / comment vérifier)
vivent dans `docs/TODO.md` §« Backlog des audits du jalon v1.5 ».

## Axe 3 — Re-renders (48-SOUS-RAPPORT, mesures Profiler)

| ID | Parcours | Mesure dominante | Sévérité | Disposition finale |
|----|----------|------------------|----------|---------------------|
| PERF-47-11 | connexion | mount 14,5 ms ; interaction 5,3 ms | mineur | mineur → backlog |
| PERF-47-12 | rejoindre | mount 4,0 ms ; interaction ≤ 1,5 ms | mineur | mineur → backlog |
| PERF-47-13 | dashboard | mount 52,4 ms, cascade ≤ 55,0 ms ; interaction 35-39 ms | moyen | moyen → backlog — cause transverse `useResource` → transverse → arbitrée en phase 52 (D-14) |
| PERF-47-14 | courses | mount 15,2 ms ; optimiste 0,7 ms puis ≤ 30,0 ms | mineur | mineur → backlog ; éligibilité memo démonstration : props instables |
| PERF-47-15 | tâches | mount 13,5 ms ; optimiste 0,8 ms puis ≤ 23,2 ms | mineur | mineur → backlog |
| PERF-47-16 | ardoise | montages 8,2 / 19,4 ms ; enregistrement ≤ 25,4 ms | mineur | mineur → backlog ; `computeBalances` au backlog (D-08) |
| PERF-48-CROISE-01 | hors parcours | famille SQL household `household_balances`/`simplify_household_debts`/`expense_settlement` (0006:488/555/585/597, 0013:148/163) | mineur (non EXPLAINé — non mesuré) | mineur → backlog, hors périmètre 48, non fixé (D-10) |

**Aucun majeur re-renders au seuil TRA-01 (45-SPEC §1)** : toutes les durées
de commit observées restent ≤ ~55 ms par commit, avec réponse perçue
instantanée sur les interactions (overlay optimiste < 1 ms avant refetch).
Aucun memo n'a été posé (D-13 de la phase 48 : pas de memo « par prudence ») ;
la phase 48 reste complete au titre de PERF-03 via le fix SQL
PERF-47-09 (0182).

## Arbitrage `useResource` — verdict D-04 (phase 52)

L'arbitrage D-14 attendu par la phase 48 (« transverse → arbitrée en
phase 52 ») est rendu par l'**absence de fix** : les re-renders mesurés sont
tous mineurs/moyens (≤ ~55 ms, réponse optimiste < 1 ms, aucun impact
utilisateur démontré au seuil TRA-01), et la cause est transverse —
`useResource` (chaque arrivée de données re-rend toute la page, cf.
PERF-47-13) — combinée à la lecture `select *` systématique du supabase-adapter
(PERF-47-10), sans preuve d'impact. Un `React.memo` sur les widgets
n'éliderait pas les arrivées séquentielles (les données changent à chaque
commit) ; D-12/D-13 de la phase 48 refusent le memo sans majeur démontré.

**Verdict : aucun fix, `useResource.ts` et le chemin transverse restent en
l'état** — consigné ici pour ne pas ré-ouvrir la question sans nouveau majeur.
Le recalcul client `computeBalances` (use-ardoise.ts:279) suit le même sort :
explicitement au backlog (D-08), cause client-side déjà prévue au backlog,
aucun fix en 48 sans mesure d'impact utilisateur supplémentaire.

## Preuves

Chaque fiche porte sa preuve dans son rapport source (« commande → résultat
daté ») : EXPLAIN datés du 2026-11-12T20:07Z pour l'axe 2 (47-AUDIT), mesures
Profiler en texte pour l'axe 3 (48-SOUS-RAPPORT). Preuve du fix
PERF-47-09 : avant/après datés de la migration 0182, commit `d413769`
(48-SOUS-RAPPORT, récap final). Aucun code touché par ce closing
(Task 2 du plan 52-05 : fichiers de documentation uniquement).

## Contrôle anti-fuite

Contrôle des motifs de valeurs de secrets (clés secrètes Supabase, mot de
passe PostgreSQL) exécuté avant commit sur ce fichier → 0 occurrence
(menace T-52-06).
