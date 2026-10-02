import type { ExpenseParticipantRow, ExpenseRow, MemberColorTag } from '@/types';

/** Type de partage porté par `expenses.split_type`. */
export type SplitType = 'egal' | 'personnalise';

/** Nature d'un participant : membre du foyer ou invité externe d'une ardoise. */
export type ParticipantKind = 'membre' | 'guest';

export const MEMBER_KEY_PREFIX = 'membre:';
export const GUEST_KEY_PREFIX = 'invite:';

export const memberKey = (id: string) => `${MEMBER_KEY_PREFIX}${id}`;
export const guestKey = (id: string) => `${GUEST_KEY_PREFIX}${id}`;

/** Clé stable d'un participant, membre ou invité. */
export const participantKey = (kind: ParticipantKind, id: string) =>
  kind === 'guest' ? guestKey(id) : memberKey(id);

/** Résolution d'un `member_id` en libellé. */
export type ParticipantResolver = (kind: ParticipantKind, id: string) => { name: string; colorTag: MemberColorTag | null } | null;

export interface Participant {
  /** `membre:<id>` ou `invite:<id>` : clé stable d'un participant. */
  key: string;
  kind: ParticipantKind;
  /** `member_id` ou `guest_id` selon le kind. */
  memberId: string;
  name: string;
  colorTag: MemberColorTag | null;
  shareAmount: number;
}

export interface Expense {
  id: string;
  ardoiseId: string;
  title: string;
  amount: number;
  paidBy: string | null;
  paidByKind: ParticipantKind;
  paidByName: string;
  paidByColorTag: MemberColorTag | null;
  date: string;
  splitType: SplitType;
  participants: Participant[];
}

export interface MemberOption {
  id: string;
  name: string;
  colorTag: MemberColorTag;
  role: 'admin' | 'membre' | 'enfant';
}

/** Solde signé : positif = le foyer lui doit, négatif = il doit au foyer. */
export interface Balance {
  key: string;
  kind: ParticipantKind;
  name: string;
  colorTag: MemberColorTag | null;
  amount: number;
}

/** Proposition de compensation : `from` rembourse `to`. */
export interface Settlement {
  id: string;
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  amount: number;
}

export interface NewExpenseInput {
  /** Ardoise visée (obligatoire depuis les ardoises multiples). */
  ardoiseId?: string;
  title: string;
  amount: number;
  paidBy: string;
  /** Membre ou invité ; `membre` par défaut (compatibilité). */
  paidByKind?: ParticipantKind;
  date: string;
  splitType: SplitType;
  /** Clés de participants dans l'ordre d'affichage ; le dernier absorbe l'écart. */
  participants: string[];
  /** Montants personnalisés, uniquement pour `split_type = personnalise`. */
  customShares?: Record<string, number>;
}

/** Invitation ciblée (`invitations`), distincte du token d'accès au foyer. */
export interface InvitationInput {
  name: string;
  email: string;
  role: 'membre' | 'enfant';
  access: 'foyer' | 'cercle' | 'ardoise';
}

export const roundCents = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const sum = (values: number[]) => roundCents(values.reduce((total, value) => total + value, 0));

/**
 * Partage égal au centime : les parts sont arrondies et le dernier participant
 * absorbe la différence, afin que la somme reproduce toujours le montant exact.
 */
export function splitEqual(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const base = roundCents(amount / count);
  const shares = Array.from({ length: count }, () => base);
  shares[count - 1] = roundCents(shares[count - 1] + (amount - base * count));
  return shares;
}

/** Normalise des parts personnalisées : le dernier participant porte l'écart. */
export function normalizeShares(amount: number, keys: string[], custom?: Record<string, number>): number[] {
  if (!custom) return splitEqual(amount, keys.length);
  const shares = keys.map((key) => roundCents(custom[key] ?? 0));
  if (shares.length > 0) {
    const last = shares.length - 1;
    shares[last] = roundCents(shares[last] + (amount - sum(shares)));
  }
  return shares;
}

