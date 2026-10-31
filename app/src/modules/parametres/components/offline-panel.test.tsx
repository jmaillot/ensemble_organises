// Estampille de build dans le panneau Paramètres (D-02 et D-03).
//
// Pourquoi chaque cas :
// - Repli `unknown` (D-02) : hors pipeline estampillé, rien n'injecte
//   `VITE_APP_VERSION`. Afficher `0.1.0` — le semver du `package.json` —
//   serait une version fausse avec assurance : un build local diffère déjà de
//   l'image servie (`.dockerignore` exclut les tests et `docs`, Tailwind émet
//   moins de classes). Le test refuse donc toute occurrence de `0.1.0`.
// - Forme courte + titre (D-03) : 8 caractères pour l'humain à l'écran, le
//   SHA complet (40) en `title` pour une comparaison exacte avec
//   `git rev-parse HEAD` sur le clone de production.
// - Valeur courte (`abc`) : `slice(0, 8)` doit la laisser intacte — aucun cas
//   spécial à gérer.
// - `unknown` stubbé explicitement (7 caractères < 8) : s'affiche en entier
//   avec `title` égal à la valeur — le panneau ne prétend jamais à un SHA
//   qu'il n'a pas.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

const SHA_40 = '42b76a163b845c6f29c196ea3852172063583fb1';
// D-11 : sans estampille, le libellé écran est une déclaration honnête —
// « Version de développement » — jamais `unknown` brut ni `0.1.0`. Les DEUX
// points d'affichage sont couverts (ligne « Version » du panneau Données et
// pied du panneau « Application web »), chacun avec une explication au survol.
const LIBELLE_REPLI = 'Version de développement';

// La constante de version est calculée au chargement du module : un stub
// après un import classique ne changerait rien au module déjà mémoïsé.
// D'où `vi.stubEnv` + `vi.resetModules()` + import dynamique. Le helper de
// rendu est réimporté APRÈS le reset au même titre que le panneau : le reset
// régénère aussi `@/components/ui/toast`, et un `ToastProvider` de l'ancienne
// instance ne satisferait pas le `useToast` de la nouvelle (identité de
// contexte React cassée).
async function rendreAvecVersion(valeur: string) {
  vi.stubEnv('VITE_APP_VERSION', valeur);
  vi.resetModules();
  const module = await import('./offline-panel');
  const rendu = await import('@/test/render');
  rendu.renderWithProviders(<module.OfflinePanel />);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('OfflinePanel — estampille de build', () => {
  // Famille 1 (D-11/D-13) : sans estampille — VITE_APP_VERSION absente.
  it('affiche « Version de développement » aux deux points d\'affichage, jamais `unknown` ni `0.1.0`', async () => {
    await rendreAvecVersion('unknown');

    const affichages = screen.getAllByText(LIBELLE_REPLI);
    expect(affichages.length).toBe(2);
    for (const affichage of affichages) {
      const title = affichage.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title?.length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).not.toContain('unknown');
    expect(document.body.textContent).not.toContain('0.1.0');
  });

  // Famille 1, variante chaîne vide : `||` traite une estampille vidée comme
  // absente — le rendu est identique à la variante sans variable.
  it('affiche « Version de développement » quand l\'estampille est une chaîne vide', async () => {
    await rendreAvecVersion('');

    const affichages = screen.getAllByText(LIBELLE_REPLI);
    expect(affichages.length).toBe(2);
    expect(document.body.textContent).not.toContain('unknown');
    expect(document.body.textContent).not.toContain('0.1.0');
  });

  // Famille 2 (D-03, inchangée) : estampillée → SHA court + title complet,
  // aux DEUX points d'affichage.
  it('affiche les 8 premiers caractères du SHA, le complet en title', async () => {
    await rendreAvecVersion(SHA_40);

    const ligneVersion = screen.getByText('Version').parentElement;
    expect(ligneVersion).not.toBeNull();
    const affichee = within(ligneVersion as HTMLElement).getByText(SHA_40.slice(0, 8));
    expect(affichee).toHaveAttribute('title', SHA_40);
  });

  it('affiche le SHA court avec title complet au pied « Application web »', async () => {
    await rendreAvecVersion(SHA_40);

    const pied = screen.getByText(/service worker mis à jour/i).closest('p');
    expect(pied).not.toBeNull();
    expect(pied?.textContent).toContain(SHA_40.slice(0, 8));
  });

  it('laisse une valeur courte affichée en entier, title égal à la valeur', async () => {
    await rendreAvecVersion('abc');

    const ligneVersion = screen.getByText('Version').parentElement;
    const affichee = within(ligneVersion as HTMLElement).getByText('abc');
    expect(affichee).toHaveAttribute('title', 'abc');
  });
});
