import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/shared/icon';
import { cn, pluralize } from '@/lib/utils';
import { PROVIDER_TYPE_ICON_LABELS, PROVIDER_TYPE_ICONS, type Provider, type ProviderType } from '../types';

const schema = z.object({
  name: z.string().trim().min(1, 'Le nom du type est obligatoire.').max(120, 'Ce nom est trop long.'),
});

type TypeFormValues = z.infer<typeof schema>;

export interface ProviderTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ProviderType[];
  providers: Provider[];
  saving?: boolean;
  onSave: (id: string | null, values: { name: string; icon: string }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

function IconPicker({ value, onChange, idPrefix }: { value: string; onChange: (icon: string) => void; idPrefix: string }) {
  return (
    <div
      role="radiogroup"
      aria-label="Icône du type"
      className="grid grid-cols-5 gap-2 rounded-[11px] bg-bg p-2 sm:grid-cols-10"
    >
      {PROVIDER_TYPE_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={value === icon}
          aria-label={PROVIDER_TYPE_ICON_LABELS[icon] ?? icon}
          id={`${idPrefix}-${icon}`}
          onClick={() => onChange(icon)}
          className={cn(
            'grid min-h-11 place-items-center rounded-[10px] border text-muted transition-colors duration-[var(--duration-quick)]',
            value === icon ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border bg-surface hover:border-accent hover:text-fg',
          )}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}

/** Gestion des `provider_types` : ajout, renommage, icône et suppression. */
export function ProviderTypeDialog({
  open,
  onOpenChange,
  types,
  providers,
  saving = false,
  onSave,
  onDelete,
}: ProviderTypeDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [icon, setIcon] = useState<string>('people');
  const [pending, setPending] = useState<ProviderType | null>(null);
  const wasOpen = useRef(false);
  const editing = useMemo(() => types.find((type) => type.id === editingId) ?? null, [types, editingId]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TypeFormValues>({ resolver: zodResolver(schema), defaultValues: { name: '' } });

  useEffect(() => {
    if (open && !wasOpen.current) {
      setEditingId(null);
      setIcon('people');
      reset({ name: '' });
    }
    wasOpen.current = open;
  }, [open, reset]);

  useEffect(() => {
    if (editing) {
      reset({ name: editing.name });
      setIcon(editing.icon);
    }
  }, [editing, reset]);

  const usageOf = (typeId: string) => providers.filter((provider) => provider.typeId === typeId).length;

  const submit = handleSubmit(async (values) => {
    await onSave(editingId, { name: values.name, icon });
    setEditingId(null);
    setIcon('people');
    reset({ name: '' });
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Prestataires</p>
            <DialogTitle>Gérer les types</DialogTitle>
            <DialogDescription>
              Les types sont propres au foyer : ils servent au filtre et à l’icône de chaque fiche.
            </DialogDescription>
          </DialogHeader>

          {types.length === 0 ? (
            <p className="m-0 rounded-[11px] bg-bg px-3 py-3 text-xs text-muted">
              Aucun type pour l’instant. Ajoutez le premier ci-dessous.
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {types.map((type) => (
                <li key={type.id} className="flex items-center gap-2.5 rounded-[11px] bg-bg px-3 py-2.5">
                  <span className="grid size-[34px] place-items-center rounded-[11px] bg-accent-soft text-accent-strong">
                    <Icon name={type.icon} size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-[13px]">{type.name}</strong>
                    <small className="block text-[10px] text-muted">
                      {pluralize(usageOf(type.id), 'prestataire')}
                    </small>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    icon="edit"
                    className="size-[34px] text-muted hover:bg-accent-faint hover:text-fg"
                    aria-label={`Renommer le type ${type.name}`}
                    onClick={() => setEditingId(type.id)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon="trash"
                    className="size-[34px] text-muted hover:bg-coral-soft hover:text-coral"
                    aria-label={`Supprimer le type ${type.name}`}
                    onClick={() => setPending(type)}
                  />
                </li>
              ))}
            </ul>
          )}

          <form className="mt-4 grid gap-3.5 rounded-[16px] border border-border p-3.5" noValidate onSubmit={submit}>
            <p className="m-0 text-[12px] font-extrabold">
              {editing ? `Renommer « ${editing.name} »` : 'Ajouter un type'}
            </p>
            <Field label="Nom du type" error={errors.name?.message}>
              {(props) => (
                <Input placeholder="Ex. Médecin" list="provider-type-suggestions" {...props} {...register('name')} />
              )}
            </Field>
            <datalist id="provider-type-suggestions">
              {types.map((type) => (
                <option key={type.id} value={type.name} />
              ))}
            </datalist>
            <Field label="Icône" optional>
              {() => (
                <IconPicker
                  value={icon}
                  onChange={setIcon}
                  idPrefix={editing ? 'type-edit' : 'type-new'}
                />
              )}
            </Field>
            <DialogActions>
              {editing ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingId(null);
                    setIcon('people');
                    reset({ name: '' });
                  }}
                >
                  Annuler la modification
                </Button>
              ) : null}
              <Button type="submit" icon="check" disabled={saving}>
                {editing ? 'Enregistrer' : 'Ajouter le type'}
              </Button>
            </DialogActions>
          </form>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Terminer
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Supprimer ce type ?"
        description={
          pending
            ? usageOf(pending.id) > 0
              ? `« ${pending.name} » sera retiré. ${pluralize(usageOf(pending.id), 'prestataire', 'prestataires')} resteront dans le carnet, sans type.`
              : `« ${pending.name} » sera définitivement supprimé.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer le type"
        onConfirm={() => {
          if (pending) {
            void onDelete(pending.id);
            if (editingId === pending.id) setEditingId(null);
          }
          setPending(null);
        }}
      />
    </>
  );
}
