import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';

const controlClass =
  'w-full max-w-full min-h-11 rounded-[11px] border border-border bg-surface px-3 text-fg outline-none transition-colors duration-[var(--duration-quick)] hover:border-accent focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-[3px] focus-visible:outline-accent-strong disabled:opacity-55 aria-[invalid=true]:border-coral';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(controlClass, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(controlClass, 'min-h-25 resize-y py-2.5', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(controlClass, 'cursor-pointer pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, containerClassName, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Icon name="search" size="sm" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input ref={ref} type="search" className={cn(controlClass, 'pl-[38px]', className)} {...rest} />
    </div>
  );
});
