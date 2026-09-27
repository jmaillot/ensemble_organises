# Travaux en cours

Liste de ce qui reste à faire sur le dépôt, avec l'état réel de chaque point.
Elle est courte, et c'est volontaire : une liste qui grossit est une liste que
personne ne lit.

Chaque entrée porte ce qu'il faut pour la reprendre à froid : ce qui est à
faire, pourquoi, et **comment vérifier que c'est fini**. Un travail sans
critère de fin n'est pas terminé, il est en cours.

Dernière mise à jour : 26 septembre 2026.

---

- [ ] **1. L'affichage des notifications n'est pas établi**

**Qui peut le faire : l'utilisateur.** C'est le seul point bloquant.

**Ce qui est établi.** Le chemin « base → Edge Function → service Push » est
validé et reproductible par `sh scripts/test-dispatch-push.sh` : rapport
`{ notifications: 1, delivered: 1, failed: 0, dropped: 0, consumed: 1 }`, et la
ligne de rappel supprimée de `public.task_reminders`. Côté navigateur,
l'abonnement existe, l'empreinte de l'endpoint correspond à celle de la base
(`dfd1d16ba4985a4d`), le bundle déployé contient l'écouteur `push`, et
`showNotification` appelé depuis la console affiche bien une bannière.

**Ce qui ne l'est pas.** Qu'un `push` atteigne réellement le service worker.
`delivered: 1` signifie que Mozilla a *accepté* l'envoi en file, pas qu'il a
**Ce qui ne l'est pas.** Qu'un `push` atteigne réellement le service worker.
`delivered: 1` signifie que Mozilla a *accepté* l'envoi en file, pas qu'il a
été distribué. La nuance est écrite dans `docs/BACKEND.md` §6.6, et j'en ai
fait une étape d'une chaîne « validée de bout en bout » alors que seule la
remise l'était.

**Comment trancher.** Dans la console Firefox, sur la page de l'application,
puis cliquer « Envoyer un test » dans les 40 secondes :

```js
(async () => {
  const r = await navigator.serviceWorker.ready;
  let vus = 0;
  const t = setInterval(async () => {
    const ns = await r.getNotifications({ includeInvisible: true });
    if (ns.length > vus) {
      vus = ns.length;
      console.log('NOTIFICATION REÇUE ->', ns.map(n => n.title));
    }
  }, 500);
  setTimeout(() => {
    clearInterval(t);
    console.log('fin. notifications aperçues :', vus);
  }, 40000);
})()
```

- `NOTIFICATION REÇUE` → la remise fonctionne, et le problème est
  l'affichage par GNOME. Aucun correctif côté dépôt.
- `0` → le `push` n'arrive pas. `about:debugging` → Service Workers →
  Inspecter → Console : un `push` reçu y apparaîtrait, et son absence est la
  preuve.

**Terminé quand** le point 4 a été fait, ou que la remise est prouvée.

---

- [ ] **2. Le contrôleur de littéraux est sourd dans deux endroits**

Diagnosticé et localisé, non corrigé. La correction tient en une ligne par
site ; elle n'a pas été appliquée parce qu'elle aurait pu casser des
contrôles verts, et qu'aucun cas ne permet encore de le prouver.

**Qui peut le faire : l'agent.**

`check-sql-statique.py` compte des parenthèses sur un corps `do $$` sans
masquer les littéraux, aux lignes **590** et **669**. Un littéral contenant des
parenthèses non appariées — `'private\.(\w+)\s*\('` en contient deux — décale
le comptage, et le contrôle cherche ensuite dans une structure qu'il n'a jamais
Un troisième site, à la ligne 246, a été corrigé le 26 septembre : c'est lui
qui rendait le contrôle 2 aveugle aux CTE récursifs. Les deux autres
n'ont pas été repris — les contrôles qui les utilisent ont des cas déjà
éprouvés, et je préfère les laisser verts que les corriger sur une
déduction.

**Comment vérifier.** Écrire d'abord un cas qui doit être détecté, et un qui
ne doit pas l'être — sur le modèle des neuf cas du contrôle `recursive`. Puis
appliquer `_masque_litteraux` sur le corps avant de compter, et vérifier que
les cas existants morsent toujours.

**Terminé quand** les deux sites sont masqués et que les cas passent.

---

- [x] **3. Le chemin anniversaires n'a jamais été validé par un envoi**

