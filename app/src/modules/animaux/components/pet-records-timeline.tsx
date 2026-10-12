import { useState } from 'react';
import { cn, formatLongDate, formatMediumDate } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/shared/icon';
import { petRecordTypeLabel, reminderAlert, type PetRecord } from '../types';

const dots: Record<PetRecord['kind'], string> = {
  produit: 'bg-accent',
  vaccin: 'bg-accent-strong',
  traitement: 'bg-coral',
  info: 'bg-border',
};

const badgeTones: Record<PetRecord['kind'], 'accent' | 'coral' | 'amber' | 'muted'> = {
  produit: 'accent',
  vaccin: 'accent',
  traitement: 'amber',
  info: 'muted',
};

export interface PetRecordsTimelineProps {
  records: PetRecord[];
  /** En cours de suppression : la ligne concernée est neutralisée. */
  busyId?: string | null;
  /** Quand la modification n'est pas offerte, seule la lecture s'affiche. */
  onEdit?: (record: PetRecord) => void;
  /** Absent pour les non-administrateurs : aucune suppression proposee. */
  onDelete?: (record: PetRecord) => void;
}

/**
 * Vue chronologique du carnet de santé : pastille de type, date, échéance et
 * notes. La modification ouvre le dialogue en mode edition ; toute
 * suppression passe par une confirmation.
 */
export function PetRecordsTimeline({ records, busyId, onEdit, onDelete }: PetRecordsTimelineProps) {
  const [pending, setPending] = useState<PetRecord | null>(null);

  if (records.length === 0) {
    return (
      <p className="m-0 rounded-[11px] bg-bg px-3 py-4 text-xs text-muted">
        Aucun suivi enregistré pour cette fiche. Le carnet commence par un premier produit, vaccin ou traitement.
      </p>
    );
  }

  return (
    <>
      <ol className="m-0 grid list-none p-0" aria-label="Historique des suivis de santé">
        {records.map((record) => {
          const alert = reminderAlert(record.kind, record.nextDueDate);
          return (
            <li
              key={record.id}
              className={cn(
                'flex items-start gap-3 border-t border-border py-3 first:border-t-0',
                busyId === record.id && 'opacity-55',
              )}
            >
              <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', dots[record.kind])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[13px]">{record.name}</strong>
                  <Badge tone={badgeTones[record.kind]} className="min-h-5 text-[10px]">
                    {petRecordTypeLabel(record.kind)}
                  </Badge>
                  {alert ? (
                    <span
                      className={cn(
                        'inline-flex min-h-5 items-center gap-1 rounded-full px-2 text-[10px] font-extrabold',
                        alert.className,
                      )}
                    >
                      <Icon name="bell" size="sm" />
                      {alert.label}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 mb-0 text-[11px] text-muted">
                  {formatLongDate(record.recordDate)}
                  {record.nextDueDate ? ` · prochaine échéance le ${formatMediumDate(record.nextDueDate)}` : ''}
                </p>
                {record.notes ? <p className="mt-1 mb-0 text-xs">{record.notes}</p> : null}
              </div>
              {onEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  icon="edit"
                  className="size-[31px] text-muted hover:bg-accent-faint hover:text-accent-strong"
                  aria-label={`Modifier le suivi ${record.name}`}
                  onClick={() => onEdit(record)}
                />
              ) : null}
              {onDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  className="size-[31px] text-muted hover:bg-coral-soft hover:text-coral"
                  aria-label={`Supprimer le suivi ${record.name}`}
                  onClick={() => setPending(record)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Supprimer ce suivi ?"
        description={
          pending
            ? `« ${pending.name} » disparaîtra du carnet de santé. Cette action est définitive.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer le suivi"
        onConfirm={() => {
          if (pending && onDelete) onDelete(pending);
          setPending(null);
        }}
      />
    </>
  );
}
