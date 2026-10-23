---
target: interface app (app/src) comparée à melimelo.co
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 6
target_identity: "file:/home/jmaillot/Projects/ensemble_organises/app/src (interface app, comparée à melimelo.co)"
timestamp: 2026-10-23T14-52-20Z
slug: app-src-interface-app-compar-e-melimelo-co
---
# Critique + audit UI — Ensemble & Organisés vs melimelo.co

Method: dual-agent (A: ses_e96c57a57ffeLukuJeJmF10g3F · B: ses_e96c57a56ffevwBYErQc3D4CRl)
Preuves de référence : REA sur https://melimelo.co (ev_044a7c5f…, CSS 108 807 o, Fraunces italique + Inter Tight) + captures Playwright de l'app (8 desktop 1440×900, 2 mobile 390×844) + détecteur impeccable (app/src).

## Verdict de spécificité design

**À moitié authorée.** Le socle est fidèle et discipliné (crème `#f2f0ec`, sapin `#20413d` = valeurs mesurées du vrai site ; pilules ; grands rayons ; eyebrows ; chiffres Fraunces). Mais les gestes de signature sont repris à contresens dans l'emploi :

- **Les titres géants sont appliqués aux pages-outils** : chez melimelo, « Tout ce qui fait tourner ton foyer. » est un héro de vente ; ici « Courses » en Fraunces ~62 px est peint au-dessus de chaque page de travail, suivi de 4 cartes de stats et de 5-6 actions avant la première liste réelle (~510 px de défilement sur mobile Courses).
- **Le corail** : chez melimelo, accent rare de joie (7 occurrences dans tout leur CSS). Ici, c'est presque exclusivement la couleur de l'erreur et de la destruction (ErrorState, toasts, bouton danger, corbeilles, retards), avec une valeur dérivée plus sourde (`#d95f5c` vs `#e37371`). L'accent tendre du benchmark dit « cassé » trente fois par écran de code.
- **Le beurre** : chez melimelo, LE mot italique du héro. Ici, réduit à un point décoratif de 16 px sur les chips d'état vide.
- **L'italique Fraunces est absent** : `@fontsource-variable/fraunces` romain uniquement, aucun `font-style: italic` sur du display — le geste typographique central du vrai site n'a pas été embarqué.
- **Le héro plein sapin n'existe pas sur l'accueil**, alors que `hero-card.tsx` prouve que l'app sait le faire (carte « 0 liste » de Courses).
- **Le vouvoiement** (« votre foyer ») contredit le positionnement familial tutoyé par melimelo.

Si on retire kickers, chiffres Fraunces et point corail de « Bonjour Camille. », il reste un layout dashboard-admin interchangeable — la patte est dans les détails, pas dans la composition.

**Scan déterministe (détecteur impeccable, app/src)** : 4 alertes « broken-image », **toutes des faux positifs** — elles visent des fichiers de test `*.test.tsx` dont trois sont des gardes-fous anti-image-cassée (guest-media-contract.test.ts, recipe-cuisine-photo.test.tsx). 0 alerte confirmée en production. Le sous-agent B relève en revanche des défauts réels par lecture de code (voir audit).

## Design Health Score (Nielsen, évaluation A)

| # | Heuristique | Score | Problème clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 2/4 | « Le point du jour » affirme un état faux (« Les courses sont presque prêtes » alors que la base est vide) ; murs de « 0 » |
| 2 | Correspondance monde réel | 2/4 | « (0,5 € en jeu) » non expliqué ; « Supprimer « Perso » » parle d'une catégorie non exposée ; vouvoiement |
| 3 | Contrôle et liberté | 2/4 | Pas d'annuler visible ; suppression à un tap au milieu des filtres |
| 4 | Cohérence et standards | 2/4 | « À faire » ET « Tâches » actifs simultanément ; « Calendrier » deux fois dans la nav ; 1 à 2 primaires selon les pages |
| 5 | Prévention des erreurs | 2/4 | ConfirmDialog systématique (bien) mais « Supprimer « Perso » » sans marquage destructif ; corbeille collée à « Ouvrir » (Ardoise) |
| 6 | Reconnaissance plutôt que rappel | 3/4 | Icônes + libellés, fil d'Ariane, bouton ⓘ persistant |
| 7 | Flexibilité et efficacité | 2/4 | ⌘K et Impression : bons ; dupliques de nav à désambiguïser |
| 8 | Esthétique et minimalisme | 2/4 | Facture soignée mais curation : 4 cartes de stats (souvent toutes à 0) avant le contenu |
| 9 | Récupération d'erreur | 3/4 | ErrorState + « Réessayer » + route-error dédiés, propres |
| 10 | Aide et documentation | 3/4 | Mode d'emploi par module, injecté par le shell — genuinely good |
| **Total** | | **23/40** | **Acceptable (57,5 %)** |

