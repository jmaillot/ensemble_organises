# Benchmark Melimelo → Ensemble & Organisés

> Analyse menée le 21 octobre 2026 sur la branche `feat/melimelo-design`.
> **État au 22 octobre 2026 :** le lot 0 et le lot 1 sont terminés. Le lot 2
> (quick wins) est terminé aussi : export PDF des courses et du calendrier,
> vue Tableau des tâches, verrou de note, Markdown, photo de couverture,
> confettis et libellés d'anniversaire, emoji de catégorie d'événement,
> recherche globale (palette Ctrl/Cmd + K), **import vCard dans Contacts**
> (aperçu avant écriture, doublons marqués, structures ignorées) et
> **recherche d'adresse en ligne** (Edge Function `place-search` sur
> Nominatim, préremplissage du formulaire de lieu). Restent les lots 3
> (nouveaux modules) et 4 (modèle économique).
>
> **Re-vérification du site melimelo.co le 23 octobre 2026** : la page
> d'accueil liste toujours les mêmes 26 modules (la table §4 reste juste),
> mais les **notes de version** (`/releases`) révèlent un **27e module absent
> de l'analyse : Entourage** (v4.1.0, 15 octobre 2026) — il relie le foyer à
> ceux de ses proches : invitation d'un foyer par code ou lien, partage d'une
> recette, d'une adresse ou d'un prestataire que le proche ajoute chez lui en
> un toucher, fil des partages reçus (signalé sur l'accueil et par
> notification), messages inter-foyers, lien public de recette avec aperçu
> dans les messageries. Aucune page publique `/entourage` n'existe encore et
> la page d'accueil ne le compte pas dans ses 26 : le module n'est visible
> que par les notes de version et dans l'application. La même v4.1.0 élargit
> aussi Budget (« reste pour vivre », pots, import OFX/CSV/Excel,
> ventilation, mode Expert), Bien-être (journal alimentaire, calories,
> nutriments, sport, poids) et Bébé (sommeil, couches, minuteurs) — trois
> modules que le benchmark classait « absent » et dont le périmètre réel de
> référence est désormais plus large que ce qui était décrit ici.
>
> **Décision produit du 23 octobre 2026 : quatre modules exclus du
> périmètre, définitivement et sans appel — Entourage, Bébé, Budget,
> Bien-être.** Ils ne seront ni portés, ni planifiés, ni reproposés ; une
> future re-vérification du site ne doit pas les remonter comme manquants.
> Le lot 3 (nouveaux modules) s'en tient à ce que le benchmark §6 liste
> hors ces quatre-là.

## 0. Réponse courte

Oui, la direction visuelle de Melimelo est reproductible sur le projet. Elle ne
demande pas de réécrire l'application : elle se joue sur trois couches.

1. **Les jetons** — fond crème, encre vert sapin, accents beurre/bleu/corail,
   typographie Fraunces + Inter Tight, rayons généreux.
2. **Les composants** — pilules, cartes à 28 px, tuiles pastel, lignes de liste
   aérées, boutons flottants, feuilles modales.
3. **La mise en page** — accueil éditorial, grille d'applications, en-têtes
   immenses, navigation mobile par le bas, rail discret sur desktop.

Le projet a déjà **17 espaces**, dont **16 des 26 modules Melimelo**. Il lui
manque **10 modules** et **l'assistant Melia**. Il a en plus des fonctions que
Melimelo ne met pas en avant : Contacts, vacances scolaires, météo, catalogue
OpenFoodFacts, liens invités, rôle enfant, notifications push, PWA, mode cuisine,
espace voyage complet, ardoises multiples.

Ce qui ne sera **pas** copié : les illustrations 3D, les photos, les textes, la
marque, le découpage Premium et les promesses commerciales. On reprend un
**langage visuel**, pas des assets.

---

## 1. Tester la branche

### 1.1 Mode démonstration — recommandé pour la revue visuelle

Aucun backend, aucun compte, aucune variable d'environnement :

```sh
git checkout feat/melimelo-design
cd app
npm ci
npm run dev
```

Ouvrir <http://localhost:5173/connexion>, puis **« Entrer dans la démonstration »**.
Le foyer Martin est entièrement peuplé (courses, tâches, calendrier, notes,
recettes, ardoise, animaux, voyages, messages…). C'est le meilleur terrain pour
juger une refonte visuelle, parce que chaque écran a du contenu.

### 1.2 Comptes de test — stack Supabase locale

La stack Docker locale doit tourner (`supabase-db`, `supabase-auth`,
`supabase-rest`, `supabase-envoy`, `supabase-functions`). Le script est
idempotent :

```sh
sh scripts/seed-test-accounts.sh
```

Il crée ou réutilise :

| Compte | Mot de passe | Rôle |
|---|---|---|
| `camille@test.local` | `TestFoyer2026!` | admin du foyer « Foyer Martin (test) » |
| `thomas@test.local` | `TestFoyer2026!` | membre |

Puis créer `app/.env.local` avec les deux valeurs publiques affichées par le
script :

