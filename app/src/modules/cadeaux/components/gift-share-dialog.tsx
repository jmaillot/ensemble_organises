import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { MemberAvatar } from '@/components/shared/member-avatar';
import type { HouseholdMemberRow } from '@/types';
import { permissionLabel, type GiftList, type GiftShare, type GiftShareInput } from '../types';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const schema = z
  .object({
    members: z.array(z.string()),
    permissions: z.record(z.string(), z.enum(['lecture', 'reservation'])),
    email: z.string().trim().refine((value) => value === '' || emailPattern.test(value), 'Indiquez un email valide.'),
  })
  .refine((values) => values.members.length > 0 || values.email !== '', {
    message: 'Choisissez un membre du foyer ou invitez un proche.',
    path: ['members'],
  });

type FormValues = z.infer<typeof schema>;

export interface GiftShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: GiftList | null;
  members: HouseholdMemberRow[];
  existingShares: GiftShare[];
  onSubmit: (listId: string, shares: GiftShareInput[]) => void;
  isPending?: boolean;
}

/**
 * Partage d'une liste de cadeaux : le schéma porte le partage au niveau de la
 * liste (`gift_list_shares`), chaque destinataire ayant sa propre permission.
 */
export function GiftShareDialog({
  open,
  onOpenChange,
  list,
  members,
  existingShares,
  onSubmit,
  isPending = false,
}: GiftShareDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { members: [], permissions: {}, email: '' },
  });

  const shareable = members.filter((member) => member.id !== list?.ownerMemberId);
  const selected = watch('members') ?? [];

  useEffect(() => {
    if (!open || !list) return;
    reset({
      members: existingShares.filter((share) => share.memberId).map((share) => share.memberId as string),
      permissions: Object.fromEntries(
        existingShares.filter((share) => share.memberId).map((share) => [share.memberId as string, share.permission]),
      ),
      email: existingShares.find((share) => share.email)?.email ?? '',
    });
  }, [existingShares, list, open, reset]);

  const submit = (values: FormValues) => {
    if (!list) return;
    const shares: GiftShareInput[] = values.members.map((memberId) => ({
      memberId,
      email: null,
      permission: values.permissions[memberId] === 'reservation' ? 'reservation' : 'lecture',
    }));
    if (values.email !== '') {
      shares.push({ memberId: null, email: values.email, permission: 'lecture' });
    }
    onSubmit(list.id, shares);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Cadeaux</p>
          <DialogTitle>Partager cette idée</DialogTitle>
          <DialogDescription>
            {list
              ? `Choisissez les personnes du foyer ou un proche externe. Le partage porte sur toute la liste « ${list.name} ».`
              : 'Choisissez les personnes du foyer ou un proche externe.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-extrabold text-muted">Membres du foyer</legend>
            {shareable.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong">
                  <input type="checkbox" value={member.id} className="accent-accent" {...register('members')} />
                  <MemberAvatar member={member} size="sm" />
                  {member.display_name}
                </label>
                <Select
                  aria-label={`Permission pour ${member.display_name}`}
                  className="w-[150px] shrink-0"
                  {...register(`permissions.${member.id}`)}
                >
                  <option value="lecture">{permissionLabel.lecture}</option>
                  <option value="reservation">{permissionLabel.reservation}</option>
                </Select>
              </div>
            ))}
            {errors.members?.message ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                {errors.members.message}
              </p>
            ) : null}
            {selected.length > 0 ? (
              <p className="m-0 text-[10px] text-muted">{`${selected.length} personne(s) sélectionnée(s).`}</p>
            ) : null}
          </fieldset>

          <Field label="Inviter un proche (optionnel)" error={errors.email?.message} hint="Un accès lecture seule">
            {(props) => <Input {...props} type="email" placeholder="prenom@exemple.fr" {...register('email')} />}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="share" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer le partage'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
