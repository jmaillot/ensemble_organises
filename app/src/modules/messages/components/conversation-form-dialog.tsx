import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/primitives';
import { MemberAvatar } from '@/components/shared/member-avatar';
import type { HouseholdMemberRow } from '@/types';

const schema = z
  .object({
    type: z.enum(['direct', 'groupe']),
    title: z.string().trim().max(120, '120 caractères maximum.'),
    memberIds: z.array(z.string()).min(1, 'Choisissez au moins un membre.'),
  })
  .refine((values) => values.type !== 'groupe' || values.title.trim().length >= 2, {
    message: 'Un groupe exige un titre.',
    path: ['title'],
  });

export interface ConversationFormValues {
  type: 'direct' | 'groupe';
  title: string;
  memberIds: string[];
}

export interface ConversationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: HouseholdMemberRow[];
  /** Membre courant : participe d'office, non proposé dans la liste. */
  currentMemberId: string;
  isSaving?: boolean;
  onSubmit: (values: ConversationFormValues) => Promise<void> | void;
}

/**
 * Création d'une conversation : un interlocuteur (direct) ou plusieurs
 * (groupe, titre exigé). Le créateur participe toujours, sans avoir à se
 * cocher — enfants inclus, comme le reste du foyer.
 */
export function ConversationFormDialog({
  open,
  onOpenChange,
  members,
  currentMemberId,
  isSaving = false,
  onSubmit,
}: ConversationFormDialogProps) {
  const others = members.filter((member) => member.id !== currentMemberId);
  const { register, handleSubmit, reset, control, watch, formState } = useForm<ConversationFormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { type: 'direct', title: '', memberIds: [] },
  });
  const errors = formState.errors;
  const type = watch('type');
  const selected = watch('memberIds') ?? [];

  useEffect(() => {
    if (open) reset({ type: 'direct', title: '', memberIds: [] });
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Messages</p>
          <DialogTitle>Démarrer une conversation</DialogTitle>
          <DialogDescription>
            Un interlocuteur pour un échange privé, plusieurs pour un groupe. Vous en faites partie d’office.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de conversation">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                  <input type="radio" value="direct" checked={field.value === 'direct'} onChange={() => field.onChange('direct')} />
                  Échange privé
                </label>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                  <input type="radio" value="groupe" checked={field.value === 'groupe'} onChange={() => field.onChange('groupe')} />
                  Groupe
                </label>
              </div>
            )}
          />

          {type === 'groupe' ? (
            <Field label="Titre du groupe" error={errors.title?.message}>
              {(props) => <Input {...props} {...register('title')} placeholder="Ex. Projet cabane" autoComplete="off" />}
            </Field>
          ) : null}

          <Controller
            name="memberIds"
            control={control}
            render={({ field }) => (
              <fieldset className="grid gap-1.5">
                <legend className="text-[11px] font-extrabold text-muted">Avec qui</legend>
                <div className="flex flex-wrap gap-2">
                  {others.map((member) => {
                    const checked = (field.value ?? []).includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            field.onChange(value ? [...(field.value ?? []), member.id] : (field.value ?? []).filter((id) => id !== member.id))
                          }
                          aria-label={`Inviter ${member.display_name}`}
                        />
                        <MemberAvatar member={member} size="sm" />
                        {member.display_name}
                      </label>
                    );
                  })}
                </div>
                {errors.memberIds?.message ? (
                  <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                    {errors.memberIds.message}
                  </p>
                ) : (
                  <p className="m-0 text-[10px] text-muted">
                    {selected.length > 0
                      ? `${selected.length} personne${selected.length > 1 ? 's' : ''} sélectionnée${selected.length > 1 ? 's' : ''}, plus vous.`
                      : 'Cochez au moins une personne.'}
                  </p>
                )}
              </fieldset>
            )}
          />

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              Démarrer
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface AddMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Membres du foyer hors participants actuels. */
  eligible: HouseholdMemberRow[];
  conversationTitle: string;
  isSaving?: boolean;
  onSubmit: (memberIds: string[]) => Promise<void> | void;
}

/**
 * Ajout ultérieur de membres à une conversation existante : un participant
 * (ou un admin) fait entrer un membre manquant.
 */
export function AddMembersDialog({
  open,
  onOpenChange,
  eligible,
  conversationTitle,
  isSaving = false,
  onSubmit,
}: AddMembersDialogProps) {
  const { handleSubmit, reset, control, watch, formState } = useForm<{ memberIds: string[] }>({
    resolver: zodResolver(z.object({ memberIds: z.array(z.string()).min(1, 'Choisissez au moins un membre.') })),
    mode: 'onSubmit',
    defaultValues: { memberIds: [] },
  });
  const errors = formState.errors;
  const selected = watch('memberIds') ?? [];

  useEffect(() => {
    if (open) reset({ memberIds: [] });
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Messages</p>
          <DialogTitle>Ajouter un membre</DialogTitle>
          <DialogDescription>Faire entrer quelqu’un dans « {conversationTitle} ».</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values.memberIds);
          })}
        >
          <Controller
            name="memberIds"
            control={control}
            render={({ field }) => (
              <fieldset className="grid gap-1.5">
                <legend className="text-[11px] font-extrabold text-muted">Membres à ajouter</legend>
                {eligible.length === 0 ? (
                  <p className="m-0 text-[12px] text-muted">Tout le foyer participe déjà.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {eligible.map((member) => {
                      const checked = (field.value ?? []).includes(member.id);
                      return (
                        <label
                          key={member.id}
                          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              field.onChange(
                                value ? [...(field.value ?? []), member.id] : (field.value ?? []).filter((id) => id !== member.id),
                              )
                            }
                            aria-label={`Ajouter ${member.display_name}`}
                          />
                          <MemberAvatar member={member} size="sm" />
                          {member.display_name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.memberIds?.message ? (
                  <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                    {errors.memberIds.message}
                  </p>
                ) : selected.length > 0 ? (
                  <p className="m-0 text-[10px] text-muted">
                    {selected.length} personne{selected.length > 1 ? 's' : ''} à faire entrer.
                  </p>
                ) : null}
              </fieldset>
            )}
          />

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving || eligible.length === 0}>
              Ajouter
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