## Audit technique (évaluation B)

| # | Dimension | Score | Constat clé |
|---|---|---|---|
| 1 | Accessibilité | 3/4 | ARIA de métier (Fab à libellé obligatoire, PendingAssignee, drag clavier) ; MAIS contrastes corail ≈3,0:1 à 10-11 px (Badge coral, PriorityTag haute), toast erreur 3,7:1, actions de ligne invisibles au tactile ≥ 651 px |
| 2 | Performance | 4/4 | Zéro `transition: all`, zéro `will-change`, confettis CSS composites double-gated, code-splitting systématique, lazy + memo |
| 3 | Theming | 3,5/4 | Migration sky/amber-strong effectivement employée, résidus justifiés ; dérive oklch 45 % vs token 52 %, token violet manquant, pas de dark mode (assumé) |
| 4 | Responsive | 3,5/4 | Rupture unique 650/651 + safe-areas + garde overflow ; cibles 32 px ; double système `sm:`/650 ; drag tactile Courses sans `touch-action` |
| 5 | Intégrité d'implémentation | 4/4 | Shell contractuel (60+ usages, exceptions documentées), règles citées puis tenues, décor honnête (vrai code-barres/QR), vocabulaire produit |
| **Total** | | **18/20** | **Très bon (A−)** |

**Verdict d'intégrité : système cohérent et spécifique.** Ce n'est pas un gabarit recyclé : les règles empruntées sont commentées avec leur raison et adaptées au tactile (bottom-nav pilule, FAB, feuilles mobiles) — ce que melimelo ne fait pas. Le système survivrait à un 21ᵉ module.

## Charge cognitive (A)

6 échecs francs sur 8 : focus unique (Courses = 6 actions + 4 stats + rail avant la liste), chunking (MetricRow 4 + rail 2-3 ; Calendrier = 4 sélecteurs + 3 pilules + zone scolaire), hiérarchie (stats vides > données vivantes), une chose à la fois (2 primaires Calendrier), choix minimaux (6 avant toute matière), mémoire de travail (À faire/Tâches, « 0,5 € en jeu », « Perso »).

## Problèmes prioritaires (fusion A + B)

**[P0] Le mur de zéros** — `MetricRow` s'affiche avant le contenu sur chaque module ; à zéro, il ne dit rien. 7 captures sur 8 ouvrent sur 3-4 stats à 0 ; Courses débat le zéro DEUX fois (carte « LISTES 0 » + carte sapin « 0 liste »). Correction : ne rendre `MetricRow` que si ≥ 1 valeur non nulle ; supprimer la carte LISTES de Courses ; Ardoise : solde réel en vedette.

**[P1] Contraste corail/amber en échec AA** (B) — Badge coral et PriorityTag « haute » ≈ 3,0:1 à 10-11 px (`primitives.tsx:83`, `module-shell.tsx:205`), toast erreur 3,7:1 (`toast.tsx:53`). Correctif : token `coral-text` sombre, comme le oklch 45 % l'a fait pour amber.

**[P1] Actions de ligne invisibles au tactile ≥ 651 px** (B) — le motif `group-hover + max-[650px]:opacity-100` couvre mobile et clavier mais pas la tablette tactile. Le correctif existe déjà dans le Cercle (`post-card.tsx:313` `[@media(hover:none)]:opacity-100`) : généraliser aux 7 autres sites (task-row, shopping-item-row, routines, ardoise-detail, agenda-list, anniversaires).

**[P1] Surcharge d'actions d'en-tête** (A) — 6 pilules sur Courses, deux primaires pleines sur Calendrier. Un seul bouton plein par en-tête, le reste en menu « ⋯ » ; masquer (pas griser) « Imprimer » sans données.

**[P1] Navigation double** (A) — « À faire » et « Tâches » remplis en même temps, « Calendrier » deux fois. Un seul nom, un seul état actif dérivé d'une clé de route.

