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
prod) — GATE-01 simulable validée en phase 41 (harnais e2e, 4/4 vert) ; le
re-test en conditions réelles reste un observatoire à consigner à la première
utilisation observée.

**Dette reportée au jalon suivant :** GATE-01 (re-test gate SW au prochain
déploiement naturel), CACHE-01 (maxAge 24 h, décision produit), flake
menu-page du dimanche + flake frère household-store WR-03, spec e2e
join-token périmé (refonte 31-03), amorçage offline ≈ 30-40 s (observation
UX), smoke-test sans mode prod (exige l'autoconfirm), 2 infos de review
phase 37 (gardes morts), extension du modèle de partage ardoise (observation
produit UAT test 2).

## État courant — phase 44 close le 2026-11-12 (CACHE-01 du jalon v1.4, jalon soldé)

**CACHE-01 n'est pas tranchée — différé consigné honnêtement** (critère de
succès 1 du plan : campagne OU différé tracé). La campagne on-device §6
n'a pas pu tourner : pas d'accès à l'environnement de mesure en session
(confirmé par l'utilisateur le 2026-11-12). Le plan prévoyait ce repli :
aucune valeur inventée, aucun émulateur, `query-policy.ts` inchangé (statu
quo de fait, 9 familles vivantes à 24 h, 2 annexes à 7 j en expressions de
ms), buster `v2` inchangé, PROJECT.md sans section « Décision CACHE-01 »
(D-11 respecté). `docs/MESURES-COLD-START-42.md` porte les mentions
« Différé consigné (2026-11-12) » datées en §7.1–7.5 et la chaîne §2.7
complète verte en §7.6 (typecheck, 2006 tests, build, e2e 163 passed,
contrôles SQL — bannière CHAINE-44-VERTE). L'outillage est prêt : la reprise
se fait au même protocole (N=5, purge §2.1, dictée des panneaux) dès l'accès
à l'appareil de référence — les squelettes attendent les dictées.
Résiduels connus, hors-run, à traiter à la main : 3 comptes e2e antérieurs
(e2e+179422391*). W2 (spec navigateur Playwright) reste conditionné à un seam
client révélé — aucun à ce jour.

## Current Milestone: v1.4 Preuve & décision

**Goal:** Fermer les deux dettes priorisées de v1.3 — la surface bridge ardoise devient prouvée en prod et la décision de cache maxAge est tranchée famille par famille.

**Target features:**
- W1 : preuve niveau prod de la surface bridge ardoise (Edge household-token, RPC, réconciliation) via extension de `test-join-token-real.sh`
- CACHE-01 : décision maxAge par famille appliquée selon les critères §5 de `docs/MESURES-COLD-START-42.md`, mise en œuvre dans `query-policy.ts`

**Contraintes :** aucune nouvelle surface produit ; CACHE-01 requiert la machine on-device ; GATE-01 et COLD-02 restent observatoires hors jalon.

## État v1.3 (shipped 2026-11-10)

Jalon dette soldé : 5 phases, 13 plans, 12 tâches. 10/12 exigences satisfaites, 2 deferred par décision produit. Audit : tech_debt (voir [milestones/v1.3-MILESTONE-AUDIT.md](milestones/v1.3-MILESTONE-AUDIT.md)).

**Livré :**
- Ardoise : un invité sans foyer rejoint le foyer via « Rejoindre via mon compte » (table pont 0180, bridge token HMAC usage unique, réconciliation transactionnelle des participations) — l'unique surface produit du jalon
- Filet de tests fiable : flakes du dimanche corrigés à la racine (helpers `debutSemaineIso`), spec join-token réécrite et prouvée en prod, chaîne §2.7 redevenue un instrument de confiance
- Smoke-test en mode prod réel (API Admin GoTrue, création+purge prouvée, autoconfirm resté false)
- Gate SW « file vide » devenue planifiable (harnais e2e, `scripts/test-sw-gate.sh`, 4 cas contre build+preview réel)
- Cold start instrumenté (4 segments `performance.mark`, panneau « Amorçage ») + protocole de mesure versionné

**Dette reportée hors jalon (décision produit) :**
- COLD-02 : corrections profilées du cold start — campagne on-device interrompue après 2 runs (protocole `docs/MESURES-COLD-START-42.md`, reprise avec purge « Vider le cache » seule)
- CACHE-01 : décision maxAge par famille — critères §5 contraignants, campagne on-device différée honnêtement le 2026-11-12 (phase 44), `query-policy.ts` inchangé, protocole prêt pour reprise
- W1 : surface bridge ardoise sans preuve niveau prod (tests SQL + RTL uniquement) — étendre `test-join-token-real.sh` ou spec navigateur réel

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
*Last updated: 2026-11-12 after Phase 44 (CACHE-01 différée honnêtement, jalon v1.4 soldé)*
