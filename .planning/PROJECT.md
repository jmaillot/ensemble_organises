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

## Current Milestone: v1.0 — Mise en ligne publique

**Goal :** absorber dettes et hors-ligne, arbitrer les décisions produit
restantes, outiller l'exploitation et préparer l'ouverture publique.

**Target features :**
- Comptes enfants = profils gérés par un parent (pas de compte autonome mineur)
- Messages de foyer évolue : conversations directes, accusés de lecture, notifications
- Dettes : Edge generate-routine-occurrences branchée, semis démo avec photos,
  panneau de version sans estampille, UI mineures (feuilles mobiles)
- Hors-ligne : 3 todos résorbés (état hors-ligne à tort, amorçage réseau,
  compteur)
- RGPD : export complet du foyer + suppression de compte (purge médias,
  réversibilité 30 j)
- Token de foyer : réutilisable, expiration obligatoire (défaut 30 j),
  max d'utilisations configurable (défaut 10), révocation admin
- Inscriptions ouvertes, confirmation email obligatoire, SMTP durci
- Exploitation : sauvegardes exercées (restauration testée), supervision,
  RPO/RTO documenté, mentions légales / confidentialité

### Active requirements

ENF-01 → ENF-05 validés par la phase 25 (2026-10-26) : profils enfants gérés
par le parent, sans compte d'authentification, redirection push vers les
adultes. Reste du jalon dans REQUIREMENTS.md (jalon v1.0).

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
*Last updated: 2026-10-26 après transition phase 25 → 26*