**Qui peut le faire : l'agent, puis l'utilisateur.** — **Fait le 27 septembre 2026** par `sh scripts/test-dispatch-anniversaires.sh` (écrit pour l'occasion, modèle `test-dispatch-push.sh`, propriété inversée : réannonce au lieu de disparaître) : deux dispatches, `200` et `delivered: 2` les deux fois, `consumed: 0` comme prévu par contrat, tag encore dû avant le second appel, nettoyage vérifié par comptage.

`eo-birthday-alerts` passe chaque matin à 06 h 40 et n'a jamais rien envoyé.
`0006_birthdays.sql` couvre sa logique, et §6.6 explique pourquoi ce chemin ne
peut pas être validé par la disparition d'une ligne : un anniversaire n'a rien
à consommer.

**Ce qu'il faut.** `scripts/test-dispatch-anniversaires.sh`, sur le modèle de
`test-dispatch-push.sh`, avec une propriété **inversée** : puisque rien n'est
consommé, le test vérifie qu'un **second** appel réannonce, au lieu de
vérifier une disparition.

**Deux choses vérifiées avant d'écrire.** Le chemin anniversaires n'est **pas**
conditionné par une préférence : `preference` vaut `null` pour un
anniversaire, et le filtre fait `coalesce(case … end, true)`, donc il passe.
Et la source filtre sur `days_until = 0`, ce qui vaut toute la journée — il
n'y a pas de fenêtre d'une minute à rater.

**Terminé quand** le rapport dit `200` avec `delivered: 1`, et qu'un second
appel est annoncé une seconde fois.

---

- [ ] **4. Le parcours humain n'a jamais été fait**

**Qui peut le faire : l'utilisateur.** Aucun test ne peut l'atteindre.

Le formulaire de tâche expose bien le champ de rappel — `reminderAt` au
schéma Zod, saisie en `datetime-local`, `saveTask` appelant
`setTaskReminder`, `removeTask` nettoyant au passage. Le `notificationclick` du
service worker est écrit : fermeture, focus d'un onglet de même origine, et
`openWindow` sinon. Tout est là, et rien n'a été exercé.

**Comment faire.** Créer une tâche, lui mettre un rappel à deux minutes,
attendre, et cliquer la notification. Vérifier qu'elle mène à `/taches`.

**Terminé quand** la notification est apparue et que le clic a ouvert la
tâche. Un chemin dont chaque maillon est vérifié peut encore ne pas
s'emboîter.

---

- [ ] **5. Publication Cercle avec photo : « bucket not found »**

**Qui peut le faire : l'agent.**

**Cause établie.** Le frontend vise `CERCLES_BUCKET = 'cercle'`
(`app/src/modules/cercle/api.ts:22`, upload ligne 65, URL signée ligne 71),
mais la 0010 ne crée que `household-media` et `household-avatars`, et ses
politiques Storage ne connaissent que ces deux noms. Le chemin d'objet
`${householdId}/${postId}/…` suit déjà la convention `foldername[1]` des
politiques : c'est le nom du bucket qui diverge, pas le chemin.

**Ce qu'il faut.** Pointer la constante vers `household-media`, vérifier les
trois usages (upload, URL signée, suppression éventuelle) et l'octroi MIME
(0010 : jpeg/png/webp/avif/heic + mp4/quicktime).

**Terminé quand** une publication avec photo part depuis l'app (pas depuis
le mode démo), et que l'image s'affiche via l'URL signée après rechargement.

---

- [ ] **6. Tâche/routine avec assigné : « permission denied for function parent_household_id »**

**Qui peut le faire : l'agent.**

**Cause établie.** `0009_grants.sql:68` révoque `EXECUTE` sur
`private.parent_household_id(text, text)` à `authenticated`, mais
`task_assignees_insert` (`0007:362-368`) et `routine_assignees_insert`
(`0007:400-407`) l'appellent **directement** dans leur `WITH CHECK`. Une
expression de politique s'exécute avec les droits de l'appelant : sans
`EXECUTE`, toute assignation échoue en 42501. Seules les créations **avec**
assigné sont touchées ; sans assigné, le chemin ne passe pas par là.

**Pourquoi les tests sont verts.** `0002` ne fait qu'`expect_denied` sur les
assignations, et un refus pour défaut de privilège porte le même code 42501
qu'un refus RLS : le négatif passe pour la mauvaise raison. `0007_push:366`
insère dans un bloc `do`, donc avec le rôle propriétaire, hors RLS. Aucun
test n'assert le chemin heureux en `authenticated`.

**Ce qu'il faut (corriger vers l'avant).** Ne pas simplement re-granter la
fonction : `0009:41-43` documente la doctrine « les helpers de politique ne
renvoient que des booléens », et `parent_household_id` renvoie du texte. Donc :
nouvelle migration avec deux enveloppes booléennes `SECURITY DEFINER`
(`member_in_task_household`, `member_in_routine_household`), `GRANT EXECUTE`
à `authenticated`, réécriture des deux politiques dessus, et tests positifs
en `authenticated` (assignation même foyer acceptée, inter-foyer refusée).

