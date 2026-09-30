import { cn, initials } from '@/lib/utils';
import type { HouseholdMemberRow, MemberColorTag } from '@/types';

const tagClass: Record<MemberColorTag, string> = {
  accent: 'bg-accent',
  ink: 'bg-fg',
  coral: 'bg-coral',
  amber: 'bg-amber',
  violet: 'bg-[oklch(55%_0.13_300)]',
};

export function memberTagClass(tag: MemberColorTag | string | null | undefined) {
  // Le foyer porte sa couleur en texte libre (`households.avatar_color`) : une
  // valeur inconnue retombe sur l'accent plutôt que de casser le rendu.
  return tag !== null && tag !== undefined && tag in tagClass ? tagClass[tag as MemberColorTag] : tagClass.accent;
}

export interface MemberAvatarProps {
  member?: Pick<HouseholdMemberRow, 'display_name' | 'color_tag' | 'avatar_url'> | null;
  name?: string;
  colorTag?: MemberColorTag | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'size-[23px] rounded-[8px] text-[9px]',
  md: 'size-8 rounded-[11px] text-[10px]',
  lg: 'size-11 rounded-[14px] text-xs',
} as const;

/** Avatar coloré par membre : le code couleur remplace la lecture du nom. */
export function MemberAvatar({ member, name, colorTag, size = 'md', className }: MemberAvatarProps) {
  const label = member?.display_name ?? name ?? '';
  if (member?.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={label ? `Photo de ${label}` : 'Photo du membre'}
        className={cn('shrink-0 object-cover', sizeClass[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      title={label || undefined}
      className={cn(
        'grid shrink-0 place-items-center font-extrabold text-surface',
        sizeClass[size],
        memberTagClass(member?.color_tag ?? colorTag),
        className,
      )}
    >
      {initials(label)}
    </span>
  );
}
