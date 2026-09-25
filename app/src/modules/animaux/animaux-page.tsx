import { useMemo, useState } from 'react';
import { CountBadge, ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { assetUrl } from '@/lib/modules';
import { cn, formatLongDate, formatMediumDate } from '@/lib/utils';
import { usePetRecords, usePets } from './hooks/use-animaux';
import { PetFormDialog } from './components/pet-form-dialog';
import { PetRecordDialog } from './components/pet-record-dialog';
import { PetRecordsTimeline } from './components/pet-records-timeline';
import {
  PET_RECORD_TABS,
  nextReminderOf,
  petRecordEmptyLabel,
  petSummaryOf,
  petWeightLabel,
  reminderAlert,
  type Pet,
  type PetDraft,
  type PetRecord,
  type PetRecordDraft,
} from './types';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] bg-bg px-[11px] py-[11px]">
      <span className="block text-[10px] text-muted">{label}</span>
      <strong className="mt-0.5 block text-xs">{value}</strong>
    </div>
  );
}

/** Contenu d'un onglet du carnet : nom du suivi, date et prochaine échéance. */
function RecordList({ records, kind }: { records: PetRecord[]; kind: PetRecord['kind'] }) {
  if (records.length === 0) {
    return <p className="m-0 rounded-[11px] bg-bg px-3 py-3 text-xs text-muted">{petRecordEmptyLabel(kind)}</p>;
  }
  return (
    <div className="grid">
      {records.map((record) => {
        const alert = reminderAlert(record.kind, record.nextDueDate);
        return (
          <div
            key={record.id}
            className="flex items-start justify-between gap-2.5 border-t border-border py-3 text-xs first:border-t-0"
          >
            <span className="min-w-0 text-muted">{record.name}</span>
            <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
              <strong className="text-xs">
                {record.nextDueDate
                  ? `Échéance : ${formatMediumDate(record.nextDueDate)}`
                  : `Le ${formatMediumDate(record.recordDate)}`}
              </strong>
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
          </div>
        );
      })}
    </div>
  );
}

