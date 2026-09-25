import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { todayIso } from '@/lib/utils';
import { PET_RECORD_TABS, type PetRecord, type PetRecordDraft } from '../types';

const isIsoDate = (value: string) => z.iso.date().safeParse(value).success;

const schema = z
  .object({
    kind: z.enum(['produit', 'vaccin', 'traitement', 'info'], { error: 'Choisissez un type de suivi.' }),
    name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200, 'Ce nom est trop long.'),
    recordDate: z.string().refine(isIsoDate, { message: 'Date invalide.' }),
    nextDueDate: z.string().refine((value) => value === '' || isIsoDate(value), { message: 'Date invalide.' }),
    notes: z.string().trim().max(2000, 'Ces notes sont trop longues.'),
  })
  .refine((values) => !values.nextDueDate || values.nextDueDate >= values.recordDate, {
    message: 'La prochaine échéance doit suivre la date du suivi.',
    path: ['nextDueDate'],
  });

type RecordFormValues = z.infer<typeof schema>;

function toDraft(values: RecordFormValues): PetRecordDraft {
  return {
    kind: values.kind,
    name: values.name,
    recordDate: values.recordDate,
    nextDueDate: values.nextDueDate || null,
    notes: values.notes || null,
  };
}

function defaultsFor(record: PetRecord | null): RecordFormValues {
  if (!record) return { kind: 'vaccin', name: '', recordDate: todayIso(), nextDueDate: '', notes: '' };
  return {
    kind: record.kind,
    name: record.name,
    recordDate: record.recordDate,
    nextDueDate: record.nextDueDate ?? '',
    notes: record.notes ?? '',
  };
}

export interface PetRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petName: string;
  record: PetRecord | null;
  saving?: boolean;
  onSubmit: (draft: PetRecordDraft) => void | Promise<void>;
}

/** Ajout ou modification d'une ligne du carnet de santé. */
export function PetRecordDialog({ open, onOpenChange, petName, record, saving = false, onSubmit }: PetRecordDialogProps) {
  const wasOpen = useRef(false);
  const defaults = useMemo(() => defaultsFor(record), [record]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecordFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open && !wasOpen.current) reset(defaults);
    wasOpen.current = open;
  }, [open, defaults, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow">Carnet de santé</p>
          <DialogTitle>{record ? 'Modifier ce suivi' : 'Ajouter un suivi'}</DialogTitle>
          <DialogDescription>
            {record
              ? `Une ligne du carnet de ${petName}.`
              : `Un produit, un vaccin, un traitement ou une information sur ${petName}.`}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" noValidate onSubmit={handleSubmit((values) => onSubmit(toDraft(values)))}>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Type de suivi" error={errors.kind?.message}>
              {(props) => (
                <Select {...props} {...register('kind')}>
                  {PET_RECORD_TABS.map((tab) => (
                    <option key={tab.kind} value={tab.kind}>
                      {tab.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Nom du suivi" error={errors.name?.message}>
              {(props) => <Input placeholder="Ex. Rappel annuel — rage" {...props} {...register('name')} />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Date du suivi" error={errors.recordDate?.message}>
              {(props) => <Input type="date" {...props} {...register('recordDate')} />}
            </Field>
            <Field
              label="Prochaine échéance"
              optional
              error={errors.nextDueDate?.message}
              hint="Une échéance dans les 14 jours déclenche une alerte."
            >
              {(props) => <Input type="date" {...props} {...register('nextDueDate')} />}
            </Field>
          </div>
          <Field label="Notes" optional error={errors.notes?.message}>
            {(props) => <Textarea rows={3} placeholder="Ex. Gouttes en spot-on." {...props} {...register('notes')} />}
          </Field>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer le suivi'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
