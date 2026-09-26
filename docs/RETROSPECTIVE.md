# Première mise en œuvre — ce que l'exécution réelle a révélé

> 25 septembre 2026 · 17 migrations · 6 suites SQL · 244 assertions

Bilan de la première campagne d'exécution du schéma sur une vraie base. Tout ce
qui suit a été **constaté sur un serveur**, pas déduit d'une lecture du code.
Cette page sert de point de départ à la suite : les pièges décrits ici sont
ceux qui reviendront, pas ceux qui n'arriveront pas.

---

## 1. Les quatre défauts réels

Aucun n'a été trouvé à la lecture. Tous ont été trouvés par une suite de tests
écrite avant la première exécution, et qui n'avait encore jamais tourné.

### 1.1 Sept tables ouvertes à tous les foyers — le plus grave

`task_assignees`, `routine_assignees`, `event_reminders`, `task_reminders`,
`routine_reminders`, `conversation_members`, `gift_list_shares` avaient bien
leurs politiques RLS, écrites par `0007`. Mais **la RLS n'était pas activée** :
le bloc `alter table … enable row level security` qui suit la création des
tables dans `0003`/`0004` oubliait les tables de jointure et de rappel.

Or `0009` accorde `select, insert, update, delete on all tables in schema
public to authenticated`. Une politique sans RLS est inerte : ces sept tables
étaient donc **intégralement lisibles et modifiables par tout utilisateur
connecté, tous foyers confondus**. Lire les assignataires de toutes les tâches
de toutes les familles ne demandait aucun privilège.

**Empilement de deux erreurs** : l'omission d'un côté, le `GRANT` générique de
l'autre. Chacune est anodine ; ensemble elles ouvrent les données.

### 1.2 Aucune politique sur `expenses` — l'Ardoise inerte

`0007` générait les politiques d'un bloc de 21 tables « foyer plat ». `expenses`
n'y était pas, et n'avait pas de politique écrite à la main non plus. RLS
activée, aucun droit de lecture : **personne** ne pouvait lire ni écrire une
dépense, pas même l'administratrice. Le symptôme côté utilisateur était une
liste vide, pas une erreur.

Sa table fille `expense_participants` recevait bien ses quatre politiques :
c'est la mère qui avait été omise.

### 1.3 Le partage d'une dépense était impossible

`0004` déclarait les unicités de partage en `unique nulls not distinct`, qui
traite `NULL` comme égal à `NULL`. Chaque part de type `membre` porte
`external_participant_id = NULL` : la contrainte externe les collisionnait donc
toutes. **Une dépense ne pouvait être répartie qu'entre un seul membre du
foyer**, plus un participant externe au plus. Même défaut, symétrique, sur
`gift_list_shares` : un partage par membre *ou* par courriel, jamais les deux.

L'intention — « un participant ne peut pas être compté deux fois » — s'exprime
par un index unique **partiel**, pas par une contrainte globale.

### 1.4 Des effets de bord annulés par leur propre exception

`redeem_household_invite_token` faisait, sur un token périmé :

```sql
update public.household_invite_tokens set is_active = false where id = …;
raise exception 'token expiré';
```

Les deux sont dans la **même instruction** : l'exception remonte, la
transaction est annulée, et l'`UPDATE` avec. Cette désactivation n'avait jamais
eu lieu. Le code affichait une intention, pas un comportement.

Non exploitable — chaque échange revérifie `expires_at` — mais le nettoyage réel
appartient à `prune_expired_invite_tokens`, seul endroit où une désactivation
peut être réellement committée.

---

## 2. La famille de pièges

Ce qui relie ces défauts est plus utile qu'eux. Quatre fois, la même erreur de
raisonnement : **supposer un comportement au lieu de le vérifier.**

### 2.1 Une dépendance de la stack, supposée

Les politiques s'appuient sur `auth.uid()`, fonction de la stack et non de notre
code. Sur l'instantané `self-hosted/v0.8.2` :

```sql
select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
```

