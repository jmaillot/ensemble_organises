import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Verrou anti-récidive de la couverture invitée d'ardoise (WR-08, fermeture du
 * bloqueur de 19-VERIFICATION.md).
 *
 * CE QU'IL VERROUILLE. 19-09 a aligné `ardoises.cover_url` sur D-01 : la colonne
 * porte désormais le CHEMIN du bucket, plus une URL signée. La lecture invitée
 * ne suivait pas : `ardoise-invite` rendait la colonne brute, et la page invitée
 * la posait dans un `<img src>` — une image cassée à coup sûr pour tout lien
 * partagé. Le remède est côté serveur : la fonction signe la couverture au
 * moment de la réponse (`resolveGuestCoverUrl`, motif de `recipe-invite`), et la
 * charge utile porte une URL servable sous un nom qui dit ce qu'elle porte
 * (`coverUrl`). Ce fichier refuse le retour au motif fautif.
 *
 * CE QU'IL NE PEUT PAS PROUVER — À LIRE AVANT DE SE FIER À UN VERT.
 *   * `deno` n'est PAS installé sur cet hôte, et `ardoise-invite/index.ts`
 *     importe `@supabase/server` (spécificateur BARE, résolu par la table
 *     d'importation du runtime épinglé) : aucun runner Node/Vitest ne peut
 *     charger ce fichier. Le comportement d'EXÉCUTION de la fonction Edge — la
 *     signature réelle, l'échec fermé réel, le TTL réel — n'est donc exercé par
 *     AUCUNE chaîne ici. Les six fichiers `*.test.ts` de `supabase/functions`
 *     sont bien exécutés par `npm test` (`vite.config.ts`, `include`), mais ce
 *     sont des tests de modules PURS (`child-guard`, `web-push`, `ref-days`) :
 *     aucun n'importe un `index.ts`. Un vert ici ne prouve pas que la fonction
 *     s'exécute correctement en production, seulement que la SOURCE n'a pas
 *     régressé vers la colonne brute.
 *   * Ce contrôle est TEXTUEL (AGENTS.md §2.7D.6 : un motif ancré et précis
 *     plutôt qu'une analyse syntaxique fragile, et surtout une forme POSITIVE
 *     d'abord). Il ne conclut que sur la présence de l'appel de signature et sur
 *     l'absence du motif d'écriture directe — pas sur la correction du reste de
 *     la fonction.
 *
 * Un scan de source n'est pas une preuve comportementale : ne pas laisser ce
 * vert passer pour une exécution (AGENTS.md §2.7D).
 */

/**
 * Racine du dépôt, cherchée en remontant depuis le répertoire courant du runner
 * — Vitest ne garantit pas ce répertoire (même mécanique que
 * `media-path-contract.test.ts`). On reconnaît deux dispositions : cwd = `app/`
 * (le cas normal) et cwd = racine du dépôt. Rend `null` si rien n'est trouvé,
 * pour que l'assertion échoue BRUYAMMENT plutôt que de conclure sur un chemin
 * inexistant (AGENTS.md §2.7B : « un contrôle qui ne regarde rien est vert et
 * muet »).
 */
function findRepoRoot(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    for (const candidate of [directory, resolve(directory, '..')]) {
      if (existsSync(resolve(candidate, 'supabase/functions/ardoise-invite/index.ts'))) {
        return candidate;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

function readRepoFile(relative: string): string {
  const root = findRepoRoot();
  expect(root, `racine du dépôt introuvable depuis ${process.cwd()}`).not.toBeNull();
  const file = resolve(root!, relative);
  expect(existsSync(file), `fichier introuvable : ${relative}`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('contrat de la couverture invitée (WR-08, fermeture du bloqueur 19-09)', () => {
  it('la racine du dépôt est trouvée, sinon le contrôle ne regarde rien', () => {
    const root = findRepoRoot();
    expect(
      root,
      `supabase/functions/ardoise-invite/index.ts introuvable en remontant depuis ${process.cwd()} : le scan ne peut rien vérifier`,
    ).not.toBeNull();
    expect(readRepoFile('supabase/functions/ardoise-invite/index.ts').length).toBeGreaterThan(0);
  });

  it('ardoise-invite signe la couverture invitée au lieu de rendre la colonne brute', () => {
    const source = readRepoFile('supabase/functions/ardoise-invite/index.ts');
    const FILE = 'supabase/functions/ardoise-invite/index.ts';

    // Forme POSITIVE d'abord : l'appel de signature doit être là, ancré sur le
    // seul récepteur légitime (le client `admin`).
    expect(
      source,
      `${FILE} ne signe pas la couverture invitée (resolveGuestCoverUrl absent) — ` +
        'la charge utile rendrait un CHEMIN de bucket dans un <img src> (régression 19-09)',
    ).toContain('resolveGuestCoverUrl(admin,');

    // La charge utile doit porter le nom qui dit ce qu'elle porte : une URL.
    expect(
      source,
      `${FILE} : la charge utile invitée ne porte pas de champ \`coverUrl\` — le nom doit dire que la valeur est une URL servable, pas un chemin`,
    ).toContain('coverUrl,');

    // Absence du motif d'ÉCRITURE DIRECTE de la colonne dans la charge utile.
    // Ancré sur `cover_url: (ardoise as` : le `select` de la fonction contient
    // légitimement `cover_url` (c'est la colonne, elle doit rester un chemin) et
    // n'est PAS visé — une interdiction large du type « cover_url absent du
    // fichier » croiserait ce qu'il ne faut pas (AGENTS.md §2.7D.6).
    expect(
      source,
      `${FILE} : la charge utile invitée rend de nouveau la colonne brute \`cover_url\` (régression 19-09)`,
    ).not.toContain('cover_url: (ardoise as');
  });

  it('le type invité côté client suit la charge utile : `coverUrl`, pas `cover_url`', () => {
    const source = readRepoFile('app/src/modules/ardoise/api.ts');
    const start = source.indexOf('interface GuestArdoiseView');
    expect(start, 'GuestArdoiseView introuvable dans modules/ardoise/api.ts').toBeGreaterThanOrEqual(0);
    // Bloc borné : du `interface` à la première accolade fermante qui le clôt.
    const block = source.slice(start, source.indexOf('\n}', start));

    expect(block, 'GuestArdoiseView ne déclare pas `coverUrl`').toContain('coverUrl: string | null');
    expect(
      block,
      'GuestArdoiseView déclare encore `cover_url` : le type client mentirait sur la charge utile',
    ).not.toContain('cover_url');
  });

  it('la page invitée rend `coverUrl` (pas `cover_url`) dans son <img src>', () => {
    const source = readRepoFile('app/src/modules/ardoise/guest-ardoise-page.tsx');
    expect(source, 'guest-ardoise-page ne lit pas `coverUrl`').toContain('view.ardoise.coverUrl');
    expect(
      source,
      'guest-ardoise-page lit encore `view.ardoise.cover_url` : un chemin de bucket irait dans le src',
    ).not.toContain('view.ardoise.cover_url');
  });
});
