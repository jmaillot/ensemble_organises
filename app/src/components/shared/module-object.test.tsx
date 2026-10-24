import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { catalogueModules } from '@/lib/modules';
import { ModuleObject } from './module-object';

/**
 * Garde-fou du 24/10/2026 : la carte d'images a déjà rendu silencieusement
 * le repli SVG (chemin de glob faux, puis clé de recherche erronée — le
 * build et les tests restaient verts, seul le rendu réel a vu le défaut).
 * Ici, chaque espace du catalogue DOIT résoudre vers une image réelle ; un
 * repli SVG en tuile est un échec, pas un comportement de secours.
 */
describe('ModuleObject — objets illustrés générés', () => {
  it('rend une image pour chaque espace du catalogue, sans repli SVG', () => {
    for (const entry of catalogueModules) {
      const { container, unmount } = render(<ModuleObject module={entry.key} />);
      const img = container.querySelector('img');
      expect(img, `${entry.key} : aucun <img> rendu — le repli SVG a pris le relais`).not.toBeNull();
      expect(img?.getAttribute('src'), `${entry.key} : src vide`).toBeTruthy();
      unmount();
    }
  });

  it('couvre aussi « accueil », présent dans le tiroir mais hors catalogue', () => {
    const { container } = render(<ModuleObject module="accueil" />);
    expect(container.querySelector('img')).not.toBeNull();
  });
});