**[P1] « Le point du jour » ment** (A) — « Les courses, elles, sont presque prêtes » alors que « 0 liste, 0 articles » sur le même écran. Ne prononcer la phrase que si `0 < checkedCount < itemCount`.

**[P2] Mobile Courses : 510 px avant la première liste** (A) — replier les actions sous 650 px (Fab existe déjà), supprimer MetricRow sur mobile.

**[P2] Drag tactile Courses** (B) — `PointerSensor distance:6` sans `touch-action` sur la poignée : aligner sur le modèle dashboard (TouchSensor appui long).

**[P2] Dérive amber + trancher** (B) — `oklch(52%)` (token) vs `oklch(45%)` (PriorityTag) : deux valeurs pour le même usage.

**[P2] La patte manquante** (A) — importer la variante italique de Fraunces, réserver le héro plein sapin à l'accueil, rendre le beurre à l'italique display, et trancher le corail : joie rare OU erreur, pas les deux.

## Accords A↔B (croisements notables)

- **Le corail** : A voit l'erreur sémantique (couleur de joie devenue sirène), B voit l'échec de contraste — même token, deux raisons de le retravailler.
- **L'« angle mort tablette »** : B mesure les actions hover-gated inaccessibles ≥ 651 px ; Casey (A) sent le même défaut côté mobile/une-main. La classe « entre les deux » est récurrente.
- **Les commentaires-contrats** : A et B citent indépendamment les commentaires de `app.css` (règle des dégradés, justification scrollbar) comme le plus grand point fort du codebase — et la dérive oklch 45 % comme la plus visible des violations de ce contrat.

## Personas (red flags précis)

- **Jordan (débutant)** : 6 boutons d'en-tête Courses ; 4 stats à 0 ressemblent à un dysfonctionnement ; « (0,5 € en jeu) » indéchiffrable ; double surlignage À faire/Tâches.
- **Sam (accessibilité)** : contraste badges corail 3,0:1 à 11 px ; « Supprimer « Perso » » annoncé comme bouton ordinaire par le lecteur d'écran ; corbeille à une Tab de « Ouvrir » ; double entrée « Calendrier » tabulée deux fois.
- **Casey (mobile une main)** : première liste sous le pli (510 px) ; retour en haut à gauche hors du pouce ; « Foyer Mart… » tronqué — le seul contexte est le texte coupé ; flèche retour ET hamburger simultanés.
- **Marie (parent de 4, persona projet)** : le résumé matinal ment sur les courses ; instruction de drag inutile affichée sur une grille vide ; l'argent résumé par « 0,00 € » + jargon.

## Ce qui marche

1. **Les commentaires sont des contrats** (A et B d'accord) : chaque token/utility porte sa raison et sa borne d'usage (`app.css:24,30,36,242-244`) — le système est pensé pour être tenu.
2. **L'état vide est un composant** : EmptyState (chip sauge + point beurre + Fraunces + une action) avec des textes écrits, pas générés — le composant le plus important d'une app familiale au premier lancement, et il est bon.
3. **L'accessibilité n'est pas du vernis** : focus-visible global 3 px, ARIA raisonné, reduced-motion double-garde, drag clavier — l'exécution de détail pèche, pas la volonté.

## Observations mineures

- La carte sapin du rail Courses affirme « temps réel » sur une base vide (2ᵉ affirmation non vérifiée du même écran).
- Astérisque « Votre commentaire * » sur le composeur Cercle : un post est par définition du texte.
- Chips d'état vide rigoureusement identiques sur 5 modules : la constance vire à l'estampille.
- Titres sautant h1→h3 (Panel/EmptyState sans SectionHeading intermédiaire).
- Libellés 10-11,5 px systématiques : passent le contraste, fragiles en lisibilité.
- Aucune image avec width/height explicites (CLS porté par les conteneurs aspect-*).
- Double système de ruptures `sm:` (640) et maison 650/651.

## Questions à considérer

1. Retirez toutes les stats à zéro et les titres géants des pages-outils : que reste-t-il de la signature Melimelo ? Si la réponse est « le crème, le sapin et Fraunces », le langage a été adopté comme palette, pas comme grammaire.
2. Le corail : couleur de joie ou couleur d'erreur ? Aujourd'hui l'app répond « erreur » à chaque grep et « joie » à un point de ponctuation.
3. Une maman dans une file d'attente, un doigt, 20 secondes : combien de pixels avant sa première liste ? 510 sur 844. L'app est-elle conçue pour le mode Operate ou pour la démo ?
