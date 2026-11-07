import { useEffect, useState } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { clearDatabase } from '@/lib/data/dexie';
import { isLocalMode } from '@/lib/data';
import { useInstallPrompt } from '@/hooks/use-pwa';
import { useOutbox } from '@/hooks/use-outbox';
import { useOutboxGate } from '@/hooks/use-outbox-gate';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { abandonOutboxEntry, outboxEntryLabel, outboxKeyFor, type OutboxEntry } from '@/lib/offline/outbox';
import { retryOutboxEntry } from '@/lib/offline/outbox-replay';
import {
  getRestoreOutcome,
  inspectPersistedCache,
  type InspectCachePersiste,
  type RestoreOutcome,
} from '@/lib/offline/query-persistence';
import { useSwState, updateSW } from '@/lib/sw-register';
import { dataModeLabel } from '../types';

// `unknown` signale « construit hors pipeline estampillé » (D-02) : sans
// injection de SHA, afficher `0.1.0` — le semver du `package.json` — serait
// une version fausse avec assurance, car un build local diffère déjà de
// l'image servie (`.dockerignore` exclut les tests et `docs`, Tailwind émet
// moins de classes). `||` et non `??` : un `--build-arg GIT_SHA=` transmet
// une chaîne VIDE, qu'il faut replacer par `unknown` au même titre qu'une
// variable absente.
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';
// SHA complet (40) pour la comparaison exacte avec `git rev-parse HEAD` sur
// le clone de production, forme courte (8) pour l'œil à l'écran (D-03).
// `unknown` ne fait que 7 caractères : `slice(0, 8)` le laisse intact, aucun
// cas spécial à gérer.
const appVersionShort = appVersion.slice(0, 8);

// D-11 : à l'ÉCRAN, `unknown` n'est jamais montré tel quel. Un build sans
// estampille (ou avec chaîne vide, déjà replacée par `unknown` ci-dessus) est
// un build local : afficher `0.1.0` serait une version fausse avec assurance
// et `unknown` un libellé de machine, pas un message pour l'humain. On
// déclare alors « Version de développement », avec au survol la raison de
// l'imprécision. Ce repli est strictement un choix de RENDU : les trois
// canaux machine de l'estampille (`X-App-Version`, `/version.json`, LABEL
// image) continuent de porter `unknown` tel quel — leur contrat `unknown` est
// consommé par `scripts/check-version-stamp.sh` et les diagnostics de
// production (D-12). Avec estampille : SHA court à l'écran, SHA complet au
// survol, comportement inchangé (D-13).
const appVersionInconnue = appVersion === 'unknown';
const libelleRepli = 'Version de développement';
const titleRepli =
  'Version de développement : cette version a été construite hors du pipeline estampillé, sa valeur exacte n’est pas fiable.';
const versionEcran = appVersionInconnue ? libelleRepli : appVersionShort;
const titleEcran = appVersionInconnue ? titleRepli : appVersion;

/**
 * 35-09 (gap G-35-5) : libellés de la section « Cache hors-ligne ». D-11 —
 * le panneau décrit des faits, jamais une fraîcheur prétendue ni une perte
 * suggérée : une famille au-delà de sa conservation est « écartée au prochain
 * démarrage », jamais « périmée et perdue » ; une absence de cache est « pas
 * encore sur cet appareil », jamais « perdu ».
 */
function libelleAgeCache(ageMs: number): string {
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 1) return 'moins d’une minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function libelleDureeConservation(maxAgeMs: number): string {
  const heures = maxAgeMs / 3600000;
  // Au-delà de deux jours, le jour est l'unité honnête ; 24 h reste « 24 h »
  // (l'unité de la règle D-08 pour les familles Tier 1).
  if (heures >= 48 && heures % 24 === 0) return `${heures / 24} j`;
  return `${heures} h`;
}

function libelleIssueRestore(outcome: RestoreOutcome | null): string {
  if (!outcome) return 'Restauration pas encore passée sur cette session';
  if (outcome.failure) return `Dernière restauration : échec — ${outcome.failure}`;
  if (outcome.restoredFamilies === 0) return 'Dernière restauration : rien à restaurer';
  const base = `Dernière restauration : ${outcome.restoredFamilies} familles restaurées`;
  // M = prunedFamilies : le delta de prune est un fait AFFICHÉ (compté avant/
  // après par connectOfflineCache), jamais déduit. M = 0 → mention omise.
  return outcome.prunedFamilies > 0 ? `${base}, ${outcome.prunedFamilies} écartées (> 24 h)` : base;
}

