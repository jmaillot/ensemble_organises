---
phase: "21"
slug: "photos-dans-les-etapes-de-recette"
status: verified
threats_open: 0
asvs_level: 2
created: "2026-10-16"
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Vérifié par `gsd-security-auditor` le 2026-10-16 sur HEAD `75850b1` — chaque
> verdict est ancré à un `file:line` ouvert pendant l'audit, jamais repris d'un
> SUMMARY ni d'un plan.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| membre → `recipe_steps.photo_path` | colonne texte écrite par un membre (`can_write_household`) ; sa forme décide de ce que l'Edge signera | chemin d'objet Storage |
| Edge `recipe-invite` (client service-role) → Storage `household-media` | la signature privilégiée contourne la politique du bucket `(storage.foldername(name))[1]` ; la valeur signée doit donc être bornée en amont | URL signée TTL 1 h |
| écriture client → objet de bucket | une écriture non atterrie ne doit pas détruire l'objet que la ligne référence encore | objet média |
| vue invitée → navigateur sans session | la projection invitée ne porte que des URL signées ; un chemin brut ne doit jamais traverser | URL signée / `null` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-21-01 | Elevation of Privilege | écriture `recipe_steps` / Storage par un `enfant` | high | mitigate | RLS `recipe_steps` (`0122:326-337`) + `household_media_insert` (`0010:35-39`, renforcée `0099:53-58`) via `private.can_write_household` (`0006:77-85`) ; affordance client `readOnly` (`recipe-steps.tsx:316-323,327,354`, `recette-detail-page.tsx:267,323`, `use-recettes.ts:78,187`) ; cas négatif prouvé `0125_recipe_step_photos.sql:95-107,131-138` | closed |
| T-21-02 | Information Disclosure | projection invitée | high | mitigate | `guest-steps.ts:93-110` ne rend que `photoUrl` ; échec fermé **sans journalisation** (`:71-75`) ; site de signature unique (`index.ts:68,472,484`) ; preuve `guest-steps.test.ts:178-179,191-192` | closed |
| T-21-03 | Information Disclosure | forme de la valeur stockée | high | mitigate | producteur unique `storedValueOf(deposited)` (`api.ts:333`) au point unique `lib/storage.ts:173-175` ; verrou vivant `media-path-contract.test.ts:86,101-129` | closed |
| T-21-04 | Information Disclosure | projection cliente invitée | high | mitigate | `api.ts:652-663` lit `row.photoUrl` (charge servie), jamais `row.photo_path` ; `guest-recipe-page.tsx:81-91` force `photoPath: null` | closed |
| T-21-05 | Information Disclosure | modèle d'impression | high | mitigate | `types.ts:276` résout la carte d'URLs, jamais `step.photoPath` ; surface unique `recette-detail-page.tsx:101-103,139,319,325` ; preuve `recipe-actions.test.ts` | closed |
| T-21-06 | Information Disclosure | signature inter-foyers via `photo_path` (revue WR-01a) | high | mitigate | contrainte `check (photo_path is null or starts_with(photo_path, household_id \|\| '/'))` (`0126:35-37`), `household_id` aligné au foyer de la recette par le trigger `align_household` (`0122:368-371`) ; preuve par échec réel `0126_recipe_step_photos_household.sql:82-94,100-103,109-116` | closed |
| T-21-07 | Tampering | nettoyage destructif sur écriture non atterrie (revue CR-01) | high | mitigate | `writeStepPhoto` rend l'atterrissage (`api.ts:395-404`) ; `replaceRecipeStepPhoto` retire l'objet **neuf** et conserve l'ancien si `!landed` (`:425-430`) ; `clearRecipeStepPhoto` conditionne le retrait (`:442-444`) ; preuves `recipe-step-photo.test.ts:289,309` | closed |
| T-21-08 | Denial of Service | URL `http(s)` arbitraire servie à l'invité (revue WR-01b) | medium | mitigate | la contrainte de `0126:37` rejette toute forme `http(s)://` (`household_id` vaut `household_<uuid>`, `0001:36-43`) : le passe-plat de `guest-steps.ts:65` est inatteignable pour une photo d'étape | closed |
| T-21-SC | Tampering | installations npm/pip/cargo | high | mitigate | aucune surface de dépendance modifiée sur `2ff8085..HEAD` (ni `package.json`, ni lockfile, ni `deno.json`, ni `import_map`) ; `guest-steps.ts:1-6` reste sans import Deno | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**`threats_open: 0`.** Les deux constats de revue porteurs de sécurité sont
cartographiés : CR-01 → T-21-07, WR-01 → T-21-06 (a) / T-21-08 (b)
(`21-05-PLAN.md:199-201`, `21-REVIEW-DISPOSITION.md`).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-21-01 | T-21-08 (variante `recipes.cover_photo`) | Le signeur invité passe encore tout `http(s)://` verbatim (`guest-steps.ts:65`) et signe tout chemin non-URL avec le service-role (`:66-72`) ; `recipes.cover_photo` n'a **pas** de contrainte de préfixe de foyer (seule `recipe_steps.photo_path` en a reçu une en `0126:35-37`). Un membre peut donc encore pointer la **couverture** vers une image distante arbitraire ou vers le chemin d'un objet d'un autre foyer. **Préexistant à la phase 21**, explicitement hors périmètre (21-SPEC/CONTEXT) ; suivi comme résidu, pas comme dette muette. **FERMÉ le 2026-10-16 (phase 22, plan 22-01)** : `view_recipe_share` ne rend plus qu'une couverture bornée au foyer de la recette et sans segment `..` (`0127`, `supabase/tests/0127_guest_media_household.sql` cas (b2), (b3), (b4)). La contrainte d'écriture n'a délibérément **pas** été posée sur la colonne : sa forme `http(s)` est héritée et le client réécrit la valeur existante à chaque édition (`use-recettes.ts:202`) — le trou réel était la SIGNATURE service-role, fermée à la lecture. | orchestrateur (fermeture 21) | 2026-10-16 |
| AR-21-02 | T-21-06 (durcissement) | La mitigation vit **uniquement** dans la contrainte de base ; l'Edge ne revalide pas le préfixe avant `createSignedUrl` (défense en profondeur volontairement non prise, `21-05-PLAN.md:199`). La contrainte est un contrôle de préfixe **littéral** (`starts_with`) : elle n'interdit pas un segment `..` **après** un préfixe de foyer valide (`<homeA>/../<homeB>/x.jpg` la satisfait). L'auditeur **n'a pas pu trancher** si la couche Storage normalise ce segment avant de résoudre la clé — aucun runtime Storage sur cet hôte (`deno` absent). Le risque est donc **non prouvé, non écarté** : consigné ici avec un suivi, jamais présenté comme clos par la seule contrainte. **FERMÉ le 2026-10-16 (phase 22, plan 22-01)** : la contrainte d'écriture refuse tout `..` (`strpos(photo_path, '..') = 0`, `0127`) **et** `view_recipe_share` prononce le même verdict à la lecture — la normalisation de Storage n'est donc plus supposée, le refus tombe avant la signature. Prouvé par mutation (retirer `strpos` rend le cas (a2) rouge ; retirer le `case` du RPC rend le cas (c) rouge). | orchestrateur (fermeture 21) | 2026-10-16 |

