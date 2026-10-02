import { describe, expect, it } from 'vitest';
import { filterRoutinesByAssignee, filterRoutinesByFolder, type Routine } from './types';

const routine = (overrides: Partial<Routine>): Routine => ({
  id: 'r',
  name: 'Routine',
  description: null,
  recurrenceRule: 'FREQ=DAILY',
  folderId: null,
  frequencyLabel: 'Chaque jour',
  preset: 'quotidien',
  assignees: [],
  reminderAt: null,
  reminderLabel: null,
  reminders: [],
  isLate: false,
  lateCount: 0,
  lateLabel: null,
  createdBy: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  isDueToday: false,
  isDoneToday: false,
  streak: 0,
  streakLabel: 'Série à relancer',
  missedDates: [],
  nextDate: null,
  nextLabel: 'Aucune occurrence',
  ...overrides,
});

const withAssignee = (memberId: string) => ({
  memberId,
  member: {
    id: memberId,
    household_id: 'h',
    user_id: null,
    display_name: 'Membre',
    avatar_url: null,
    color_tag: 'accent' as const,
    role: 'membre' as const,
    created_at: '2026-10-02T10:00:00.000Z',
  },
});

describe('filterRoutinesByFolder', () => {
  const routines = [routine({ id: 'a' }), routine({ id: 'b', folderId: 'f1' })];
  it('null = Général, dossier explicite', () => {
    expect(filterRoutinesByFolder(routines, null).map((entry) => entry.id)).toEqual(['a']);
    expect(filterRoutinesByFolder(routines, 'f1').map((entry) => entry.id)).toEqual(['b']);
  });
});

describe('filterRoutinesByAssignee', () => {
  const routines = [routine({ id: 'a', assignees: [withAssignee('m1')] }), routine({ id: 'b' })];
  it('tous, non-assigne, membre', () => {
    expect(filterRoutinesByAssignee(routines, 'tous')).toHaveLength(2);
    expect(filterRoutinesByAssignee(routines, 'non-assigne').map((entry) => entry.id)).toEqual(['b']);
    expect(filterRoutinesByAssignee(routines, 'm1').map((entry) => entry.id)).toEqual(['a']);
  });
});
