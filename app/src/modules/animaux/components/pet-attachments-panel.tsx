import { useState } from 'react';
import { Panel, CountBadge } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/shared/icon';
import { formatBytes, isImageMime } from '@/lib/storage';
import type { PetAttachment } from '../types';

export interface PetAttachmentsPanelProps {
  petName: string;
  attachments: PetAttachment[];
  isLoading?: boolean;
  uploading?: boolean;
  uploadError?: string | null;
  onAdd: (files: File[]) => void | Promise<void>;
  onDelete: (attachment: PetAttachment) => void | Promise<void>;
}

/**
 * Section « pièces jointes » sous le carnet de santé : ordonnances, factures
 * et comptes rendus, en images ou PDF. Plusieurs fichiers par fiche.
 */
export function PetAttachmentsPanel({
  petName,
  attachments,
  isLoading = false,
  uploading = false,
  uploadError = null,
  onAdd,
  onDelete,
}: PetAttachmentsPanelProps) {
  const [pending, setPending] = useState<PetAttachment | null>(null);

  return (
    <Panel
      title="Pièces jointes"
      description={`Ordonnances, factures et documents de ${petName}.`}
      action={<CountBadge value={attachments.length} label="fichiers" />}
      className="mt-[18px]"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-[11px] text-[12px] font-[760] text-fg transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint">
          <Icon name="plus" size="sm" />
          {uploading ? 'Envoi…' : 'Joindre des fichiers'}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length > 0) void onAdd(files);
            }}
          />
        </label>
        <span className="text-[11px] text-muted">Images et PDF.</span>
      </div>
      {uploadError ? (
        <p role="alert" className="m-0 mb-3 text-[11px] font-semibold text-coral">
          {uploadError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="m-0 rounded-[11px] bg-bg px-3 py-3 text-xs text-muted">Chargement des pièces jointes…</p>
      ) : attachments.length === 0 ? (
        <p className="m-0 rounded-[11px] bg-bg px-3 py-3 text-xs text-muted">
          Aucun document pour cette fiche. Les ordonnances et factures du vétérinaire restent à portée de main.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" aria-label={`Pièces jointes de ${petName}`}>
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-[11px] bg-bg px-3 py-2.5"
            >
              {isImageMime(attachment.mime) ? (
                <img
                  src={attachment.url}
                  alt={`Aperçu de ${attachment.fileName}`}
                  className="size-11 shrink-0 rounded-[9px] border border-border object-cover"
                />
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-muted">
                  <Icon name="receipt" size="sm" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{attachment.fileName}</strong>
                <small className="text-[11px] text-muted">{formatBytes(attachment.size)}</small>
              </span>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-soft hover:text-accent-strong"
                aria-label={`Ouvrir ${attachment.fileName}`}
              >
                <Icon name="link" size="sm" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                icon="trash"
                className="size-[31px] shrink-0 text-muted hover:bg-coral-soft hover:text-coral"
                aria-label={`Supprimer ${attachment.fileName}`}
                onClick={() => setPending(attachment)}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Supprimer ce fichier ?"
        description={
          pending
            ? `« ${pending.fileName} » disparaîtra de la fiche de ${petName}. Cette action est définitive.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer le fichier"
        onConfirm={() => {
          if (pending) void onDelete(pending);
          setPending(null);
        }}
      />
    </Panel>
  );
}
