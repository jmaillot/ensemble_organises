# Ensemble & Organisés — PROJECT

PWA foyers : tâches, courses, calendrier, notes, routines, ardoise, cadeaux, anniversaires/contacts.
Stack : React 19.3 + Vite 8 + TS7 + Supabase self-hosted (Postgres RLS stricte) + TanStack Query + Zustand + Tailwind v4.
Source plan figé : /home/jmaillot/.opencode/plan/ensemble-plan.md + 01-05.
Règles : migrations vers l'avant, search_path='', RLS + tests négatifs, secrets Vault, chaîne §2.7.
Phase 05 livrée 2026-10-06 (cadeaux/contacts : gift_ideas, contact_lists/contacts + miroir birthdays, gift_list_invites RPC-only + Edge user-only OQ-1 A, vue masquée reserved_by, Tabs Listes/Idées/Contacts) — décisions : surprise serveur (jamais client), redeem surclasse lecture→reservation (0082), invité reservation peut réserver sur liste privée via trigger garde-colonnes (0083), liste privée partagée visible à son invité, owner voit badge neutre + switch Reçu. Gap reconnu : livraison push navigateur non vue sur Firefox local (chaîne serveur prouvée) ; parcours externe sans foyer au backlog.

## État courant — jalon v0.9.0 clôturé le 2026-10-24

Les 20 espaces sont branchés et en prod. Le jalon v0.9.0 (phases 16-24)
porte : Recettes complet + Menu de la semaine + Frigo (vague 3.1), la
chaîne d'invités durcie (photos d'étapes signées, verdict média borné au
foyer, quotas), les durcissements 18-20 et l'estampille de build à quatre
canaux. La vague design melimelo (hors cycle) a livré l'identité visuelle
actuelle : tuiles pastel-liens avec illustrations générées (palette
sapin/pastel, docs/OBJETS-TUILES-GEN.md), menu mobile unifié (feuille
basse animée depuis la barre basse), notifications, contraste vérifié,
e2e 147/147. PWA installable validée sur Android.

## État courant — jalon v1.0 clôturé le 2026-11-04

Le jalon v1.0 « Mise en ligne publique » (phases 25-31) est livré et taggé :
profils enfants gérés, export RGPD, suppression de compte, exploitation
(sauvegardes répliquées, alertes prouvées, exercice de restauration attesté),
messagerie v2 (directes, accusés de lecture, push groupées), hygiène du jalon,
et inscriptions ouvertes (SMTP durci, invitations pré-auth, modèle liste de
tokens 0176). Audit passed 38/38 exigences, 7/7 phases vérifiées. La prod
reçoit des étrangers : le foyer est désormais son unité d'organisation en
production.

## Current Milestone: v1.1 — PWA durcie mobile-first

**Goal :** la PWA installée devient une vraie app de poche — fiable
hors-ligne, joignable en un tap depuis l'écran d'accueil, sans aucun store.

**Target features :**
- Offline réel : lecture depuis le cache (dernier état connu, horodaté) +
  file d'attente d'écriture rejouée à la reconnexion
- Raccourcis web : vues dédiées (tâches du jour, courses) en deep links
- Durcissement PWA : installabilité vérifiée tous OS (desktop, Android, iOS),
  manifest et service worker au niveau

**Arbitrages d'ouverture (2026-11-04) :** aucun store, aucun APK, aucun
wrapper natif — les widgets natifs sont sortis du périmètre au profit des
raccourcis web ; l'offline v1.1 n'est pas le retour du mode démo Dexie
(retiré du prod en phase 09, D-10).

### Active requirements

Voir REQUIREMENTS.md (jalon v1.1, en cours de définition). Le v1.0 a livré
toutes ses exigences (38/38, audit passed) : voir
.planning/milestones/v1.0-REQUIREMENTS.md pour l'historique.

## État v0.9.0 (historique)

Audit PASSED le 2026-10-24 (phases 16-24). Les 20 espaces branchés et en
prod, e2e 147/147, PWA installable validée sur Android.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-04 — démarrage jalon v1.1*
