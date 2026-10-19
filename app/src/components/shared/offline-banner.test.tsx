import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { OfflineBanner } from './offline-banner';

/**
 * Le bandeau lit `onlineManager`, la MÊME source que la politique réseau
 * (T-261019-dw6-02) : il ne peut ni afficher un état contradictoire avec ce que
 * font les requêtes, ni rester muet pendant une coupure. Ces tests exercent les
 * trois états : hors ligne (rendu), en ligne (rien), et la bascule en direct —
 * c'est elle qui prouve l'abonnement, pas seulement la valeur initiale.
 *
 * `onlineManager` est un singleton partagé par toute la suite : chaque test
 * restaure l'état en ligne, sinon les fichiers voisins hériteraient d'un
 * « hors ligne » qu'ils n'ont pas demandé.
 */
beforeEach(() => {
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('OfflineBanner', () => {
  it('hors ligne, annonce la coupure sous un rôle status', () => {
    onlineManager.setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Vous êtes hors ligne');
  });

  it('en ligne, ne rend rien', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suit une bascule en direct : apparaît hors ligne, disparaît en ligne', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => onlineManager.setOnline(true));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
