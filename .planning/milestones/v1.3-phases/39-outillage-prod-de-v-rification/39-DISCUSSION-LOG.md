# Phase 39: Outillage prod de vérification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 39-outillage-prod-de-vérification
**Areas discussed:** Périmètre de la spec join-token, Stratégie de création des comptes smoke, Déclenchement du smoke, Domaine des emails e2e

---

## Périmètre de la spec join-token

### Q1 — Contre quoi tourne la spec réécrite ?

| Option | Description | Selected |
|--------|-------------|----------|
| Spec réelle, run séparé | Exige une stack réelle (E2E_BASE_URL + comptes via l'outillage smoke), tourne comme run séparé documenté — la suite standard reste 100 % verte sans elle | ✓ |
| Spec démo, périmètre réduit | Ne couvre que ce qui tourne sans backend en démo — la traversée preview/redeem reste non couverte | |
| Suppression documentée | Supprimer et consigner la couverture perdue (TEST-02 l'autorise) | |

**User's choice:** Spec réelle, run séparé
**Notes:** — (recommandation suivie)

### Q2 — Quelle couverture ?

| Option | Description | Selected |
|--------|-------------|----------|
| Flux complet 31-03 | Création foyer (token+QR), pré-écran D-20, traversée D-06, redeem D-08+D-17, atterrissage D-09, D-03 sur token mort | ✓ |
| Chemin heureux seul | Pré-écran + redeem + atterrissage ; erreurs couvertes par les tests unitaires | |
| Équivalent ancienne spec | Validation format + création foyer avec QR réécrits contre l'UI actuelle | |

**User's choice:** Flux complet 31-03
**Notes:** —

### Q3 — Emplacement et sort de l'ancienne spec (l.123-139) ?

| Option | Description | Selected |
|--------|-------------|----------|
| Nouveau fichier dédié | Nouveau fichier dédié ; ancienne supprimée de critical-paths.spec.ts — pas de gating conditionnel, pas de doublon | ✓ |
| Même fichier, gating stack | Tests réels dans critical-paths, sautés sans stack — recrée le skip silencieux documenté en 38 | |
| Coexistence | L'ancienne reste en place (toujours rouge) + nouveau fichier — viole TEST-02 | |

**User's choice:** Nouveau fichier dédié
**Notes:** —

### Q4 — Comment la spec réelle obtient-elle ses comptes ?

| Option | Description | Selected |
|--------|-------------|----------|
| Outil smoke partagé | Le smoke expose un mode réutilisable que la spec consomme — un seul chemin d'accès à SUPABASE_SECRET_KEY | ✓ |
| Autonome côté spec | supabase-js admin dans beforeAll/afterAll — second chemin de secrets à auditer | |
| Fixtures statiques | Un foyer réel pré-créé manuellement — pas de création dynamique | |

**User's choice:** Outil smoke partagé
**Notes:** —

---

## Stratégie de création des comptes smoke

### Q1 — Mécanisme de création selon l'environnement ?

| Option | Description | Selected |
|--------|-------------|----------|
| Deux modes auto-détectés | Autoconfirm (dev) → signup ; prod → POST /auth/v1/admin/users email_confirm:true — un script pour les deux mondes | ✓ |
| Admin API toujours | Un seul chemin de création — mais la stack dev perd la couverture du /signup public | |
| Deux scripts séparés | Duplication du parcours de test | |

**User's choice:** Deux modes auto-détectés
**Notes:** —

### Q2 — Rigueur identique dans les deux modes ?

| Option | Description | Selected |
|--------|-------------|----------|
| Règles identiques | Refus sans secret (fallback l.197 supprimé) + purge vérifiée (re-delete → 404) en dev ET prod | ✓ |
| Durci en prod seulement | Purge best-effort conservée en dev | |
| Fallback conservé en dev | « Comptes laissés en place » en dev — dette §2.7 F | |

**User's choice:** Règles identiques
**Notes:** —

### Q3 — Parcours de test du smoke ?

| Option | Description | Selected |
|--------|-------------|----------|
| Parcours inchangé | 5 étapes conservées (inscription, foyer, RLS, isolement, token) — seul le mécanisme de création change | ✓ |
| Réduit à create+purge | Le strict SMOKE-01 — la preuve RLS en prod réel serait perdue du smoke | |
| Étendu ardoise | Prépare la phase 40 — scope creep, hors SMOKE-01 | |

**User's choice:** Parcours inchangé
**Notes:** —

### Q4 — Interface partagée avec la spec e2e ?

| Option | Description | Selected |
|--------|-------------|----------|
| Oui — interface partagée | Mode bibliothèque (sous-commandes ou sourcé) — même discipline de secrets | ✓ |
| Non — autonome | Deux implémentations, deux audits | |

**User's choice:** Oui — interface partagée
**Notes:** —

---

## Déclenchement du smoke

### Q1 — Mode de déclenchement ?

| Option | Description | Selected |
|--------|-------------|----------|
| Manuel, documenté | Comme aujourd'hui ; le branchement automatique noté en idée différée | ✓ |
| Cron quotidien | Vérification continue — verrou anti-concurrent, notifications, cadence 429 | |
| CI à chaque push | La CI n'a pas accès aux secrets prod (§2.7 H) — chantier d'infra à part | |

**User's choice:** Manuel, documenté
**Notes:** —

### Q2 — Gestion des rate limits GoTrue ?

| Option | Description | Selected |
|--------|-------------|----------|
| Sérialisé + retry borné | Pause fixe courte, un seul retry, puis échec nommé — jamais de retry aveugle (§2.7 F) | ✓ |
| Backoff générique | Masque les vraies erreurs (422 ≠ 429) derrière des retries | |
| Échec sec sur 429 | Le minimum — SC3 exige une gestion explicite | |

**User's choice:** Sérialisé + retry borné
**Notes:** —

### Q3 — Documentation du « quand lancer » ?

| Option | Description | Selected |
|--------|-------------|----------|
| Doc exploitation | Section « smoke-test prod » dans docs/EXPLOITATION.md (quand, quoi, lecture du rapport) | ✓ |
| En-tête script suffit | Couvre le « comment », pas le « quand » | |
| Exploitation + runbook release | Section + étape nominale post-déploiement dans DEPLOIEMENT-PROD.md | |

**User's choice:** Doc exploitation
**Notes:** —

---

## Domaine des emails e2e

### Q1 — Domaine des comptes e2e+<runid>@… ?

| Option | Description | Selected |
|--------|-------------|----------|
| Sous-domaine réservé | e2e+<runid>@e2e.votredomaine.fr — jamais de collision, traçabilité maximale | ✓ |
| Domaine réel direct | Simple, mais un runid mal purgé laisse une adresse de test dans le namespace réel | |
| Domaine non-routable | Aucune collision SMTP, mais identifiable comme test et validations possibles | |

**User's choice:** Sous-domaine réservé
**Notes:** —

### Q2 — Comptes résiduels de runs précédents ?

| Option | Description | Selected |
|--------|-------------|----------|
| Détection résiduelle | Listage e2e*@<sous-domaine> en fin de run + signalement des survivants ; purge bornée à ses propres runids | ✓ |
| Purge globale du préfixe | Auto-réparatrice mais dangereuse si runs parallèles | |
| Runid seul | Le strict SMOKE-01 ; résidus invisibles | |

**User's choice:** Détection résiduelle
**Notes:** —

---

## the agent's Discretion

- Mécanisme de détection autoconfirm (lecture du .env vs sonde)
- Forme de l'interface bibliothèque et format du runid
- Structure interne de la spec réelle et nom de fichier exact
- Sous-domaine réservé précis (alignement DNS, docs/DEPLOIEMENT-PROD.md)

## Deferred Ideas

- Branchement automatique du smoke (cron/CI) — chantier d'exploitation à part
- Purge globale du préfixe e2e* — à réévaluer si les runs restent sérialisés
