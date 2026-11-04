---
phase: 26-export-rgpd
reviewed: 2026-10-27T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - app/src/modules/parametres/api.ts
  - app/src/modules/parametres/types.ts
  - app/src/modules/parametres/parametres-page.tsx
  - app/src/modules/parametres/components/gdpr-export-panel.tsx
  - app/src/modules/parametres/components/gdpr-export-panel.test.tsx
  - supabase/functions/gdpr-export-run/index.ts
  - supabase/functions/gdpr-export-purge/index.ts
  - supabase/functions/push-notify/index.ts
  - supabase/migrations/0158_gdpr_export.sql
  - supabase/migrations/0159_gdpr_export_fixes.sql
  - supabase/migrations/0160_gdpr_export_privileges.sql
  - supabase/migrations/0161_gdpr_extract_batch.sql
  - supabase/migrations/0162_gdpr_http_guard.sql
  - supabase/migrations/0163_gdpr_extract_batch_wrapper.sql
  - supabase/migrations/0164_gdpr_push_export.sql
  - supabase/tests/0158_gdpr_export.sql
  - supabase/tests/0161_gdpr_extract_batch.sql
  - supabase/tests/0164_gdpr_push_export.sql
findings:
  critical: 1
  warning: 4
  info: 6
  total: 11
status: issues_found
---

# Phase 26 — Export RGPD : Code Review Report

**Reviewed:** 2026-10-27
**Depth:** deep (cross-file : migrations ↔ Edge Functions ↔ frontend ↔ tests)
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Le socle est solide sur les points qui fensaient : la borne RGEX-03 vit réellement dans le SQL (0161), les privilèges des fonctions privées/wrapper sont tenus (0159/0160/0163), le bucket est scellé sur `<user_id>/`, aucune URL signée n'est persistée, aucun secret dans `cron.job.command`. L'isolement inter-membres de l'extraction est correct : tous les filtres dérivent de `household_members.user_id = v_uid`, vérifié en lecture croisée module par module.

En revanche, trois défauts de fond : **la purge cesse définitivement de fonctionner après 50 exports expirés** (les lignes de job ne sont jamais supprimées et remplissent le plafond de candidats), **le scope push `export` re-distribue et consomme les rappels tâche/événement/routine** (double canal de dispatch), et **l'ordre des fragments JSON dans l'archive est faux dès qu'un module dépasse ~1000 lignes** (tri lexicographique d'offsets numériques). S'y ajoutent des duplications de contenu dans les lots des modules paginés et une assertion tautologique dans le test 0158, explicitement proscrite par AGENTS.md §2.7D.

---

## Critical

### CR-01 : La purge RGPD s'arrête définitivement après 50 exports expirés

**Fichier :** `supabase/functions/gdpr-export-purge/index.ts:136-146` et `229-237` (conjointement à l'absence de suppression de `gdpr_export_jobs` partout dans le dépôt)

**Issue :** `fetchCandidates` sélectionne au plus `JOB_CAP = 50` jobs (`status in ('pret','echec')`, `expires_at` dépassé, tri `expires_at` ascendant). Aucun code — ni dans la Edge Function, ni dans une migration — ne supprime ni n'archive la ligne `gdpr_export_jobs` après une purge réussie. Un job déjà purgé réapparaît donc à chaque passage quotidien en tête de la liste (tri ascendant = les plus vieux d'abord), avec zéro chemin à supprimer, et **consomme une place du plafond à perpétuité**. Au 51ᵉ export expiré, les 50 slots sont occupés par des jobs déjà purgés ; les nouveaux candidats au-delà du plafond ne sont jamais atteints, et les archives restent dans le bucket au-delà des 7 jours — violation directe de l'exigence de rétention RGEX-04, de façon silencieuse (le passage répond `{ purged_jobs: 0 }`).

**Fix :** après une purge intégraale d'un job (aucun chemin restant), supprimer la ligne (ou basculer un statut terminal purgé, par ex. `status = 'purge'` exclu des candidats) :

```ts
// dans handlePurge, après la boucle de lots d'un job :
if (!partial && remaining.length > 0) {
  const { error } = await admin.from('gdpr_export_jobs').delete().eq('id', job.id);
  if (error) throw new GdprPurgeError(`clôture du job purgé impossible : ${error.message}`);
}
```

