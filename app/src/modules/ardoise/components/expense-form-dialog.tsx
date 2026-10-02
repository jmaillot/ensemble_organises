import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Collapsible from '@radix-ui/react-collapsible';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { formatEuro, todayIso } from '@/lib/utils';
import { GUEST_KEY_PREFIX, MEMBER_KEY_PREFIX, FREE_PAYER_VALUE, guestKey, memberKey, participantKey, roundCents, type Expense, type MemberOption, type NewExpenseInput, type ParticipantKind, type SplitType } from '../types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Date calendaire réelle (`2026-02-30` est refusé), passée ou future. */
const isRealDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const schema = z
  .object({
    title: z.string().trim().min(1, 'Donnez un libellé à la dépense.').max(80, '80 caractères maximum.'),
    amount: z
      .string()
      .trim()
      .min(1, 'Indiquez un montant.')
      .refine((value) => parseAmount(value) > 0, 'Le montant doit être supérieur à zéro.'),
    paidBy: z.string().min(1, 'Choisissez qui a payé.'),
    payerName: z.string().trim().max(120, '120 caractères maximum.').optional(),
    date: z.string().refine(isRealDate, 'Indiquez une date valide (AAAA-MM-JJ).'),
    splitType: z.enum(['egal', 'personnalise']),
    participants: z.array(z.string()).min(1, 'Choisissez au moins une personne qui partage.'),
    customShares: z.record(z.string(), z.string()),
  })
  .refine(
    (values) =>
      values.splitType !== 'personnalise' ||
      Object.values(values.customShares).every((value) => value.trim() === '' || parseAmount(value) >= 0),
    { message: 'Les montants personnalisés doivent être positifs.', path: ['customShares'] },
  )
  .refine((values) => values.paidBy !== FREE_PAYER_VALUE || (values.payerName ?? '').trim() !== '', {
    message: 'Indiquez le nom de la personne.',
    path: ['payerName'],
  });

type FormValues = z.infer<typeof schema>;

/** Accepte la virgule française et le point, comme dans l'export de design. */
const parseAmount = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const checkOption =
  'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[11px] font-semibold text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong max-[650px]:min-h-11';

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberOption[];
  /** Invités de l'ardoise (sans pastille couleur). */
  guests?: { id: string; name: string }[];
  defaultPayerId: string | null;
  onSubmit: (values: NewExpenseInput) => void;
  isPending?: boolean;
  /** Dépense à modifier ; absente, le dialogue crée. */
  initialExpense?: Expense | null;
}

