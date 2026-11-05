import { afterEach, describe, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { DataError } from './adapter';
import {
  WRITE_ALLOWLIST,
  assertWriteAllowed,
  isWriteAllowed,
  OFFLINE_WRITE_REFUSED_MESSAGE,
} from './write-policy';

/**
 * Preuves comportementales de la garde d'écriture (T-34-05, D-07).
 *
 * `query-policy.test.ts` (tests J/K) exerce déjà la garde par le ré-export de
 * `query-policy.ts` ; ici on prouve le module feuille LUI-MÊME — celui que
 * l'adaptateur et `useResource` importent. Si un jour le bloc repartait vivre
 * ailleurs, ces tests resteraient l'ancrage du comportement : la liste borne
 * le HORS-LIGNE, jamais l'en ligne.
 */

afterEach(() => {
  // `onlineManager` est un singleton partagé : ne jamais laisser la suite
  // déclarée hors ligne après ce fichier.
  onlineManager.setOnline(true);
});

describe('write-policy — garde upfront D-07 (module feuille)', () => {
  it('A. la liste porte exactement les 5 tables de D-14', () => {
    expect([...WRITE_ALLOWLIST].sort()).toEqual(
      ['routine_completions', 'routines', 'shopping_list_items', 'task_assignees', 'tasks'],
    );
    expect(isWriteAllowed('shopping_list_items')).toBe(true);
    expect(isWriteAllowed('notes')).toBe(false);
  });

  it('B. une écriture allowlistée passe la garde en ligne ET hors ligne', () => {
    onlineManager.setOnline(true);
    expect(() => assertWriteAllowed('shopping_list_items')).not.toThrow();
    onlineManager.setOnline(false);
    // Hors ligne, une écriture Tier 1 part en file (MutationCache) : la garde
    // ne la refuse PAS — sinon la file d'écriture serait vide à jamais.
    expect(() => assertWriteAllowed('tasks')).not.toThrow();
    expect(() => assertWriteAllowed('routine_completions')).not.toThrow();
  });

  it('C. une écriture hors liste hors ligne lève un DataError portant le message utilisateur', () => {
    onlineManager.setOnline(false);
    let caught: unknown = null;
    try {
      assertWriteAllowed('notes');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DataError);
    expect((caught as DataError).message).toBe(OFFLINE_WRITE_REFUSED_MESSAGE);
  });

  it('D. la même écriture hors liste passe en ligne — la liste blanche borne le hors-ligne', () => {
    onlineManager.setOnline(true);
    expect(() => assertWriteAllowed('notes')).not.toThrow();
    expect(() => assertWriteAllowed('expenses')).not.toThrow();
  });
});
