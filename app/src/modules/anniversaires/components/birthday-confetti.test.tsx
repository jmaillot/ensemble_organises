import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { REDUCED_MOTION_QUERY } from '@/hooks/use-prefers-reduced-motion';
import { todayIso } from '@/lib/utils';
import { renderWithProviders } from '@/test/render';
import AnniversairesPage from '../anniversaires-page';
import { BirthdayConfetti } from './birthday-confetti';

/**
 * `window.matchMedia` répond selon la requête : seule la préférence de
 * mouvement est pilotée, tout le reste de l'application reste au repos — la
 * grille et la barre basse ne doivent pas changer de disposition sous prétexte
 * qu'on éprouve les confettis.
 */
function stubReducedMotion(reduced: boolean) {
  const previous = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}

let restoreMatchMedia: (() => void) | null = null;

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

const overlay = () => document.querySelector('[data-confetti="birthday"]');

/** JJ/MM/AAAA du jour, format attendu par le champ masqué du dialogue. */
function todayInput(): string {
  const [year, month, day] = todayIso().split('-');
  return `${day}/${month}/${year}`;
}

describe('BirthdayConfetti', () => {
  it('fait tomber une pluie décorative qui ne capte aucun clic', () => {
    restoreMatchMedia = stubReducedMotion(false);
    render(<BirthdayConfetti />);

    const layer = overlay();
    expect(layer).not.toBeNull();
    // Décoratif : rien à annoncer, et le calque laisse passer le pointeur.
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer?.className).toContain('pointer-events-none');
    expect(layer?.className).toContain('fixed');

    const particles = layer?.querySelectorAll('span') ?? [];
    expect(particles).toHaveLength(28);
    for (const particle of particles) {
      expect(particle.style.animation).toContain('confetti-fall');
      expect(particle.style.animation).toContain('linear');
      expect(particle.style.getPropertyValue('--confetti-drift')).toMatch(/px$/);
      expect(particle.style.backgroundColor).not.toBe('');
    }
  });

  it('donne exactement la même pluie au rendu suivant', () => {
    restoreMatchMedia = stubReducedMotion(false);
    const { rerender, container } = render(<BirthdayConfetti />);
    const before = container.innerHTML;

    // Le parent se réexécute à chaque état (ouverture d'un dialogue, réponse
    // réseau) : un tirage aléatoire ferait sauter les particules en vol.
    rerender(<BirthdayConfetti />);

    expect(container.innerHTML).toBe(before);
  });

  it('ne monte rien quand la personne a demandé à réduire les animations', () => {
    restoreMatchMedia = stubReducedMotion(true);
    render(<BirthdayConfetti />);

    expect(overlay()).toBeNull();
  });

  it('accueille le jour J par la pluie, sur l’écran des anniversaires', async () => {
    restoreMatchMedia = stubReducedMotion(false);
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    // Aucun anniversaire de démonstration ne tombe aujourd'hui : la pluie ne
    // doit apparaître qu'une fois le jour J créé.
    await screen.findByRole('list', { name: 'Liste des anniversaires' });
    expect(overlay()).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'Ajouter un anniversaire' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Zoé Aujourd’hui');
    await user.type(within(dialog).getByLabelText(/^Date de naissance/), todayInput());
    await user.selectOptions(within(dialog).getByLabelText(/Membre du foyer/), 'member-lina');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’anniversaire/ }));

    await waitFor(() => expect(overlay()).not.toBeNull());
  });
});
