import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Progress } from '@/components/ui/primitives';
import { useCuisineProgress } from '../hooks/use-cuisine-progress';
import type { RecipeStep } from '../types';

export interface RecipeCuisineViewProps {
  steps: RecipeStep[];
  recipeId: string;
  wakeLockSupported: boolean;
}

/**
 * Vue cuisine (SPEC R2, D-01–D-09) : fork de `StepRow` SANS DnD ni édition —
 * pastille XL statique + connecteur + case à gauche + compteur sticky N/M.
 * Reçoit `steps` déjà chargés par la fiche : zéro appel réseau.
 */
export function RecipeCuisineView({ steps, recipeId, wakeLockSupported }: RecipeCuisineViewProps) {
  const { checked, toggle, reset } = useCuisineProgress(recipeId, steps);
  const done = steps.filter((step) => checked.has(step.id)).length;
  const total = steps.length;

  if (total === 0) {
    // Copie reprise telle quelle de `recipe-steps.tsx` (piège Pitfall 6 :
    // ne pas retaper l'apostrophe).
    return (
      <section aria-label="Mode cuisine">
        <p className="m-0 py-3 text-xs text-muted">Aucune étape pour l’instant.</p>
      </section>
    );
  }

  return (
    <section aria-label="Mode cuisine">
      <div className="sticky top-0 z-10 bg-surface/95 py-1 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p
            className="m-0 text-[14px] font-bold"
            aria-live="polite"
            aria-label={`Progression : ${done} étapes sur ${total}`}
          >
            {done}/{total}
          </p>
          <CuisineReset label="Réinitialiser" variant="quiet" size="sm" onReset={reset} />
        </div>
        <Progress value={total === 0 ? 0 : (done / total) * 100} label={`Progression : ${done} étapes sur ${total}`} />
        {!wakeLockSupported ? (
          <p className="m-0 mt-1 text-[14px] text-muted">Veille non bloquée sur cet appareil.</p>
        ) : null}
      </div>

      <ol className="m-0 mt-6 grid list-none gap-0 p-0" aria-label="Étapes de la recette">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const number = index + 1;
          const isChecked = checked.has(step.id);
          return (
            <li key={step.id} className="relative flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[20px] font-bold text-accent-strong"
                >
                  {number}
                </span>
                {!isLast ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggle(step.id)}
                    aria-label={`Marquer l’étape ${number} comme faite`}
                    className="relative mt-1 size-6 shrink-0 after:absolute after:-inset-3 after:content-['']"
                  />
                  {isChecked ? (
                    <p className="m-0 line-clamp-2 text-[14px] text-muted" aria-label={step.content}>
                      {step.content}
                    </p>
                  ) : (
                    <p className="m-0 text-[18px] leading-[1.5]">{step.content}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <CuisineReset
        label="Tout réinitialiser"
        variant="secondary"
        onReset={reset}
        className="mt-8 w-full min-[650px]:w-auto"
      />
    </section>
  );
}

interface CuisineResetProps {
  label: string;
  variant: 'quiet' | 'secondary';
  size?: 'sm' | 'default';
  onReset: () => void;
  className?: string;
}

/**
 * Reset aux deux endroits (D-09) avec confirmation inline in-place (D-14,
 * sans modale : aucune donnée serveur en jeu). « Annuler » restaure le
 * bouton ; « Réinitialiser » remet à zéro.
 */
function CuisineReset({ label, variant, size, onReset, className }: CuisineResetProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className={className}>
        <p className="m-0 text-[14px]">Tout effacer ?</p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              onReset();
              setConfirming(false);
            }}
          >
            Réinitialiser
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant={variant} size={size} onClick={() => setConfirming(true)} className={className}>
      {label}
    </Button>
  );
}
