import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricRow, type MetricItem } from './module-shell';

/**
 * Garde du « mur de zéros » (critique UI 2026-10-23, P0) : une rangée de
 * statistiques dérivées toutes vides ne porte aucune information — l'état
 * vide du panneau la dit déjà mieux — et elle priment à tort sur les
 * données vivantes. Le contrat : la rangée ne se rend que si AU MOINS une
 * valeur est informative ; sinon elle ne rend rien du tout.
 */
describe('MetricRow — rangée de statistiques dérivées', () => {
  const toutZero: MetricItem[] = [
    { label: 'Listes', value: 0, caption: 'liste active' },
    { label: 'Articles', value: 0, caption: 'à acheter au total' },
    { label: 'Prochaine course', value: '—', caption: 'aucune course planifiée' },
  ];

  it('ne rend rien quand toutes les valeurs sont vides (0, « 0 », « — », chaîne vide)', () => {
    const { container } = render(<MetricRow items={toutZero} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend la rangée dès qu\'une seule valeur est informative', () => {
    render(
      <MetricRow
        items={[
          { label: 'Listes', value: 0, caption: 'liste active' },
          { label: 'Articles', value: 7, caption: 'à acheter au total' },
        ]}
      />,
    );
    expect(screen.getByText('Articles')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Listes')).toBeInTheDocument();
  });

  it('rend la rangée quand la valeur est une chaîne informative (ex. « 23/10 »)', () => {
    render(<MetricRow items={[{ label: 'Sélection', value: '23/10', caption: 'jour affiché' }]} />);
    expect(screen.getByText('23/10')).toBeInTheDocument();
  });
});
