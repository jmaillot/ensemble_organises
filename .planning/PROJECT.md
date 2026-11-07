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

## État courant — jalon v1.1 clôturé le 2026-11-07

Le jalon v1.1 « PWA durcie mobile-first » (phases 32-35) est livré et taggé :
la PWA installée est une vraie app de poche — **lecture offline** (cache
TanStack persisté IndexedDB namespacé, bandeau « dernier état connu le… »,
allowlist Tier 1, SW ne cachant jamais une réponse API), **file d'écriture
idempotente** (client_key + unicité SQL, outbox MutationCache, rejeu FIFO
exactement-une-fois, badge « N en attente », purge scan-avertir-purger),
**deep links** (/taches/jour, redirect-after-login, cold-start offline avec
session conservée — gardien 10 s + sonde réseau), et **installabilité durcie**
(manifest maskable + raccourcis, registerType prompt avec gate « file vide »).
Audit tech_debt 16/16 exigences, intégration 8/8 coutures, aucune rupture de
flux. Validation on-device : Desktop Chrome + Android 16 (chaîne offline
complète passée le 2026-11-07, v1.0-149) ; **iOS réel non testé** (appareil
absent, consigné honnêtement — cellules matrice « Non testé »).

**Dette reportée au jalon suivant :** outbox silencieux (écriture vers ligne
supprimée serveur = entrée évaporée sans message — contredit la décision 34),
maxAge 24 h du cache (décision produit avec les données du panneau diagnostic),
gate SW runtime (bandeau de mise à jour réel — re-test au prochain déploiement),
matrice iOS (appareil), flocon test D auth-bootstrap, 2 tests rouges
anniversaires préexistants, e2e offline-shared-device (2 comptes réels requis).

## Current Milestone: à définir

Le jalon suivant n'est pas encore ouvert. Démarrage : `/gsd-new-milestone`
(questioning → research → requirements → roadmap). Les exigences v1.1 (16/16)
sont archivées dans `.planning/milestones/v1.1-REQUIREMENTS.md`.

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
*Last updated: 2026-11-07 after v1.1 milestone*