Elle ne lit que le GUC **scalaire**, jamais le JSON `request.jwt.claims`. Un
harnais qui ne posait que le JSON voyait `uid()` à `NULL` : **aucune politique
ne reconnaissait personne**, et chaque comptage rendait zéro. PostgREST pose les
deux formes, donc la production n'était pas concernée — mais rien ne le
garantissait.

### 2.2 Un outil de test qui mentait sur son nom

`testkit.count()` exécutait la requête et en prenait la **première ligne** : sur
un `select 1 from household_members` couvrant trois membres, elle rendait `1`. Et
`NULL` si la RLS n'en montrait aucun. Toutes les assertions de comptage
comparaient donc une valeur qui n'était pas un compte — et le défaut est resté
invisible parce qu'un `NULL` et un `1` se ressemblent dans un message d'échec.

### 2.3 Des attentes qui ne tenaient pas compte de leur propre arithmétique

L'Ardoise : le test attendait un solde de −20 € pour un membre qui avait avancé
30 € et gérait 30 € de parts, soit exactement zéro. La fonction de calcul était
juste ; c'est le test qui était faux.

L'identique sur un contrat d'API : le test attendait qu'un `p_max_uses => 5000`
soit **refusé**, la fonction le **ramène** à 100. Les deux comportements sont
défendables ; l'écart ne l'est pas.

### 2.4 Le faux vert : des tests qui mesurent l'absence de données

Une assertion négative vaut « l'autorisation a été refusée » — mais elle vaut
aussi « cet acteur n'a **aucun** accès ». Un membre retiré du foyer échoue à
chacune pour la mauvaise raison, et le fichier est vert.

C'est exactement ce qui est arrivé : une section supprimait Bob du foyer, et la
section suivante s'intitulait « Bob, membre ordinaire du foyer A » et vérifiait
qu'il ne pouvait pas s'attribuer `admin`. Sept assertions, sept verts
frauduleux. Seule l'assertion **positive** du bloc — « un membre peut créer une
note dans son foyer » — distinguait les deux, et c'est elle qui a parlé.

**Règle** : avant une série d'assertions négatives, prouver que l'acteur a
accès. Sinon on mesure `count(*) = 0`, ce qui devient une tautologie dès que
quelqu'un a retiré l'accès.

Corollaire : `anon` se prouve par **privilège**, pas par un compte à zéro. Il
n'a aucun droit sur les tables de `public` — le refus est antérieur à la RLS, ce
qui est plus fort, et un `count(*) = 0` présupposerait le droit de lecture.

### 2.5 Le SQL que rien n'exécute

`create function` enregistre un corps sans l'exécuter. Une migration s'applique,
le test de contrat passe, la relecture ne voit rien — et la fonction ne se
révèle qu'à son premier appel, en production, tous les quarts d'heure.

C'est arrivé cinq fois, pour cinq raisons sans rapport :

| Défaut | Erreur à la première exécution |
|---|---|
| CTE nommé `window` | `syntax error at or near "window"` |
| liste de colonnes sur un appel de fonction | `a column definition list is only allowed for functions returning record` |
| tables non qualifiées sous `search_path = ''` | `relation "task_reminders" does not exist` |
| CTE nommé comme la table qu'il sélectionne | `recursive reference to query "tasks" must not appear within a non-recursive CTE` |
| colonne de `returns table` référencée sans qualification | `column reference "user_id" is ambiguous` |

Le troisième est le plus grave, et le plus trompeur : `set search_path = ''` est
la bonne pratique — c'est ce qui empêche un appelant de détourner la fonction via
un objet placé dans un schéma de son choix. Mais un `search_path` vide ne résout
**aucun** nom non qualifié. La fonction source des rappels aurait renvoyé une
erreur quatre fois par heure depuis sa mise en production, et aucun rappel de
tâche, d'événement ou de routine n'aurait été distribué.