```dotenv
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

et relancer `npm run dev`. Le mode démo disparaît tant que ce fichier existe :
c'est le comportement attendu, `.env.local` est ignoré par Git.

> Le conteneur `realtime` n'est pas démarré sur cette machine : la console
> affiche des erreurs WebSocket 503. Les lectures et écritures REST fonctionnent.
> Pour tester le temps réel : `cd supabase-project && sh run.sh start realtime`.

### 1.3 Vérifications avant tout commit

La chaîne du dépôt reste la seule référence :

```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py
sh scripts/test-db.sh          # si Docker
```

---

## 2. La direction visuelle de Melimelo

### 2.1 Palette

Valeurs relevées dans la feuille de style publique (`style-DzDib88Q.css`) :

| Rôle | Hex | Usage observé |
|---|---|---|
| Sapin | `#20413D` | texte principal, boutons pleins, pilules actives, en-têtes |
| Crème | `#F2F0EC` | fond général de l'application |
| Crème chaude | `#F3ECE0` | fonds secondaires, tuiles sable |
| Blanc | `#FFFFFF` | cartes, barres, surfaces surélevées |
| Beurre | `#EFC86E` | accents, badges, courbes, icônes |
| Bleu | `#47A9BA` | accents, catégories, données |
| Corail | `#E37371` | alertes douces, dépenses, accents |
| Sauge | `#5E8782` | texte secondaire, traits |
| Vert profond | `#0E201E` | fonds sombres, cartes budget |

Règles de contraste à tenir :

- Le beurre et le corail **ne portent pas de texte blanc**. Texte sapin sur
  beurre, texte blanc sur corail foncé (`#C25553` environ) ou texte sapin.
- Le sauge `#5E8782` sur crème est limite pour du petit texte : l'utiliser à
  partir de 14 px et en semibold, ou assombrir à `#4C706B`.