export function OfflinePanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canInstall, install } = useInstallPrompt();
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // D-12 : point d'observation unique de l'état SW. `useSwState` renvoie l'objet
  // de test mocké (vi.hoisted) ou le store zustand réel.
  const sw = useSwState();
  const { isEmpty } = useOutboxGate();
  const [swVersion, setSwVersion] = useState<string | null>(null);
  // D-11 (plan 34-04) : la liste des écritures vient de la SOURCE UNIQUE
  // `useOutbox` — le même canal que le badge et la gate, aucun comptage ni
  // listing parallèle.
  const { entries } = useOutbox();
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const householdId = useHouseholdStore((state) => state.householdId);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [entryToAbandon, setEntryToAbandon] = useState<OutboxEntry | null>(null);

  // 35-09 (T-35-19) : l'introspection du cache persisté est lue au montage et
  // au changement de couple (utilisateur, foyer) — JAMAIS à chaque rendu.
  // Lecture seule (D-08) : aucun effet de bord, aucun bouton.
  const [cacheInspecte, setCacheInspecte] = useState<InspectCachePersiste | null>(null);
  const [lectureCacheImpossible, setLectureCacheImpossible] = useState(false);
  useEffect(() => {
    if (!userId || !householdId) {
      setCacheInspecte(null);
      setLectureCacheImpossible(false);
      return;
    }
    let annule = false;
    setLectureCacheImpossible(false);
    inspectPersistedCache(userId, householdId)
      .then((rapport) => {
        if (!annule) setCacheInspecte(rapport);
      })
      .catch(() => {
        // L'échec de lecture est un état affiché, pas un plantage muet (§2.7 F).
        if (!annule) setLectureCacheImpossible(true);
      });
    return () => {
      annule = true;
    };
  }, [userId, householdId]);

  // L'issue du restore est un fait de SESSION, posé par connectOfflineCache au
  // bootstrap (avant le montage de ce panneau) : lu une fois, pas de polling.
  const [issueRestore] = useState<RestoreOutcome | null>(() => getRestoreOutcome());

  // État réseau réel (onlineManager, corrigé par la sonde 35-07) — même
  // discipline que le listener SW ci-dessus : abonnement + nettoyage appariés.
  const [enLigne, setEnLigne] = useState(onlineManager.isOnline());
  useEffect(() => {
    const unsubscribe = onlineManager.subscribe(() => setEnLigne(onlineManager.isOnline()));
    return unsubscribe;
  }, []);

  // Ping EO_VERSION (sw.ts) vers le worker actif : la réponse reporte la
  // version du SW en service. Repli honnête si pas de registration ni d'API
  // serviceWorker (dev sans SW, navigateurs exotiques).
  useEffect(() => {
    const active = sw.registration?.active;
    // La référence API est capturée ICI : le cleanup doit retirer l'écouteur
    // sur le MÊME objet, même si l'environnement change après coup (tests).
    const swApi = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!active || !swApi) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; version?: string } | null;
      if (data?.type === 'EO_VERSION_REPLY' && typeof data.version === 'string') {
        setSwVersion(data.version);
      }
    };
    swApi.addEventListener('message', onMessage);
    active.postMessage({ type: 'EO_VERSION' });
    return () => swApi.removeEventListener('message', onMessage);
  }, [sw.registration]);

  /** D-11 : Réessayer — l'entrée repasse à `pending` et une passe de rejeu part (T-34-10). */
  const handleRetry = async (entry: OutboxEntry) => {
    if (!userId || !householdId) return;
    setRetrying(entry.key);
    try {
      await retryOutboxEntry(queryClient, userId, householdId, entry);
      // Le verdict est lu dans la file elle-même, jamais deviné : l'entrée
      // partie = envoyée ; encore présente = réseau toujours absent, elle
      // retentera (§2.7 F : un succès muet est un échec inexpliqué).
      const encore = (queryClient.getQueryData<OutboxEntry[]>(outboxKeyFor(userId, householdId)) ?? []).some(
        (candidate) => candidate === entry,
      );
      toast(encore ? 'Écriture toujours en attente : elle repartira dès le retour du réseau.' : 'Écriture partie au serveur.');
    } catch (retryError) {
      toast(retryError instanceof Error ? retryError.message : 'Rejeu impossible.', 'error');
    } finally {
      setRetrying(null);
    }
  };

  /** D-11 : Abandonner — retrait explicite, après confirmation (T-34-09). */
  const handleAbandon = () => {
    if (!entryToAbandon || !userId || !householdId) return;
    abandonOutboxEntry(queryClient, userId, householdId, entryToAbandon);
    setEntryToAbandon(null);
    toast('Écriture abandonnée : elle ne sera pas envoyée au serveur.');
  };

  return (
    <div className="grid gap-[18px] max-[920px]:grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <Panel title="Données et mode de fonctionnement" description="L’application lit et écrit directement sur le serveur du foyer.">
        <div className="grid gap-0">
          <div className="flex items-center justify-between gap-2.5 py-[13px] text-xs">
            <span className="text-muted">Mode de données</span>
            <strong>{dataModeLabel(isLocalMode)}</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Version</span>
            <strong title={titleEcran}>{versionEcran}</strong>
          </div>
          {/* D-12 : la version du worker est une source DISTINCTE de la
              version app (Pitfall 7) — deux lignes, jamais fusionnées. */}
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Version du service worker</span>
            <strong>{swVersion ?? 'Service worker indisponible'}</strong>
          </div>
          {sw.needsRefresh ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
              <span className="text-muted">Mise à jour en attente</span>
              <Button
                variant="secondary"
                disabled={!isEmpty}
                onClick={() => void updateSW()}
              >
                {isEmpty ? 'Appliquer maintenant' : 'Mise à jour en préparation…'}
              </Button>
            </div>
          ) : null}
        </div>
        {isLocalMode ? (
          <p className="mt-4 mb-4 text-[11px] text-muted">
            En mode local, les données vivent uniquement dans ce navigateur : rien n’est envoyé sur un serveur. Videz le
            cache pour revenir au jeu de démonstration d’origine.
          </p>
        ) : (
          <p className="mt-4 mb-4 text-[11px] text-muted">
            Connecté au serveur du foyer : chaque lecture et chaque écriture part directement, et une erreur réseau ou
            serveur s’affiche telle quelle. Une connexion est nécessaire pour utiliser l’application.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon="trash"
            disabled={clearing}
            onClick={() => setConfirmClear(true)}
          >
            Vider le cache local
          </Button>
          {canInstall ? (
            <Button icon="download" onClick={() => void install()}>
              Installer l’application
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Écritures en attente"
        description="Les modifications faites hors connexion partent au serveur dès que le réseau revient."
      >
        {entries.length === 0 ? (
          <p className="m-0 text-[11px] text-muted">
            Aucune écriture en attente : tout ce que vous avez fait est arrivé au serveur du foyer.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {entries.map((entry) => (
              <li
                key={entry.key}
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] border border-border px-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <strong className="block">{outboxEntryLabel(entry)}</strong>
                  {entry.status === 'failed' && entry.failure ? (
                    <span className="block text-[11px] font-semibold text-coral-text">
                      Bloquée ({entry.failure.code}) — {entry.failure.message}
                    </span>
                  ) : (
                    <span className="block text-[11px] text-muted">En attente du réseau</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={retrying === entry.key}
                    onClick={() => void handleRetry(entry)}
                  >
                    {retrying === entry.key ? 'Rejeu…' : 'Réessayer'}
                  </Button>
                  <Button variant="secondary" icon="trash" onClick={() => setEntryToAbandon(entry)}>
                    Abandonner
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Cache hors-ligne"
        description="Ce que cet appareil a mis en cache pour ce foyer — lecture seule."
      >
        {!userId || !householdId ? (
          <p className="m-0 text-[11px] text-muted">Connectez-vous pour voir le cache de ce foyer.</p>
        ) : (
          <div className="grid gap-0">
            <div className="flex items-center justify-between gap-2.5 py-[13px] text-xs">
              <span className="text-muted">État du réseau</span>
              <strong>{enLigne ? 'En ligne' : 'Hors ligne'}</strong>
            </div>
            <div className="border-t border-border py-[13px] text-xs">
              {lectureCacheImpossible ? (
                <p className="m-0 text-[11px] text-muted">
                  État du cache indisponible : la lecture de cet appareil a échoué.
                </p>
              ) : cacheInspecte === null ? (
                <p className="m-0 text-[11px] text-muted">Lecture de l’état du cache…</p>
              ) : cacheInspecte.families.length === 0 ? (
                // L'absence est un fait, pas une erreur (D-11) : « pas encore
                // sur cet appareil », jamais « perdu ».
                <p className="m-0 text-[11px] text-muted">
                  Aucune donnée mise en cache sur cet appareil pour ce foyer — reconnectez-vous une fois en ligne pour
                  la mettre en cache.
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {cacheInspecte.families.map((famille) => (
                    <li key={famille.prefix} className="text-xs">
                      {famille.prefix} — mise en cache il y a {libelleAgeCache(famille.ageMs)} — conserve{' '}
                      {libelleDureeConservation(famille.maxAgeMs)}
                      {famille.pruneEligible
                        ? ' — au-delà de la durée de conservation, écartée au prochain démarrage'
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
              <span className="text-muted">Dernière restauration</span>
              <strong>{libelleIssueRestore(issueRestore)}</strong>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Application web" description="Installable, sans magasin d’applications.">
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>Application web installable (manifeste + service worker).</li>
          <li>Les rappels arrivent en notification push, réglables dans le panneau notifications.</li>
        </ul>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Version <span title={titleEcran}>{versionEcran}</span> · service worker mis à jour automatiquement à chaque
          déploiement.
        </p>
      </Panel>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider le cache local ?"
        description="Les données enregistrées sur cet appareil seront supprimées. Le jeu de démonstration sera rechargé à la prochaine lecture."
        confirmLabel="Vider le cache"
        onConfirm={async () => {
          setClearing(true);
          try {
            await clearDatabase();
            await queryClient.invalidateQueries();
            toast('Cache local vidé.');
          } catch (clearError) {
            toast(clearError instanceof Error ? clearError.message : 'Vidage impossible.', 'error');
          } finally {
            setClearing(false);
            setConfirmClear(false);
          }
        }}
      />

      <ConfirmDialog
        open={entryToAbandon !== null}
        onOpenChange={(open) => {
          if (!open) setEntryToAbandon(null);
        }}
        title="Abandonner cette écriture ?"
        description="Elle ne sera jamais envoyée au serveur : la modification concernée restera locale et sera perdue. Cette action est définitive."
        confirmLabel="Abandonner l’écriture"
        onConfirm={handleAbandon}
      />
    </div>
  );
}
