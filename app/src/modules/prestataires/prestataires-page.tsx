import { useMemo, useState } from 'react';
import { MetricRow, ModuleShell } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { SearchInput, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { mailtoHref, mapsUrl, telHref } from './api';
import { usePrestataires } from './hooks/use-prestataires';
import { ProviderFormDialog } from './components/provider-form-dialog';
import { ProviderTypeDialog } from './components/provider-type-dialog';
import { hasAddress, isCallable, isShared, matchesProviderQuery, type Provider, type ProviderDraft } from './types';

const ALL_TYPES = 'tous';

export default function PrestatairesPage() {
  const toast = useToast();
  const { providers, types, isLoading, isError, error, refetch, isMutating, saveProvider, deleteProvider, saveProviderType, deleteProviderType } =
    usePrestataires();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [form, setForm] = useState<{ open: boolean; provider: Provider | null }>({ open: false, provider: null });
  const [typesOpen, setTypesOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<Provider | null>(null);

  const visible = useMemo(
    () =>
      providers.filter(
        (provider) =>
          (typeFilter === ALL_TYPES || provider.typeId === typeFilter) && matchesProviderQuery(provider, query),
      ),
    [providers, query, typeFilter],
  );

  const metrics = useMemo(
    () => [
      { label: 'Prestataires', value: providers.length, caption: 'contacts enregistrés' },
      { label: 'Types', value: types.length, caption: 'types personnalisés' },
      { label: 'Cette semaine', value: providers.filter(isCallable).length, caption: 'appels à passer' },
      { label: 'Partagés', value: providers.filter(isShared).length, caption: 'e-mail renseigné' },
    ],
    [providers, types],
  );

  const resetFilters = () => {
    setTypeFilter(ALL_TYPES);
    setQuery('');
  };

  const handleSubmit = async (draft: ProviderDraft) => {
    const editing = form.provider;
    try {
      await saveProvider(editing?.id ?? null, draft);
      setForm((current) => ({ ...current, open: false }));
      toast(editing ? 'Prestataire mis à jour.' : 'Prestataire ajouté.', 'success');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
    }
  };

  const handleDelete = async (provider: Provider) => {
    try {
      await deleteProvider(provider.id);
      toast(`${provider.name} a été supprimé.`, 'success');
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.', 'error');
    } finally {
      setPendingDeletion(null);
    }
  };

  const handleSaveType = async (id: string | null, values: { name: string; icon: string }) => {
    try {
      await saveProviderType(id, values);
      toast(id ? 'Type mis à jour.' : 'Type ajouté.', 'success');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
    }
  };

  const handleDeleteType = async (id: string) => {
    try {
      const detached = await deleteProviderType(id);
      toast(
        detached > 0
          ? `Type supprimé. ${detached} prestataire${detached > 1 ? 's sont' : ' est'} désormais sans type.`
          : 'Type supprimé.',
        'success',
      );
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.', 'error');
    }
  };

  return (
    <ModuleShell
      module="prestataires"
      actions={
        <>
          <Button variant="secondary" icon="settings" onClick={() => setTypesOpen(true)}>
            Gérer les types
          </Button>
          <Button icon="plus" onClick={() => setForm({ open: true, provider: null })}>
            Ajouter un prestataire
          </Button>
        </>
      }
    >
      <MetricRow items={metrics} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="provider-type-filter" className="text-[11px] font-extrabold text-muted">
            Type
          </label>
          <Select
            id="provider-type-filter"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="min-w-[190px]"
          >
            <option value={ALL_TYPES}>Tous les types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid flex-1 gap-1.5">
          <label htmlFor="provider-search" className="text-[11px] font-extrabold text-muted">
            Recherche
          </label>
          <SearchInput
            id="provider-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un prestataire"
            containerClassName="min-w-[220px]"
          />
        </div>
        <p className="m-0 mb-3 ml-auto text-[11px] text-muted" aria-live="polite">
          {visible.length} prestataire{visible.length > 1 ? 's' : ''} affiché{visible.length > 1 ? 's' : ''}
        </p>
      </div>

      {isLoading ? <LoadingRows rows={4} /> : null}
      {isError ? <ErrorState message={error?.message ?? 'Lecture impossible.'} onRetry={refetch} /> : null}

      {!isLoading && !isError && providers.length === 0 ? (
        <EmptyState
          icon="settings"
          title="Aucun prestataire"
          description="Ajoutez le médecin, l’artisan ou l’école du foyer : les coordonnées restent à portée de main pour toute la famille."
          actionLabel="Ajouter un prestataire"
          onAction={() => setForm({ open: true, provider: null })}
          secondaryActionLabel="Gérer les types"
          onSecondaryAction={() => setTypesOpen(true)}
        />
      ) : null}

      {!isLoading && !isError && providers.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="Aucun prestataire trouvé"
          description="Aucun contact ne correspond à ce filtre. Modifiez la recherche ou affichez de nouveau tous les types."
          actionLabel="Réinitialiser les filtres"
          onAction={resetFilters}
        />
      ) : null}

      {visible.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1">
          {visible.map((provider) => (
            <article key={provider.id} className="panel-surface rounded-[16px] p-[17px]">
              <div className="flex items-start gap-[11px]">
                <div className="grid size-[42px] place-items-center rounded-[13px] bg-accent-soft text-accent-strong">
                  <Icon name={provider.typeIcon} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-0.5 text-[15px]">{provider.name}</h3>
                  <p className="m-0 text-[11px] text-muted">{provider.typeName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  icon="edit"
                  className="size-[31px] text-muted hover:bg-accent-faint hover:text-fg"
                  aria-label={`Modifier ${provider.name}`}
                  onClick={() => setForm({ open: true, provider })}
                />
              </div>
              <div className="mt-4 grid gap-2 border-t border-border pt-3 text-[11px] text-muted">
                {provider.email ? (
                  <span className="flex items-center gap-2">
                    <Icon name="message" size="sm" />
                    <a className="truncate hover:text-accent-strong" href={mailtoHref(provider.email)}>
                      {provider.email}
                    </a>
                  </span>
                ) : null}
                {provider.phone ? (
                  <span className="flex items-center gap-2">
                    <Icon name="phone" size="sm" />
                    <a className="hover:text-accent-strong" href={telHref(provider.phone)}>
                      {provider.phone}
                    </a>
                  </span>
                ) : null}
                {hasAddress(provider) ? (
                  <span className="flex items-start gap-2">
                    <Icon name="pin" size="sm" className="mt-px" />
                    <span>{provider.fullAddress}</span>
                  </span>
                ) : null}
                {provider.notes ? (
                  <span className="flex items-start gap-2">
                    <Icon name="info" size="sm" className="mt-px" />
                    <span>{provider.notes}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-[15px] flex flex-wrap gap-2">
                {provider.phone ? (
                  <Button asChild variant="secondary" size="sm" icon="phone">
                    <a href={telHref(provider.phone)}>Appeler</a>
                  </Button>
                ) : null}
                {hasAddress(provider) ? (
                  <Button asChild variant="secondary" size="sm" icon="map">
                    <a href={mapsUrl(provider.fullAddress)} target="_blank" rel="noreferrer noopener">
                      Itinéraire
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  className="text-muted hover:bg-coral-soft hover:text-coral"
                  onClick={() => setPendingDeletion(provider)}
                >
                  Supprimer
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <ProviderFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        provider={form.provider}
        types={types}
        saving={isMutating}
        onSubmit={handleSubmit}
      />

      <ProviderTypeDialog
        open={typesOpen}
        onOpenChange={setTypesOpen}
        types={types}
        providers={providers}
        saving={isMutating}
        onSave={handleSaveType}
        onDelete={handleDeleteType}
      />

      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        title="Supprimer ce prestataire ?"
        description={
          pendingDeletion
            ? `${pendingDeletion.name} sera retiré du carnet. Cette action est définitive.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer le prestataire"
        onConfirm={() => {
          if (pendingDeletion) void handleDelete(pendingDeletion);
        }}
      />
    </ModuleShell>
  );
}
