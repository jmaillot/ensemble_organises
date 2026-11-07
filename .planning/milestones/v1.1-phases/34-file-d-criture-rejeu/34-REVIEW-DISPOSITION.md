---
phase: 34-file-d-criture-rejeu
recorded: 2026-11-05T19:10:00Z
review_status: issues_found
severity:
  critical: 2
  warning: 4
  info: 4
  total: 10
open: 4
fixed: 6
skipped: 0
deferred: 0
---

# Review Disposition — Phase 34

Une ligne par finding de [34-REVIEW.md](34-REVIEW.md), statut par défaut `open`.
Pour trier : éditer la colonne Statut (`open` / `fixed` / `skipped` / `deferred`)
et documenter la raison dans Source. `fixed`/`skipped` sont réconciliés depuis
REVIEW-FIX.md à la prochaine passe `/gsd-code-review 34 --fix`.

| Finding | Sévérité | Statut | Source |
|---------|----------|--------|--------|
| CR-01: La query outbox est refetchable — un refetch écrase la file d'écritures pendantes | critical | fixed | fix(34) db32ce7 — renforcé au-delà de la suggestion : queryFn rend l'état actuel de la file, plus `staleTime: Infinity` ; relecture humaine recommandée |
| CR-02: La fusion D-04 remplace un `create` pendante par un `update` — l'entité n'est jamais créée côté serveur | critical | fixed | fix(34) 6eaf9a2 — fusion des valeurs d'update dans le create (client_key conservé) |
| WR-01: `signOut` révoque la session serveur AVANT la vérification des écritures pendantes | warning | fixed | fix(34) 4add203 — assertSignOutAllowed scanne la file avant la révocation ; relecture humaine recommandée |
| WR-02: `useResource.mutate` annule l'overlay optimiste d'un update même quand l'écriture part en file | warning | fixed | fix(34) 2233e84 — symétrie create, seul un refus métier remet l'écran en l'état |
| WR-03: Commentaires affirmant un « lecture Dexie pure / aucun appel réseau » que le code ne tient plus | warning | fixed | fix(34) 57631fc — les trois copies corrigées (§2.7 I) |
| WR-04: `deleteShoppingList` hors ligne enfille les suppressions d'articles puis échoue sur la liste | warning | fixed | fix(34) f6446d4 — la liste est tentée d'abord, le refus D-07 précède tout enfilage |
| IN-01: Condition morte dans le contrôle de type photo | info | open | |
| IN-02: Chemins d'écriture brutes de l'onglet voyage hors de la file d'écriture | info | open | |
| IN-03: Fusion d'options redondante dans `buildQueryClient` | info | open | |
| IN-04: `serializePairs` réduit toute valeur non scalaire à `[object Object]` | info | open | |

**Note :** CR-01 et CR-02 ont été corrigés le 2026-11-05 (passe `--fix`, voir
[34-REVIEW-FIX.md](34-REVIEW-FIX.md)). CR-01 et WR-01 portent la mention
`fixed: requires human verification` dans le rapport de correction. Les 4
findings Info restent ouverts (hors périmètre de la passe critical_warning).
