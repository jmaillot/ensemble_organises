import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroCard } from './hero-card';

describe('HeroCard', () => {
  it('affiche le sur-titre, le chiffre et la légende', () => {
    render(
      <HeroCard
        kicker="Ardoise · Octobre"
        value={<span data-testid="hero-value">24,90&nbsp;€</span>}
        caption="Répartis automatiquement."
      />,
    );

    expect(screen.getByText('Ardoise · Octobre')).toBeInTheDocument();
    expect(screen.getByTestId('hero-value')).toHaveTextContent('24,90 €');
    expect(screen.getByText('Répartis automatiquement.')).toBeInTheDocument();
  });

  it('pose une jauge accessible dont la valeur est arrondie en pourcentage', () => {
    render(<HeroCard value="12" gauge={0.45} gaugeLabel="Budget consommé" />);

    const gauge = screen.getByRole('progressbar');
    expect(gauge).toHaveAttribute('aria-valuenow', '45');
    expect(gauge).toHaveAttribute('aria-label', 'Budget consommé');
    expect(gauge).toHaveAttribute('aria-valuemin', '0');
    expect(gauge).toHaveAttribute('aria-valuemax', '100');
  });

  it('sature une jauge hors bornes au lieu de déborder', () => {
    render(
      <>
        <HeroCard value="a" gauge={1.5} gaugeLabel="Au-delà" />
        <HeroCard value="b" gauge={-0.2} gaugeLabel="En deçà" />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'Au-delà' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'En deçà' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('ne rend pas de jauge sans prop gauge', () => {
    render(<HeroCard kicker="Sans jauge" value="7" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('rend les actions et le contenu libre', () => {
    render(
      <HeroCard
        value="3"
        actions={<button type="button">Ajouter</button>}
      >
        <p>Contenu libre</p>
      </HeroCard>,
    );

    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
    expect(screen.getByText('Contenu libre')).toBeInTheDocument();
  });
});
