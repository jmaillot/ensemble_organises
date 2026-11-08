# Roadmap: Ensemble & Organisés

## Milestones

- ✅ **v1.0 Mise en ligne publique** (phases 25-31, shipped 2026-11-04)
- ✅ **v1.1 PWA durcie mobile-first** (phases 32-35, shipped 2026-11-07)
- ✅ **v1.2 Finition de la dette offline** (phases 36-37, shipped 2026-11-08)
- 🚧 **v1.3 Solde de la dette** (phases 38-42) — jalon courant

## Phases

Summary checklist:

- [ ] **Phase 38: Filet de tests fiable** - Flakes dimanche corrigés à la racine + dette review 37 (IN-01/IN-02) ; la chaîne §2.7 devient un instrument de confiance pour tout le jalon
- [ ] **Phase 39: Outillage prod de vérification** - Smoke-test en mode prod réel via API Admin + spec e2e join-token refondue contre le flux 31-03
- [ ] **Phase 40: Ardoise « Rejoindre via mon compte »** - L'unique surface produit du jalon : un invité sans foyer rejoint le foyer via le flux d'invitation existant, atterrit dans l'ardoise partagée
- [ ] **Phase 41: Gate SW simulable** - Le chemin runtime de la gate « file vide » validé e2e contre build+preview réel (GATE-01 planifiable)
- [ ] **Phase 42: Cold start mesuré puis corrigé + décision cache** - Instrumentation en dernier, corrections désignées par le profil, décision CACHE-01 tranchée avec les données on-device

## Phase Details

### Phase 38: Filet de tests fiable

