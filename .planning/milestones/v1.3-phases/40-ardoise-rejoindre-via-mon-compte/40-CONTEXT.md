---
phase: 40-ardoise-rejoindre-via-mon-compte
captured: 2026-11-09
status: complete
---

# Contexte — Phase 40 : Ardoise « Rejoindre via mon compte »

## Domaine

Un invité sans foyer qui clique « Rejoindre via mon compte » sur le lien de partage ardoise rejoint le foyer via le flux d'invitation foyer existant (token HMAC, transaction serveur) et atterrit dans l'ardoise partagée. Seule surface utilisateur nouvelle du jalon v1.3.

## Décisions verrouillées (discuss du 2026-11-09)

### 1. Pont code partage → adhésion foyer : échange serveur code→token

- Nouvelle action Edge (sur `ardoise-invite`, ex. `household-token`) : un utilisateur **connecté** qui présente un code de partage ardoise valide reçoit un **token d'invitation foyer à usage unique émis côté serveur**.
- L'UI suit ensuite le flux existant `/foyer/rejoindre?token=…` (échange `household-invite`, transaction, HMAC) — **rien du flux foyer n'est réinventé**.
- Espaces de clés intacts : le code de partage ardoise reste hashé dans son modèle (jamais de colonne `household_id` ajoutée, ARD-03) ; le token foyer vit le temps de la redirection seulement.

### 2. Confirmation pré-adhésion : dialog maison sur la page invitée

- Le clic « Rejoindre via mon compte » ouvre une **confirm-dialog sur la page invitée** (« Vous allez rejoindre le foyer X ») AVANT de lancer l'échange code→token. Jamais d'adhésion implicite au clic (anti-feature confirmée, REQUIREMENTS.md).
- Le **nom du foyer** affiché vient de la **vue invitée** (`link-view` enrichie) — l'ardoise porte déjà `household_id` côté serveur, l'enrichissement est naturel, pas d'appel supplémentaire.
- Le token foyer n'est émis qu'après confirmation — la confirmation précède l'échange.

### 3. Réconciliation `invite:` → `membre:` : transactionnelle à l'adhésion (ARD-02 tranchée)

- Dans la **même transaction** que l'adhésion au foyer : les lignes `expense_participants` où `guest_id` correspond à l'invité basculent en `participant_type='membre'` + `member_id`.
- Le solde du foyer intègre le passé invité ; aucun orphelin silencieux.
- Prouvé par tests SQL négatifs ET positifs : lignes migrées, part zéro du passé respectée, déjà admin, déjà membre, double redemption concurrente (`FOR UPDATE`), rôle forcé côté serveur uniquement (ARD-03).

### 4. Atterrissage post-adhésion : `/ardoise` du foyer

- Après l'échange du token, redirection vers **`/ardoise`** (module ardoise du foyer), pas le dashboard. ARD-01 l'exige explicitement.
- Le mapping participant des dépenses reflète la réconciliation (décision 3) : le solde affiché inclut les participations passées « invité ».

## Code context (actifs réutilisables)

- `app/src/modules/ardoise/guest-ardoise-page.tsx` — la page invitée avec le bouton « Rejoindre via mon compte » existant (appelle aujourd'hui `joinArdoise(code)` → action `join` de l'Edge, rattachement direct au modèle binaire). C'est CE chemin que la phase remplace par le flux foyer.
- `app/src/modules/ardoise/api.ts` — `joinArdoise`, `GuestArdoiseView` (vue invitée : `link-view`), pattern `InviteRequestError`.
- `supabase/functions/ardoise-invite/index.ts` — Edge avec schéma Zod `discriminatedUnion`, rate-limit mémoire par action, résolution de rôle `service_role` (l.320+), modes `user`. La nouvelle action s'ajoute ici.
- `app/src/modules/landing/join-household-page.tsx` — pré-écran de join foyer + pattern `state.from` (l.126) pour préserver le paramètre à travers la redirection `/connexion` (success criterion 2).
- `supabase/functions/household-invite/index.ts` — échange existant (`redeem`, transaction, HMAC) — NE PAS le modifier, il est consommé tel quel.
- `app/src/components/ui/confirm-dialog.tsx` — dialog de confirmation standard.
- Migration `0176_token_list_governance.sql` — pattern de preview RPC (pré-écran public).
- Leçon phase 39 (fix `5618352`) : l'Admin API GoTrue brut attend `user_metadata` (pas `data`) — utile si les tests e2e créent des comptes.

## Décisions portées des phases antérieures

- Anti-features v1.3 (REQUIREMENTS.md) : adhésion foyer implicite au clic interdite ; pas d'autres nouvelles fonctionnalités produit.
- Modèle binaire ardoise (phases 37-38) : `join` refuse un non-membre avec 403 explicite — le message est affiché tel quel, jamais maquillé.
- `state.from` est le pattern établi de préservation de paramètre à travers `/connexion` (phase du flux foyer).
- Espaces de clés distincts : partage ardoise ≠ invitation foyer (ARD-03) — la décision 1 préserve cette propriété.

## Canonical refs

- `AGENTS.md` (racine du dépôt) — §2.6 RLS/secrets, §2.7 chaîne de vérification et tests SQL négatifs obligatoires.
- `.planning/REQUIREMENTS.md` — ARD-01/02/03, anti-features v1.3.
- `.planning/ROADMAP.md` — Phase 40, success criteria 1-4.
- `.planning/phases/40-ardoise-rejoindre-via-mon-compte/40-CONTEXT.md` — ce fichier.

## Idées différées (hors périmètre)

- (aucune soulevée — la discussion est restée dans le périmètre ARD-01..03)
