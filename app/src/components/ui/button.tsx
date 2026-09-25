import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/shared/icon';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[12px] font-[760] whitespace-nowrap transition-[background,color,border-color,transform] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-[3px] focus-visible:outline-accent-strong disabled:pointer-events-none disabled:opacity-55 disabled:hover:translate-y-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent-strong text-surface hover:bg-accent-deep',
        secondary: 'border border-border bg-surface text-fg hover:border-accent hover:bg-accent-faint',
        quiet: 'bg-transparent px-2 text-accent-strong hover:bg-accent-soft',
        danger: 'bg-coral-soft text-coral hover:bg-coral-strong',
        ghost: 'bg-transparent text-muted hover:bg-accent-faint hover:text-fg',
      },
      size: {
        default: 'min-h-11 px-[15px] text-[13px]',
        sm: 'min-h-9 rounded-[10px] px-[11px] text-[12px]',
        lg: 'min-h-12 px-5 text-sm',
        icon: 'size-11 shrink-0 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: IconName;
  iconEnd?: IconName;
  asChild?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, icon, iconEnd, asChild, fullWidth, children, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  if (asChild) {
    // `Slot` exige un enfant unique : l'icône est fournie par l'appelant.
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)} {...rest}>
        {children}
      </Comp>
    );
  }
  return (
    <Comp
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size="sm" /> : null}
    </Comp>
  );
});

export { buttonVariants };
