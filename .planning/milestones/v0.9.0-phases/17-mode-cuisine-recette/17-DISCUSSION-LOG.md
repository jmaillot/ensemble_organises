# Phase 17: mode-cuisine-recette - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 17-mode-cuisine-recette
**Areas discussed:** Confort lecture cuisine, En-tête progression, Interrupteur veille, Bascule + reset, Parité invitée, Enfant cuisine, A11y cuisine

---

## Confort lecture cuisine

| Option | Description | Selected |
|--------|-------------|----------|
| Grandes lignes aérées | Texte 17-18px, lignes aérées, cases ≥48px | ✓ |
| Densité fiche actuelle | Même densité que la fiche actuelle | |
| Très grand confort | Texte très grand, une étape bien visible | |

**User's choice:** Grandes lignes aérées
**Notes:** Mains farineuses, écran posé.

| Option | Description | Selected |
|--------|-------------|----------|
| Barré + atténué | Numéro + texte barrés et atténués sur place | |
| Réduites tassées | Étapes faites réduites, liste se tasse | ✓ |
| Masquées | Étapes faites masquées derrière filtre | |

**User's choice:** Réduites tassées

| Option | Description | Selected |
|--------|-------------|----------|
| Pastille actuelle | Même pastille ronde statique | |
| Chiffre seul | Simple chiffre gras sans pastille | |
| Pastille XL | Grande pastille accentuée | ✓ |

**User's choice:** Pastille XL

| Option | Description | Selected |
|--------|-------------|----------|
| Case à gauche | Case à gauche du texte, ≥48px | ✓ |
| Case à droite | Case à droite, texte prioritaire | |
| Ligne cliquable | Toute la ligne bascule la case | |

**User's choice:** Case à gauche

| Option | Description | Selected |
|--------|-------------|----------|
| Garder liaison | Point + trait vertical conservés | ✓ |
| Sans liaison | Lignes séparées épurées | |

**User's choice:** Garder liaison

| Option | Description | Selected |
|--------|-------------|----------|
| Texte entier | Texte complet toujours visible | ✓ |
| Tronqué + déplier | Tronqué 2-3 lignes avec dépliage | |

**User's choice:** Texte entier

---

## En-tête progression

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky haut | Compteur + barre toujours visibles au scroll | ✓ |
| Non sticky | En-tête simple, disparaît au scroll | |
| Flottante bas | Mini-barre flottante en bas | |

**User's choice:** Sticky haut

| Option | Description | Selected |
|--------|-------------|----------|
| Compteur + barre | « N/M » + barre fine | ✓ |
| Barre seule | Barre seule sans chiffres | |
| Texte seul | « Étape N sur M » sans barre | |

**User's choice:** Compteur + barre

| Option | Description | Selected |
|--------|-------------|----------|
| Bas de vue | Bouton discret après la dernière étape | |
| Dans l'en-tête | Dans le sticky à côté du compteur | |
| Les deux | Rappel en-tête + bouton bas | ✓ |

**User's choice:** Les deux

| Option | Description | Selected |
|--------|-------------|----------|
| Avec compteur | Interrupteur dans l'en-tête près du compteur | ✓ |
| En bas | Interrupteur en bas près du reset | |
| You decide | Planner choisit | |

**User's choice:** Avec compteur (supplanté ensuite par « pas d'élément séparé »)

---

## Interrupteur veille

| Option | Description | Selected |
|--------|-------------|----------|
| Switch | Petit switch on/off cohérent | ✓ (supplanté) |
| Bouton icône | Bouton ampoule/soleil + état | |
| Case à cocher | « Garder l'écran allumé » | |

**User's choice:** Switch (puis supplanté : pas d'élément séparé)

| Option | Description | Selected |
|--------|-------------|----------|
| ON par défaut | Verrou demandé dès l'entrée | |
| OFF par défaut | Switch OFF, activation manuelle | ✓ (supplanté) |

**User's choice:** OFF par défaut (puis supplanté)

| Option | Description | Selected |
|--------|-------------|----------|
| Écran allumé | Court et explicite | |
| Bloquer veille | Technique assumé | |
| You decide | Planner choisit | |

**User's choice (free-text):** « Juste "Mode cuisine" » → clarifié : « pas d'élément séparé »
**Notes:** La veille suit le toggle Mode cuisine (ON = demande, OFF = relâche). Amendement R4 SPEC acté.

| Option | Description | Selected |
|--------|-------------|----------|
| Mention discrète | « veille non bloquée sur cet appareil » | ✓ |
| Silence | Aucun message si non supporté | |

**User's choice:** Mention discrète

---

## Bascule + reset

| Option | Description | Selected |
|--------|-------------|----------|
| Switch Panel | Switch aria-pressed en Panel action | ✓ |
| Bouton texte | Simple bouton texte en en-tête | |

**User's choice:** Switch Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Garder position | Scroll conservé à la bascule | ✓ |
| Haut de vue | Retour en haut à chaque bascule | |

**User's choice:** Garder position

| Option | Description | Selected |
|--------|-------------|----------|
| Inline | « Tout effacer ? Annuler / Réinitialiser » inline | ✓ |
| Modale | Modale de confirmation classique | |

**User's choice:** Inline

| Option | Description | Selected |
|--------|-------------|----------|
| Description swap | Description du panneau bascule avec le mode | ✓ |
| Description fixe | Description fixe, seul le contenu change | |

**User's choice:** Description swap

---

## Parité invitée

| Option | Description | Selected |
|--------|-------------|----------|
| Parité totale | Même vue XL + sticky + mémoire locale | ✓ |
| Version allégée | Vue simplifiée sans sticky ni confort XL | |

**User's choice:** Parité totale

| Option | Description | Selected |
|--------|-------------|----------|
| Oui mémoire | Même clé eo:recette:cuisine sur l'appareil invité | ✓ |
| Sans mémoire | Cases éphémères session invité | |

**User's choice:** Oui mémoire

---

## Enfant cuisine

| Option | Description | Selected |
|--------|-------------|----------|
| Visible + cases | Toggle visible, cases seules | ✓ |
| Masqué enfant | Mode cuisine masqué au rôle enfant | |

**User's choice:** Visible + cases

---

## A11y cuisine

| Option | Description | Selected |
|--------|-------------|----------|
| Annonce polie | Compteur aria-live poli à chaque case | ✓ |
| Sans annonce | Lecteur lit la case seule | |

**User's choice:** Annonce polie

---

## the agent's Discretion

Tailles px exactes, épaisseur/couleur barre, wording repli, libellé reset, nom composant/hook.

## Deferred Ideas

None.
