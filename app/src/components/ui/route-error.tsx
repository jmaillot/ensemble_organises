import { Component, Suspense, createElement, lazy, useMemo, type ReactNode } from 'react';
import { ErrorState } from './empty-state';
import { Button } from './button';
import type { RouteChunkLoader } from '@/app/route-preload';

/**
 * Repli de chargement d'une page (squelette), inchangé depuis le routeur :
 * c'est l'état « ça charge », distinct de l'état « ça a échoué » ci-dessous.
 */
export function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-[38px] py-9 max-[650px]:px-[15px]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la page…</span>
      <div className="mb-6 h-9 w-64 animate-pulse rounded-[11px] bg-accent-faint" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-[16px] bg-accent-faint" />
        <div className="h-44 animate-pulse rounded-[16px] bg-accent-faint" />
      </div>
    </div>
  );
}

interface LazyChunkProps {
  load: RouteChunkLoader;
  attempt: number;
}

/**
 * Marque à la source le rejet d'un **import** paresseux. Sans cette marque, le
 * navigateur rend une `TypeError` de fetch, indiscernable d'une vraie erreur de
 * code : la frontière d'erreur ne pourrait pas séparer « le morceau ne s'est
 * pas téléchargé » (où « Réessayer » relance utilement un `import()`) de « la
 * page s'est chargée puis a échoué au rendu » (où rejouer boucle sans fin).
 * Le nom est posé ici, avant `lazy`, donc avant que React n'en fasse une
 * erreur de rendu quelconque.
 */
const CHUNK_ERROR_NAME = 'ChunkLoadError';

function tagChunkLoadError(error: unknown): Error {
  const tagged = error instanceof Error ? error : new Error(String(error));
  tagged.name = CHUNK_ERROR_NAME;
  return tagged;
}

/**
 * Le morceau paresseux lui-même. `attempt` force la recréation du `lazy()` à
 * chaque réessai : React met en cache la promesse rejetée d'un `lazy`
 * existant, donc réafficher le MÊME objet ne retenterait jamais le
 * téléchargement. Un nouvel objet = un nouvel `import()` = les morceaux
 * précachés par le SW se résolvent même hors ligne.
 */
function LazyChunk({ load, attempt }: LazyChunkProps) {
  const Chunk = useMemo(
    () =>
      lazy(async () => {
        try {
          return await load();
        } catch (error) {
          throw tagChunkLoadError(error);
        }
      }),
    [load, attempt],
  );
  return (
    <Suspense fallback={<RouteFallback />}>
      {createElement(Chunk)}
    </Suspense>
  );
}

/**
 * Erreur de **rendu** : la page s'est chargée, puis son affichage a échoué.
 * Rejouer le même rendu boucle sans fin, et l'imputer à la connexion est faux.
 * L'action offerte recharge donc réellement l'application — délibérément
 * distincte du « Réessayer » du morceau, qui ne vaut que pour un import.
 */
function RenderErrorState() {
  return (
    <div className="grid min-h-40 place-items-center rounded-[16px] border border-coral/30 bg-coral-soft/40 px-6 py-7 text-center">
      <div>
        <h3 className="mb-1.5 font-display text-base tracking-[-0.035em]">Cette page a rencontré une erreur</h3>
        <p className="mx-auto mb-4 max-w-md text-xs text-muted">
          La page s’est chargée mais son affichage a échoué. La réessayer rejouerait la même panne : rechargez
          l’application pour repartir d’un état neuf.
        </p>
        <Button variant="secondary" icon="refresh" onClick={() => window.location.reload()}>
          Recharger l’application
        </Button>
      </div>
    </div>
  );
}

interface LazyRouteState {
  error: Error | null;
  attempt: number;
}

/**
 * Garde d'erreur par route (09-06, D-09) : borne chaque page paresseuse avec
 * un état de réessai explicite au lieu du repli `Suspense` figé.
 *
 * Deux causes, deux traitements (WR-17, D-12) :
 * - rejet de l'**import** (marqué `ChunkLoadError` dans `LazyChunk`) : message
 *   de connexion et bouton « Réessayer » qui ré-importe le morceau — jamais
 *   une impasse, et le réessai automatique au retour réseau reste en place ;
 * - erreur de **rendu** de la page : message qui dit ce qu'elle est, sans
 *   réessai (rejouer la même page fautive boucle), avec un rechargement réel
 *   de l'application à la place.
 *
 * Au succès, la garde dort : le rendu est exactement la page, sans
 * habillage — comportement en ligne identique à avant.
 */
export class LazyRoute extends Component<{ load: RouteChunkLoader }, LazyRouteState> {
  override state: LazyRouteState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<LazyRouteState> {
    return { error };
  }

  private handleOnline = (): void => {
    // Le retour réseau ne relance que l'import : une erreur de rendu ne
    // dépend pas du réseau et ne doit pas se rejouer en boucle.
    if (this.state.error?.name === CHUNK_ERROR_NAME) this.retry();
  };

  override componentDidMount(): void {
    if (typeof window !== 'undefined') window.addEventListener('online', this.handleOnline);
  }

  override componentWillUnmount(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.handleOnline);
  }

  private retry = (): void => {
    this.setState((previous) => ({ error: null, attempt: previous.attempt + 1 }));
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-[1480px] px-[38px] py-9 max-[650px]:px-[15px]">
          {this.state.error.name === CHUNK_ERROR_NAME ? (
            <ErrorState
              message="La page n’a pas pu se charger — vérifiez votre connexion puis réessayez : la page se rechargera aussi toute seule au retour du réseau."
              onRetry={this.retry}
            />
          ) : (
            <RenderErrorState />
          )}
        </div>
      );
    }
    return <LazyChunk load={this.props.load} attempt={this.state.attempt} />;
  }
}
