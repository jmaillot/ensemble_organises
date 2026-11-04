import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateBanner } from './update-banner';
import { useBannerStore } from './banner-store';

const gate = vi.hoisted(() => ({ isEmpty: true }));

vi.mock('@/hooks/use-outbox-gate', () => ({
  useOutboxGate: () => ({ isEmpty: gate.isEmpty }),
}));

describe('UpdateBanner', () => {
  beforeEach(() => {
    gate.isEmpty = true;
    useBannerStore.setState({ entries: [], sorted: [] });
  });

  it('affiche le texte et un bouton Recharger actif (gate vide)', async () => {
    const updateSW = vi.fn();
    render(<UpdateBanner updateSW={updateSW} />);
    expect(screen.getByText('Une mise à jour est disponible')).toBeInTheDocument();
    const reload = screen.getByRole('button', { name: 'Recharger' });
    expect(reload).toBeEnabled();
    await userEvent.click(reload);
    expect(updateSW).toHaveBeenCalledOnce();
  });

  it('désactive Recharger avec le libellé D-10 quand la file n’est pas vide', () => {
    gate.isEmpty = false;
    const updateSW = vi.fn();
    render(<UpdateBanner updateSW={updateSW} />);
    const reload = screen.getByRole('button', { name: 'Mise à jour en préparation…' });
    expect(reload).toBeDisabled();
  });

  it('« Plus tard » referme le bandeau (dismiss sw-update)', async () => {
    const updateSW = vi.fn();
    render(<UpdateBanner updateSW={updateSW} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(useBannerStore.getState().entries).toHaveLength(0);
  });
});
