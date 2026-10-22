import { Icon } from '@/components/shared/icon';
import type { MentionCandidate } from '../types';

/**
 * La liste des mentions proposées sous l'éditeur.
 *
 * L'éditeur garde le focus — on tape, on choisit. La liste est donc un
 * `listbox` que le champ pilote par `aria-activedescendant`, comme le veut
 * le patron combobox : le focus ne saute pas, et l'option active est
 * annoncée.
 */
export interface MentionPickerProps {
  candidates: MentionCandidate[];
  /** Index de l'option active, celle qui sera saisie. */
  activeIndex: number;
  /** Identifiant du `listbox` — le champ le désigne par `aria-controls`. */
  listboxId: string;
  onPick: (candidate: MentionCandidate) => void;
}

export function MentionPicker({ candidates, activeIndex, listboxId, onPick }: MentionPickerProps) {
  if (candidates.length === 0) return null;
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Mentions disponibles"
      className="m-0 grid list-none gap-0.5 rounded-[14px] border border-border bg-surface p-1 shadow-[var(--shadow-sm)]"
    >
      {candidates.map((candidate, index) => (
        <li
          key={candidate.id}
          id={`${listboxId}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => {
            // `mousedown` et non `click` : le clic ferait perdre le focus du
            // champ avant l'insertion, et le curseur reviendrait au début.
            event.preventDefault();
            onPick(candidate);
          }}
          className={
            index === activeIndex
              ? 'flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] bg-accent-soft px-2.5 text-[12.5px] font-[650] text-accent-strong'
              : 'flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] px-2.5 text-[12.5px] text-fg hover:bg-accent-faint'
          }
        >
          <Icon name={candidate.kind === 'membre' ? 'user' : 'edit'} size="sm" />
          <span className="truncate">{candidate.label}</span>
        </li>
      ))}
    </ul>
  );
}