export default function AnimauxPage() {
  const toast = useToast();
  const { pets, isLoading, isError, error, refetch, isMutating, savePet, deletePet } = usePets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [petForm, setPetForm] = useState<{ open: boolean; pet: Pet | null }>({ open: false, pet: null });
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [pendingPetDeletion, setPendingPetDeletion] = useState<Pet | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);

  const pet = useMemo(() => pets.find((entry) => entry.id === selectedId) ?? pets[0] ?? null, [pets, selectedId]);
  const { records, isLoading: recordsLoading, saveRecord, deleteRecord } = usePetRecords(pet?.id ?? null);

  const recordsByKind = useMemo(() => {
    const grouped = new Map<PetRecord['kind'], PetRecord[]>();
    for (const tab of PET_RECORD_TABS) {
      grouped.set(tab.kind, records.filter((record) => record.kind === tab.kind));
    }
    return grouped;
  }, [records]);

  const summary = useMemo(() => petSummaryOf(records), [records]);
  const reminder = useMemo(() => nextReminderOf(records), [records]);

  const handleSubmitPet = async (draft: PetDraft) => {
    const editing = petForm.pet;
    try {
      await savePet(editing?.id ?? null, draft);
      setPetForm((current) => ({ ...current, open: false }));
      toast(editing ? 'Fiche animal enregistrée.' : 'Fiche animal créée.', 'success');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
    }
  };

  const handleSaveRecord = async (draft: PetRecordDraft) => {
    try {
      await saveRecord(null, draft);
      setRecordDialogOpen(false);
      toast('Suivi ajouté au carnet de santé.', 'success');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Ajout impossible.', 'error');
    }
  };

  const handleDeleteRecord = async (record: PetRecord) => {
    setBusyRecordId(record.id);
    try {
      await deleteRecord(record.id);
      toast('Suivi supprimé.', 'success');
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.', 'error');
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleDeletePet = async (target: Pet) => {
    try {
      await deletePet(target.id);
      if (selectedId === target.id) setSelectedId(null);
      toast(`Fiche de ${target.name} supprimée.`, 'success');
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.', 'error');
    } finally {
      setPendingPetDeletion(null);
    }
  };

  return (
    <ModuleShell
      module="animaux"
      actions={
        <Button icon="plus" onClick={() => setPetForm({ open: true, pet: null })}>
          Ajouter une fiche
        </Button>
      }
    >
      {isLoading ? <LoadingRows rows={3} /> : null}
      {isError ? <ErrorState message={error?.message ?? 'Lecture impossible.'} onRetry={refetch} /> : null}

      {!isLoading && !isError && pets.length === 0 ? (
        <EmptyState
          icon="heart"
          title="Aucune fiche animal"
          description="Créez une fiche par animal du foyer : identité, santé et carnet de suivi restent accessibles à tous."
          actionLabel="Ajouter une fiche"
          onAction={() => setPetForm({ open: true, pet: null })}
        />
      ) : null}

      {pets.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="pet-selector" className="text-[11px] font-extrabold text-muted">
            Fiche affichée
          </label>
          <Select
            id="pet-selector"
            value={pet?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
            className="max-w-[260px]"
          >
            {pets.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {pet ? (
        <>
          <section
            className="mb-[18px] grid grid-cols-[260px_minmax(0,1fr)] gap-5 rounded-[22px] border border-border bg-surface p-5 max-[920px]:grid-cols-[210px_minmax(0,1fr)] max-[650px]:block max-[650px]:p-3.5"
            aria-label={`Fiche de ${pet.name}`}
          >
            <img
              className="h-[250px] w-full rounded-[15px] bg-bg object-contain max-[650px]:mb-4 max-[650px]:h-[220px]"
              src={pet.photoUrl ?? assetUrl('animaux.jpg')}
              alt={`Portrait de ${pet.name}`}
            />
            <div>
              <p className="eyebrow">Fiche animal</p>
              <h2 className="mb-1.5 text-[28px]">{pet.name}</h2>
              <p className="mb-5 text-xs text-muted">
                Une fiche complète pour prendre soin de sa santé et de son histoire.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <Fact label="Type" value={pet.species || '—'} />
                <Fact label="Race" value={pet.breed ?? '—'} />
                <Fact label="Poids" value={petWeightLabel(pet)} />
                <Fact label="Naissance" value={pet.birthDate ? formatLongDate(pet.birthDate) : '—'} />
                <Fact label="Identifiant" value={pet.identificationNumber ?? '—'} />
                <Fact
                  label="Prochain rappel"
                  value={reminder?.nextDueDate ? formatMediumDate(reminder.nextDueDate) : '—'}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" icon="edit" onClick={() => setPetForm({ open: true, pet })}>
                  Modifier la fiche
                </Button>
                <Button icon="plus" onClick={() => setRecordDialogOpen(true)}>
                  Ajouter un suivi
                </Button>
                <Button
                  variant="ghost"
                  icon="trash"
                  className="text-muted hover:bg-coral-soft hover:text-coral"
                  onClick={() => setPendingPetDeletion(pet)}
                >
                  Supprimer la fiche
                </Button>
              </div>
              {summary.notes ? (
                <p className="mt-4 mb-0 rounded-[11px] bg-accent-faint px-3 py-2.5 text-xs">
                  <span className="font-extrabold text-accent-strong">Informations · </span>
                  {summary.notes}
                </p>
              ) : null}
            </div>
          </section>

          <Panel
            title="Suivi de santé"
            description="Produits, vaccins et traitements."
            action={<CountBadge value={records.length} label="suivis" />}
            className="mb-[18px]"
          >
            <p className="sr-only" aria-live="polite">
              {records.length} suivis dans le carnet de santé de {pet.name}.
            </p>
            <Tabs defaultValue={PET_RECORD_TABS[0].kind}>
              <TabsList aria-label="Types de suivi de santé">
                {PET_RECORD_TABS.map((tab) => (
                  <TabsTrigger key={tab.kind} value={tab.kind}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {PET_RECORD_TABS.map((tab) => (
                <TabsContent key={tab.kind} value={tab.kind}>
                  <RecordList records={recordsByKind.get(tab.kind) ?? []} kind={tab.kind} />
                </TabsContent>
              ))}
            </Tabs>
          </Panel>

          <Panel
            title="Carnet de santé"
            description="L’historique chronologique de tous les suivis."
            action={
              <Button variant="secondary" size="sm" icon="plus" onClick={() => setRecordDialogOpen(true)}>
                Ajouter un suivi
              </Button>
            }
          >
            {recordsLoading ? (
              <LoadingRows rows={3} />
            ) : (
              <PetRecordsTimeline records={records} busyId={busyRecordId} onDelete={handleDeleteRecord} />
            )}
          </Panel>

          <PetRecordDialog
            open={recordDialogOpen}
            onOpenChange={setRecordDialogOpen}
            petName={pet.name}
            record={null}
            onSubmit={handleSaveRecord}
          />
        </>
      ) : null}

      <PetFormDialog
        open={petForm.open}
        onOpenChange={(open) => setPetForm((current) => ({ ...current, open }))}
        pet={petForm.pet}
        summary={petForm.pet ? summary : null}
        saving={isMutating}
        onSubmit={handleSubmitPet}
      />

      <ConfirmDialog
        open={Boolean(pendingPetDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingPetDeletion(null);
        }}
        title="Supprimer cette fiche animal ?"
        description={
          pendingPetDeletion
            ? `La fiche de ${pendingPetDeletion.name} et tout son carnet de santé seront supprimés. Cette action est définitive.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer la fiche"
        onConfirm={() => {
          if (pendingPetDeletion) void handleDeletePet(pendingPetDeletion);
        }}
      />
    </ModuleShell>
  );
}
