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
import { externalKey, memberKey, roundCents, type ExternalParticipant, type MemberOption, type NewExpenseInput, type SplitType } from '../types';

const schema = z
  .object({
    title: z.string().trim().min(1, 'Donnez un libellé à la dépense.').max(80, '80 caractères maximum.'),
    amount: z
      .string()
      .trim()
      .min(1, 'Indiquez un montant.')
      .refine((value) => parseAmount(value) > 0, 'Le montant doit être supérieur à zéro.'),
    paidBy: z.string().min(1, 'Choisissez qui a payé.'),
    date: z.string().min(1, 'Indiquez une date.'),
    splitType: z.enum(['egal', 'personnalise']),
    participants: z.array(z.string()).min(1, 'Choisissez au moins une personne qui partage.'),
    externalIds: z.array(z.string()),
    customShares: z.record(z.string(), z.string()),
  })
  .refine(
    (values) =>
      values.splitType !== 'personnalise' ||
      Object.values(values.customShares).every((value) => value.trim() === '' || parseAmount(value) >= 0),
    { message: 'Les montants personnalisés doivent être positifs.', path: ['customShares'] },
  );

type FormValues = z.infer<typeof schema>;

/** Accepte la virgule française et le point, comme dans l'export de design. */
const parseAmount = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const checkOption =
  'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[11px] font-semibold text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong';

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberOption[];
  externalParticipants: ExternalParticipant[];
  defaultPayerId: string | null;
  onSubmit: (values: NewExpenseInput) => void;
  isPending?: boolean;
}

/**
 * Ajout d'une dépense : libellé, montant, payeur et participants restent
 * visibles ; date, type de partage, participants externes et montants
 * personnalisés sont repliés pour rester lisible sur mobile.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  members,
  externalParticipants,
  defaultPayerId,
  onSubmit,
  isPending = false,
}: ExpenseFormDialogProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);

  const defaultValues = (): FormValues => ({
    title: '',
    amount: '',
    paidBy: defaultPayerId ?? members[0]?.id ?? '',
    date: todayIso(),
    splitType: 'egal',
    participants: members.map((member) => member.id),
    externalIds: [],
    customShares: {},
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaultValues() });

  useEffect(() => {
    if (!open) return;
    reset(defaultValues());
    setOptionsOpen(false);
    // `defaultValues` est recalculé à chaque rendu : on ne dépend que de l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const splitType = watch('splitType');
  const participants = watch('participants') ?? [];
  const externalIds = watch('externalIds') ?? [];
  const amount = parseAmount(watch('amount'));
  const shareCount = participants.length + externalIds.length;

  const submit = (values: FormValues) => {
    onSubmit({
      title: values.title,
      amount: roundCents(parseAmount(values.amount)),
      paidBy: values.paidBy,
      date: values.date,
      splitType: values.splitType as SplitType,
      participants: [...values.participants.map(memberKey), ...values.externalIds.map(externalKey)],
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
          <DialogTitle>Ajouter une dépense</DialogTitle>
          <DialogDescription>Le partage se calcule automatiquement pour les membres choisis.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <Field label="Libellé" error={errors.title?.message}>
            {(props) => <Input {...props} {...register('title')} placeholder="Ex. Courses du samedi" />}
          </Field>

          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Montant" error={errors.amount?.message} hint="En euros">
              {(props) => (
                <Input {...props} type="number" step="0.01" min="0" inputMode="decimal" placeholder="24,90" {...register('amount')} />
              )}
            </Field>
            <Field label="Payé par" error={errors.paidBy?.message}>
              {(props) => (
                <Select {...props} {...register('paidBy')}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <fieldset className="grid gap-1.5">
            <legend className="text-[11px] font-extrabold text-muted">Qui partage</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <label key={member.id} className={checkOption}>
                  <input type="checkbox" value={member.id} className="accent-accent" {...register('participants')} />
                  <MemberAvatar name={member.name} colorTag={member.colorTag} size="sm" />
                  {member.name.split(' ')[0]}
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

              {externalParticipants.length > 0 ? (
                <fieldset className="grid gap-1.5">
                  <legend className="text-[11px] font-extrabold text-muted">Participants externes</legend>
                  <div className="flex flex-wrap gap-2">
                    {externalParticipants.map((participant) => (
                      <label key={participant.id} className={checkOption}>
                        <input type="checkbox" value={participant.id} className="accent-accent" {...register('externalIds')} />
                        <span className="grid size-[23px] shrink-0 place-items-center rounded-[8px] bg-muted text-[9px] font-extrabold text-surface">
                          {participant.name.slice(0, 2).toUpperCase()}
                        </span>
                        {participant.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {splitType === 'personnalise' ? (
                <fieldset className="grid gap-2">
                  <legend className="text-[11px] font-extrabold text-muted">Montants personnalisés</legend>
                  <p className="m-0 text-[10px] text-muted">
                    Le dernier participant absorbe l’écart pour que la somme corresponde au montant.
                  </p>
                  {members
                    .filter((member) => participants.includes(member.id))
                    .map((member) => (
                      <Field key={member.id} label={member.name} className="grid-cols-[1fr_130px] items-center gap-3">
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
                </fieldset>
              ) : null}
            </Collapsible.Content>
          </Collapsible.Root>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Ajouter la dépense'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