*Accepted risks do not resurface in future audit runs.*

**Suivi recommandé (AR-21-02) — TRAITÉ.** Le second terme de l'alternative a été
retenu (« refuser tout segment `..` dans la contrainte »), complété par le même
verdict à la lecture dans `view_recipe_share` : la défense en profondeur n'est
plus laissée de côté, mais elle vit là où le foyer est connu par construction,
pas dans `resolveGuestMediaUrl` (qui ne reçoit que la valeur brute). Aucun
runtime Storage réel n'a été nécessaire, la normalisation d'un `..` n'étant plus
supposée par le verdict.

**Résidu nouveau (R3 de la phase 22), hors périmètre** — la même classe de
signature non validée subsiste dans deux autres Edge qui signent un chemin brut
avec le client service-role : `gift-list-invite/index.ts:857`
(`resolveGuestPhotoUrl`) et `ardoise-invite/index.ts:637`
(`resolveGuestCoverUrl`). Ni l'une ni l'autre ne borne le chemin au foyer de la
ressource, et aucune n'a de contrainte d'écriture équivalente à `0126`/`0127`.
Le foyer y est pourtant disponible sur le site d'appel
(`gift-list-invite/index.ts:750`, `ardoise-invite/index.ts:532`). Non traité ici
parce que ce sont des surfaces distinctes, sans donnée de la phase 21.

**FERMÉ le 2026-10-17 (phase 23, migration `0128`).** Les deux signeurs reçoivent
désormais une valeur **déjà bornée** au foyer de la ressource, et la forme
`http(s)` héritée n'est plus relayée sur l'une ni l'autre surface invitée
(D-03) :
- `gift-list-invite` : `guest_view_gift_list` recréée par `0128` ne rend un
  `photo_url` que s'il commence par `<household_id>/` ; `resolveGuestPhotoUrl`
  (`index.ts:864`) ne signe que ce verdict borné, tout le reste tombe dans
  l'échec fermé (`null`).
- `ardoise-invite` : le verdict est prononcé par un module **pur**
  (`guest-media.ts`, sans import Deno, donc couvert par Vitest) **avant** la
  signature, exactement comme `recipe-invite/guest-steps.ts` pour les recettes
  (`0127`).

Ce n'est donc plus un résidu ouvert. L'asymétrie restante est cosmétique et
écrite telle quelle (`guest-media.ts:26-31`) : un seul signeur,
`recipe-invite/guest-steps.ts:65`, porte encore un relais `http(s)`
**inatteignable** (`0127` n'émet plus cette forme) — jamais présenté comme une
protection.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-16 | 9 | 9 | 0 | gsd-security-auditor (orchestré par la fermeture de la phase 21) |

*`T-21-SC` est déclaré à l'identique dans les cinq plans ; compté une fois.
Aucun SUMMARY de la phase ne porte de section « Threat Flags » : aucune surface
d'attaque nouvelle déclarée par un exécuteur n'est restée hors carte.*

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-16
