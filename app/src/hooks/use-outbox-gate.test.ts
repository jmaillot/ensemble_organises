import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOutboxGate } from './use-outbox-gate';

describe('useOutboxGate', () => {
  it('retourne le contrat D-10 : file vide (stub phase 32)', () => {
    const { result } = renderHook(() => useOutboxGate());
    expect(result.current).toEqual({ isEmpty: true });
  });
});
