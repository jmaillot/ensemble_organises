# Phase 36: Outbox — plus jamais d'effacement silencieux - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Fiabiliser la classification des échecs du rejeu d'outbox et rendre chaque échec visible : tout code d'erreur de rejeu (404, 400, 403 RLS, 42501, réseau, 5xx…) reçoit une classification terminal/retryable explicite et un libellé français visible. La décision 34 « jamais d'effacement silencieux » redevient vraie sans exception. Zéro nouvelle surface produit hors les messages d'échec — jalon 100 % dette (OBOX-01, OBOX-02).

La mécanique de rejeu v1.1 est en place et n'est PAS refondue : FIFO D-09, upsert idempotent D-14, entrée failed jamais rejouée automatiquement, Réessayer/Abandonner dans le panneau, badge « N en attente / N bloquées ».

</domain>

<decisions>
## Implementation Decisions

### Messages utilisateur
- **D-01:** Libellé français court **par famille de code** : 404/PGRST116 → « cet élément a été supprimé entre-temps » ; 42501/403 → droits insuffisants ; 23514 → données invalides ; etc. Un code inconnu tombe sur un libellé générique — jamais de trou ni de jargon technique exposé à l'utilisateur.
- **D-02:** Le message apparaît **badge + panneau uniquement, pas de toast** : le badge compte les entrées failed, le panneau Paramètres liste chaque échec avec son libellé. Conforme à UAT-34-1 (pas de toast intrusif pendant l'usage normal).
- **D-03:** **Le toast d'échec terminal D-12 (« une fois par passe ») est retiré.** Le badge devient l'unique signal actif, le panneau l'unique canal de détail — un seul canal de vérité, moins de bruit. Ce changement inverse une décision v1.1 assumée (D-12).

### Forme de l'audit (OBOX-02)
- **D-04:** **Le test est la source de vérité de l'audit** — pas un doc séparé : chaque code de la matrice est testé 2× (classification terminal/retryable ET libellé affiché non vide/non générique). L'audit vit dans le code et ne peut pas diverger de l'implémentation.
- **D-05:** Matrice exhaust = celle du critère 2 du roadmap : 404/PGRST116, 400 (malformed), 403/42501 (RLS), 23514 (check), 23503 (FK), 23505 (unique), réseau (TypeError), 5xx, délai de lecture (AbortError).
- **D-06:** **Comportement par défaut : terminal** pour tout code imprévu (non présent dans la matrice) — avec libellé générique. Aucun code ne peut évaporer une entrée par défaut, ni boucler indéfiniment ; conforme à l'esprit D-34. Le test de la matrice reste la preuve du comportement nominal.

### Test rouge→vert du 404 (critère 4)
- **D-07:** Deux niveaux : **intégration sur `replayOutbox`** (adaptateur mocké, ligne supprimée serveur → PGRST116 ; prouve entrée classée failed + message visible + jamais évaporée, scénario complet du critère 1) **plus** test unitaire sur la famille 404 du mapping de libellés.
- **D-08:** Les tests vivent dans les **fichiers existants** : `app/src/lib/offline/outbox-replay.test.ts` (intégration), `outbox.test.ts` (classification), `app/src/modules/parametres/components/offline-panel.test.tsx` (rendu du libellé). Mêmes conventions, même setup.
- **D-09:** Le **rouge est démontré avant le vert** : le test d'intégration échoue d'abord sur le comportement actuel (l'évaporation silencieuse du scénario d'origine), preuve exigée par le critère 4 et l'esprit §2.7 B (« vu rouge avant d'être vu vert »).
- **D-10:** Le **rendu du libellé côté UI est aussi testé** : test composant sur offline-panel — entrée failed 404 → libellé « supprimé entre-temps » rendu, badge cohérent.

### the agent's Discretion
- Emplacement exact du catalogue code→famille→libellé (extension de `classifyFailure` dans `outbox.ts` vs module dédié) — le chercheur et le planneur tranchent au vu de la taille du catalogue.
- Libellés français exacts au-delà du 404 (« cet élément a été supprimé entre-temps » est verrouillé) — à proposer dans le plan, ajustable à l'UAT.
- Comment retirer proprement le toast D-12 (tests et code concernés) sans toucher au reste du panneau.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Décisions et mécanique outbox v1.1
- `.planning/MILESTONES.md` §v1.1 — décisions D-09 (FIFO), D-11/D-12 (badge/panneau/toast), D-14 (upsert idempotent), UAT-34-1 (pas de toast à l'enfilage), Pitfall 3/4
- `.planning/ROADMAP.md` §Phase 36 — goal, 4 success criteria (dont la matrice de codes du critère 2)
- `.planning/REQUIREMENTS.md` §OBOX-01/OBOX-02 — exigences verrouillées

### Garde-fous de vérification
- `AGENTS.md` §2.7 — chaîne de vérification avant commit (typecheck, tests, build, e2e) ; §B « vu rouge avant d'être vu vert » ; §F « un succès muet est un échec inexpliqué »

### Code (source de vérité du comportement actuel)
- `app/src/lib/offline/outbox.ts` — `classifyFailure` (l.336 : code présent → terminal, REMOVE_MISSING → terminal, sinon retryable), `OutboxEntry.failure`
- `app/src/lib/offline/outbox-replay.ts` — moteur de rejeu, `markFailed`, `retryOutboxEntry`
- `app/src/lib/data/supabase-adapter.ts` — `DataError(error.message, error)` : l'objet PostgREST (avec `code`) passe en `cause`
- `app/src/modules/parametres/components/offline-panel.tsx` — badge, Réessayer, Abandonner (confirm-dialog)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `classifyFailure` (outbox.ts) : chaîne d'erreur + cause déjà parcourue, règle « le CODE décide » posée (Pitfall 4) — le catalogue de familles vient s'y greffer
- `DataError` (adapter.ts) : porte le message ET l'erreur d'origine en `cause` — les codes PostgREST sont déjà accessibles au classifieur
- `offline-panel.tsx` + son test : badge « N bloquées », actions Réessayer/Abandonner et confirm-dialog déjà câblés — seul le libellé affiché change
- `outbox-replay.test.ts` / `outbox.test.ts` : setup de mock adaptateur et conventions d'assertion existants

### Established Patterns
- Entrée failed : reste en file, `status: 'failed'`, jamais rejouée (replayOutbox ne lit que 'pending') — la boucle est structurellement impossible
- Réessayer = passage explicite à `pending` par un humain (T-34-10) puis passe complète
- Compteurs dérivés, jamais stockés (D-13)
- Aucune pré-lecture avant un `remove` (Pitfall 3) : REMOVE_MISSING est terminal dans les deux cas (refus RLS / ligne déjà partie)

### Integration Points
- `markFailed` : c'est là que la classification et le futur libellé sont attachés à l'entrée (`entry.failure = { kind, code, message }`)
- Le toast D-12 à retirer vit dans le flux de rejeu/panneau — repérer son émission unique par passe
- Tests d'outbox : la phase 37 consolide le filet APRÈS cette phase (depend on 36) — les tests d'outbox peuvent bouger ici

</code_context>

<specifics>
## Specific Ideas

- Le message du scénario 404 est verrouillé mot pour mot : « cet élément a été supprimé entre-temps » — exigé par le critère 1 du roadmap, badge et panneau cohérents.
- La classification n'est pas refondue : elle existe déjà et fonctionne pour les cas connus ; la phase ajoute l'exhaustivité (matrice auditée), les libellés, et referme le scénario 404 silencieux d'origine.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 36-Outbox — plus jamais d'effacement silencieux*
*Context gathered: 2026-11-07*
