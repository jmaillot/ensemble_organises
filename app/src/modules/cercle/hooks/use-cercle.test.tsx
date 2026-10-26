/**
 * D-12 (25-05) — modération du Cercle par les adultes : canDelete couvre le
 * contenu d'un enfant géré, pas le contenu des adultes (D-07 reste la règle
 * des publications d'adultes : strictement l'auteur).
 *
 * Les rôles vivent dans le store ; les publications viennent du jeu démo
 * (@/lib/data) enrichi de lignes créées pour l'essai — le hook est exercé
 * en entier (requêtes comprises), pas un doublon de sa logique.
 */

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdMemberRow, PostRow } from '@/types';
import { createTestQueryClient } from '@/test/render';
import { useCercleFeed } from './use-cercle';

/** Thomas : adulte par le rôle « membre » (D-01), pas administrateur. */
const MEMBRE = DEMO_MEMBERS.thomas;
const ENFANT = DEMO_MEMBERS.noe;

/** Un second enfant : prouver que la modération ne s'étend pas entre enfants. */
const secondEnfant: HouseholdMemberRow = {
  ...(demoMembers.find((member) => member.id === ENFANT) as HouseholdMemberRow),
  id: 'member-mini',
  display_name: 'Mini Martin',
  color_tag: 'coral',
};

const membersAvecSecondEnfant = [...demoMembers, secondEnfant];

const seedView = (memberId: string, members: HouseholdMemberRow[] = demoMembers) => {
  useHouseholdStore.setState({
    householdId: DEMO_HOUSEHOLD_ID,
    householdName: 'Foyer Martin',
    members,
    currentMemberId: memberId,
  });
};

let sequence = 0;
async function createPost(authorId: string): Promise<string> {
  sequence += 1;
  const id = `post-moderation-${sequence}`;
  await data.create<PostRow>('posts', {
    id,
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: authorId,
    text: `Moment d’essai ${sequence}`,
    created_at: new Date().toISOString(),
  });
  return id;
}

async function renderFeed() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const rendered = renderHook(() => useCercleFeed(), { wrapper });
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false), { timeout: 8000 });
  return rendered;
}

const postOf = (feed: ReturnType<typeof useCercleFeed>['feed'], id: string) => {
  const post = feed.find((entry) => entry.id === id);
  expect(post, `la publication ${id} doit être dans le fil`).toBeTruthy();
  return post!;
};

beforeEach(() => {
  useHouseholdStore.getState().reset();
  // Démo : le jeu local persiste entre les essais du fichier ; ids uniques
  // via `sequence` — aucune remise à zéro de l'adaptateur dans ce fichier.
});

describe('useCercleFeed — modération adulte des publications d’enfant (D-12)', () => {
  it('un adulte membre (pas admin) supprime la publication d’un enfant, pas celle d’un autre adulte', async () => {
    const enfantPostId = await createPost(ENFANT);
    const autreAdultePostId = await createPost(DEMO_MEMBERS.lina);
    const sienPostId = await createPost(MEMBRE);
    seedView(MEMBRE);
    const { result } = await renderFeed();

    expect(result.current.canDelete(postOf(result.current.feed, enfantPostId))).toBe(true);
    // D-07 : le contenu adulte garde sa règle stricte d'auteur.
    expect(result.current.canDelete(postOf(result.current.feed, autreAdultePostId))).toBe(false);
    expect(result.current.canDelete(postOf(result.current.feed, sienPostId))).toBe(true);
  });

  it('un administrateur modère le contenu d’enfant, pas celui d’un adulte', async () => {
    const enfantPostId = await createPost(ENFANT);
    const autreAdultePostId = await createPost(DEMO_MEMBERS.lina);
    seedView(DEMO_MEMBERS.camille);
    const { result } = await renderFeed();

    expect(result.current.canDelete(postOf(result.current.feed, enfantPostId))).toBe(true);
    expect(result.current.canDelete(postOf(result.current.feed, autreAdultePostId))).toBe(false);
  });

  it('un enfant ne modère rien : ses propres publications seulement', async () => {
    const sienPostId = await createPost(ENFANT);
    const autreEnfantPostId = await createPost(secondEnfant.id);
    const adultePostId = await createPost(DEMO_MEMBERS.lina);
    seedView(ENFANT, membersAvecSecondEnfant);
    const { result } = await renderFeed();

    expect(result.current.canDelete(postOf(result.current.feed, sienPostId))).toBe(true);
    expect(result.current.canDelete(postOf(result.current.feed, autreEnfantPostId))).toBe(false);
    expect(result.current.canDelete(postOf(result.current.feed, adultePostId))).toBe(false);
  });
});
