import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { CountBadge, MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Icon } from '@/components/shared/icon';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { depositHouseholdFile } from '@/lib/storage';
import { useArdoises } from './hooks/use-ardoise';
import { joinArdoise, redeemGuestTicket } from './api';
import { useSessionUser } from '@/hooks/use-auth';

/** Liste des ardoises du foyer + création + rejoindre par code. */
export default function ArdoisePage() {
  const { ardoises, isLoading, isError, error, refetch, isMutating, addArdoise, removeArdoise } = useArdoises();
  const toast = useToast();
  const navigate = useNavigate();
  const sessionUser = useSessionUser();
  const householdId = useHouseholdStore((state) => state.householdId);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <ModuleShell
      module="ardoise"
      actions={
        <>
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            Créer une ardoise
          </Button>
          <Button variant="secondary" icon="arrow" onClick={() => setJoinOpen(true)}>
            Rejoindre
          </Button>
        </>
      }
    >
      <MetricRow
        items={[
          { label: 'Ardoises', value: ardoises.length, caption: 'comptes partagés' },
          { label: 'Actives', value: ardoises.filter((ardoise) => ardoise.is_active).length, caption: 'partages ouverts' },
        ]}
      />

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Les ardoises du foyer n’ont pas pu être chargées.'}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : ardoises.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Aucune ardoise pour le moment"
          description="Créez une ardoise par occasion — coloc, week-end entre amis, sortie en famille — ou rejoignez-en une avec un code partagé."
          actionLabel="Créer une ardoise"
          onAction={() => setCreateOpen(true)}
          secondaryActionLabel="Rejoindre avec un code"
          onSecondaryAction={() => setJoinOpen(true)}
        />
      ) : (
        <Panel
          id="ardoises-panel"
          title="Vos ardoises"
          description="Un compte par occasion, des soldes indépendants."
          action={<CountBadge value={ardoises.length} label="ardoises" />}
        >
          <div role="list" aria-label="Ardoises du foyer" className="grid gap-2.5">
            {ardoises.map((ardoise) => (
              <div
                key={ardoise.id}
                role="listitem"
                className={`relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[12px] border px-3.5 py-3 ${
                  ardoise.cover_url ? 'border-transparent' : 'border-border'
                }`}
              >
                {ardoise.cover_url ? (
                  <>
                    <img
                      src={ardoise.cover_url}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-fg/60" />
                  </>
                ) : null}
                <div className="relative min-w-[150px] flex-1">
                  <p className={`m-0 text-[14px] font-[760] ${ardoise.cover_url ? 'text-white' : ''}`}>
                    {ardoise.name}
                  </p>
                  <small className={`text-[11px] ${ardoise.cover_url ? 'text-white/75' : 'text-muted'}`}>
                    {ardoise.description ? `${ardoise.description} · ` : ''}
                    {ardoise.is_active ? 'Partage actif' : 'Partage coupé'}
                  </small>
                </div>
                <div className="relative">
                  <Button variant="secondary" onClick={() => navigate(`/ardoise/${ardoise.id}`)}>
                    Ouvrir
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(ardoise.id)}
                  aria-label={`Supprimer ${ardoise.name}`}
                  className={`relative grid size-11 place-items-center rounded-[9px] transition-colors hover:bg-coral-soft hover:text-coral ${
                    ardoise.cover_url ? 'text-white/85' : 'text-muted'
                  }`}
                >
                  <Icon name="trash" size="sm" />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <CreateArdoiseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isSaving={isMutating}
        onSubmit={async (values) => {
          try {
            // Photo de couverture optionnelle : déposée avant création, comme
            // dans l'onglet Paramètres (même dossier `ardoises`).
            let coverUrl: string | undefined;
            if (values.coverFile) {
              if (!householdId) throw new Error('Aucun foyer sélectionné.');
              coverUrl = (await depositHouseholdFile({ householdId, folder: 'ardoises', file: values.coverFile })).url;
            }
            const created = await addArdoise({
              name: values.name,
              description: values.description,
              memberIds: values.memberIds,
              coverUrl,
            });
            setCreateOpen(false);
            toast(`Ardoise « ${created.name} » créée.`);
            navigate(`/ardoise/${created.id}`);
          } catch (creationError) {
            toast(creationError instanceof Error ? creationError.message : 'Création impossible.', 'error');
          }
        }}
      />

      <JoinArdoiseDialog open={joinOpen} onOpenChange={setJoinOpen} isMember={Boolean(sessionUser)} />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Supprimer cette ardoise ?"
        description="L’ardoise, ses dépenses et ses soldes seront définitivement retirés."
        confirmLabel="Supprimer l’ardoise"
        onConfirm={() => {
          const target = pendingDeleteId;
          setPendingDeleteId(null);
          if (!target) return;
          void removeArdoise(target)
            .then(() => toast('Ardoise supprimée.'))
            .catch((removalError: unknown) =>
              toast(removalError instanceof Error ? removalError.message : 'Suppression impossible.', 'error'),
            );
        }}
      />
    </ModuleShell>
  );
}

function CreateArdoiseDialog({
  open,
  onOpenChange,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onSubmit: (values: { name: string; description?: string; memberIds: string[]; coverFile: File | null }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  // `null` = tous cochés (régime historique) ; décochez pour exclure.
  const [selected, setSelected] = useState<string[] | null>(null);
  const householdMembers = useMembers();
  const eligible = householdMembers.filter((member) => member.role === 'admin' || member.role === 'membre');
  const effective = selected ?? eligible.map((member) => member.id);

  const reset = () => {
    setName('');
    setDescription('');
    setCoverFile(null);
    setSelected(null);
  };

  const toggle = (memberId: string) => {
    const current = new Set(effective);
    if (current.has(memberId)) current.delete(memberId);
    else current.add(memberId);
    setSelected([...current]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Ardoise</p>
          <DialogTitle>Créer une ardoise</DialogTitle>
          <DialogDescription>
            Ex. coloc, week-end entre amis, sortie en famille. Un code de partage sera généré pour inviter.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (isSending) return;
            setIsSending(true);
            void onSubmit({ name, description, memberIds: effective, coverFile }).finally(() => setIsSending(false));
          }}
        >
          <Field label="Nom de l’ardoise">
            {(props) => (
              <Input {...props} value={name} onChange={(change) => setName(change.target.value)} maxLength={120} autoComplete="off" />
            )}
          </Field>
          <Field label="Description" optional>
            {(props) => (
              <Textarea {...props} value={description} onChange={(change) => setDescription(change.target.value)} rows={2} />
            )}
          </Field>
          <Field label="Photo de couverture" optional>
            {(props) => (
              <Input
                {...props}
                type="file"
                accept="image/*"
                onChange={(change) => setCoverFile(change.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          {eligible.length > 0 ? (
            <fieldset className="grid gap-1.5">
              <legend className="text-[11px] font-extrabold text-muted">Membres inclus</legend>
              <div className="flex flex-wrap gap-2">
                {eligible.map((member) => (
                  <label
                    key={member.id}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[11px] font-semibold text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong max-[650px]:min-h-11"
                  >
                    <input
                      type="checkbox"
                      checked={effective.includes(member.id)}
                      onChange={() => toggle(member.id)}
                      className="accent-accent"
                    />
                    <MemberAvatar member={member} size="sm" />
                    {member.display_name.split(' ')[0]}
                  </label>
                ))}
              </div>
              <p className="m-0 text-[10px] text-muted">
                Décochez pour exclure. D’autres membres pourront être ajoutés ensuite.
              </p>
            </fieldset>
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="plus" disabled={isSaving || isSending || name.trim() === ''}>
              Créer l’ardoise
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinArdoiseDialog({
  open,
  onOpenChange,
  isMember,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Faux pour un visiteur sans compte : seul le parcours invité est proposé. */
  isMember: boolean;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const submitMember = () => {
    setIsJoining(true);
    void joinArdoise(code)
      .then(({ ardoise_id }) => {
        onOpenChange(false);
        setCode('');
        toast('Ardoise rejointe.');
        navigate(`/ardoise/${ardoise_id}`);
      })
      .catch((joinError: unknown) =>
        toast(joinError instanceof Error ? joinError.message : 'Code invalide.', 'error'),
      )
      .finally(() => setIsJoining(false));
  };

  const submitGuest = () => {
    setIsJoining(true);
    void redeemGuestTicket(code, displayName)
      .then(({ ardoiseId }) => {
        onOpenChange(false);
        setCode('');
        setDisplayName('');
        toast('Bienvenue sur l’ardoise.');
        navigate(`/ardoise/${ardoiseId}`);
      })
      .catch((joinError: unknown) =>
        toast(joinError instanceof Error ? joinError.message : 'Code invalide.', 'error'),
      )
      .finally(() => setIsJoining(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCode('');
          setDisplayName('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Ardoise</p>
          <DialogTitle>Rejoindre une ardoise</DialogTitle>
          <DialogDescription>
            Collez le code partagé par l’organisateur. Sans compte, indiquez un pseudonyme.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (isMember) submitMember();
            else submitGuest();
          }}
        >
          <Field label="Code de partage">
            {(props) => (
              <Input {...props} value={code} onChange={(change) => setCode(change.target.value)} autoComplete="off" />
            )}
          </Field>
          {!isMember ? (
            <Field label="Pseudonyme">
              {(props) => (
                <Input
                  {...props}
                  value={displayName}
                  onChange={(change) => setDisplayName(change.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
              )}
            </Field>
          ) : null}
          <p className="m-0 text-[11px] text-muted">
            {isMember
              ? 'Membre du foyer : le code vous inscrit à l’ardoise.'
              : 'Invité : votre ticket est conservé dans ce navigateur.'}{' '}
            Un code fait au moins 22 caractères.
          </p>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isJoining || code.trim().length < 22}>
              Rejoindre
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
