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

## État courant — jalon v1.2 clôturé le 2026-11-08

Le jalon v1.2 « Finition de la dette offline » (phases 36-37) est livré et
taggé, volontairement 100 % dette/fiabilité — aucune nouvelle surface produit
hors les messages d'échec de l'outbox. **L'outbox ne perd plus jamais une
entrée en silence** : chaque code d'erreur du rejeu (404, 400, 403 RLS, 42501,
réseau, 5xx…) est classifié terminal/retryable par la matrice
`FAILURE_FAMILIES`, surface avec un libellé français lisible + badge, et les
échecs terminaux se retirent du panneau sur action explicite. **Le filet de
tests est redevenu fiable** : flocon test D épinglé avec cause racine
documentée, suite anniversaire 44/44 (globale 1968/1970 — les 2 restants sont
les flakes dimanche consignés), **e2e offline-shared-device exécuté au vert
avec 2 comptes réels** (b8295a3, reproduit indépendamment par le vérificateur),
et la clé GoTrue résiduelle sur purges invité est éliminée au chokepoint
signOut — atteignable depuis /foyer pour un visiteur connecté sans foyer
(G-37-2), re-testé on-device le 2026-11-08. Audit tech_debt : 6/6 exigences,
intégration 3/3, flux 3/3. Déploiement v1.1-34-g20bbcbd+ effectué le
2026-11-08 (bouton « Rejoindre via mon compte » et déconnexion réelle en
prod) — le re-test GATE-01 reste à consigner à la première utilisation
observée.

**Dette reportée au jalon suivant :** GATE-01 (re-test gate SW au prochain
déploiement naturel), CACHE-01 (maxAge 24 h, décision produit), flake
menu-page du dimanche + flake frère household-store WR-03, spec e2e
join-token périmé (refonte 31-03), amorçage offline ≈ 30-40 s (observation
UX), smoke-test sans mode prod (exige l'autoconfirm), 2 infos de review
phase 37 (gardes morts), extension du modèle de partage ardoise (observation
produit UAT test 2).

## Current Milestone

*(aucun — le prochain jalon démarre par /gsd-new-milestone)*

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
*Last updated: 2026-11-07 after Phase 36 (milestone v1.2 en cours)*
