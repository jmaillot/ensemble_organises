import { describe, expect, it } from 'vitest';
import type { ConversationRow } from '@/types';
import { resolveConversationTitle, type ConversationParticipant } from './types';

const direct: ConversationRow = {
  id: 'conversation_1',
  household_id: 'household_1',
  type: 'direct',
  title: null,
  created_at: '2026-10-01T09:00:00Z',
};

const groupe: ConversationRow = { ...direct, id: 'conversation_2', type: 'groupe', title: 'Vacances' };

const participant = (id: string, name: string): ConversationParticipant => ({
  id,
  name,
  colorTag: 'accent',
});

describe('resolveConversationTitle', () => {
  it('nomme un groupe par son titre', () => {
    expect(resolveConversationTitle(groupe, [participant('moi', 'Lina Roy')], 'moi')).toBe('Vacances');
  });

  it('nomme un direct par le prénom de l’autre, même complet en base', () => {
    expect(
      resolveConversationTitle(direct, [participant('moi', 'Lina Roy'), participant('elle', 'Camille Diaz')], 'moi'),
    ).toBe('Camille');
  });

  it('garde le prénom de l’interlocuteur parti plutôt que de retomber sur « Foyer »', () => {
    // Le direct n'a pas de titre en base : sans le registre des partis, la
    // liste affichait « Foyer » et l'échange privé devenait anonyme.
    expect(resolveConversationTitle(direct, [], 'moi', [participant('elle', 'Camille Diaz')])).toBe('Camille');
  });

  it('ignore les partis quand l’interlocuteur est encore là', () => {
    expect(
      resolveConversationTitle(
        direct,
        [participant('moi', 'Lina Roy'), participant('elle', 'Camille Diaz')],
        'moi',
        [participant('ancien', 'Noé Martin')],
      ),
    ).toBe('Camille');
  });

  it('retombe sur « Foyer » quand personne n’est connu', () => {
    expect(resolveConversationTitle(direct, [], 'moi')).toBe('Foyer');
  });

  it('nomme un groupe sans titre plutôt que d’afficher une chaîne vide', () => {
    expect(resolveConversationTitle({ ...groupe, title: null }, [], 'moi')).toBe('Groupe du foyer');
  });
});
