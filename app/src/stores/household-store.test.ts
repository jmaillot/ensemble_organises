import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';
import * as householdStore from './household-store';
import { DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';

const { useHouseholdStore } = householdStore;

/**
 * D-01/D-04 : le store est le point d'ingestion unique des membres. Le hook
 * `useIsAdult` (admin OU membre) y côtoie `useIsAdmin` (inchangé), et le
 * filtre `deleted_at` y est posé une seule fois, dans `setHousehold` et
 * `setMembers` — un enfant archivé disparaît alors de TOUS les consommateurs
 * (panneau des membres, sélecteurs inline, `useCurrentMember`), sans jamais
 * être supprimé de la base.
 */

const baseMember = {
  household_id: 'h-1',
  user_id: null,
  avatar_url: null,
  color_tag: 'accent',
  created_at: '2026-01-01T00:00:00Z',
} as const;

const memberRow = (
  overrides: Record<string, unknown> & Pick<HouseholdMemberRow, 'id' | 'role'>,
): HouseholdMemberRow =>
  ({
    ...baseMember,
    display_name: 'Membre test',
    ...overrides,
    // Assertion tolérante : certains cas portent des colonnes pas encore
    // déclarées sur HouseholdMemberRow (birth_date, deleted_at,
    // managed_modules) — leur ARRIVÉE dans le type est justement l'objet de
    // la tâche ; à la fin du plan, les lignes ci-dessous compilent sans cast.
  }) as HouseholdMemberRow;

const householdRow = {
  id: 'h-1',
  name: 'Foyer Test',
  avatar_color: 'accent',
  school_zone: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  disabled_modules: [],
} as HouseholdRow;

const adulte = memberRow({ id: 'm-adulte', role: 'membre', display_name: 'Adulte' });
const admin = memberRow({ id: 'm-admin', role: 'admin', display_name: 'Admin' });
const enfant = memberRow({ id: 'm-enfant', role: 'enfant', display_name: 'Enfant' });
const enfantArchive = memberRow({
  id: 'm-enfant-archive',
  role: 'enfant',
  display_name: 'Enfant archivé',
  deleted_at: '2026-10-26T10:00:00Z',
});

describe('useIsAdult (D-01)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('retourne true pour un membre courant administrateur', () => {
    useHouseholdStore.setState({ members: [admin], currentMemberId: 'm-admin' });
    expect(typeof householdStore.useIsAdult).toBe('function');
    const { result } = renderHook(() => householdStore.useIsAdult());
    expect(result.current).toBe(true);
  });

  it('retourne true pour « membre » et false pour « enfant »', () => {
    useHouseholdStore.setState({ members: [adulte], currentMemberId: 'm-adulte' });
    const adulteCourant = renderHook(() => householdStore.useIsAdult());
    expect(adulteCourant.result.current).toBe(true);

    useHouseholdStore.setState({ members: [enfant], currentMemberId: 'm-enfant' });
    const enfantCourant = renderHook(() => householdStore.useIsAdult());
    expect(enfantCourant.result.current).toBe(false);
  });
});

describe('useIsAdmin reste inchangé (non-régression)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('est true uniquement pour « admin », false pour membre et enfant', () => {
    useHouseholdStore.setState({ members: [admin], currentMemberId: 'm-admin' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(true);

    useHouseholdStore.setState({ members: [adulte], currentMemberId: 'm-adulte' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(false);

    useHouseholdStore.setState({ members: [enfant], currentMemberId: 'm-enfant' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(false);
  });
});

describe('useMemberRole sur une ligne étendue (typage HouseholdMemberRow)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('lit le rôle d\'une ligne porteuse de birth_date, managed_modules et deleted_at', () => {
    const enfantEtendu = memberRow({
      id: 'm-enfant-etendu',
      role: 'enfant',
      display_name: 'Enfant étendu',
      birth_date: '2016-09-29',
      managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
      deleted_at: null,
    });
    useHouseholdStore.setState({ members: [enfantEtendu], currentMemberId: 'm-enfant-etendu' });
    expect(renderHook(() => householdStore.useMemberRole()).result.current).toBe('enfant');
    // Le store conserve les colonnes étendues telles quelles : aucune
    // normalisation ne doit les amputer en passant par setMembers.
    useHouseholdStore.getState().setMembers([enfantEtendu]);
    expect(useHouseholdStore.getState().members[0]?.birth_date).toBe('2016-09-29');
    expect(useHouseholdStore.getState().members[0]?.managed_modules).toEqual([
      'taches',
      'routines',
      'anniversaires',
      'menu',
    ]);
  });
});

describe('filtre deleted_at en un point unique (D-04)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('setMembers écarte la ligne archivée et conserve les lignes vivantes', () => {
    useHouseholdStore.getState().setMembers([adulte, enfant, enfantArchive]);
    const ids = useHouseholdStore.getState().members.map((row) => row.id);
    expect(ids).not.toContain('m-enfant-archive');
    expect(ids).toEqual(['m-adulte', 'm-enfant']);
  });

  it('setHousehold applique le même filtre', () => {
    useHouseholdStore.getState().setHousehold(householdRow, [admin, enfantArchive]);
    const ids = useHouseholdStore.getState().members.map((row) => row.id);
    expect(ids).toEqual(['m-admin']);
  });

  it('un enfant deleted_at null mais role « enfant » reste listé (le filtre porte sur l\'archivage, pas le rôle)', () => {
    useHouseholdStore.getState().setMembers([adulte, enfant]);
    expect(useHouseholdStore.getState().members.map((row) => row.id)).toContain('m-enfant');
  });
});

describe('seed démo (Noé, socle D-06)', () => {
  it('porte birth_date, deleted_at null et le socle managed_modules', () => {
    const noe = demoMembers.find((row) => row.id === DEMO_MEMBERS.noe);
    expect(noe).toBeDefined();
    expect(noe?.deleted_at).toBeNull();
    expect(noe?.managed_modules).toEqual(['taches', 'routines', 'anniversaires', 'menu']);
  });
});
