import { describe, expect, it } from 'vitest';
import { filterByAssignee, filterByFolder, type Task } from './types';

const task = (overrides: Partial<Task>): Task => ({
  id: 't',
  name: 'Tâche',
  description: null,
  dueDate: null,
  status: 'a_faire',
  priorityOrder: 0,
  priority: 'normale',
  assignees: [],
  reminderAt: null,
  folderId: null,
  createdBy: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  isLate: false,
  lateDays: 0,
  dueLabel: 'Sans échéance',
  reminderTime: null,
  reminderLabel: null,
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

describe('filterByFolder', () => {
  const tasks = [task({ id: 'a' }), task({ id: 'b', folderId: 'f1' }), task({ id: 'c', folderId: 'f2' })];
  it('null = Général', () => {
    expect(filterByFolder(tasks, null).map((entry) => entry.id)).toEqual(['a']);
  });
  it('dossier explicite', () => {
    expect(filterByFolder(tasks, 'f1').map((entry) => entry.id)).toEqual(['b']);
    expect(filterByFolder(tasks, 'absent')).toEqual([]);
  });
});

describe('filterByAssignee', () => {
  const tasks = [
    task({ id: 'a', assignees: [withAssignee('m1')] }),
    task({ id: 'b' }),
    task({ id: 'c', assignees: [withAssignee('m1'), withAssignee('m2')] }),
  ];
  it('tous = identité', () => {
    expect(filterByAssignee(tasks, 'tous')).toHaveLength(3);
  });
  it('non-assigne', () => {
    expect(filterByAssignee(tasks, 'non-assigne').map((entry) => entry.id)).toEqual(['b']);
  });
  it('membre précis', () => {
    expect(filterByAssignee(tasks, 'm1').map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(filterByAssignee(tasks, 'm2').map((entry) => entry.id)).toEqual(['c']);
  });
});
