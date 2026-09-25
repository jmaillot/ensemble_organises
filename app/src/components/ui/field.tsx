import { createContext, useContext, useId, type ReactNode } from 'react';
import { Label } from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

interface FieldContextValue {
  controlId: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  describedBy: string | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/**
 * Champ de formulaire : libellé lié au contrôle, aide et message d'erreur
 * reliés par `aria-describedby`.
 */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const uid = useId();
  const controlId = `${uid}-control`;
  const descriptionId = hint ? `${uid}-description` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ controlId, descriptionId: descriptionId ?? '', errorId: errorId ?? '', invalid: Boolean(error), describedBy }}>
      <div className={cn('grid gap-1.5', className)}>
        <Label htmlFor={controlId} className="text-[11px] font-extrabold text-muted">
          {label}
          {optional ? <span className="ml-1 font-normal">· optionnel</span> : <span aria-hidden="true"> *</span>}
        </Label>
        {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) || undefined })}
        {hint ? (
          <p id={descriptionId} className="text-[10px] text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="text-[11px] font-semibold text-coral">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function useFieldControl() {
  const context = useContext(FieldContext);
  if (!context) return {};
  return {
    id: context.controlId,
    'aria-describedby': context.describedBy,
    'aria-invalid': context.invalid || undefined,
  };
}
