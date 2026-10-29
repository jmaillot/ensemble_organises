import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReadWatermark } from './use-messages';

/**
 * D-01 : le watermark d'un membre s'écrit À L'OUVERTURE du fil et au retour
 * sur l'onglet — une écriture par session de lecture, jamais par message.
 * Les réceptions en direct (re-rendus à props égales) ne doivent rien écrire,
 * et la garde `current[id] >= at` rend toute écriture redondante inoffensive
 * sans la rendre nécessaire.
 */

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('useReadWatermark — une écriture par session de lecture (D-01)', () => {
  it('écrit une fois à l’ouverture, jamais au rendu des messages', () => {
    const markRead = vi.fn();
    const { rerender } = renderHook(({ id }) => useReadWatermark(id, markRead), {
      initialProps: { id: 'fil-1' as string | null },
    });

    expect(markRead).toHaveBeenCalledTimes(1);
    expect(markRead).toHaveBeenCalledWith('fil-1');

    // Des messages arrivent en direct : re-rendus à props égales, zéro écriture.
    rerender({ id: 'fil-1' });
    rerender({ id: 'fil-1' });
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it('le retour sur l’onglet écrit une fois ; rester caché non', () => {
    const markRead = vi.fn();
    renderHook(({ id }) => useReadWatermark(id, markRead), {
      initialProps: { id: 'fil-1' as string | null },
    });
    expect(markRead).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    expect(markRead).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(markRead).toHaveBeenCalledTimes(2);
    expect(markRead).toHaveBeenLastCalledWith('fil-1');
  });

  it('changer de fil est une nouvelle session : une écriture, et un écouteur neuf', () => {
    const markRead = vi.fn();
    const { rerender } = renderHook(({ id }) => useReadWatermark(id, markRead), {
      initialProps: { id: 'fil-1' as string | null },
    });
    expect(markRead).toHaveBeenCalledTimes(1);

    rerender({ id: 'fil-2' });
    expect(markRead).toHaveBeenCalledTimes(2);
    expect(markRead).toHaveBeenLastCalledWith('fil-2');

    // Le retour sur l'onglet vise le fil OUVERT (fil-2), pas l'ancien.
    setVisibility('visible');
    expect(markRead).toHaveBeenCalledTimes(3);
    expect(markRead).toHaveBeenLastCalledWith('fil-2');
  });

  it('aucun fil ouvert : aucune écriture, aucune écoute', () => {
    const markRead = vi.fn();
    const { rerender } = renderHook(({ id }) => useReadWatermark(id, markRead), {
      initialProps: { id: null as string | null },
    });
    setVisibility('visible');
    expect(markRead).not.toHaveBeenCalled();

    // L'ouverture d'un fil reste marquée, même après un passage sans fil.
    rerender({ id: 'fil-1' });
    expect(markRead).toHaveBeenCalledTimes(1);
  });
});