**Terminé quand** `sh scripts/test-db.sh` est vert avec les nouveaux tests,
**et** qu'une tâche puis une routine avec assigné se créent depuis l'app
(le test seul ne suffit plus : c'est exactement ce qu'il n'a pas vu).

---

- [ ] **7. Création d'une liste de cadeaux impossible**

**Qui peut le faire : l'agent, après le message exact.**

**État.** Cause non établie : la politique `gift_lists_insert` (`0007:460`)
n'appelle aucune fonction révoquée (`can_write_household` +
`member_in_household`, toutes deux accordées). Pistes, dans l'ordre :
`owner_member_id` périmé envoyé par le client (membre d'avant le wipe du
27/09 : `member_in_household` rend faux → 42501 RLS, pas une erreur de
fonction), puis visibilité `can_read_gift_list` après création.

**Ce qu'il faut d'abord.** Reproduire et relever le **message exact**
(toast ou Network `POST gift_lists` → corps de réponse), plus
l'`owner_member_id` envoyé (DevTools → onglet Requête).

**Terminé quand** une liste se crée depuis l'app et reste visible après
rechargement. Le critère exact sera resserré une fois le message connu.

---

- [ ] **8. Date d'anniversaire affichée en MM/DD/YYYY**

**Qui peut le faire : l'agent.**

**Cause établie.** Le dialogue utilise un `<Input type="date">` natif
(`birthday-form-dialog.tsx:83`), dont l'affichage suit la locale du
**navigateur**, pas `lang="fr"` de la page : le Firefox du poste 2 est en
`en-US` (prouvé par `Accept-Language` dans la trace réseau du 27/09). La
valeur stockée est saine (ISO) ; seule la présentation est américaine.

**Ce qu'il faut.** Ne plus dépendre de la locale navigateur : champ texte
explicite `JJ/MM/AAAA` avec parse/format ISO + validation Zod (jour/mois
valides, 29/02 accepté), en gardant le `datetime` accessible au clavier et
l'indice « Prochain anniversaire » existant.

**Terminé quand** `27/09/1990` saisi à la main est accepté, stocké en ISO,
réaffiché en `JJ/MM/AAAA` à la réouverture, et que les tests du dialogue
couvrent les deux sens + un 29/02.

---

- [ ] **9. Prestataires : « sans type » sans possibilité d'en créer un**

**Qui peut le faire : l'agent, après le comportement exact.**

**État.** Ni l'UI ni la base n'interdisent la création : le bouton
« Gérer les types » est câblé (`prestataires-page.tsx:101`, état vide :159,
dialogue :261) et `provider_types` porte les politiques standard
(`0007:192`, insert `can_write_household`, sans colonne d'auteur). Reste à
voir ce qui se passe réellement : bouton absent à l'écran ? toast d'erreur
à la sauvegarde (texte exact) ? contrainte `provider_types_name_unique`
sur un doublon ?

**Ce qu'il faut d'abord.** Reproduire et noter : le bouton est-il visible ?
Que dit le toast (texte exact) ou le Network (`POST provider_types` → corps) ?

**Terminé quand** un type créé depuis « Gérer les types » est proposé dans
le formulaire prestataire et persiste après rechargement. Le critère exact
sera resserré une fois le comportement connu.

---

## Décidé, sans action

**Les listes de privilèges en dur restent.** Elles ne sont pas redondantes avec
le contrôle exhaustif de `0001` §7 bis : elles affirment une troisième chose
qu'il ne regarde pas — que `service_role` **peut** exécuter. C'est la moitié
positive du contrat, et c'est elle qui fait fonctionner les Edge Functions et
les jobs `pg_cron`. Revoquer `service_role` sur `dispatch_birthday_alerts` ne
casserait aucun test d'ici, et casserait le job de 06 h 40. La raison est
écrite dans le fichier de test.

---

## Validé, pour mémoire

Ce qui est établi et ne se re-discute pas, afin qu'on ne le recherche pas
encore :

- les sept suites SQL passent, contrôle exhaustif des privilèges inclus ;
- la chaîne « base → Edge Function → service Push » est validée **consommation
  comprise**, et reproductible ;
- le nettoyage du script de dispatch est vérifié par comptage, plus muet ;
- l'empreinte de l'abonnement en base correspond à celle du navigateur ;
- le bundle déployé contient l'écouteur `push` ;
- `showNotification` fonctionne depuis la console.
