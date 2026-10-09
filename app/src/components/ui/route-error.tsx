import { Component, Suspense, createElement, lazy, useMemo, type ReactNode } from 'react';
import { ErrorState } from './empty-state';
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
 * Le morceau paresseux lui-même. `attempt` force la recréation du `lazy()` à
 * chaque réessai : React met en cache la promesse rejetée d'un `lazy`
 * existant, donc réafficher le MÊME objet ne retenterait jamais le
 * téléchargement. Un nouvel objet = un nouvel `import()` = les morceaux
 * précachés par le SW se résolvent même hors ligne.
 */
function LazyChunk({ load, attempt }: LazyChunkProps) {
  const Chunk = useMemo(() => lazy(load), [load, attempt]);
  return (
    <Suspense fallback={<RouteFallback />}>
      {createElement(Chunk)}
    </Suspense>
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
 * - « Réessayer » ré-importe le morceau (voir `LazyChunk`) — jamais une
 *   impasse : le bouton reste tant que la page ne s'affiche pas.
 * - Réessai automatique au retour réseau : l'événement `online` relance
 *   l'import sans que l'utilisateur ait à toucher quoi que ce soit.
 * - Au succès, la garde dort : le rendu est exactement la page, sans
 *   habillage — comportement en ligne identique à avant.
 */
export class LazyRoute extends Component<{ load: RouteChunkLoader }, LazyRouteState> {
  override state: LazyRouteState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<LazyRouteState> {
    return { error };
  }

  private handleOnline = (): void => {
    if (this.state.error) this.retry();
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
          <ErrorState
            message="La page n'a pas pu se charger — tu es peut-être hors ligne et cette page n'a pas encore été mise en cache. Reconnecte-toi puis réessaie : la page se rechargera aussi toute seule au retour du réseau."
            onRetry={this.retry}
          />
        </div>
      );
    }
    return <LazyChunk load={this.props.load} attempt={this.state.attempt} />;
  }
}