Le quatrième mérite une explication, parce qu'il est invisible à la relecture :
dans un CTE, le nom du CTE est résolu **avant** la table du même nom. `join tasks
t` à l'intérieur du CTE `tasks` ne joint pas la table, il joint le CTE à
lui-même. Les défauts deux et trois de cette fonction sont apparus dans
l'ordre — d'abord le nom non qualifié, ensuite l'auto-référence, ensuite
l'ambiguïté — ce qui donne le change : corriger le premier fait apparaître le
suivant, et l'on peut croire à une régression. C'est aussi pourquoi il a fallu
quatre migrations correctives pour une fonction écrite en une fois, et une seule
d'entre ellesrait la cause initiale.

Le cinquième est le plus trompeur de tous, parce que son pire cas est
**silencieux**. `returns table (user_id uuid, …)` ne décrit pas seulement le
résultat : en PL/pgSQL, ces colonnes sont des VARIABLES. Une référence non
qualifiée est un conflit, et ses deux issues sont mauvaises — PostgreSQL refuse
si deux tables fournissent la colonne ; si une seule le fait, plpgsql lui
substitue la variable, qui vaut `NULL` dans une fonction renvoyant un ensemble.
Le second cas ne lève aucune erreur et renvoie des lignes vides. Seule une
assertion sur le **contenu** des lignes l'aurait vu, et il n'y en avait pas.

**Règle** : `search_path = ''`, nom de CTE et colonnes de sortie sont trois
décisions à prendre ensemble, et aucune n'est vérifiable en lisant.
`scripts/check-sql-statique.py` les vérifie sur la définition effective de
chaque fonction.

Corollaire, moins évident : une assertion peut aussi décrire un état que le
code n'a jamais atteint. Deux fois, un test affirmait que le code était
différent de ce qu'il est — une fonction « inchangée » qui ne l'était pas, un
contrat de retour remplacé trois migrations plus tôt. Le test n'était pas
faible, il était **faux**, et il échouait précisément parce qu'il était
exigeant.

### 2.6 Un contrôle qui passe à vide

Écrire un vérificateur et le voir vert ne prouve rien. Le premier jet de
`check-sql-statique.py` a annoncé « aucun défaut » sur un fichier qui en
comportait un. Il en a fallu **quatre** pour qu'il morde, et chaque fois
l'échappatoire était différente :

* il **sautait** le corps `$$ … $$` sans l'analyser — or c'est du plpgsql, et
  c'est là que se trouvait le défaut ;
* il traitait `$$` comme un dollar-quote à tag nommé, si bien que le corps
  n'était jamais ouvert et que le fichier entier passait en état « littéral
  ouvert » ;
* il détectait bien le cas, mais rapportait les **cent lignes** en aval de la
  cause, ce qui revenait à noyer le signal ;
* sur le contrôle suivant, il signalait des alias (`… as body`) et des
  affectations (`debtor_id := …`) — du code qui fonctionne, et que
  `0005_ardoise.sql` exécute avec succès.

Le dernier est le plus instructif. `0005` passait, donc ces fonctions
s'exécutaient réellement : un contrôle qui condamne du code qui marche est
**pire** qu'absence de contrôle, parce qu'on apprend à l'ignorer avant qu'il ne
trouve un vrai défaut. C'est de là qu'est venue la seule restriction qui vaille
la peine : en `language sql`, `returns table` ne déclare que des NOMS de
colonnes, il n'y a pas de variable, donc pas de substitution, donc pas de
risque. Le contrôle ne vise plus que `language plpgsql`.

**Règle** : un contrôle se prouve sur un cas qui **doit** échouer — ici, la
version cassée du fichier rejouée depuis Git, et une fonction piégée. Un
vérificateur qui n'a jamais refusé quelque chose n'a pas encore été exercé ; et
un vérificateur qui refuse du code que les tests couvrent, non plus.

### 2.7 Le test lui-même était le défaut

Les quatre premiers défauts de cette famille étaient dans le schéma. Les trois
suivants étaient dans `0007_push.sql`, qui n'avait encore atteint aucune
assertion de comportement.

* une assertion appelait `due_push_notifications('test', now(), null)` et
  attendait une notification, alors que la fonction refuse un test sans
  destinataire — délibérément, pour que la fonction d'envoi ne devienne pas un
  service de messagerie ;