- Les états (retard, expiration) ne reposent jamais sur la seule couleur :
  ajouter un libellé (« Aujourd'hui », « + 1 j », « En retard »).

### 2.2 Typographie

| Usage | Police | Détail |
|---|---|---|
| Titres, dates, chiffres clés | **Fraunces** (`ui-serif`) | graisses 500–700, `letter-spacing: -0.03em` |
| Interface, listes, boutons | **Inter Tight** | 400–700, très lisible en petit |
| Chiffres tabulaires | Inter Tight | `font-variant-numeric: tabular-nums` |

Tailles cibles :

- Titre d'écran : `clamp(40px, 5vw, 64px)`, Fraunces, interligne 1,02.
- Titre de section : 24–28 px, Fraunces.
- Corps : 15–16 px, Inter Tight, interligne 1,45.
- Libellé de ligne : 16–17 px semibold.
- Méta : 12–13 px, sauge.
- Micro-libellé : 11 px, majuscules, `letter-spacing: .08em`.

Le projet ne charge aucune police : il déclare `Söhne`/`Avenir Next`, absentes,
et retombe sur la police système. Pour tenir la promesse PWA hors ligne, ajouter
`@fontsource-variable/fraunces` et `@fontsource-variable/inter-tight` plutôt
qu'un lien Google Fonts.

### 2.3 Formes, profondeur, rythme

- Rayon de base Melimelo : `.9rem`. En pratique : **cartes 24–28 px**,
  **pilules 999 px**, **feuilles 32 px en haut**, **vignettes 16–20 px**.
- Bordures : 1 px `rgba(32, 65, 61, .10)`, jamais de gris bleuté.
- Ombres : très basses, teintées vert, `0 1px 0 rgba(32,65,61,.04)` +
  `0 12px 30px rgba(32,65,61,.06)` pour les éléments flottants.
- Fond : crème uni, pas de dégradé sur les pages. Les dégradés verts sont
  réservés aux cartes héro (budget, ardoise, voyage).
- Densité : les listes respirent (lignes de 64–72 px), les cartes ont 20–24 px
  de padding, les sections 32–48 px d'écart.
- Iconographie : traits fins, 20–24 px, plus **emoji** pour les catégories et
  les objets du quotidien. Les emoji ne remplacent pas les libellés.

### 2.4 Composants signature

1. **Barre supérieure** : bouton rond « maison », pilule foyer avec photo de
   groupe, pastille Melia, cloche, avatar. Hauteur 56–64 px.
2. **Pilules d'onglets** : actives en sapin plein, inactives en blanc bordé,
   hauteur 40–44 px, défilement horizontal sur mobile.
3. **Grille « Mes applications »** : 3 colonnes sur mobile, 4–6 sur desktop,
   tuiles pastel avec une illustration/emoji, le nom en gras et un compteur.
4. **Lignes de liste** : vignette 44 px, titre 17 px, sous-titre 13 px,
   valeur à droite, séparateur 1 px très clair.
5. **Cartes héro** : fond vert profond, texte crème, anneau ou jauge, chiffres
   en Fraunces.
6. **Bouton flottant** : cercle sapin de 56 px, icône blanche, en bas à droite.
7. **Feuille modale** : coins 32 px, poignée, fond crème, actions en bas.

### 2.5 Les cinq décisions qui produisent l'effet Melimelo

1. **Crème au lieu de blanc** : le fond général passe de `#F8FAFB` à `#F2F0EC`.
2. **Fraunces sur les titres** : le contraste serif/sans fait 70 % de l'identité.
3. **Tuiles pastel** : chaque module a une couleur de fond et un objet, au lieu
   d'une photo sombre uniforme.
4. **Tout en pilules** : boutons, onglets, filtres, badges. Les rectangles à
   coins de 11 px disparaissent.
5. **Emoji + chiffres** : les listes gagnent un repère visuel immédiat.

### 2.6 Adaptation au desktop

Melimelo est une application mobile (captures 430 px). Le projet est une PWA
utilisée aussi sur ordinateur. L'adaptation proposée :

- **Desktop ≥ 1024 px** : rail gauche crème de 248 px, logo en Fraunces, entrée
  active en pilule sapin ; contenu centré max. 1180 px ; grille de modules en
  4 colonnes ; panneau latéral droit conservé pour l'ardoise/l'activité.
- **Tablette 640–1023 px** : rail réduit à 76 px (icônes), grille 3 colonnes.
- **Mobile < 640 px** : barre supérieure + **barre de navigation basse** à
  5 entrées (Maison, Tâches, Courses, Calendrier, Plus). « Plus » ouvre une
  feuille avec les 13 autres espaces. Le bouton flottant reste contextuel.
- Le tiroir mobile actuel est conservé pour les réglages, mais ne porte plus la
  navigation principale.

---

## 3. Ce que le projet possède déjà

17 espaces, tous fonctionnels en démo et branchés sur Supabase en mode connecté.

| Espace | Route | Forces actuelles | Maturité |
|---|---|---|---|
| Maison | `/accueil` | salutation, point du jour, 5 widgets réordonnables, grille des espaces, activité, ardoise, anniversaires | avancé |
| Calendrier | `/calendrier` | vues Mois/Semaine/Jour/Liste, événements, rappels, catégories, couleurs membre, calendriers perso/foyer, jours fériés + vacances scolaires | avancé |
| Tâches | `/taches` | échéances, assignés, priorités, dossiers, rappels, glisser-déposer, tri, filtres | avancé |
| Notes | `/notes` | dossiers, catégories, photos, recherche, tri par modification | solide |
| Courses | `/courses` | listes multiples, articles, quantités/unités, catégories, catalogue produit, scan code-barres, OpenFoodFacts | avancé |
| Routines | `/routines` | RRULE, occurrences, assignés, historique, dossiers, rappels, série | avancé |
| Recettes | `/recettes` | fiches, ingrédients, étapes photo, favoris, recherche, partage invité, mode cuisine + wake lock, impression | avancé |
| Ardoise | `/ardoise` | ardoises multiples, dépenses, participants, répartition, règlement, graphique, invités par code | avancé |
| Cadeaux | `/cadeaux` | listes, idées, contacts, privé/foyer/partagé, réservation par un proche, partage | avancé |
| Anniversaires | `/anniversaires` | liste/calendrier, âge, couleurs, miroir des contacts | solide |
| Contacts | `/contacts` | carnet famille/proches, fiches | solide |
| Animaux | `/animaux` | fiches, vaccins, traitements, produits, échéances, photos, pièces jointes | avancé |
| Prestataires | `/prestataires` | types personnalisables, fiches, appel, itinéraire, pièces jointes | solide |
| Fidélité | `/fidelite` | cartes, code-barres/QR, catégories, scan | solide |
| Adresses | `/adresses` | lieux, 13 types, note 1–5, visité, photo, carte, filtres | solide |
| Cercle | `/cercle` | fil du foyer, publications, photos, commentaires, réactions | solide |
| Voyages | `/voyages` | espace projet, onglets, budget, tâches, notes, adresses, courses, invités | avancé |
| Messages | `/messages` | conversations, groupes, archives, images, notifications push | avancé |
| Paramètres | `/parametres` | profil, foyer, invitations, notifications, application | avancé |

**Total : 17 espaces + paramètres.** Melimelo en revendique 26 ; 16 sont communs,
Contacts est un extra.

### 3.1 Les extras à ne pas perdre

- **Contacts** : Melimelo n'a pas de carnet de contacts autonome.
- **Vacances scolaires** : zones A/B/C, jours fériés.
- **Météo** : widget Open-Meteo, ville du profil.
- **OpenFoodFacts** : catalogue produits et scan.
- **Liens invités** : ardoise, cadeau, voyage, recette — sans compte.
- **Rôle enfant** : masquage de 5 modules sensibles.
- **Push** : abonnements Web Push, rappels, notifications.
- **PWA** : installation, service worker, mode cuisine avec wake lock.
- **Voyage** : espace complet avec budget et invités, au-delà d'une simple fiche.
- **Multi-ardoises** : plusieurs budgets partagés, pas une seule cagnotte.

---

## 4. Comparaison avec les 26 modules Melimelo

Légende : ✅ parité fonctionnelle · 🟡 partiel · ❌ absent.

| # | Module Melimelo | Statut | Ce que nous avons | Manques principaux |
|---|---|---|---|---|
| 1 | Au frigo | ❌ | — | tout le module |
| 2 | Recettes | 🟡 | fiches, ingrédients, étapes, favoris, partage, mode cuisine, impression | communauté, import web, mise à l'échelle des portions, nutrition, lien frigo |
| 3 | Courses | 🟡 | listes, catalogue, scan, catégories, ajout rapide | export PDF, lien menu/frigo, tri par rayon paramétrable |
| 4 | Calendrier | 🟡 | 4 vues, rappels, catégories, membres, vacances, jours fériés | récurrence, sync Google/Outlook/iCloud, export PDF, widget, types emoji, anniversaires intégrés |
| 5 | Tâches | 🟡 | échéances, assignés, priorités, dossiers, rappels | kanban, dictée vocale, catégories |
| 6 | Menu | ❌ | — | tout le module |
| 7 | Cadeaux | ✅ | listes, idées, partage, réservation, privé | — |
| 8 | Anniversaires | 🟡 | liste/calendrier, âge, contacts | import téléphone, libellés, confettis |
| 9 | Notes | 🟡 | dossiers, photos, recherche | verrou/privé, texte riche, photo de couverture, collage intelligent |
| 10 | Routines | ✅ | RRULE, assignés, historique, rappels, série | — |
| 11 | Animaux | ✅ | fiches, vaccins, traitements, produits, échéances | — |
| 12 | Voyage | ✅ | espace projet, onglets, budget, invités, tâches, notes | — |
| 13 | Ordures | ❌ | — | tout le module |
| 14 | Ardoise | ✅ | multi-ardoises, invités, règlement, graphique | — |
| 15 | Budget | ❌ | — | tout le module |
| 16 | Extérieur | ❌ | — | tout le module |
| 17 | Bien-être | ❌ | — | tout le module |
| 18 | Adresses | 🟡 | 13 types, note, visité, photo, carte | recherche en ligne, 14e type |
| 19 | Documents | ❌ | — | tout le module |
| 20 | Prestataires | ✅ | types, fiches, appel, itinéraire | import téléphone |
| 21 | Fidélité | ✅ | cartes, codes, catégories | — |
| 22 | Véhicules | ❌ | — | tout le module |
| 23 | Cave à vin | ❌ | — | tout le module |
| 24 | Cercles | 🟡 | un fil de foyer, posts, médias, réactions | cercles multiples, codes d'invitation |
| 25 | Bébé | ❌ | — | tout le module |
| 26 | Messages | ✅ | conversations, groupes, archives, images, push | — |
| — | Melia (assistant) | ❌ | — | tout l'assistant |

**Bilan : 16 modules couverts sur 26, dont 8 à parité et 8 partiels.
10 modules absents + Melia.**

---

## 5. Ajouts intéressants sans créer de module

Ces chantiers réutilisent les données existantes. Ils sont classés par rapport
valeur/effort.

### Priorité 1 — forts en usage, effort faible

| Ajout | Pourquoi | Effort |
|---|---|---|
| **Export PDF des courses et du calendrier** | Melimelo le fait ; utile pour imprimer la liste ou le planning de la semaine. Réutiliser le CSS d'impression des recettes. | S (1–2 j) |
| **Vue kanban des tâches** | Le statut `a_faire / en_cours / fait` existe déjà. Colonnes + glisser-déposer, aucun changement SQL. | S (2–3 j) |
| **Verrouiller / rendre privée une note** | Fort besoin familial. Ajoute `is_private` + RLS auteur uniquement. | S/M (2–4 j) |
| **Texte riche en Markdown** | Les notes sont du texte brut. Éditeur Markdown + aperçu, sans changer le schéma. | S (2–3 j) |
| **Photo de couverture des notes** | Le stockage et les photos existent déjà dans Notes. | S (1 j) |
| **Libellés et confettis d'anniversaire** | Deux détails très visibles, peu coûteux. Confettis uniquement le jour J, avec `prefers-reduced-motion`. | S (1 j) |
| **Emoji par catégorie d'événement** | Melimelo s'en sert partout. Table de correspondance, aucun schéma. | S (1 j) |
| **Recherche globale (Ctrl/Cmd + K)** | 17 espaces, la navigation devient le problème principal. Palette de commandes + résultats groupés. | M (3–5 j) |
| **Import de contacts (vCard)** | Melimelo le fait pour les anniversaires et prestataires. | S (1–2 j) |
| **Recherche d'adresse en ligne** | Nominatim/OSM, ou une Edge Function `place-search` sur le modèle de `off-search`. | S (1–2 j) |

### Priorité 2 — profondeur fonctionnelle

| Ajout | Pourquoi | Effort |
|---|---|---|
| **Récurrence des événements** | RRULE est déjà maîtrisé pour les routines. Ajouter `recurrence_rule` à `events` + génération d'occurrences. | M (4–6 j) |
| **Abonnement ICS en lecture** | Premier pas vers Google/Outlook/iCloud sans OAuth : une URL `webcal` par calendrier, rafraîchie par une Edge Function. | M (4–6 j) |
| **Sync bidirectionnelle Google/Microsoft** | OAuth, quotas, conflits, webhooks. Chantier à part, à ne pas promettre trop vite. | L (3–4 sem.) |
| **Lien menu → courses** | Génération de la liste à partir des repas de la semaine, avec dédoublonnage. | M (3–5 j) |
| **Lien frigo → courses** | « Il manque » → ajout à la liste ; « bientôt périmé » → suggestion de recette. | M (3–5 j) |
| **Import de recette par URL** | Lire le JSON-LD `Recipe` de la page ; repli manuel. | M (3–5 j) |
| **Mise à l'échelle des portions** | Les ingrédients ont déjà quantité + unité. Règle de trois + arrondis. | S (1–2 j) |
| **Mode hors ligne en lecture** | Le projet l'a retiré en phase 09 ; le réintroduire comme cache de lecture seulement, pas comme écriture différée. | M (5–8 j) |
| **Widget d'écran d'accueil** | Impossible en PWA pure sur iOS/Android. Alternative : raccourcis PWA + widget HTML dans l'app. À trancher. | L / hors périmètre |

### Priorité 3 — confort et différenciation

- **Dictée vocale** sur la création de tâche/course (Web Speech API, repli clavier).
- **Scan de ticket** pour l'ardoise ou le budget (OCR + confirmation manuelle).
- **Streaks de routines** déjà amorcés : vue calendrier + badges.
- **Recherche dans les messages** et les commentaires.
- **Mode sombre** : Melimelo n'en a pas ; le projet non plus. À ne pas ouvrir
  tant que la palette claire n'est pas stabilisée.
- **Accessibilité** : navigation clavier complète, focus visible, annonces live
  sur les listes, tests axe sur les parcours clés.

---

## 6. Les 10 sections absentes + Melia

Chaque fiche donne la promesse, le MVP, les données et l'effort. Les modèles sont
des propositions : les migrations feront foi, avec `household_id`, RLS et tests
négatifs selon AGENTS.md §2.6.

### 6.1 Au frigo — `❌`

**Promesse.** Savoir ce qu'il y a dans le frigo, le congélateur et le
garde-manger, et ce qui va périmer.

**MVP.**
- Trois emplacements : réfrigérateur, congélateur, garde-manger.
- Article : nom, catégorie, quantité, unité, date de péremption, photo, note.
- Tri par date, code couleur, recherche, filtre « bientôt périmé ».
- Ajout par scan code-barres (réutiliser `BarcodeDetector` + OpenFoodFacts).
- Notification à J-2 / J-0.

**Données.** `pantry_items` (`id`, `household_id`, `name`, `category`,
`quantity`, `unit`, `location`, `expires_on`, `opened_on`, `photo_url`,
`notes`, `created_by`) + éventuellement `pantry_events` pour l'historique.

**Effort.** M (5–8 j). **Dépendances.** Aucune ; synergie forte avec Courses,
Recettes et Menu.

### 6.2 Menu — `❌`

**Promesse.** Planifier les repas de la semaine et générer les courses.

**MVP.**
- Semaine, plusieurs repas par jour, texte libre ou recette.
- Glisser-déposer, édition en deux taps.
- Génération de la liste de courses (ingrédients × portions, dédoublonnage).
- Partage foyer ; « qui mange » par repas.

**Données.** `meal_plans` (`id`, `household_id`, `week_start`),
`meal_entries` (`id`, `plan_id`, `date`, `slot`, `recipe_id`, `free_text`,
`servings`, `member_ids`).

**Effort.** M (5–8 j). **Dépendances.** Recettes et Courses.

### 6.3 Ordures — `❌`

**Promesse.** Ne plus rater la sortie des poubelles.

**MVP.**
- Calendrier mensuel, 5 types (ordures, recyclage, verre, compost, encombrants).
- Séries récurrentes + ajout manuel + modification d'une occurrence ou de la série.
- Rappel la veille.

**Données.** `waste_schedules` (`id`, `household_id`, `type`, `recurrence_rule`,
`starts_on`, `ends_on`), `waste_collections` (`id`, `schedule_id`, `date`,
`status`).

**Effort.** S/M (2–4 j). **Dépendances.** RRULE, notifications.

### 6.4 Budget — `❌`

**Promesse.** Voir où part l'argent du foyer, sans tableur.

**MVP.**
- Comptes, catégories, transactions, revenus.
- Vue mensuelle/annuelle, anneau de dépenses, « reste à vivre ».
- Budgets par catégorie et épargne prévue.
- Import CSV/OFX ; sync bancaire en option later.

**Données.** `budget_accounts`, `budget_categories`, `budget_transactions`,
`budget_recurrences`, `budget_envelopes`. Réutiliser les membres et les
prestataires.

**Effort.** L (10–15 j). **Dépendances.** Aucune, mais c'est le module le plus
lourd ; le découper en deux lots (saisie + analyse, puis import).

### 6.5 Extérieur — `❌`

**Promesse.** Suivre le jardin et la piscine.

**MVP.**
- Onglets Jardin / Piscine.
- Plantes : nom, photo, emplacement, date de plantation, arrosage, traitement.
- Piscine : lectures (pH, chlore, température), actions (filtration, produit),
  historique daté.
- Rappels.

**Données.** `garden_plants`, `garden_care_actions`, `pool_readings`,
`pool_treatments`.

**Effort.** M (5–8 j). **Dépendances.** Aucune.

### 6.6 Bien-être — `❌`

**Promesse.** Un suivi **strictement privé** par membre.

**MVP.**
- Poids, calories, journal alimentaire, macros, hydratation, jeûne, séances.
- Courbes et objectifs.
- Aucune visibilité foyer : RLS sur `member_id = auth.uid()` uniquement.
- Export/suppression des données.

**Données.** `wellness_profiles`, `weight_entries`, `meal_logs`, `workouts`,
`water_logs`. Chaque table porte `member_id` et une politique personnelle.

**Effort.** M/L (7–10 j). **Dépendances.** Aucune ; point juridique sur les
données de santé à cadrer.

### 6.7 Documents — `❌`

**Promesse.** Les papiers du foyer, accessibles partout.

**MVP.**
- Dossiers colorés, upload photo/PDF, viewer intégré.
- Nom, date d'expiration, note, partage par e-mail/message.
- Recherche par nom.

**Données.** `document_folders`, `documents` (`id`, `household_id`, `folder_id`,
`name`, `mime`, `size`, `storage_path`, `expires_on`, `created_by`). Bucket
privé + politiques par foyer.

**Effort.** M (4–6 j). **Dépendances.** Storage déjà en place.

### 6.8 Véhicules — `❌`

**Promesse.** Le carnet d'entretien des véhicules du foyer.

**MVP.**
- Fiche véhicule : marque, modèle, plaque, année, photo, kilométrage.
- Contrôle technique : date, échéance, alerte.
- Entretiens : date, type, kilométrage, coût, prestataire, prochaine échéance.
- Historique et recherche.

**Données.** `vehicles`, `vehicle_services`, `vehicle_documents`.

**Effort.** S/M (3–5 j). **Dépendances.** Prestataires pour le garage.

### 6.9 Cave à vin — `❌`

**Promesse.** Savoir ce qu'on a en cave et quoi ouvrir.

**MVP.**
- Cave(s), bouteilles : domaine, cuvée, millésime, région, appellation, format,
  quantité, emplacement, prix, photo, notes.
- Entrées/sorties, historique, « à boire avant ».
- Recherche.

**Données.** `wine_cellars`, `wine_bottles`, `wine_movements`.

**Effort.** M (4–6 j). **Dépendances.** Aucune.

### 6.10 Bébé — `❌`

**Promesse.** Le suivi des premiers mois, partagé avec l'autre parent.

**MVP.**
- Trois onglets : repas, sommeil, couches.
- Chronomètre d'allaitement, biberons, diversification, allergènes testés.
- Courbe de croissance, rendez-vous.
- Ajout d'un profil bébé au foyer, partage avec un professionnel.

**Données.** `baby_profiles`, `baby_feeding_sessions`, `baby_sleep_sessions`,
`baby_diapers`, `baby_growth`.

**Effort.** M (6–9 j). **Dépendances.** Membres, notifications.

### 6.11 Melia — `❌`

**Promesse.** Un assistant qui agit dans les modules, pas un chatbot décoratif.

**MVP réaliste en trois paliers.**
1. **Lecture** : « qu'est-ce qui est prévu demain ? », « qu'est-ce qui périme ? ».
2. **Proposition** : créer une recette, ajouter des courses, planifier un repas —
   toujours avec confirmation avant écriture.
3. **Actions** : rappels, déplacements, résumés hebdomadaires.

**Données.** `ai_conversations`, `ai_messages`, `ai_tool_calls` ; Edge Function
`melia` avec un fournisseur LLM, clé côté serveur, journal d'audit, plafond de
coût. Aucune donnée du foyer utilisée pour l'entraînement.

**Effort.** L (10–20 j) + coût récurrent. **Décision requise** : fournisseur,
modèle, budget, rétention. C'est le seul module qui ne peut pas être “juste” un
nouvel écran.

---

## 7. Architecture cible

### 7.1 Shell et navigation

- `app-shell.tsx` garde son rôle, mais la barre latérale devient crème et les
  entrées deviennent des pilules.
- Ajouter `MobileTabBar` (5 entrées) et `AllSpacesSheet` (les 13 autres).
- Le catalogue `lib/modules.ts` reste la source unique : chaque entrée porte
  désormais `tint` (pastel) et `emoji`/`illustration`.
- Les routes ne changent pas. Les nouveaux modules suivent `/frigo`, `/menu`,
  `/budget`, `/documents`, `/exterieur`, `/vehicules`, `/ordures`, `/cave`,
  `/bebe`, `/bien-etre`.

### 7.2 Design system

Fichier `app/src/styles/app.css` : remplacer les valeurs, garder les **noms
sémantiques** (`bg`, `surface`, `fg`, `muted`, `accent`, `accent-soft`,
`coral`, `amber`). Une centaine de composants utilisent déjà ces classes ;
changer les valeurs suffit pour 70 % de l'effet.

Ajouts :

```css
--color-sapin: #20413d;
--color-cream: #f2f0ec;
--color-cream-2: #f3ece0;
--color-butter: #efc86e;
--color-sky: #47a9ba;
--color-sage: #5e8782;
--radius-card: 28px;
--radius-pill: 999px;
--radius-sheet: 32px;
--font-display: 'Fraunces Variable', ui-serif, Georgia, serif;
--font-body: 'Inter Tight Variable', Inter, system-ui, sans-serif;
```

Composants à créer ou retoucher :

- `PageHeader` (sur-titre + titre Fraunces + sous-titre + actions).
- `AppTile` (tuile pastel avec illustration, compteur).
- `PillTabs` (onglets défilants).
- `ListRow` (vignette + titre + méta + valeur).
- `HeroCard` (fond vert, chiffre, jauge).
- `Fab` (bouton flottant).
- `Sheet` (feuille mobile).
- `EmptyState` (déjà là, à rechausser en crème/Fraunces).
- `Button` : primaire en pilule sapin, secondaire en pilule blanche bordée.

### 7.3 Conventions pour les nouveaux modules

Chaque module reprend la structure existante : `api.ts`, `types.ts`,
`components/`, `hooks/`, page. Les nouveaux modules doivent aussi fournir :
migration SQL + test SQL négatif, seed démo, route lazy, entrée de catalogue,
tests Vitest du hook et de la page, e2e du parcours principal.

---

## 8. Feuille de route proposée

### Lot 0 — Fondations visuelles (2–3 j)

**Fait le 21 octobre 2026 :** polices, jetons, `Button`, `ModuleHeader`,
`Panel`, shell (rail crème + barre mobile) et pilote **Courses**. Les points 3
et 4 restent partiels : les primitives nommées ci-dessous n'existent pas encore
comme fichiers dédiés.

1. Ajouter les polices auto-hébergées.
2. Remplacer les jetons de couleur, rayon, ombre.
3. Refaire `Button`, `PageHeader`, `Card`, `PillTabs`, `ListRow`, `EmptyState`.
4. Adapter le shell : rail crème, entrées pilules, barre mobile basse.
5. Page pilote : **Courses**, parce qu'elle contient liste, scan, formulaire et
   état vide.

**Critère de sortie.** Captures Playwright à 390 px et 1440 px ; contraste AA ;
aucune régression sur `npm run typecheck && npm test && npm run build`.

### Lot 1 — Restyle des 17 espaces (8–12 j)

Ordre : Accueil, Calendrier, Tâches, Notes, Courses, Routines, Recettes,
Ardoise, Cadeaux, Anniversaires, Contacts, Animaux, Prestataires, Fidélité,
Adresses, Cercle, Voyages, Messages, Paramètres.

**Fait le 21 octobre 2026 :** les dix-sept espaces ont reçu la passe — quinze
écran par écran, Accueil et Paramètres de façon ciblée — plus les deux
primitives qui les portent (lignes de liste et onglets). Calendrier (numéros de
semaine ISO, agenda en lignes aérées avec pastilles typées, filtres en une
rangée défilante sur mobile, zone scolaire rapprochée de son explication), Tâches
(lignes de 64 px, case 22 px, priorité en pilule, actions révélées au survol et
toujours visibles au tactile), Routines (cartes du jour en 20 px, série en
pastille, listes à lignes survolables, historique en lignes rondes), Recettes
(voile dégradé dédié pour que le titre reste lisible sur les photos), Ardoise
(tuile sauge et montants en Fraunces), Cadeaux, Anniversaires, Contacts,
Animaux, Prestataires, Fidélité, Adresses, Cercle, Voyages, Messages et Notes.
Accueil et Paramètres ont reçu une passe ciblée : cartes de widgets à 20–22 px,
fiches d'invitation à 20 px, métadonnées remontées de 10 à 11 px.

Un détail du Cercle a été corrigé après essai : les commandes d'un commentaire
(modifier, supprimer) étaient posées sous le texte et coupaient la lecture du
fil. Elles tiennent maintenant la ligne du commentaire, à droite, en 28 px,
effacées tant qu'on ne survole pas la ligne (ou ne tabule pas dedans) et
toujours visibles au tactile.

Deux décisions de fond ont été prises en chemin :

- **Onglets en pilules** (`TabsList`/`TabsTrigger` partagés) à la place des
  soulignements : un seul état actif lisible, `bg-accent` sur `text-surface`,
  et le même geste dans Animaux, Anniversaires et Paramètres.
- **Actions de ligne au survol** : 32 px, rondes, bordées, visibles au clavier
  (`focus-visible`) et toujours affichées sous 650 px, où le survol n'existe
  pas. Une action destructive garde sa confirmation.

Les métriques de Voyages sont alignées sur `MetricRow` (valeur Fraunces,
libellé en sur-titre) pour que le même chiffre se lise pareil partout.

**Critère de sortie.** Tous les écrans lisibles à 390 px, 768 px et 1440 px ;
zéro débordement horizontal ; parcours clavier sur les 5 écrans principaux.
Mesuré sur les 19 routes à 390, 768 et 1440 px : aucun `scrollWidth` supérieur
à la fenêtre. Captures conservées à 390 et 1440 px dans `shots/` (non versionné).

Pour chaque écran : en-tête Fraunces, pilules d'onglets, cartes 28 px, lignes
aérées, tuiles pastel. Aucun changement de données.

**Critère de sortie.** Tous les écrans lisibles à 390 px, 768 px et 1440 px ;
zéro débordement horizontal ; parcours clavier sur les 5 écrans principaux.

### Lot 2 — Quick wins (6–8 j)

PDF courses/calendrier, kanban, verrou de note, Markdown, couverture de note,
libellés/confettis, emoji d'événement, recherche globale, import vCard, recherche
d'adresse.

**Fait, intégralement, entre le 21 et le 22 octobre 2026.** Les dix items sont
livrés ; en complément du plan, quelques-uns ont été poussés plus loin que le
minimum : la palette de recherche couvre les espaces restants et ouvre les
fiches, l'import vCard montre chaque fiche avant d'écrire (doublons probables
marqués et écartés par défaut, structures comptées), et la recherche d'adresse
passe par une Edge Function dédiée (`place-search`, Nominatim) qui borne le
rythme et met en cache, conformément à la politique d'usage d'OSM.

### Lot 3 — Nouveaux modules, par vagues

| Vague | Modules | Pourquoi cet ordre |
|---|---|---|
| 3.1 | Menu + Frigo | synergie immédiate avec Recettes et Courses ; démontre la valeur |
| 3.2 | Budget + Documents | deux modules très demandés, indépendants |
| 3.3 | Ordures + Véhicules | petits modules, forte fréquence d'usage |
| 3.4 | Extérieur + Cave à vin | niches, plus faciles une fois le design stabilisé |
| 3.5 | Bébé + Bien-être | données sensibles, RLS et consentement à soigner |
| 3.6 | Melia | dépend d'une décision fournisseur et d'un budget |

### Lot 4 — Modèle économique (si décidé)

Entitlements, quotas, essai, facturation. **À ne pas construire maintenant** :
Melimelo gate 5 modules et plafonne 8 autres, mais le projet n'a pas encore
arrêté de modèle. Le code peut rester ouvert.

---

## 9. Décisions à confirmer

1. **Périmètre visuel** : identité complète (tokens + composants + shell) ou
   simple « reskin » de la palette ? Je recommande l'identité complète, sinon
   l'effet Melimelo ne tient pas.
2. **Mobile** : ajouter une barre de navigation basse, ou conserver le tiroir ?
   Je recommande la barre basse + feuille « Tous les espaces ».
3. **Tuiles** : garder les photos actuelles teintées, ou passer à des tuiles
   pastel avec emoji/illustrations ? Je recommande les tuiles pastel pour
   l'accueil, et garder les photos pour les recettes et les voyages.
4. **Polices** : Fraunces + Inter Tight auto-hébergées (recommandé) ou polices
   système pour éviter 2 dépendances ?
5. **Premier module pilote** : Courses (recommandé) ou Accueil ?
6. **Nouveaux modules** : commencer par Menu + Frigo, ou Budget d'abord ?
7. **Melia** : fournisseur LLM, budget mensuel, rétention des conversations.
8. **Accès à `app.melimelo.co`** : un compte de test permettrait de vérifier les
   écrans internes (réglages, onboarding, premium, partage) et d'ajuster ce plan.
   À défaut, cette analyse s'appuie sur les pages publiques et les captures
   officielles.

---

## 10. Definition of Done d'une phase design

- [ ] `npm run typecheck`, `npm test`, `npm run build` verts.
- [ ] `npm run test:e2e` vert sur les parcours touchés.
- [ ] Captures 390 × 844 et 1440 × 900 pour chaque écran modifié.
- [ ] Contraste AA vérifié sur texte, boutons, états et pilules.
- [ ] Cibles tactiles ≥ 44 px ; focus visible ; navigation clavier.
- [ ] `prefers-reduced-motion` respecté par les animations ajoutées.
- [ ] Aucun `transition: all`, aucun `scale(0)`, aucune directive de linter.
- [ ] Aucune régression des états vides, chargement, erreur.
- [ ] Si SQL : `check-sql-statique.py` et `test-db.sh` verts, test négatif RLS.
