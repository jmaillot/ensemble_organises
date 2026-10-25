---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
created: 2026-10-15
source: 18-REVIEW.md (revue large du frontend app/src)
scope: correctifs chirurgicaux — silences serveur, intégrité des données, écran bloqué
deferred_to_backlog: true
---

# Phase 18 — Contexte et décisions

## Origine

`18-REVIEW.md` : 1 critical, 20 warning, 14 info, issu d'une revue du frontend
complet (`app/src`, ~70 000 lignes). Les portes automatiques étaient toutes vertes ;
ces défauts échappent à la CI parce que les tests Vitest tournent en **mode démo
(Dexie)**, sans `CHECK` SQL ni RLS.

## Périmètre de la phase (7 findings, tous chirurgicaux)

| ID | Finding | Type |
|----|---------|------|
| CR-01 | Masquer/déplacer un widget viole `check (width between 1 and 4)` | contrainte serveur jamais respectée |
| WR-01 | `remove`/`removeWhere` sans comptage → refus RLS = faux succès | silence |
| WR-02 | Affordances de suppression au-delà des droits (tâches, dossiers, routines) | silence + UX |
| WR-03 | `ardoise_members` absente de `KEYLESS_TABLES` → ajout de membres sans effet | silence |
| WR-04 | `useAuthBootstrap` sans `.catch` → écran de chargement infini | blocage total |
| WR-05 | Éditer un lieu supprime sa photo du bucket | perte de données |
| WR-06 | Parts personnalisées d'ardoise négatives (somme non validée) | argent faux |

## Decisions verrouillées

- **D-01 — CR-01 : assouplir la contrainte, ne pas changer l'encodage.**
Nouvelle migration (jamais réécrire une migration appliquée, AGENTS.md §2.7.A.1) qui
remplace le CHECK par `width between 0 and 4`. On conserve la sémantique existante
`visible = width > 0` (`modules/dashboard/types.ts:64`) et l'idiome d'upsert
`id: widget-<memberId>-<kind>` + `unique(member_id, widget_type)` : c'est le
changement le plus petit et il ne touche aucune lecture. Alternative rejetée : ajouter
une colonne `visible boolean` (touche toutes les lectures, deux sources de vérité).

- **D-02 — WR-01 : compter les lignes affectées, et prouver la classe.**
`remove`/`removeWhere` doivent demander les lignes supprimées (`.select()`) et lever si
le compte est zéro. Sous RLS, une politique `DELETE` exige la visibilité de la ligne :
0 ligne signifie « rien supprimé », donc l'échec devient explicite plutôt que silencieux.
Vérifier qu'aucun appelant ne s'appuie volontairement sur une suppression idempotente
(0 ligne = succès) avant de généraliser ; si un tel appelant existe, il doit le dire
explicitement. La phase doit recenser **tous** les sites concernés (§E : corriger la
classe), pas seulement les trois cités.

- **D-03 — WR-02 : l'interface ne propose que ce que le serveur accorde.**
Aligner le gating des affordances sur les politiques réelles
(`tasks_delete_admin`, `task_lists_delete_admin`, `routine_completions_delete_admin`).
Le rôle qui n'a pas le droit ne doit pas voir l'action ; un refus résiduel doit être
visible (couvert par D-02).

- **D-04 — WR-03 : corriger la classe, avec un garde qui empêche la récidive.**
Ajouter `ardoise_members` à `KEYLESS_TABLES`. La phase doit aussi **établir la liste
exhaustive** des tables à clé composite sans colonne `id` (lecture des migrations) et
la confronter à la constante, puis figer ce rapprochement par un test — l'instance
seule reviendra sinon sous une autre table.

- **D-05 — WR-04 : un échec d'amorçage doit être visible et rejouable.**
`useAuthBootstrap` doit garantir `setReady(true)` sur tous les chemins (y compris
l'échec) et exposer un état d'erreur avec reprise, plutôt que « Chargement… » infini.
Dédupliquer le commentaire (IN-11) au passage.

- **D-06 — WR-05 : comparer ce qui est comparable.**
La comparaison « photo changée ou retirée » de `editPlace` doit porter sur la **valeur
stockée** (chemin bucket), pas sur l'URL signée résolue. Le formulaire doit transporter
la valeur stockée brute ; l'affichage continue d'utiliser la valeur résolue. Preuve
exigée : éditer un lieu sans toucher à la photo **ne supprime pas** l'objet et ne
réécrit pas la colonne avec une URL signée.

- **D-07 — WR-06 : borner la somme, pas seulement chaque part.**
La validation du partage personnalisé doit vérifier que la somme des parts égale le
montant (tolérance centime) en plus de `>= 0` par part, avec un message qui explique
l'écart. Aucune part négative ne doit pouvoir être persistée, en démo comme en ligne.

## Preuves attendues (par finding)

- CR-01 : insertion `width = 0` acceptée après migration ; test qui échouait avant.
  La phase doit expliquer pourquoi le test versionné actuel passe (mode démo sans CHECK).
- WR-01/WR-02 : cas négatif explicite (membre non admin) dont la suppression échoue
  **bruyamment** au lieu de mentir ; cas positif admin inchangé.
- WR-03 : ajout de membres d'ardoise effectif (ligne en base), + test de rapprochement
  clé composite ↔ `KEYLESS_TABLES`.
- WR-04 : lecture foyer en échec → état d'erreur rendu, pas de « Chargement… » infini.
- WR-05 : édition sans changement de photo ⇒ objet intact dans le bucket.
- WR-06 : parts personnalisées dont la somme dépasse le montant ⇒ refus explicite,
  aucune ligne négative.

## Chaîne de vérification

`cd app && npm run typecheck && npm test && npm run build`, puis
`python3 scripts/check-sql-statique.py` (une migration étant ajoutée), puis
`npm run test:e2e`, puis `sh scripts/test-db.sh` **si Docker est disponible**
(sinon le dire — AGENTS.md §2.7 : le SQL n'est pas validé par le simple fait que la
migration s'applique).

## Hors périmètre (reporté, voir 18-REVIEW.md)

Conventions temps (WR-07), médias signés (WR-08), rollback création+upload (WR-09),
orphelins Storage (WR-10), drapeaux Animaux (WR-11), dates 29 février (WR-12), tri/drag
Tâches (WR-13), rappels expirés (WR-14), fidélité (WR-15), MIME vide (WR-16), gardes de
route (WR-17), enfant/calendrier (WR-18), deps notifications (WR-19), parts invité
voyage (WR-20), et les 14 info (IN-01…IN-14). Ces items feront l'objet de phases ou de
tâches rapides suivantes — ne pas les absorber ici.