* une autre comparait `testkit.count(...)` — un `bigint` — à une variable
  déclarée `integer`. `testkit.eq` étant `eq(anyelement, anyelement, text)`,
  PostgreSQL ne trouvait aucune surcharge. L'affectation, elle, accepte
  bigint → integer sans bruit : **le défaut n'existait qu'à la comparaison** ;
* une expression `n.value ->> 'title' || '|' || n.value ->> 'url'` se lisait
  `(((… ->> 'title') || '|') || n.value) ->> 'url'`, parce que `->>` et `||` ont
  la même priorité en PostgreSQL et que l'associativité est à gauche ;
* quatre assertions appelaient `testkit.count('select 1 from … where user_id =
  v_alice')`. Le texte est sur une seule ligne et se lit comme du SQL
  ordinaire, mais `testkit.count` l'exécute par `execute` dans son **propre**
  corps : `v_alice` n'y est pas déclaré, et PostgreSQL répond « column
  "v_alice" does not exist » en nommant une variable déclarée trois lignes plus
  haut. La forme correcte est un sous-requête paramétré,
  `(select count(*) from … where col = v_x)`.

Le premier est le plus grave, et il ne se voyait pas : **l'assertion suivante,
à deux lignes de distance, passait déjà le bon argument.** Les deux disaient la
même chose, dont une version fausse. Une assertion fausse n'est pas moins
fausse qu'une assertion absente.

Le dernier est le plus coûteux, et il ne s'arrête pas à un : le serveur
s'arrête au premier échec, il aurait donc fallu quatre allers-retours pour les
découvrir. C'est ce qui a changé la méthode — voir 2.8.

**Règle** : avant d'écrire une assertion, lire l'implémentation qu'elle vérifie.
Une assertion écrite de mémoire teste l'idée qu'on se fait du code, pas le code.
Et « le test échoue, ce qui est rare » n'est pas un signal : sur un fichier
nouveau, c'est la norme.

### 2.8 Corriger la classe, pas l'instance

Le serveur s'arrête au premier échec d'un fichier. Un défaut par aller-retour,
donc, pour un fichier dont la logique n'avait jamais été exécutée.

Les quatre derniers défauts de `0007_push.sql` étaient la même famille : le test
s'adressait à une fonction en lui passant un contexte qui n'était pas le sien.
Une assertion qui appelle `due_push_notifications('test', …, null)`, une
comparaison `bigint` contre `integer`, une interpolation d'une variable plpgsql
dans une chaîne exécutée ailleurs — trois formulations, un seul soupçon : *le
test suppose un contrat qu'il n'a pas vérifié*.

Les corriger une à une aurait coûté quatre tours. Les chercher toutes d'un coup
en a coûté un : le premier tour a révélé la première, le deuxième en a révélé
trois autres, et le contrôle automatisé les a trouvées avant même le serveur.

**Règle** : devant un défaut, demander non seulement « comment corriger celui-ci »
mais « quelles autres occurrences de la même cause restent dans le dépôt ». La
première question répare, la deuxième évite les quatre tours suivants — et c'est
la seule des deux qui passe à l'échelle.

---

## 3. Les garde-fous désormais en place

Chacun existe parce qu'un défaut l'a rendu nécessaire.

| Garde-fou | Où | Empêche |
|---|---|---|
| RLS activée sur **toutes** les tables de `public` | `0001_schema_contract.sql` | 1.1 |
| Au moins **une politique** sur chaque table | `0001_schema_contract.sql` | 1.2 |
| Index uniques **partiels** vérifiés comme tels | `0015` | 1.3 |
| Nettoyage hors du chemin de l'exception | `0017` | 1.4 |
| `testkit.count()` encapsule et compte vraiment | `_setup.sql` | 2.2 |
| Ancre positive avant les assertions négatives | `0002` § Bob | 2.4 |
| `as_user` pose les deux GUC, comme PostgREST | `_setup.sql` | 2.1 |
| Tables qualifiées, CTE sans auto-référence, littéraux fermés, `returns table` sans référence nue, `testkit.eq` à types égaux, pas de variable plpgsql en SQL dynamique | `check-sql-statique.py` | 2.5, 2.7 |
| Un contrôle se prouve sur un cas qui doit échouer | idem, cas piégés | 2.6 |
| Chercher la **classe** du défaut, pas l'instance | idem | 2.8 |

