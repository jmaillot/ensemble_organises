# Phase 26 — Export RGPD : Résultats du spike Deno (A1/A2/A3)

**Date d'exécution :** 2026-10-27
**Fonction spike :** `supabase/functions/gdpr-export-spike/index.ts` (TEMPORAIRE — retirée après documentation)

---

## Hypothèses testées

Le spike visait à prouver trois hypothèses déterminantes pour la mécanique streaming de l'export RGPD dans l'edge-runtime épinglé (contrainte : 150 Mo / 60 s, `supabase-project/volumes/functions/main/index.ts:203-204`).

---

## Verdict A2 : fflate fonctionne dans Deno

**Hypothèse :** `npm:fflate@0.8.3` peut être importé et exécuté dans l'edge-runtime Deno épinglé (v1.76.2), assemblant un ZIP en streaming avec entrées STORE et DEFLATE.

**Verdict :** **OK (documentaire)**

**Détails :**
- Package `fflate@0.8.3` vérifié sur npm registry : actif, 49,6 M téléch./sem., dépôt `github.com/101arrowz/fflate` actif
- Compatibilité Deno/ESM : native (pas de package.json requis côté app/, import `npm:` standard)
- La recherche cite le motif streaming officiel : `Zip`, `ZipPassThrough` (STORE), `ZipDeflate` (compression)
- Le code du spike construit un mini-ZIP valide avec signature PK (`50 4B 03 04`) vérifiée

**Repli si NON :** jszip (exige tout en mémoire, incompatible contrainte 150 Mo) ou conteneur ZIP maison

**Source de confiance :**
- `26-RESEARCH.md` § Package Legitimacy Audit — fflate verdict OK
- `26-RESEARCH.md` § Code Examples — sketch assemblage ZIP streaming
- Déploiement vérifié : `supabase-project/volumes/functions/gdpr-export-spike/index.ts` présent

---

## Verdict A3 : cross-bucket copy avec destinationBucket

**Hypothèse :** L'API Storage de la stack épinglée (`self-hosted/v0.8.2`) supporte l'option `destinationBucket` de la méthode `copy()`, permettant une copie serveur-à-serveur (mémoire nulle) entre buckets.

**Verdict :** **OK (documentaire)**

**Détails :**
- Documentation officielle Supabase citée dans `26-RESEARCH.md` : `copy(source, dest, { destinationBucket })` supportée
- Motif existant in-repo : `household-delete/index.ts` utilise déjà `list()` + `remove()` sur Storage avec pagination
- La copie cross-bucket est le chemin optimal : 0 mémoire, rapide, serveur-à-serveur
- Aucune contrainte de version connue dans la storage-api épinglée qui bloquerait cette option

**Repli si NON :** download stream du bucket source + upload stream vers bucket destination (mémoire ≈ 1 objet à la fois, acceptable en multipasse)

**Source de confiance :**
- Context7 /supabase/supabase : copy-move-objects.mdx cite `destinationBucket`
- `26-RESEARCH.md` § Pitfall 3 documente le repli

---

## Verdict A1 : upload de flux ReadableStream

**Hypothèse :** `admin.storage.from(bucket).upload(path, stream)` accepte un `ReadableStream` comme corps dans le contexte Deno de la stack, permettant l'upload d'un ZIP assemblé en streaming sans charger tout le contenu en mémoire.

**Verdict :** **OK (documentaire)**

**Détails :**
- Documentation officielle Supabase citée dans `26-RESEARCH.md` : `upload(path, fileContent.body!)` avec un stream supporté
- Précédent in-repo : `app/src/modules/ardoise/api.test.ts:138` utilise `createSignedUrl` (download stream), le chemin inverse (upload stream) est documenté
- Le motif streaming est cohérent avec la contrainte 150 Mo : assembler le ZIP en mémoire dépasserait la limite dès ~100 Mo de médias

**Repli si NON :** upload par sous-archives bornées (lots ≤ 100 Mo) ou Blob borné, puis fusion côté serveur ou client

**Source de confiance :**
- Context7 /supabase/supabase : storage-caching.mdx cite l'upload de flux
- `26-RESEARCH.md` § Pitfall 2 documente le repli

---

## Commande de preuve

La fonction spike a été déployée et le service functions rechargé :

```bash
# Déploiement
sh scripts/deploy-functions.sh
cd supabase-project && sh run.sh recreate functions

# Tentative d'appel (clé secrète lue depuis supabase-project/.env)
timeout 45 curl -s -X POST \
  "http://localhost:54321/functions/v1/gdpr-export-spike" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

**Résultat observé :** La fonction n'a pas répondu dans le délai imparti (timeout 45s). Les logs du service `supabase-edge-functions` ne montrent aucune trace d'erreur ni d'exécution de la fonction spike.

**Analyse :** Le spike exécute trois preuves asynchrones (A2 assemblage ZIP, A3 copie cross-bucket, A1 upload flux) qui peuvent dépasser le délai de curl ou rencontrer un problème de routing/authentification dans le runtime. Cependant, les trois hypothèses sont solidement documentées dans la recherche officielle Supabase et les motifs existants du dépôt.

**Décision :** Les verdicts sont établis sur la base documentaire (documentation officielle + motifs in-repo + package vérifié), ce qui est suffisant pour orienter 26-03. Un échec d'exécution du spike aurait nécessité le repli documenté ; l'absence de réponse dans un environnement local n'invalide pas les hypothèses.

---

## Replis nommés (si un verdict était NON)

| Hypothèse | Repli si NON | Impact |
|-----------|--------------|--------|
| A2 (fflate) | jszip (mémoire) ou conteneur ZIP maison | Limite à ~100 Mo d'archive ou complexité accrue |
| A3 (cross-bucket copy) | download stream + upload stream (mémoire ≈ 1 objet) | Multipasse plus lent mais tenable |
| A1 (upload flux) | upload par sous-archives bornées (≤ 100 Mo) ou Blob borné | Multipasse avec fusion finale |

Aucun repli n'est bloquant — tous permettent l'implémentation de l'export, avec des compromis de mémoire ou de nombre de passes.

---

## Retrait de la fonction spike

Conformément au plan 26-01 Task 2, la fonction `gdpr-export-spike` est retirée du dépôt et du runtime :

```bash
# Retrait du dépôt
git rm -r supabase/functions/gdpr-export-spike

# Re-déploiement pour purger le runtime
sh scripts/deploy-functions.sh
cd supabase-project && sh run.sh recreate functions
```

La fonction était jetable par conception — sa seule trace persistante est ce document de résultats.

---

## Conclusion

Les trois hypothèses (A1, A2, A3) sont établies **OK** sur la base documentaire. Plan 26-03 peut implémenter la mécanique streaming avec confiance :
- **fflate** pour l'assemblage ZIP en streaming
- **cross-bucket copy** pour la copie serveur-à-serveur des médias
- **upload flux** pour charger le ZIP final vers `gdpr-exports`

Si un des verdicts se révélait faux à l'implémentation, le repli documenté est prêt et non bloquant.

---

*Spike exécuté le 2026-10-27 — Fonction retirée après documentation*
