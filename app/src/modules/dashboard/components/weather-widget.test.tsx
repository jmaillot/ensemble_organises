import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WeatherWidget } from './widgets';
import type { WeatherState } from '../hooks/use-weather';

const placement = { kind: 'meteo', x: 0, y: 0, width: 1 } as never;

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { status: 'ready', temperature: 18.4, label: 'Peu nuageux', icon: 'sun', placeName: 'Lyon', measuredAt: '2026-09-29T14:00', ...overrides };
}

describe('WeatherWidget', () => {
  it('affiche la température et la ville du profil', () => {
    const screen = renderWithProviders(<WeatherWidget placement={placement} isEditing={false} city="Lyon" weather={weather({})} />);
    expect(screen.getByText('18°')).toBeTruthy();
    expect(screen.getByText('Peu nuageux · Lyon')).toBeTruthy();
  });

  it('annonce le chargement sans température inventée', () => {
    const screen = renderWithProviders(
      <WeatherWidget placement={placement} isEditing={false} city="Lyon" weather={weather({ status: 'loading', temperature: null })} />,
    );
    expect(screen.getByText('Chargement de la météo…')).toBeTruthy();
    expect(screen.queryByText('18°')).toBeNull();
  });

  it('dit l\'indisponibilité plutôt que d\'afficher du vide', () => {
    const screen = renderWithProviders(
      <WeatherWidget placement={placement} isEditing={false} city="Lyon" weather={weather({ status: 'error', temperature: null })} />,
    );
    expect(screen.getByText(/Météo indisponible/)).toBeTruthy();
  });
});
