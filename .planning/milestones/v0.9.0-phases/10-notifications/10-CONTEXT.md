# Phase 10: Notifications messages — Context

**Gathered:** 2026-10-12 (read-only audits + UAT)
**Status:** Ready for planning

<domain>
## Phase Boundary

Faire arriver les notifications de nouveaux messages dans la cloche
interne puis en push prod : diagnostiquer la cloche (lignes prévues
par le code mais jamais vues par l'utilisateur), corriger, et
accompagner la preuve push supervisée. Pas de nouveau canal, pas
d'accusés par message, pas de push invités/Cercle — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Cloche interne (constat UAT 2026-10-12)
- **D-01:** Les lignes `message:<conv>` existent dans le code
  (`use-notifications.ts:155-170`, conditionnées à `unread>0` +
  `lastMessageAt` + préférence) mais l'utilisateur ne les voit
  jamais — ni badge ni liste. Diagnostic à prouver (calcul `unread`,
  mapping `lastMessageAt`, marquage trop zélé, préférence, feed),
  puis correction.
- **D-02:** Le marquage « lu à l'ouverture » reste (comportement
  voulu) ; la cloche ne porte que les fils non ouverts avec du
  non-lu — à prouver par test, pas à l'œil.

### Push prod (M-01/M-02, opérateur, supervisé)
- **D-03:** La chaîne serveur existe (trigger 0042 + cron 5 min +
  Edge push-notify + VAPID). Reste opérateur sur ubuntu1 : clés
  VAPID dans le `.env` stack, `recreate functions`, appareil réel
  abonné, `test-dispatch-push.sh` avec `delivered` (checklist
  docs/PWA.md). Aucun code sans preuve d'échec constatée.
- **D-04:** Si la preuve push échoue côté serveur (pas de clés :
  échec attendu et documenté), on ne code rien — on consigne.

### the agent's Discretion
Libellés de la cloche, détail du badge, forme du rapport de preuve.
</decisions>