Deux exceptions documentées au contrôle « au moins une politique » :
`household_invite_tokens`, inatteignable par conception, et
`schema_migrations`, table de journal créée par `migrate.sh` — sous RLS, sans
politique, sans donnée personnelle.

---

## 4. Ce qui n'est toujours pas vérifié

La campagne portait sur le schéma. Restent à prouver en conditions réelles :

- **Le frontend n'a toujours pas parlé à un vrai Supabase.** L'adaptateur
  PostgREST reste emprunté pour la première fois par `scripts/smoke-test.sh`,
  jamais par l'application : celle-ci tourne en mode démo IndexedDB. La chaîne
  serveur est prouvée, pas l'intégration du client.
- **Aucune donnée réelle** : pas de signature OAuth, pas de SMTP. L'inscription
  a fonctionné en `ENABLE_EMAIL_AUTOCONFIRM=true`, c'est-à-dire avec une
  adresse non vérifiée — un réglage à ne pas conserver, une adresse non
  vérifiée servant à partager une liste de cadeaux.
- **Web Push absent**, conformément à l'écart assumé : ni abonnement, ni
  notification navigateur.
- **Les 19 modules n'ont aucun test contre l'API réelle.** La suite e2e
  existante tourne entièrement sur l'adaptateur local.

Chaque ligne est une source de surprises prévisible.

### Ce que le parcours réel a levé

`scripts/smoke-test.sh` a été écrit puis exécuté le 25/09/2026. Il lève la
réserve la plus lourde de cette page : **PostgREST transmet bien le jeton émis
par GoTrue, `auth.uid()` le résout, et la RLS reconnaît l'utilisateur.** Ce que
la suite SQL ne pouvait pas prouver, puisqu'elle pose elle-même les GUC du
jeton : elle vérifiait que les politiques sont correctes, pas que la chaîne JWT
est câblée. Isolement entre foyers, isolation des tâches, émission et échange
d'un token — 17 contrôles, aucun échec.

Les trois Edge Functions ont donc été exécutées, ce qui n'était jamais arrivé.
Elles restent hors du type-checker du frontend, et le parcours n'exerce que
`household-invite` : `expense-settlement` et `generate-routine-occurrences`
n'ont pas été appelées.

Le parcours a aussi corrigé le test lui-même, et pour la même raison que les
fois précédentes : l'assertion était fausse et la production juste. Il attendait
qu'un échange de token fonctionne **sans session** ; la fonction refuse, à dessein
— l'échange exige un `p_user_id`, et le nom affiché vient du profil, jamais du
corps de la requête. L'assertion est devenue sa vérification : un échange anonyme
**doit** être refusé. C'est une propriété de sécurité, elle se vérifie comme
telle.

---

## 5. Méthode

Trois règles ont fait progresser cette campagne, et méritent d'être appliquées
au reste du projet.

1. **Écrire les tests avant la première exécution, pas après.** Les quatre
   défauts sont des oublis d'inventaire : une liste de tables, de politiques, de
   contraintes. Seul un inventaire automatique les attrape.
2. **Ne pas interpréter un message d'échec, mesurer.** « Attendu 1, obtenu
   NULL » ne distingue pas une politique qui filtre, un déclencheur qui annule
   et une ligne qui n'existe pas. Faire porter par l'assertion elle-même l'état
   réel de la décision a résolu en un tour ce que la lecture du code
   n'arrivait pas à trancher.
3. **Un test qui demande ce que le produit ne promet pas est un test à
   réécrire, pas un code à corriger.** Trois fois dans cette campagne,
   l'assertion était fausse et la production juste : une liste de cadeaux
   transférée n'appartient plus à son ancien propriétaire, une empreinte de
   token mal formée doit être refusée, un solde nul doit disparaître de la
   compensation des dettes. Dans les trois cas, la correction a été dans le
   test.
