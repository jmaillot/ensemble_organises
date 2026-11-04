---
phase: 29-messagerie-v2
reviewed: 2026-10-29T18:30:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - supabase/migrations/0171_direct_open_read_receipts.sql
  - supabase/migrations/0172_grouped_message_push.sql
  - supabase/functions/push-notify/index.ts
  - scripts/test-dispatch-push.sh
  - scripts/test-realtime-subscription.sh
  - app/src/lib/notification-reads.ts
  - app/src/modules/messages/api.ts
  - app/src/modules/messages/hooks/use-messages.ts
  - app/src/modules/messages/messages-page.tsx
  - app/src/modules/messages/components/chat-panel.tsx
  - app/src/modules/messages/components/read-receipts.tsx
  - app/src/modules/messages/components/conversation-form-dialog.tsx
  - app/src/modules/messages/components/conversation-list.tsx
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 29 : Code Review Report

**Reviewed:** 2026-10-29T18:30:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Revue des 14 commits de la phase 29 (socle SQL 0171/0172, Edge push-notify groupé, accusés de lecture côté client, picker directe, souscription Realtime). La qualité générale est élevée : RLS/RPC bien gardées (`revoke`/`grant` explicites, `search_path = ''`), contenu de message banni du push, tests de preuve attribuables. Mais un défaut bloquant casse la chaîne de vérification §2.7 sous `dash`, et trois avertissements méritent correction (doublons de lignes de lecture, comparaison lexicographique d'horodatages hétérogènes, appelant non re-vérifié dans 0171).

## Critical Issues

### CR-01: `Expéditeur` — identifiant shell non-ASCII, script cassé sous dash

**File:** `scripts/test-dispatch-push.sh:157,177-187,360-380`

**Issue:** Le script porte `#!/usr/bin/env sh` → `dash` sur cette machine (`/bin/sh -> dash`), avec `set -eu` (ligne 49). Les identifiants `Expéditeur=` (une dizaine d'occurrences dans le bloc « Groupe de messages (0172) ») sont rejetés par dash — vérifié : `dash -c 'Expéditeur="x"'` produit `Expéditeur=x: not found` puis « éditeur ». Sous `sh scripts/test-dispatch-push.sh`, l'exécution s'interrompt à la ligne 360 (set -e), la preuve 0172 ne court jamais, et les résidus de semure ne sont ni nettoyés ni signalés. La décision consignée dans 29-03-SUMMARY (« dash rejette les identifiants non-ASCII : Expéditeur → Expediteur ») a corrigé `test-realtime-subscription.sh` mais pas celui-ci, pourtant obligatoire dans la chaîne §2.7.

**Fix:**
```sh
# Renommer toutes les occurrences, comme test-realtime-subscription.sh:202
Expediteur=""
if [ -z "$Expediteur" ]; then
```
Prouver le cas qui doit échouer : `dash -n scripts/test-dispatch-push.sh` ne suffit pas (pas d'erreur de syntaxe) — exécuter réellement sous `sh` et vérifier que le bloc messages s'exécute.

## Warnings

### WR-01: Doublons possibles dans `notification_reads` (portage D-03 et marquage concurrent)

**File:** `app/src/lib/notification-reads.ts:35-59, 204-232, 250-271`

**Issue:** Deux chemins créent des lignes sans garde d'unicité :
1. `migrateLocalReads` écrit entrée par entrée, puis retire la clé locale SEULEMENT après succès de toutes. Si l'entrée 3/5 échoue, les entrées 1-2 sont déjà créées côté serveur ; la reprise ultérieure relit `serverRows: rowsRef.current`, instantané qui ne contient pas les lignes fraîchement créées (le `refresh()` n'a lieu que sur succès complet, ligne 224) → recréation des entrées 1-2.
2. `markRead` (lignes 252-265) choisit create-vs-update d'après `rowsRef.current` (cache potentiellement périmètre, latence Realtime, marquage simultané sur un autre appareil) → deux lignes pour le même `(scope, scope_id, user_id)`.

L'affichage fusionne par `latestRead`, donc l'UI reste juste, mais les doublons s'accumulent et chaque `markRead` ultérieur n'en met qu'une à jour.

**Fix:** ajouter une contrainte `unique (scope, scope_id, user_id)` dans une migration, et passer par un upsert ; ou rafraîchir la requête et la relire avant chaque migration reprise.

### WR-02: Comparaison lexicographique d'horodatages de formats hétérogènes (pagination et tri des fils)

**File:** `app/src/modules/messages/api.ts:73-79` ; `app/src/modules/messages/hooks/use-messages.ts:266-270`

**Issue:** `fetchMessagePage` trie avec `created_at.localeCompare` et compare le curseur `before` avec `<` sur la chaîne ; `buildSummaries` trie l'activité de même. Le projet a lui-même établi (commentaire de `readTime`, `notification-reads.ts:97-108`) que l'ordre des chaînes ne vaut pas l'ordre du temps entre `…Z`, `…+00:00` et ISO sans fuseau. Les lignes optimistes portent `toISOString()` (`Z`) tandis que PostgREST rend `+00:00` : `+` (0x2B) < `.` (0x2E), donc un message optimiste passe sous un message serveur plus ancien, et la fenêtre de pagination peut couper au mauvais endroit (messages sautés entre pages).

**Fix:** réutiliser `readTime()` de `@/lib/notification-reads` comme clé de tri et pour le curseur `before` (cursor = `{ createdAt, id }` comparés par timestamp puis id).

### WR-03: `open_direct_conversation` ne re-vérifie pas l'appelant supprimé

**File:** `supabase/migrations/0171_direct_open_read_receipts.sql:58-70`

**Issue:** La cible est filtrée (`account_deleted_at is null`, lignes 58-61, conformément à 0166), mais l'appelant passe par `private.current_member_id(v_household)` (0006), qui ne filtre ni `account_deleted_at` ni l'activité du compte. Un compte marqué supprimé mais détenant encore un JWT valide peut ainsi créer/rouvrir des fils. Incohérence interne de la même fonction : cible vérifiée, appelant non.

**Fix:**
```sql
select hm.household_id into v_household
  from public.household_members hm
 where hm.id = p_other_member_id and hm.account_deleted_at is null;
...
-- après v_self := private.current_member_id(v_household) :
if exists (select 1 from public.household_members hm
            where hm.id = v_self and hm.account_deleted_at is not null) then
  raise exception 'session invalide' using errcode = '28000';
end if;
```

## Info

### IN-01: Sonde d'existence d'un `member_id` inter-foyer via les messages d'erreur

**File:** `supabase/migrations/0171_direct_open_read_receipts.sql:62-70`

**Issue:** « membre introuvable ou inactif » vs « cette personne n'appartient pas à votre foyer » : le second confirme l'existence globale d'un identifiant d'un autre foyer. Divulgation mineure (identifiants non devinables, foyer non révélé).
**Fix:** renvoyer le même message 22023 dans les deux branches.

### IN-02: Imports dupliqués du même module

**File:** `app/src/modules/messages/hooks/use-messages.ts:5-6`

**Issue:** deux instructions `import … from '@/lib/notification-reads'` consécutives (`isUnseen` puis `readTime, useSyncedReads`).
**Fix:** fusionner en une seule instruction.

### IN-03: Instruction collée à l'accolade ouvrante

**File:** `app/src/modules/messages/api.ts:425`

**Issue:** `export async function archiveConversation(...): Promise<void> {  if (isSupabaseConfigured && supabase) {` sur une seule ligne — lisibilité.
**Fix:** réinsérer le saut de ligne après `{`.

### IN-04: `fetchReadReceipts` (démo) s'écarte du contrat du RPC

**File:** `app/src/modules/messages/api.ts:486-501`

**Issue:** Le chemin démo renvoie aussi l'appelante, les membres partis (`left_at`) et les lignes `read_at null`, alors que le commentaire de la fonction annonce « la même jointure que le RPC ». Le filtrage aval dans `useReadReceipts` (use-messages.ts:833-836) compense, mais le contrat énoncé est faux.
**Fix:** filtrer `readAt !== null`, l'appelante et les lignes d'appartenance inactives directement dans le chemin démo, ou corriger le commentaire pour nommer l'écart.

### IN-05: Gabarit push direct dégénéré « Conversation avec votre conversation »

**File:** `supabase/migrations/0172_grouped_message_push.sql:102-112`

**Issue:** `other_names` exclut les membres sans compte (`m2.user_id is not null`) ; si l'unique autre participant est un profil géré, le repli produit « Conversation avec votre conversation » dans le corps. Cosmétique, mais visible pour un cas réel (messagerie avec un enfant géré).
**Fix:** repli « Conversation privée » plutôt que « votre conversation » pour le corps du gabarit directe.

---

_Reviewed: 2026-10-29T18:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
