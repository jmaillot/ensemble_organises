import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { HeroCard } from '@/components/ui/hero-card';
import { Fab } from '@/components/ui/fab';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCurrentMember } from '@/stores/household-store';
import { useCalendarGrid } from '@/hooks/use-calendar';
import { cn, formatMonthLabel, pad, pluralize, todayIso } from '@/lib/utils';
import { BirthdayConfetti } from './components/birthday-confetti';
import { BirthdayFormDialog } from './components/birthday-form-dialog';
import { useAnniversaires } from './hooks/use-anniversaires';
import { birthdayCountdown, formatDayMonth, isInMonth, monthDayKey } from './types';
import type { AggregatedBirthday, Birthday } from './types';
import { useOpenRecord } from '@/hooks/use-open-record';

const PREVIEW_LIMIT = 5;

export default function AnniversairesPage() {
  const toast = useToast();
  const { aggregated, birthdays, isLoading, isError, error, refetch, isMutating, saveBirthday, removeBirthday } =
    useAnniversaires();
  const canWrite = useCurrentMember()?.role !== 'enfant';
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('liste');
  const [dialog, setDialog] = useState<{ open: boolean; birthday: Birthday | null }>({ open: false, birthday: null });
  const [pendingDelete, setPendingDelete] = useState<Birthday | null>(null);

  // Vue agrégée (D-09) : birthdays + contacts dates en une seule liste.
  const rows = aggregated;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return rows;
    return rows.filter((birthday) => birthday.name.toLowerCase().includes(needle));
  }, [rows, query]);

  const thisMonth = useMemo(() => rows.filter((birthday) => isInMonth(birthday, todayIso())), [rows]);
  const next = rows[0] ?? null;

  // Confettis du jour J : une seule fois par an et par personne, donc le
  // budget « delight » est là. Le repère est redondant avec le libellé
  // « C'est aujourd'hui » de la ligne — l'overlay est `aria-hidden`, il ne
  // porte aucune information que la liste ne dise déjà.
  const isCelebrating = useMemo(() => rows.some((birthday) => birthday.daysUntil === 0), [rows]);

  const openCreate = () => setDialog({ open: true, birthday: null });
  const openEdit = (birthday: Birthday) => setDialog({ open: true, birthday });
  // Lien profond : `/anniversaires?ouvrir=<id>` ouvre la fiche de l’anniversaire.
  useOpenRecord(birthdays, openEdit);

  return (
    <ModuleShell
      module="anniversaires"
      infoTo="/anniversaires/aide"
      actions={
        <Button icon="plus" onClick={openCreate} className="max-[650px]:hidden">
          Ajouter un anniversaire
        </Button>
      }
    >
      {isCelebrating ? <BirthdayConfetti /> : null}

      {/* Carte héro : le compte à rebours du prochain anniversaire est la
          seule information qu'on vient chercher d'abord ; le reste (volume,
          mois courant) se lit en regard. */}
      <HeroCard
        kicker="Anniversaires · Suivi du foyer"
        value={next ? `${next.daysUntil}` : '—'}
        caption={
          next
            ? `Jours avant l’anniversaire de ${next.name}, le ${formatDayMonth(next.nextDate)}`
            : 'Aucun anniversaire enregistré — notez-en un pour ne plus l’oublier.'
        }
      >
        {/* Stats portées seulement quand il y a quelque chose à compter :
            « 0 suivis · 0 à préparer » sur un héro d'invitation est un mur
            de zéros (critique du 24/10/2026 après-midi). */}
        {rows.length > 0 ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-on-dark">
            <span>
              <strong className="font-display text-[15px]">{rows.length}</strong> anniversaires suivis
            </span>
            <span>
              <strong className="font-display text-[15px]">{thisMonth.length}</strong> à préparer ce mois-ci
            </span>
          </div>
        ) : null}
      </HeroCard>

      {thisMonth.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[16px] border border-coral/25 bg-coral-soft px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface text-coral">
            <Icon name="heart" size="md" />
          </span>
          <p className="m-0 text-xs text-fg">
            <strong className="font-extrabold">
              {pluralize(thisMonth.length, 'anniversaire')} ce mois-ci
            </strong>{' '}
            <span className="text-muted">
              — {thisMonth.map((birthday) => `${birthday.name} le ${formatDayMonth(birthday.nextDate)}`).join(', ')}.
            </span>
          </p>
        </div>
      ) : null}

      {isError ? (
        <ErrorState message={error?.message ?? 'Les anniversaires du foyer n’ont pas pu être chargés.'} onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-[18px] max-[920px]:grid-cols-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Choisir la vue des anniversaires">
              <TabsTrigger value="liste">Liste</TabsTrigger>
              <TabsTrigger value="calendrier">Calendrier</TabsTrigger>
            </TabsList>

            <TabsContent value="liste">
              <Panel
                id="birthday-list-panel"
                title="Liste des anniversaires"
                description="Une recherche simple, une date jamais oubliée."
                action={
                  <SearchInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher un prénom"
                    aria-label="Rechercher un prénom"
                    containerClassName="w-[200px]"
                    className="min-h-10"
                  />
                }
              >
                {isLoading ? (
                  <LoadingRows rows={4} />
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon="heart"
                    title="Aucun anniversaire suivi."
                    description="Ajoutez les dates du foyer pour les retrouver dans le calendrier, à côté des événements."
                    actionLabel="Ajouter un anniversaire"
                    actionVariant="secondary"
                    onAction={openCreate}
                  />
                ) : filtered.length === 0 ? (
                  <p className="m-0 text-xs text-muted" role="status">
                    Aucun anniversaire ne correspond à « {query.trim()} ».
                  </p>
                ) : (
                  <div className="grid" role="list" aria-label="Liste des anniversaires">
                    {filtered.map((birthday) => (
                      <div
                        key={birthday.id}
                        role="listitem"
                        className="group grid min-h-[68px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] px-2 py-2.5 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint/70"
                      >
                        {birthday.displayPhotoUrl ? (
                          <img
                            src={birthday.displayPhotoUrl}
                            alt={`Photo de ${birthday.name}`}
                            className="size-11 shrink-0 rounded-full border border-border object-cover"
                          />
                        ) : (
                          <MemberAvatar
                            member={birthday.member}
                            name={birthday.name}
                            colorTag={birthday.colorTag}
                            size="lg"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <strong className="block text-[14px] font-[700]">
                            {birthday.name}{' '}
                            {birthday.twoSources ? (
                              <span className="ml-1 inline-flex items-center rounded-full bg-accent-faint px-2 py-0.5 align-middle text-[11px] font-extrabold text-accent-strong">
                                2 sources
                              </span>
                            ) : null}
                          </strong>
                          <small className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted">
                            <span>
                              {birthdayCountdown(birthday)} · {birthday.turning} ans
                              {birthday.origin === 'contact' ? ' · via Contacts' : ''}
                            </span>
                            <span className="inline-flex min-h-[22px] items-center rounded-full bg-butter px-2 text-[11px] font-bold text-[oklch(40%_0.09_78)]">
                              {formatDayMonth(birthday.nextDate)}
                            </span>
                          </small>
                        </div>
                        {birthday.origin === 'contact' ? (
                          <Link
                            to="/contacts"
                            aria-label={`Voir la fiche de ${birthday.name} dans les contacts`}
                            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                          >
                            <Icon name="people" size="sm" />
                          </Link>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(birthday)}
                              aria-label={`Modifier l’anniversaire de ${birthday.name}`}
                              className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                            >
                              <Icon name="edit" size="sm" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(birthday)}
                              aria-label={`Supprimer l’anniversaire de ${birthday.name}`}
                              className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:bg-coral-soft hover:text-coral-text"
                            >
                              <Icon name="trash" size="sm" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="calendrier">
              <BirthdayCalendarView birthdays={rows} isLoading={isLoading} onOpen={openEdit} />
            </TabsContent>
          </Tabs>

          <aside className="h-fit rounded-[16px] border border-accent/20 bg-accent-faint p-[18px]">
            <h3 className="mb-1 font-display text-lg tracking-[-0.035em]">Dans le calendrier</h3>
            <p className="mb-4 text-[11px] text-muted">
              Les anniversaires apparaissent automatiquement à côté des événements.
            </p>
            {isLoading ? (
              <LoadingRows rows={3} />
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted">Aucun anniversaire à afficher pour l’instant.</p>
            ) : (
              rows.slice(0, PREVIEW_LIMIT).map((birthday) => (
                <div
                  key={birthday.id}
                  className="flex items-center justify-between gap-2.5 border-t border-accent/20 py-2.5 text-xs"
                >
                  <span className="text-muted">{formatDayMonth(birthday.nextDate)}</span>
                  <strong>{birthday.name}</strong>
                </div>
              ))
            )}
            <Button variant="secondary" fullWidth className="mt-4" onClick={openCreate}>
              Ajouter un anniversaire
            </Button>
          </aside>
        </div>
      )}

      <BirthdayFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        birthday={dialog.birthday}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.birthday;
          try {
            await saveBirthday(editing?.id ?? null, values);
            setDialog({ open: false, birthday: null });
            toast(editing ? 'Modification enregistrée.' : 'Ajouté au foyer.');
          } catch (error) {
            toast(error instanceof Error ? error.message : 'L’anniversaire n’a pas pu être enregistré.', 'error');
          }
        }}
      />

      {/* L'action principale à portée de pouce sur tactile ; l'en-tête la
          porte déjà au-delà de 650 px. */}
      {canWrite ? (
        <Fab icon="plus" label="Ajouter un anniversaire" onClick={openCreate} className="min-[651px]:hidden" />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer l’anniversaire de ${pendingDelete?.name ?? ''} ?`}
        description={
          (pendingDelete as AggregatedBirthday | null)?.origin === 'miroir'
            ? 'La ligne miroir sera retirée, mais la fiche contact reste suivie dans Contacts.'
            : 'Cette date ne sera plus suivie dans le calendrier du foyer.'
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeBirthday(target.id)
            .then(() => toast('Anniversaire supprimé.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'L’anniversaire n’a pas pu être supprimé.', 'error'),
            );
        }}
      />
    </ModuleShell>
  );
}

interface BirthdayCalendarViewProps {
  birthdays: AggregatedBirthday[];
  isLoading: boolean;
  onOpen: (birthday: Birthday) => void;
}

const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Mini-grille mensuelle de l'année courante, une pastille par membre. */
function BirthdayCalendarView({ birthdays, isLoading, onOpen }: BirthdayCalendarViewProps) {
  const today = new Date();
  const grid = useCalendarGrid(new Date(today.getFullYear(), today.getMonth(), 1));

  const byDay = useMemo(() => {
    const map: Record<string, AggregatedBirthday[]> = {};
    birthdays.forEach((birthday) => {
      const key = monthDayKey(birthday.birthDate);
      map[key] = [...(map[key] ?? []), birthday];
    });
    return map;
  }, [birthdays]);

  const monthBirthdays = useMemo(
    () => birthdays.filter((birthday) => birthday.birthDate.slice(5, 7) === pad(grid.month + 1)),
    [birthdays, grid.month],
  );

  return (
    <Panel
      id="birthday-calendar-panel"
      title={`Anniversaires · ${formatMonthLabel(new Date(grid.year, grid.month, 1))}`}
      description="Les pasteilles reprennent la couleur du membre associé."
      action={
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => grid.shift(-1)}
            aria-label="Mois précédent"
            className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
          >
            <Icon name="arrowLeft" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => grid.shift(1)}
            aria-label="Mois suivant"
            className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
          >
            <Icon name="arrow" size="sm" />
          </button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-[7px]" role="group" aria-label="Calendrier des anniversaires">
            {DAY_NAMES.map((name, index) => (
              <div
                key={`${name}-${index}`}
                aria-hidden="true"
                className="grid min-h-7 place-items-center text-[11px] font-extrabold tracking-wide text-muted uppercase"
              >
                {name}
              </div>
            ))}
            {grid.days.map((day) => {
              const dayBirthdays = byDay[monthDayKey(day.iso)] ?? [];
              const isToday = day.iso === grid.isToday;
              return (
                <div
                  key={day.iso}
                  className={cn(
                    'min-h-[54px] rounded-[10px] border border-transparent bg-bg px-2 py-2 text-xs text-ink-soft',
                    // muted/60 mesurait 2,2:1 (audit du 24/10/2026) ; muted plein 5,3:1.
                    day.isOutside && 'bg-transparent text-muted',
                    isToday && 'border-accent-strong bg-accent-soft font-extrabold',
                  )}
                >
                  <span aria-hidden="true">{day.number}</span>
                  <span className="sr-only">{formatDayMonth(day.iso)}</span>
                  {dayBirthdays.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {dayBirthdays.map((birthday) =>
                        // D-13 : on n'édite pas ce qu'on ne possède pas. Un
                        // anniversaire d'origine contact porte un id synthétique
                        // (`contact-<uuid>`) : l'édition n'écrirait rien. Comme la
                        // liste, il mène à sa fiche — même libellé, même icône.
                        birthday.origin === 'contact' ? (
                          <Link
                            key={birthday.id}
                            to="/contacts"
                            aria-label={`Voir la fiche de ${birthday.name} dans les contacts`}
                            className={cn('grid size-[7px] place-items-center rounded-full', memberTagClass(birthday.colorTag))}
                          />
                        ) : (
                          <button
                            key={birthday.id}
                            type="button"
                            onClick={() => onOpen(birthday)}
                            aria-label={`Modifier l’anniversaire de ${birthday.name}`}
                            className={cn('size-[7px] rounded-full', memberTagClass(birthday.colorTag))}
                          />
                        ),
                      )}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {monthBirthdays.length === 0 ? (
            <p className="mt-3 text-[11px] text-muted">Aucun anniversaire ce mois-ci.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {monthBirthdays.map((birthday) => (
                <li key={birthday.id} className="flex items-center gap-2.5 text-xs">
                  <MemberAvatar
                    member={birthday.member}
                    name={birthday.name}
                    colorTag={birthday.colorTag}
                    size="sm"
                  />
                  <strong className="font-[760]">{birthday.name}</strong>
                  <span className="text-[11px] text-muted">{formatDayMonth(birthday.nextDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
