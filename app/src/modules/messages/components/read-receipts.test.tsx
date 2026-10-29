import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatReadAt, ReadReceipts, type ReadReceiptReader } from './read-receipts';

/**
 * D-02, gabarit UI-SPEC : rangée d'avatars MemberAvatar sm + horodatage sous
 * la dernière bulle de l'émettrice, SANS libellé visible. Zéro lecteur = la
 * rangée ne s'affiche pas (jamais « Vu par personne »). Au-delà de 5 lecteurs,
 * un « +N » reprend sur la même rangée (backstop zero-one-many).
 */

const reader = (id: string, name: string, readAt = '2026-10-29T14:30:00'): ReadReceiptReader => ({
  id,
  name,
  colorTag: 'coral',
  readAt,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('rangée d’accusés de lecture (D-02)', () => {
  it('zéro lecteur : la rangée ne s’affiche pas du tout', () => {
    const { container } = render(<ReadReceipts readers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('un lecteur : avatar + horodatage, sans libellé technique ni libellé visible', () => {
    vi.setSystemTime(new Date('2026-10-29T14:30:30'));
    render(<ReadReceipts readers={[reader('m1', 'Thomas')]} />);
    expect(screen.getByTitle('Thomas')).toBeTruthy();
    expect(screen.getByText(/à l’instant/i)).toBeTruthy();
    // Copywriting : pas de « Vu par », pas de vocabulaire technique.
    expect(screen.queryByText(/Vu|lu par/i)).toBeNull();
  });

  it('six lecteurs : cinq avatars puis « +1 » sur la même rangée', () => {
    const readers = Array.from({ length: 6 }, (_, index) => reader(`m${index}`, `Membre ${index}`));
    render(<ReadReceipts readers={readers} />);
    expect(screen.getAllByTitle(/^Membre \d$/)).toHaveLength(5);
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('membre sans photo : initiale blanche sur la couleur profonde (contraste AA)', () => {
    render(<ReadReceipts readers={[reader('m1', 'Zoé Bell')]} />);
    const avatar = screen.getByTitle('Zoé Bell');
    expect(avatar.textContent).toBe('ZB');
    // Les variantes *-deep sont obligatoires sous l'initiale blanche.
    expect(avatar.className).toContain('bg-coral-deep');
    expect(avatar.className).toContain('size-[23px]');
  });

  it('l’ordre des avatars suit l’ordre des lectures (premier lecteur d’abord)', () => {
    render(<ReadReceipts readers={[reader('m1', 'Ada', '2026-10-29T10:00:00'), reader('m2', 'Bob', '2026-10-29T11:00:00')]} />);
    const avatars = screen.getAllByTitle(/^(Ada|Bob)$/);
    expect(avatars[0].getAttribute('title')).toBe('Ada');
  });
});

describe('horodatage relatif court de l’accusé', () => {
  it('« À l’instant », l’heure du jour, « Hier »', () => {
    vi.setSystemTime(new Date('2026-10-29T14:40:00'));
    expect(formatReadAt('2026-10-29T14:39:30')).toBe('À l’instant');
    expect(formatReadAt('2026-10-29T14:32:00')).toBe('14:32');
    expect(formatReadAt('2026-10-28T14:32:00')).toBe('Hier');
  });
});