**Goal**: La chaîne de vérification §2.7 est redevenue un instrument de confiance — aucun test qui ment, aucune dette de review 37 — pour que toutes les phases suivantes puissent prouver leurs changements.
**Depends on**: Nothing (first phase of v1.3)
**Requirements**: TEST-01, TEST-03, DEBT-01
**Success Criteria** (what must be TRUE):
  1. La suite e2e tourne au vert 7 jours sur 7 : les semis menu-page et household-store WR-03 produisent le même résultat quel que soit le jour de la semaine (tests paramétriques sur les 7 jours, aucun `new Date()` résiduel dans les semis)
  2. La chaîne §2.7 complète (typecheck, tests, build, e2e, check-sql-statique) est verte — plus aucun rouge préexistant assumé dans le jalon
  3. IN-01 : la garde morte de `api.ts:315` n'existe plus (supprimée, pas commentée) ; IN-02 : le select `service_role` d'`index.ts:656` est borné, avec `sh scripts/test-db.sh` vert si du SQL a été touché — ou l'absence de Docker consignée explicitement
  4. Les helpers `debutSemaineIso`/`jourSemaine` de `lib/datetime.ts` sont la seule source de semis de semaine lundi→dimanche (classe corrigée, pas l'instance)

**Plans:** 2/4 plans executed

Plans:
**Wave 1**
- [x] 38-01-PLAN.md — Helpers `debutSemaineIso`/`jourSemaine` + preuve 7 jours + recalage des semis semaine (menu, seed) + garde anti-récidive
- [x] 38-02-PLAN.md — Flake WR-03 : protocole W-02 (reproduction → preuve d'innocence → attente d'état) + diagnostic rétrospectif
- [ ] 38-03-PLAN.md — Dette review 37 : suppression IN-01, bornage IN-02 dans la requête, balayage I-01 du fichier entier

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 38-04-PLAN.md — Chaîne §2.7 complète + signature e2e (join-token seul rouge, J-01/J-02) + gardes statiques de discipline

### Phase 39: Outillage prod de vérification

**Goal**: Le projet dispose du moyen de créer et purger ses propres comptes e2e en mode prod réel (sans autoconfirm), et la couverture e2e du parcours join-token correspond au flux actuel.
**Depends on**: Phase 38 (filet fiable pour prouver les changements de specs)
**Requirements**: SMOKE-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Le smoke-test crée ses comptes e2e via l'API Admin GoTrue (`createUser` avec `email_confirm: true`) avec `ENABLE_EMAIL_AUTOCONFIRM` resté `false` — le mode prod est testé en prod
  2. Le smoke-test purge ses comptes et la purge est vérifiée (re-delete → 404) ; aucun secret n'apparaît en argv, dans les logs, ni dans les ARG frontend
  3. Les rate limits GoTrue (422/429) sont gérés explicitement — un run de smoke-test n'échoue pas pour une raison de throttling non anticipée
  4. La spec e2e join-token est soit réécrite contre le flux 31-03 actuel (et verte), soit supprimée avec la couverture perdue consignée par écrit — jamais « réparée au vert » par tatillage

**Plans**: TBD

### Phase 40: Ardoise « Rejoindre via mon compte »

**Goal**: Un invité sans foyer qui clique « Rejoindre via mon compte » sur le lien de partage ardoise rejoint le foyer via le flux d'invitation existant et atterrit dans l'ardoise partagée — la seule surface utilisateur nouvelle du jalon.
**Depends on**: Phase 39 (comptes e2e prod réels pour les parcours d'adhésion)
**Requirements**: ARD-01, ARD-02, ARD-03
**Success Criteria** (what must be TRUE):
  1. Un invité sans foyer clique « Rejoindre via mon compte » → il voit une confirmation explicite du foyer avant adhésion (jamais d'adhésion implicite au clic), et après adhésion il atterrit dans l'ardoise partagée, pas sur le dashboard
  2. Le paramètre `?code=` traverse la redirection vers `/foyer/rejoindre` via le pattern `state.from` existant — rien n'est perdu en chemin
  3. Les espaces de clés sont distincts (partage ardoise ≠ invitation foyer), aucune colonne `household_id` n'a été ajoutée au modèle de partage, et les tests SQL négatifs passent : déjà admin, déjà membre, double redemption concurrente (`FOR UPDATE`), rôle forcé côté serveur uniquement
  4. La réconciliation des participations `invite:` → `membre:` à l'adhésion est tranchée : soit implémentée transactionnellement et prouvée, soit refusée avec la justification produit consignée dans PROJECT.md — aucun orphelin silencieux

**Plans**: TBD
**UI hint**: yes

### Phase 41: Gate SW simulable

**Goal**: Le chemin runtime complet de la gate de mise à jour « file vide » est prouvé au moins une fois contre un build+preview réel — GATE-01 devient planifiable au lieu d'observatoire.
**Depends on**: Phase 40 (évite de mixer deux surfaces UI modifiées dans la même vague)
**Requirements**: GATE-01
**Success Criteria** (what must be TRUE):
  1. Une spec e2e fait vivre le scénario complet : deux builds successifs avec hash de precache distinct servis sur le même origin, contexte Playwright neuf, build ID injecté `VITE_BUILD_ID` — le bandeau de mise à jour apparaît sur un SW en attente réel
  2. La gate se referme correctement dans les deux conditions prouvées séparément : file non vide (bandeau absent) et file vide (bandeau présent, application de la mise à jour)
  3. La simulation passe par le harnais dev-only qui injecte dans le store existant — la logique de gate de `sw-register.ts` n'a pas été forkée ni mockée
  4. Le re-test en conditions réelles à la prochaine utilisation observée reste consigné comme observatoire hors jalon (GATE-PROD), non confondu avec cette validation

**Plans**: TBD

### Phase 42: Cold start mesuré puis corrigé + décision cache

**Goal**: L'amorçage offline est mesuré avec un protocole écrit, corrigé là où le profilage désigne, et le maxAge 24 h du cache est tranché par une décision produit documentée — plus aucune dette v1.1/v1.2 ne survit.
**Depends on**: Phase 41 (instrumentation en DERNIER, après tout changement d'imports des phases précédentes, sinon mesures invalidées)
**Requirements**: COLD-01, COLD-02, CACHE-01
**Success Criteria** (what must be TRUE):
  1. Un protocole de mesure écrit d'abord (build prod, cache froid, réseau coupé) alimente le panneau diagnostic existant avec des marks `performance.mark` aux 4 segments : entry chunk, activation SW, restore IndexedDB, auth bootstrap
  2. Les mesures viennent du on-device réel (jamais de l'émulateur) et le profil avant/après correction est documenté au même protocole — l'amorçage mesuré après correction est consigné
  3. Toute correction livrée est désignée par le profilage (jamais au doigt mouillé avant la trace) — si l'axe corrigé n'est pas celui du profil, c'est consigné comme écart
  4. La décision CACHE-01 est tranchée par famille offline avec les données du panneau diagnostic on-device, documentée dans PROJECT.md (valeur + justification), et la purge outbox reste indépendante du maxAge (tests à jour)

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 38. Filet de tests fiable | 3/4 | In Progress|  |
| 39. Outillage prod de vérification | 0/? | Not started | - |
| 40. Ardoise « Rejoindre via mon compte » | 0/? | Not started | - |
| 41. Gate SW simulable | 0/? | Not started | - |
| 42. Cold start + décision cache | 0/? | Not started | - |

---

*Milestone v1.3 « Solde de la dette » — roadmap créée le 2026-11-08 par gsd-roadmapper.*
