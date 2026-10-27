import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { fetchGdprExports, requestGdprExport, signGdprExportDownload } from '../api';
import { statutJobExportLabels, type GdprExportJobRow, type StatutJobExport } from '../types';

/**
 * « Mes données (RGPD) » : l'unique surface où le membre exerce son droit
 * d'accès (RGEX-01/02, D-05). Déclenchement par RPC serveur, suivi
 * asynchrone (trois états + durée écoulée, JAMAIS de pourcentage — D-03),
 * historique D-07, téléchargement par lien signé calculé au clic (D-04).
 * AUCUNE garde admin : le droit d'export est personnel à chaque membre avec
 * session (D-08) — volontairement pas le jumeau exact de
 * HouseholdDeletePanel, qui garde lui sa garde `isAdmin`.
 */
const GDPR_QUERY_KEY = ['gdpr-export-jobs'] as const;
const POLL_INTERVAL_MS = 4000;
const SIGNED_URL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isStatutJobExport = (value: unknown): value is StatutJobExport =>
  typeof value === 'string' && value in statutJobExportLabels;

/** Les deux états non terminaux déclenchent le polling (D-03). */
const isActive = (status: StatutJobExport) => status === 'en_attente' || status === 'en_cours';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Durée écoulée en texte lisible : « 42 s », « 3 min 05 s », « 1 h 12 min ». */
export function formatElapsedDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * Horloge locale du suivi : elle ne mute QUE l'état local du composant, la
 * requête (et sa clé de cache) reste inchangée — aucun re-render réseau pour
 * une seconde qui passe (D-03, « durée vivante »).
 */
function useElapsedClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** Le lien signé n'existe qu'au clic : la valeur vit dans ce handler, nulle part ailleurs (D-04/T-26-15). */
function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Le lien de l'historique n'est proposé que s'il peut encore être vivant (≤ 24 h, D-07). */
export function isSignedLinkAlive(job: GdprExportJobRow, now: number): boolean {
  if (!job.storage_path) return false;
  const created = new Date(job.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return now - created < SIGNED_URL_MAX_AGE_MS;
}

export function GdprExportPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: GDPR_QUERY_KEY,
    queryFn: fetchGdprExports,
    // Polling D-03 tant qu'un job est actif ; sinon la query se tait — aucun
    // re-fetch réseau pour un historique qui n'évolue que par nos actions.
    refetchInterval: (current) =>
      (current.state.data ?? []).some((entry) => isStatutJobExport(entry.status) && isActive(entry.status))
        ? POLL_INTERVAL_MS
        : false,
  });

  const jobs = query.data ?? [];
  const activeJob = jobs.find((entry) => isStatutJobExport(entry.status) && isActive(entry.status)) ?? null;
  const clock = useElapsedClock(Boolean(activeJob));

  const request = useMutation({
    mutationFn: requestGdprExport,
    onMutate: () => setError(null),
    onSuccess: () => {
      // Le RPC a créé (ou retrouvé) la ligne de job : la relecture repart
      // sur les trois états (D-06 — l'idempotence est tenue en base).
      void queryClient.invalidateQueries({ queryKey: GDPR_QUERY_KEY });
      toast('Demande d’export enregistrée.');
    },
    onError: (requestError) => {
      // D-02 : jamais un échec silencieux — inline ET toast.
      const message = requestError instanceof Error ? requestError.message : 'Demande d’export impossible.';
      setError(message);
      toast(message);
    },
  });

  const download = useMutation({
    mutationFn: (job: GdprExportJobRow) => signGdprExportDownload(job.storage_path ?? ''),
    onError: (downloadError) => {
      const message = downloadError instanceof Error ? downloadError.message : 'Téléchargement impossible.';
      setError(message);
      toast(message);
    },
    onSuccess: triggerDownload,
  });

  const activeStatusLabel = activeJob && isStatutJobExport(activeJob.status) ? statutJobExportLabels[activeJob.status] : '';
  const elapsed = activeJob ? Math.max(0, (clock - new Date(activeJob.created_at).getTime()) / 1000) : 0;

  return (
    <Panel title="Mes données (RGPD)" description="Votre droit d’accès : téléchargez l’archive de vos données personnelles.">
      {error ? (
        <p role="alert" className="m-0 text-[11px] font-semibold text-coral-text">
          {error}
        </p>
      ) : null}

      {activeJob ? (
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="m-0 text-[13px] font-semibold">
            {activeStatusLabel}
            {' — '}
            <span>durée écoulée : {formatElapsedDuration(elapsed)}</span>
          </p>
          <p className="m-0 text-[12px] text-muted">
            Votre archive est en préparation. Vous recevrez une notification quand elle sera prête ; c’est ici que
            se fera le téléchargement.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {jobs.length === 0 && !query.isPending ? (
            <p className="m-0 text-[13px] text-muted">
              Vous n’avez pas encore demandé d’export. L’archive rassemble tout ce qui vous concerne — profil,
              créations, participations, photos — dans un fichier ZIP. Elle reste disponible au téléchargement
              pendant 24 h.
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => {
                if (!request.isPending) request.mutate();
              }}
              disabled={request.isPending}
            >
              {request.isPending ? 'Demande en cours…' : 'Demander mon export'}
            </Button>
          </div>
        </div>
      )}

      {jobs.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold">Historique des exports</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {jobs.map((entry) => (
              <GdprHistoryRow
                key={entry.id}
                job={entry}
                now={clock}
                pending={download.isPending && download.variables?.id === entry.id}
                onDownload={() => download.mutate(entry)}
                onRetry={() => {
                  if (!request.isPending) request.mutate();
                }}
                retrying={request.isPending}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

interface GdprHistoryRowProps {
  job: GdprExportJobRow;
  now: number;
  pending: boolean;
  retrying: boolean;
  onDownload: () => void;
  onRetry: () => void;
}

function GdprHistoryRow({ job, now, pending, retrying, onDownload, onRetry }: GdprHistoryRowProps) {
  const statusLabel = isStatutJobExport(job.status) ? statutJobExportLabels[job.status] : job.status;
  const linkAlive = job.status === 'pret' && isSignedLinkAlive(job, now);
  const linkExpired = job.status === 'pret' && !isSignedLinkAlive(job, now);

  return (
    <li
      data-testid="gdpr-history-row"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg p-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold">{statusLabel}</span>
        <span className="text-[11px] text-muted">{dateFormatter.format(new Date(job.created_at))}</span>
        {job.status === 'echec' && job.error ? (
          <span className="text-[11px] text-coral-text">{job.error}</span>
        ) : null}
        {linkExpired ? <span className="text-[11px] text-muted">Lien expiré</span> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {linkAlive ? (
          <Button variant="secondary" onClick={onDownload} disabled={pending}>
            Télécharger
          </Button>
        ) : null}
        {job.status === 'echec' || linkExpired ? (
          <Button variant="secondary" onClick={onRetry} disabled={retrying}>
            {job.status === 'echec' ? 'Réessayer' : 'Régénérer un export'}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