/** Convertit une ligne `expenses` + ses participants en dépense métier. */
export function toExpense(
  row: ExpenseRow,
  participants: ExpenseParticipantRow[],
  resolve: ParticipantResolver,
): Expense {
  const paidKind: ParticipantKind = row.paid_by_guest ? 'guest' : 'membre';
  const payerId = row.paid_by_guest ?? row.paid_by ?? '';
  const payer = payerId === '' ? null : resolve(paidKind, payerId);
  return {
    id: row.id,
    ardoiseId: row.ardoise_id,
    title: row.title,
    amount: Number(row.amount) || 0,
    paidBy: row.paid_by_guest ?? row.paid_by,
    paidByKind: paidKind,
    paidByName: payer?.name ?? 'Payeur',
    paidByColorTag: payer?.colorTag ?? null,
    date: row.expense_date,
    splitType: row.split_type === 'personnalise' ? 'personnalise' : 'egal',
    participants: participants
      .filter((participant) => participant.expense_id === row.id)
      .map((participant) => {
        const kind: ParticipantKind = participant.participant_type === 'guest' ? 'guest' : 'membre';
        const id = (kind === 'guest' ? participant.guest_id : participant.member_id) ?? '';
        const resolved = id === '' ? null : resolve(kind, id);
        return {
          key: participantKey(kind, id),
          kind,
          memberId: id,
          name: resolved?.name ?? 'Participant',
          colorTag: resolved?.colorTag ?? null,
          shareAmount: Number(participant.share_amount) || 0,
        } satisfies Participant;
      }),
  };
}

/**
 * Solde de chaque participant : ce qu'il a avancé moins sa part.
 * La somme des soldes est nulle par ardoise (membres + invités).
 */
export function computeBalances(expenses: Expense[], seeds: Participant[]): Balance[] {
  const totals = new Map<string, number>();
  seeds.forEach((seed) => totals.set(seed.key, 0));
  expenses.forEach((expense) => {
    if (expense.paidBy !== null) {
      const payerKey = participantKey(expense.paidByKind, expense.paidBy);
      totals.set(payerKey, (totals.get(payerKey) ?? 0) + expense.amount);
    }
    expense.participants.forEach((participant) => {
      totals.set(participant.key, (totals.get(participant.key) ?? 0) - participant.shareAmount);
    });
  });
  return seeds.map((seed) => ({
    key: seed.key,
    kind: seed.kind,
    name: seed.name,
    colorTag: seed.colorTag,
    amount: roundCents(totals.get(seed.key) ?? 0),
  }));
}

/**
 * Part d'un participant au camembert : clé stable, nature, nom, pastille et
 * montant (avancé pour `computeSpent`).
 */
export interface Share {
  key: string;
  kind: ParticipantKind;
  name: string;
  colorTag: MemberColorTag | null;
  amount: number;
}

/**
 * Dépensé par payeur : somme des montants avancés par chacun, triée du plus
 * gros dépensier au plus petit. Sert le camembert de la Répartition.
 */
export function computeSpent(expenses: Expense[]): Share[] {
  const totals = new Map<string, Share>();
  for (const expense of expenses) {
    if (expense.paidBy === null) continue;
    const key = participantKey(expense.paidByKind, expense.paidBy);
    const current = totals.get(key);
    if (current) {
      current.amount = roundCents(current.amount + expense.amount);
    } else {
      totals.set(key, {
        key,
        kind: expense.paidByKind,
        name: expense.paidByName,
        colorTag: expense.paidByColorTag,
        amount: roundCents(expense.amount),
      });
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Compensation gloutonne : les plus gros créanciers sont servis en premier, ce
 * qui produit le plus petit nombre de versements pour l'ensemble du foyer.
 */
export function simplifyDebts(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((balance) => balance.amount > 0.005)
    .map((balance) => ({ key: balance.key, name: balance.name, amount: roundCents(balance.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((balance) => balance.amount < -0.005)
    .map((balance) => ({ key: balance.key, name: balance.name, amount: roundCents(-balance.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = roundCents(Math.min(creditor.amount, debtor.amount));
    if (amount > 0) {
      settlements.push({
        id: `${debtor.key}>${creditor.key}`,
        fromKey: debtor.key,
        fromName: debtor.name,
        toKey: creditor.key,
        toName: creditor.name,
        amount,
      });
    }
    creditor.amount = roundCents(creditor.amount - amount);
    debtor.amount = roundCents(debtor.amount - amount);
    if (creditor.amount < 0.005) creditorIndex += 1;
    if (debtor.amount < 0.005) debtorIndex += 1;
  }
  return settlements;
}