(ou exclure du plafond les jobs dont `remaining.length === 0` : `.not('id', 'in', ...)` après une première passe d'inventaire — mais la suppression de la ligne est la seule issue qui ne redrive pas la même course le lendemain.)

---

## High

### HR-01 : Le scope push `export` distribue et consomme aussi les rappels tâche/événement/routine

**Fichier :** `supabase/migrations/0164_gdpr_push_export.sql:308-316`

**Issue :** la branche `'export'` de `due_push_notifications` appelle `private.push_reminder_notifications(v_now)` — la fonction **entière**, dont les CTE `rappels_taches`, `rappels_evenements` et `rappels_routines`. Le job `eo-push-exports` (toutes les 5 min, `dispatch_export_notifications`) devient ainsi un **second dispatcher** pour les rappels métier, en parallèle du job minute `eo-push-dispatch` (scope `rappels`, fenêtre de 24 h). Conséquences : envois en double lorsqu'un rappel est vu par les deux passages, et consommation (`delete` de `task_reminders`/`event_reminders`/`routine_reminders` via `consume_push_reminders`) déclenchée par le mauvais dispatcher. C'est visiblement un copier-coller de la branche par défaut : les deux branches `export` et `else` sont identiques.

**Fix :** isoler la branche export dans une fonction privée dédiée (ou filtrer), de sorte que `due_push_notifications('export')` ne rende QUE `exports_dus` :

```sql
elsif p_scope = 'export' then
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
    from private.push_export_notifications(v_now) n;  -- nouvelle fonction : CTE exports_dus seule
```

(`private.push_reminder_notifications` resterait la fonction du scope `rappels` sans la branche export, ou avec — mais un scope = une population.)

### HR-02 : Ordre des fragments JSON faux — tri lexicographique d'offsets numériques

**Fichier :** `supabase/functions/gdpr-export-run/index.ts:316` (nommage) et `441` (`sort()`)

**Issue :** `partName` est `${module}-${cursor_offset}` où `cursor_offset` est l'offset **post-avance** du curseur : le premier lot d'un module de 1500 lignes s'appelle `tasks-500`, le deuxième `tasks-1000`, le dernier (partiel) `tasks-0` (le curseur est reparti à 0 sur le module suivant). L'assemblage trie ces noms **lexicalement** (`moduleParts.sort()`) : `'tasks-0' < 'tasks-1000' < 'tasks-500'` — l'ordre réel des lots est 3ᵉ, 2ᵉ, 1ᵉʳ. Toute archive dont un module dépasse 999 lignes (ou dont le dernier lot est partiel) voit ses fragments concaténés dans le désordre dans `donnees-rgpd.json`. Le contenu est complet mais l'archive est désordonnée et les données d'un même tableau sont entrelacées entre fragments.

**Fix :** nommer le fragment par son offset de **début** (à retourner par le RPC, ou recalculé côté Edge) et trier numériquement :

```ts
const list = partsByModule.get(moduleName) ?? [];
list.push(part);
// ...
moduleParts.sort((a, b) => {
  const off = (p: string) => parseInt(p.slice(`${root}/parts/`.length).replace(/\.json$/, '').split('-').pop()!, 10);
  return off(a) - off(b);
});
```

Le plus propre est d'exposer `batch_start_offset` dans le retour du RPC 0161 et de nommer `part-<module>-<start>` — le commentaire de contrat le laisse prévu (« nom déterministe par lot »), le tri lexicographique resterait faux même ainsi nommé : trier sur l'entier.

### HR-03 : Contenu dupliqué dans l'archive pour tout module paginé avec tables secondaires « module entier »

**Fichier :** `supabase/migrations/0161_gdpr_extract_batch.sql:287-289` (`shopping_list_items`), `268-270` (`routine_completions`), `304-309` (`post_comments`, `post_reactions`), `366-372` (`conversations`, `conversation_members`)

**Issue :** ces tables secondaires sont filtrées sur le demandeur **sans jointure sur le lot courant** (contrairement à `task_assignees`, `note_attachments`, etc., filtrés sur les ids du lot). Lorsque le module primaire dépasse `p_limit` (plusieurs lots par module), chaque fragment réembarque la table secondaire **en entier** : un membre avec 1200 listes de courses obtient trois copies complètes de ses `shopping_list_items` dans l'archive. Grossit le ZIP, duplique la donnée, fausse la lecture.

**Fix :** borner ces secondaires comme les autres — sur les ids primaires du lot quand il y en a un (`list_id in (select x->>'id' from jsonb_array_elements(v_primary) x)`), et pour les sans-parent-direct (`routine_completions`, `post_comments`), soit les paginer avec leur primaire, soit les émettre une seule fois (lot terminal du module, quand le primaire s'épuise).

### HR-04 : Audit de purge — les erreurs par-objet de `storage.remove()` sont invisibles

**Fichier :** `supabase/functions/gdpr-export-purge/index.ts:170-188`

**Issue :** `removeBatch` ne regarde que l'`error` global du lot et marque `removed = !error` pour **tous** les chemins du lot. `supabase-js` v2 (`@supabase/supabase-js@2.117.2`, storage-api) renvoie les échecs par objet dans `data` (tableau de `{ name, error }`) sans `error` global : un lot à moitié supprimé est audité `removed=true` chemin par chemin. La « preuve RGEX-04 » affirme alors des suppressions qui n'ont pas eu lieu — exactement le succès muet que §2.7F proscrit, et l'idempotence « déjà removed → sauté » du passage suivant sautera des objets vivants pour de bon.

**Fix :** inspecter le résultat par objet :

```ts
const { data, error } = await admin.storage.from(EXPORT_BUCKET).remove(paths);
const audit: AuditRow[] = paths.map((p) => {
  const perObject = (data as { name: string; error?: { message?: string } }[] | null)
    ?.find((r) => r.name === p);
  const failed = error || perObject?.error;
  return { job_id: jobId, storage_path: p, removed: !failed,
           error: failed ? String(perObject?.error?.message ?? error!.message).slice(0, 500) : null };
});
```

À prouver par un cas qui doit échouer dans `test-dispatch-push.sh` ou un test dédié (§2.7 : un contrôle se prouve sur un cas qui doit échouer).

---

## Medium

### MR-01 : Noms d'entrées ZIP et chemins de staging construits depuis des valeurs stockées non bornées (zip-slip / évasion de préfixe)

**Fichier :** `supabase/functions/gdpr-export-run/index.ts:333-335` (chemin de staging) et `473` (nom d'entrée ZIP) ; filtre SQL `0161:232-234` et consœurs

**Issue :** le commentaire T-26-09 affirme que les noms du ZIP « ne dérivent jamais d'une chaîne saisie par un utilisateur ». C'est inexact : les chemins de médias (`file_url`, `photo_url`, `media_url`…) proviennent de colonnes alimentées par le client au moment de l'upload (un client malveillant contrôle sa clé d'objet dans `household-media`). Le filtre SQL n'exclut que `http%`, `data:%`, `blob:%` et `/%` — un chemin `foyer/x/../../alice/secret.jpg` ou contenant `..` passe le filtre, devient `${root}/medias/household-media/foyer/x/../../alice/secret.jpg` (destination de `copy` qui peut sortir du préfixe scellé) puis un nom d'entrée ZIP `medias/.../../...` (zip-slip à l'extraction chez un unarchiveur vulnérable). La donnée d'un autre membre pourrait ainsi entrer dans l'archive — la fuite RGEX-03 exacte que la phase doit exclure.

**Fix :** valider chaque segment avant usage, côté Edge (défense en profondeur, le filtre SQL restant) :

```ts
function safeMediaPath(source: string): string | null {
  const [bucket, ...rest] = source.split('/');
  const path = rest.join('/');
  if (!(SOURCE_BUCKETS as readonly string[]).includes(bucket) || path === '') return null;
  if (path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return `${bucket}/${path}`;
}
```

et refuser (logger `missing`) tout chemin qui ne passe pas. Compléter éventuellement le filtre SQL `not like '%..%'`.

### MR-02 : Assertion tautologique dans le test 0158 (§2.7D)

**Fichier :** `supabase/tests/0158_gdpr_export.sql:219-236` (section 3d)

**Issue :** `perform testkit.ok(true, 'squelette extraction : vérification reportée au plan 26-03')` — une assertion qui ne peut pas échouer n'est pas un test, c'est un commentaire qui coûte une exécution (règle littérale d'AGENTS.md §2.7D). Pire, le commentaire du bloc affirme « le test vérifie que le RPC ne renvoie rien pour Bob » alors qu'il ne vérifie rien. L'isolement est aujourd'hui prouvé par le test 0161 (`v_bob_tasks = 0`), mais uniquement pour `created_by` — pas pour le chemin `task_assignees`/`expense_participants` (demandeur assigné, non créateur), ni pour les modules household-scope.

**Fix :** supprimer la section 3d (le commentaire de renvoi suffit en tête de fichier) et, dans 0161, ajouter le cas négatif manquant : une tâche créée par Bob **et assignée à Alice** doit sortir de l'extraction d'Alice (chemin `task_assignees`), et une tâche de Charlie ne doit jamais y être.

### MR-03 : Pagination par offset sous écriture concurrente — dupliqués et manquants possibles

**Fichier :** `supabase/migrations/0161_gdpr_extract_batch.sql` (tous les `limit v_limit_left offset v_offset`)

**Issue :** entre deux lots (séparés par le lease de 5 min, donc jusqu'à des heures pour un gros export), toute insertion dans les tables exportées décale les offsets : lignes dupliquées dans l'archive (et, avec un `order by created_at`, des lignes sautées). Pour un droit d'accès RGPD, l'archive doit être un instantané cohérent.

**Fix :** pagination keyset au lieu d'offset : cursor `(created_at, id)` du dernier rang rendu, prédicat `(created_at, id) > (cursor...)`. Le curseur est déjà persisté sur la ligne de job — remplacer `cursor_offset integer` par deux colonnes (ou une `jsonb`) et adapter le contrat du RPC. Si le coût est jugé excessif, au minimum documenter la limite « instantané approximatif » dans le livrable — mais ne pas la taire.

### MR-04 : `consume_push_reminders` — un id non-UUID dans le kind `export` avorte toute la consommation

**Fichier :** `supabase/migrations/0164_gdpr_push_export.sql:417-420`

**Issue :** `where id = v_id::uuid` lève `22P02` si `v_id` n'est pas un UUID valide ; l'exception sort de la boucle et les entrées restantes du tableau (y compris des rappels légitimes à supprimer) ne sont pas traitées. Les autres kinds acceptent n'importe quel texte. Un tag corrompu ou un id tronqué côté Edge met le canal de consommation hors service jusqu'à ce que la ligne fautive disparaisse du payload — or pour `export`, la ligne ne disparaît jamais d'elle-même (`notified_push` ne bascule que via ce chemin).

**Fix :** garder le cast défensif dans un bloc d'exception, ou tester avant :

```sql
elsif v_kind = 'export' then
  begin
    update public.gdpr_export_jobs set notified_push = true
     where id = v_id::uuid and notified_push = false;
  exception when invalid_text_representation then
    v_affected := 0;
  end;
```

---

## Low

### LR-01 : Fenêtre de téléchargement incohérente — 24 h côté UI, 7 jours côté backend

**Fichier :** `app/src/modules/parametres/components/gdpr-export-panel.tsx:66-71` et `api.ts:459-465`

**Issue :** le ZIP vit 7 jours (`expires_at`, purge quotidienne), mais `isSignedLinkAlive` masque le bouton « Télécharger » dès 24 h après `created_at` et affiche « Lien expiré » + « Régénérer ». L'utilisateur perd l'accès à un fichier encore stocké pendant 6 jours, et une régénération reconstruit un archive identique. Si la borne 24 h est la décision produit (D-04 porte sur le TTL du lien signé, pas sur la fenêtre de téléchargement), le copy et le backend devraient s'aligner — sinon, calculer la fenêtre sur `expires_at`.

**Fix :** `isSignedLinkAlive` devrait comparer `now < expires_at` (colonne déjà sélectionnable via RLS), ou la purge devrait intervenir à 24 h si c'est la vraie règle.

### LR-02 : Push d'export « fantôme » si l'utilisateur s'abonne après coup

**Fichier :** `supabase/migrations/0164_gdpr_push_export.sql:186-213` + `supabase/functions/push-notify/index.ts` (consommation conditionnelle à `sent > 0`)

**Issue :** un job terminé pour un membre sans appareil enregistré garde `notified_push = false` à vie. S'il s'abonne au push des mois plus tard, le premier passage d'`eo-push-exports` lui enverra « Votre export est prêt » pour un export expiré et purgé. Même famille que le motif des rappels, mais ici la ligne ne meurt jamais (cf. CR-01 : elle n'est jamais supprimée).

**Fix :** borner la branche `exports_dus` sur une fraîcheur (`and j.updated_at > now() - interval '7 days'`) — et la correction de CR-01 (suppression de la ligne) règle le fond.

### LR-03 : Copie des médias sans garde de budget dans la passe d'extraction

**Fichier :** `supabase/functions/gdpr-export-run/index.ts:333-339`

**Issue :** la boucle de copies n'interroge jamais `deadline` : un lot de 500 médias peut dépasser les 60 s du worker et se faire tuer en plein passage. Le manifeste garantit la réparation (bien conçu), mais chaque kill reconsomme un pass_count et rapproche du plafond de 60.

**Fix :** `if (Date.now() > deadline) return { finished: false, ... };` en tête de boucle de copies (les copies déjà faites sont idempotentes, le manifeste couvre le reste).

### LR-04 : Test 0161 — compteur de médias cumulatif et assertion faible

**Fichier :** `supabase/tests/0161_gdpr_extract_batch.sql:111-112, 126-127`

**Issue :** `v_media_count := v_media_count + jsonb_array_length(v_media)` additionne à chaque passage la longueur du tableau **cumulé** (quadratique et sur-compté) ; l'assertion `>= 1` qui en découle ne vérifie presque rien (elle passerait avec 50 doublons). Le commentaire dit « accumulés sur tous les lots — chaque lot ne porte que ses propres chemins » : c'est précisément ce que l'assertion ne prouve pas.

**Fix :** compter par lot (`res -> 'media_paths'`) et vérifier l'absence de doublon : `v_seen := v_seen || chemins_du_lot`, puis assertion `cardinality(v_seen) = cardinality(array(select distinct unnest(v_seen)))`.

### LR-05 : Purge sans garde de temps de passage

**Fichier :** `supabase/functions/gdpr-export-purge/index.ts:201-244`

**Issue :** 50 candidats × listage récursif (une requête `list` par entrée pour distinguer dossier/fichier) peut dépasser les 60 s du worker pour un job lourd ; le passage meurt en 500, toute la fournée est reprise le lendemain — progressant à zéro si le premier job est assez gros. Aucune boucle infinie (plafond 50), mais un risque de stall observable.

**Fix :** budget de passage (date limite) entre les jobs, rendant la main avant 60 s — la reprise le lendemain repart sur le job suivant, pas sur le même.

---

## Nit

### NT-01 : Code mort et nom trompeur dans 0161

**Fichier :** `supabase/migrations/0161_gdpr_extract_batch.sql:554-556, 127`

**Issue :** `if v_primary is null then v_primary := '[]'` est mort (le `coalesce` du select garantit non-null) ; `v_limit_left` n'est jamais décrémenté — le nom suggère un budget partagé entre modules qui n'existe pas (chaque appel rend un lot d'UN module). Le commentaire lignes 24-27 décrit un comportement (« quand un module s'épuise au milieu du budget… ») que le code n'implémente pas.

**Fix :** supprimer la branche morte, renommer `v_limit_left` en `v_batch_limit` et réaligner le commentaire d'en-tête.

### NT-02 : Placement du panneau RGPD dans l'onglet « foyer »

**Fichier :** `app/src/modules/parametres/parametres-page.tsx:54`

**Issue :** le droit d'accès est strictement personnel (D-08, sans garde admin), mais l'écran vit dans l'onglet « Foyer », entre `MembersPanel` et `HouseholdDeletePanel` — deux surfaces de gestion du foyer. Risque de lecture « c'est une donnée du foyer ».

**Fix :** le déplacer dans l'onglet « profil » (à côté de `ProfileForm`/`LinkedAccountsPanel`) — décision produit, à trancher côté spec si D-07 dit autre chose.

---

## Ce qui a été vérifié et tient

- **Isolement RGEX-03** : lecture module par module de 0161 — tous les prédicats dérivent de `member_ids`/`household_ids` résolus depuis `household_members.user_id = v_uid` ; pas d'autre chemin d'entrée. Les ids `text` (convention `private.new_id`) rendent les `text[]` cohérents.
- **Privilèges** : REVOKE/GRANT explicites et idempotents sur toutes les fonctions privées et le wrapper public 0163 ; `request_gdpr_export` réservée à `authenticated` ; wrapper public refusé à `authenticated`/`anon` (42501 testé).
- **Lease/claim** : `claimJob` re-vérifie la clause de lease dans l'UPDATE (PGRST116 géré comme course perdue) ; verrou `for update` + avance transactionnelle du curseur dans le RPC — pas de double remise de lot.
- **Secrets** : aucun secret dans `cron.job.command` (lecture Vault, wrappers sans paramètre conformes au contrat test 0004) ; clé en `apikey`, jamais en Bearer (motif 0025 bien appliqué en 0162).
- **D-04** : aucun `storage_path` ni lien dans les payloads push (testé par marque dans 0164, avec un marque reconnaissable) ; l'URL signée n'est jamais persistée.
- **Bucket** : privé, mime `application/zip`, 1 Go, politique scellée `foldername[1] = auth.uid()` ; zéro politique d'écriture client.
- **Test 0001 delta** : exemption `gdpr_export_purge_log` cohérente avec l'absence volontaire de politiques, assertion négative explicite.

---

_Reviewed: 2026-10-27_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
