/**
 * T1 (25-07) — la garde D-06 en un point unique.
 *
 * Pourquoi chaque cas :
 * - Le socle D-06 ['taches','routines','anniversaires','menu'] est le défaut
 *   d'un enfant créé : il figure dans ces quatre espaces et NULLE PART ailleurs
 *   tant que sa fiche ne l'active pas (backstop A4 de 25-UI-SPEC, lisible
 *   avant le premier picker branché).
 * - Un enfant archivé (`deleted_at`) reste exclu même si la fiche porte encore
 *   la clé : la fonction pure est défensive, le store filtre déjà (D-04,
 *   plan 25-05) — un double filet ne coûte rien, un trou coûte un refus 42501.
 * - Une clé inconnue ou vide n'appartient à aucun `managed_modules` réel :
 *   refus-par-défaut pour les enfants, les adultes restent — même sémantique
 *   que la base (0146, `managed_child_module_allowed` lit la ligne membre).
 * - La fonction est PURE : prise en paramètre, jamais lue depuis un store —
 *   testable avant tout picker, sans React ni IndexedDB.
 */
import { describe, expect, it } from 'vitest';
import type { HouseholdMemberRow } from '@/types';
import type { ModuleKey } from '@/lib/modules';
import { eligibleMembersForModule } from './member-eligibility';

const baseMember: HouseholdMemberRow = {
  id: '',
  role: 'membre',
  household_id: 'h-1',
  user_id: null,
  display_name: '',
  avatar_url: null,
  color_tag: 'accent',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const row = (
  overrides: Partial<HouseholdMemberRow> & Pick<HouseholdMemberRow, 'id' | 'role' | 'display_name'>,
): HouseholdMemberRow => ({ ...baseMember, ...overrides });

const admin = row({ id: 'm-camille', role: 'admin', display_name: 'Camille Martin' });
const membre = row({ id: 'm-lior', role: 'membre', display_name: 'Lior Martin', color_tag: 'ink' });
const adultes = [admin, membre];

const SOCLE = ['taches', 'routines', 'anniversaires', 'menu'] as const;

const enfantSocle = row({
  id: 'm-noe',
  role: 'enfant',
  display_name: 'Noé Martin',
  color_tag: 'amber',
  managed_modules: [...SOCLE],
});

describe('eligibleMembersForModule — garde D-06', () => {
  it('A4, 0 enfant : retourne les adultes tels quels', () => {
    const members = adultes;
    expect(eligibleMembersForModule(members, 'taches')).toEqual(adultes);
    expect(eligibleMembersForModule(members, 'menu')).toEqual(adultes);
  });

  it('A4, enfant au socle : présent dans les 4 espaces du socle, absent ailleurs (messages, ardoise)', () => {
    const members = [...adultes, enfantSocle];
    for (const cle of SOCLE) {
      expect(eligibleMembersForModule(members, cle), `socle « ${cle} »`).toEqual([...adultes, enfantSocle]);
    }
    expect(eligibleMembersForModule(members, 'messages')).toEqual(adultes);
    expect(eligibleMembersForModule(members, 'ardoise')).toEqual(adultes);
  });

  it('A4, mélange : seul l\'enfant qui porte la clé est servi, jamais l\'autre', () => {
    const enfantMenu = row({
      id: 'm-rose',
      role: 'enfant',
      display_name: 'Rose Martin',
      color_tag: 'coral',
      managed_modules: ['menu'],
    });
    const members = [...adultes, enfantSocle, enfantMenu];
    expect(eligibleMembersForModule(members, 'menu')).toEqual([...adultes, enfantSocle, enfantMenu]);
    expect(eligibleMembersForModule(members, 'taches')).toEqual([...adultes, enfantSocle]);
    expect(eligibleMembersForModule(members, 'messages')).toEqual(adultes);
  });

  it('D-04, enfant archivé : exclu même si la fiche porte encore la clé', () => {
    const enfantArchive = row({
      ...enfantSocle,
      id: 'm-noe',
      display_name: 'Noé Martin',
      managed_modules: [...SOCLE],
      deleted_at: '2026-10-20T10:00:00Z',
    });
    const members = [...adultes, enfantArchive];
    expect(eligibleMembersForModule(members, 'taches')).toEqual(adultes);
  });

  it('refus par défaut : clé inconnue ou vide — les enfants sortent, les adultes restent', () => {
    const members = [...adultes, enfantSocle];
    expect(eligibleMembersForModule(members, 'frigo')).toEqual(adultes);
    expect(eligibleMembersForModule(members, '' as ModuleKey)).toEqual(adultes);
  });

  it('pureté : l\'entrée n\'est pas mutée et l\'appel est déterministe', () => {
    const members = [...adultes, enfantSocle];
    const copie = [...members];
    const premier = eligibleMembersForModule(members, 'menu');
    const second = eligibleMembersForModule(members, 'menu');
    expect(members).toEqual(copie);
    expect(premier).toEqual(second);
  });
});
