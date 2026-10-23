import { useMemo, useState } from 'react';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { HeroCard } from '@/components/ui/hero-card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Icon } from '@/components/shared/icon';
import { SearchInput } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCurrentMember } from '@/stores/household-store';
import { usePantry } from './hooks/use-pantry';
import { PantryDialog } from './components/pantry-dialog';
import {
  expiryLabels,
  expiryStateOf,
  expiryToneClass,
  formatIsoDateFr,
  formatQuantity,
  pantryCategoryLabels,
  pantryLocationLabels,
  pantryLocations,
  type PantryFormValues,
  type PantryItem,
  type PantryLocation,
} from './types';

type LocationTab = PantryLocation | 'tous';

interface DialogState {
  open: boolean;
  item: PantryItem | null;
  location: PantryLocation;
}

/**
 * Frigo du foyer (vague 3.1) : ce qu'il y a au réfrigérateur, au congélateur
 * et au garde-manger, et ce qui va périmer. Tri par péremption, pastilles
 * couleur, recherche et filtre « bientôt périmé ». Les données vivent dans
 * `pantry_items` (0141) ; le masquage de l'espace lui-même est porté par le
 * menu des applications (0140).
 */
export default function FrigoPage() {
  const pantry = usePantry();
  const toast = useToast();
  // Le rôle `enfant` est en lecture seule côté serveur (phase 14) : la page
  // cache les commandes d'écriture au lieu de laisser la RLS refuser.
  const canWrite = useCurrentMember()?.role !== 'enfant';

  // Les trois métriques du résumé : le compte des bientôt périmés devient la
  // valeur héro, les deux autres se lisent dans la carte.
  const expiringSoonCount = pantry.items.filter(
    (item) => expiryStateOf(item.expiresOn, pantry.today) === 'soon',
  ).length;
  const expiredCount = pantry.items.filter(
    (item) => expiryStateOf(item.expiresOn, pantry.today) === 'expired',
  ).length;
  const [tab, setTab] = useState<LocationTab>('tous');
  const [query, setQuery] = useState('');
  const [onlyPerishing, setOnlyPerishing] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false, item: null, location: 'frigo' });
  const [toRemove, setToRemove] = useState<PantryItem | null>(null);

  const perishingCount = useMemo(
    () =>
      pantry.items.filter((item) => {
        const state = expiryStateOf(item.expiresOn, pantry.today);
        return state === 'expired' || state === 'soon';
      }).length,
    [pantry.items, pantry.today],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pantry
      .itemsOfLocation(tab)
      .filter((item) => (needle === '' ? true : item.name.toLowerCase().includes(needle) || (item.notes ?? '').toLowerCase().includes(needle)))
      .filter((item) => {
        if (!onlyPerishing) return true;
        const state = expiryStateOf(item.expiresOn, pantry.today);
        return state === 'expired' || state === 'soon';
      });
  }, [pantry, tab, query, onlyPerishing]);

  const openCreate = () => setDialog({ open: true, item: null, location: tab === 'tous' ? 'frigo' : tab });
  const openEdit = (item: PantryItem) => setDialog({ open: true, item, location: item.location });

  const handleSave = async (values: PantryFormValues) => {
    try {
      await pantry.saveItem(dialog.item?.id ?? null, values);
      toast(dialog.item ? 'Article mis à jour.' : 'Article ajouté au frigo.');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
      throw saveError;
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      await pantry.removeItem(toRemove.id);
      toast(`« ${toRemove.name} » retiré du frigo.`);
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : 'Suppression impossible.', 'error');
    } finally {
      setToRemove(null);
    }
  };

  return (
    <ModuleShell
      module="frigo"
      infoTo="/frigo/aide"
      actions={
        canWrite ? (
          <Button icon="plus" onClick={openCreate}>
            Ajouter un article
          </Button>
        ) : (
          <span className="text-[11px] text-muted">Lecture seule pour les profils enfant</span>
        )
      }
    >
      <HeroCard
        kicker="Frigo · Contenu du foyer"
        value={expiringSoonCount}
        caption="Bientôt périmé, à consommer sous 2 jours"
        gauge={pantry.items.length > 0 ? expiringSoonCount / pantry.items.length : 0}
        gaugeLabel="Part des articles bientôt périmés"
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-on-dark">
          <span>
            <strong className="font-display text-[15px]">{pantry.items.length}</strong> articles dans tout le frigo
          </span>
          <span>
            <strong className="font-display text-[15px]">{expiredCount}</strong> périmés, à trier
          </span>
        </div>
      </HeroCard>

      {pantry.isError ? (
        <Panel title="Le frigo" description="Contenu du foyer, par emplacement.">
          <EmptyState
            icon="archive"
            title="Le frigo n'a pas pu être chargé."
            description={pantry.error?.message ?? 'Réessayez dans un instant.'}
            actionLabel="Recharger"
            onAction={pantry.refetch}
          />
        </Panel>
      ) : (
        <Panel
          id="pantry-panel"
          title="Le frigo"
          description="Réfrigérateur, congélateur et garde-manger, triés par péremption."
          action={
            <div className="flex items-center gap-2.5">
              <Button
                variant={onlyPerishing ? 'primary' : 'secondary'}
                icon="filter"
                size="sm"
                onClick={() => setOnlyPerishing((value) => !value)}
                aria-pressed={onlyPerishing}
              >
                Bientôt périmé{perishingCount > 0 ? ` (${perishingCount})` : ''}
              </Button>
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un article"
                aria-label="Rechercher un article du frigo"
                containerClassName="w-[190px]"
                className="min-h-10"
              />
            </div>
          }
        >
          {pantry.isLoading ? (
            <LoadingRows rows={4} />
          ) : (
            <Tabs value={tab} onValueChange={(value) => setTab(value as LocationTab)}>
              <TabsList aria-label="Emplacements du frigo">
                <TabsTrigger value="tous">Tout</TabsTrigger>
                {pantryLocations.map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {pantryLocationLabels[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(['tous', ...pantryLocations] as LocationTab[]).map((value) => (
                <TabsContent key={value} value={value}>
                  {visible.length === 0 ? (
                    <EmptyState
                      icon="archive"
                      title={query.trim() !== '' ? 'Aucun article ne correspond.' : onlyPerishing ? 'Rien ne se périme ici.' : 'Cet emplacement est vide.'}
                      description={
                        query.trim() !== ''
                          ? 'Essayez un autre mot, ou ajoutez l’article s’il manque.'
                          : 'Notez ce que vous rangez : plus rien ne se perd, plus rien ne se rachète en double.'
                      }
                      actionLabel={query.trim() !== '' ? undefined : 'Ajouter un article'}
                      onAction={query.trim() !== '' ? undefined : openCreate}
                    />
                  ) : (
                    <ul className="m-0 grid list-none gap-1 p-0">
                      {visible.map((item) => (
                        <PantryRow key={item.id} item={item} today={pantry.today} canWrite={canWrite} onEdit={openEdit} onRemove={setToRemove} />
                      ))}
                    </ul>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </Panel>
      )}

      <PantryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
        item={dialog.item}
        defaultLocation={dialog.location}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => (open ? null : setToRemove(null))}
        title={`Retirer « ${toRemove?.name ?? ''} » du frigo ?`}
        description="L’article disparaît de la liste du foyer. Cette action est définitive."
        confirmLabel="Retirer"
        onConfirm={() => void handleRemove()}
      />
    </ModuleShell>
  );
}

function PantryRow({
  item,
  today,
  canWrite,
  onEdit,
  onRemove,
}: {
  item: PantryItem;
  today: string;
  canWrite: boolean;
  onEdit: (item: PantryItem) => void;
  onRemove: (item: PantryItem) => void;
}) {
  const state = expiryStateOf(item.expiresOn, today);
  return (
    <li className="flex min-h-[56px] min-w-0 items-center gap-3 rounded-[14px] px-2.5 py-1.5 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-strong">
        <Icon name="archive" size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[13.5px] font-[650] text-fg">{item.name}</strong>
        <span className="block truncate text-[11px] text-muted">
          {pantryCategoryLabels[item.category]}
          {item.unit || item.quantity !== 1 ? ` · ${formatQuantity(item)}` : ''}
          {item.openedOn ? ' · ouvert' : ''}
          {item.notes ? ` · ${item.notes}` : ''}
        </span>
      </span>
      {item.expiresOn ? (
        <span className="hidden shrink-0 text-[11px] text-muted min-[651px]:inline">{formatIsoDateFr(item.expiresOn)}</span>
      ) : null}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-[700] ${expiryToneClass[state]}`}>
        {expiryLabels[state]}
      </span>
      {canWrite ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={`Modifier ${item.name}`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:text-fg"
          >
            <Icon name="edit" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={`Retirer ${item.name} du frigo`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:text-coral"
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      ) : null}
    </li>
  );
}