/**
 * Ajout et modification d'une dépense : libellé, montant, payeur et
 * participants restent visibles ; date, type de partage et montants
 * personnalisés sont repliés pour rester lisible sur mobile. Le partage se
 * fait entre membres du foyer et invités de l'ardoise. En édition, le
 * formulaire est pré-rempli de la dépense visée.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  members,
  guests = [],
  defaultPayerId,
  onSubmit,
  isPending = false,
  initialExpense = null,
}: ExpenseFormDialogProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const editing = initialExpense !== null;

  const defaultValues = (expense: Expense | null): FormValues => {
    if (!expense) {
      return {
        title: '',
        amount: '',
        paidBy: defaultPayerId ? memberKey(defaultPayerId) : (members[0] ? memberKey(members[0].id) : ''),
        payerName: '',
        date: todayIso(),
        splitType: 'egal',
        participants: [...members.map((member) => memberKey(member.id)), ...guests.map((guest) => guestKey(guest.id))],
        customShares: {},
      };
    }
    return {
      title: expense.title,
      amount: String(expense.amount),
      paidBy: expense.paidBy ? participantKey(expense.paidByKind, expense.paidBy) : '',
      payerName: '',
      date: expense.date,
      splitType: expense.splitType,
      participants: expense.participants.map((participant) => participant.key),
      customShares: Object.fromEntries(expense.participants.map((participant) => [participant.key, String(participant.shareAmount)])),
    };
  };

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaultValues(initialExpense) });

  const initialId = initialExpense?.id ?? null;
  useEffect(() => {
    if (!open) return;
    reset(defaultValues(initialExpense));
    setOptionsOpen(false);
    // Se rouvre avec une autre dépense : le pré-remplissage suit la cible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialId, reset]);

  const splitType = watch('splitType');
  const participants = watch('participants') ?? [];
  const paidByValue = watch('paidBy');
  const amount = parseAmount(watch('amount'));
  const shareCount = participants.length;

  const submit = (values: FormValues) => {
    if (values.paidBy === FREE_PAYER_VALUE) {
      onSubmit({
        title: values.title,
        amount: roundCents(parseAmount(values.amount)),
        paidBy: '',
        paidByKind: 'guest',
        payerName: (values.payerName ?? '').trim(),
        date: values.date,
        splitType: values.splitType as SplitType,
        participants: values.participants,
        customShares:
          values.splitType === 'personnalise'
            ? Object.fromEntries(
                Object.entries(values.customShares)
                  .filter(([, value]) => value.trim() !== '')
                  .map(([key, value]) => [key, roundCents(parseAmount(value))]),
              )
            : undefined,
      });
      return;
    }
    const payerKind: ParticipantKind = values.paidBy.startsWith(GUEST_KEY_PREFIX) ? 'guest' : 'membre';
    const payerId = values.paidBy.startsWith(GUEST_KEY_PREFIX)
      ? values.paidBy.slice(GUEST_KEY_PREFIX.length)
      : values.paidBy.startsWith(MEMBER_KEY_PREFIX)
        ? values.paidBy.slice(MEMBER_KEY_PREFIX.length)
        : values.paidBy;
    onSubmit({
      title: values.title,
      amount: roundCents(parseAmount(values.amount)),
      paidBy: payerId,
      paidByKind: payerKind,
      date: values.date,
      splitType: values.splitType as SplitType,
      participants: values.participants,
      customShares:
        values.splitType === 'personnalise'
          ? Object.fromEntries(
              Object.entries(values.customShares)
                .filter(([, value]) => value.trim() !== '')
                .map(([key, value]) => [key, roundCents(parseAmount(value))]),
            )
          : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Ardoise</p>
          <DialogTitle>{editing ? 'Modifier la dépense' : 'Ajouter une dépense'}</DialogTitle>
          <DialogDescription>Le partage se calcule automatiquement pour les membres choisis.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <Field label="Libellé" error={errors.title?.message}>
            {(props) => <Input {...props} {...register('title')} placeholder="Ex. Courses du samedi" />}
          </Field>

          <div className="grid grid-cols-2 items-start gap-3 max-[650px]:grid-cols-1">
            <Field label="Montant" error={errors.amount?.message} hint="En euros">
              {(props) => (
                <Input {...props} type="number" step="0.01" min="0" inputMode="decimal" placeholder="24,90" {...register('amount')} />
              )}
            </Field>
            <Field label="Payé par" error={errors.paidBy?.message}>
              {(props) => (
                <Select {...props} {...register('paidBy')}>
                  {members.map((member) => (
                    <option key={member.id} value={memberKey(member.id)}>
                      {member.name}
                    </option>
                  ))}
                  {guests.map((guest) => (
                    <option key={guest.id} value={guestKey(guest.id)}>
                      {guest.name} (invité)
                    </option>
                  ))}
                  <option value={FREE_PAYER_VALUE}>Autre personne…</option>
                </Select>
              )}
            </Field>
          </div>
          {paidByValue === FREE_PAYER_VALUE ? (
            <Field label="Nom de la personne" error={errors.payerName?.message}>
              {(props) => (
                <Input {...props} {...register('payerName')} placeholder="Ex. Mamie" maxLength={120} autoComplete="off" />
              )}
            </Field>
          ) : null}

          <fieldset className="grid gap-1.5">
            <legend className="text-[11px] font-extrabold text-muted">Qui partage</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <label key={member.id} className={checkOption}>
                  <input type="checkbox" value={memberKey(member.id)} className="accent-accent" {...register('participants')} />
                  <MemberAvatar name={member.name} colorTag={member.colorTag} size="sm" />
                  {member.name.split(' ')[0]}
                </label>
              ))}
              {guests.map((guest) => (
                <label key={guest.id} className={checkOption}>
                  <input type="checkbox" value={guestKey(guest.id)} className="accent-accent" {...register('participants')} />
                  {guest.name.split(' ')[0]}
                </label>
              ))}
            </div>
            {errors.participants?.message ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                {errors.participants.message}
              </p>
            ) : null}
            {shareCount > 0 ? (
              <p className="m-0 text-[10px] text-muted">
                {splitType === 'egal' && amount > 0
                  ? `${formatEuro(amount / shareCount)} par personne`
                  : 'Les parts seront définies dans les options avancées.'}
              </p>
            ) : null}
          </fieldset>

          <Collapsible.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
            <Collapsible.Trigger asChild>
              <Button variant="quiet" size="sm" iconEnd="chevronDown" className="w-full justify-between">
                Options avancées
              </Button>
            </Collapsible.Trigger>
            <Collapsible.Content className="grid gap-3.5 pt-1">
              <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
                <Field label="Date" error={errors.date?.message}>
                  {(props) => <Input {...props} type="date" {...register('date')} />}
                </Field>
                <Field label="Type de partage">
                  {(props) => (
                    <Select {...props} {...register('splitType')}>
                      <option value="egal">Égal entre les participants</option>
                      <option value="personnalise">Montants personnalisés</option>
                    </Select>
                  )}
                </Field>
              </div>

              {splitType === 'personnalise' ? (
                <fieldset className="grid gap-2">
                  <legend className="text-[11px] font-extrabold text-muted">Montants personnalisés</legend>
                  <p className="m-0 text-[10px] text-muted">
                    Le dernier participant absorbe l’écart pour que la somme corresponde au montant.
                  </p>
                  {typeof errors.customShares?.message === 'string' ? (
                    <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                      {errors.customShares.message}
                    </p>
                  ) : null}
                  {members
                    .filter((member) => participants.includes(memberKey(member.id)))
                    .map((member) => (
                      <Field key={member.id} label={member.name} className="grid-cols-[1fr_130px] items-center gap-3 max-[650px]:grid-cols-1">
                        {(props) => (
                          <Input
                            {...props}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder="0,00"
                            {...register(`customShares.${memberKey(member.id)}`)}
                          />
                        )}
                      </Field>
                    ))}
                  {guests
                    .filter((guest) => participants.includes(guestKey(guest.id)))
                    .map((guest) => (
                      <Field key={guest.id} label={`${guest.name} (invité)`} className="grid-cols-[1fr_130px] items-center gap-3 max-[650px]:grid-cols-1">
                        {(props) => (
                          <Input
                            {...props}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder="0,00"
                            {...register(`customShares.${guestKey(guest.id)}`)}
                          />
                        )}
                      </Field>
                    ))}
                </fieldset>
              ) : null}
            </Collapsible.Content>
          </Collapsible.Root>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isPending}>
              {isPending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter la dépense'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
