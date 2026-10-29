import { MemberAvatar } from '@/components/shared/member-avatar';
import { latestRead } from '@/lib/notification-reads';
import { formatListTime } from '../types';
import type { MemberColorTag } from '@/types';

/**
 * Rangée d'accusés de lecture (D-02, gabarit UI-SPEC) : composition locale de
 * `MemberAvatar` — PAS un nouveau composant générique (UI-SPEC Design System,
 * aucun ajout dans `components/ui`).
 *
 * Gabarit : avatars `sm` (23px) empilés `gap-1` (8px) + horodatage
 * `text-[11px] text-muted` (Micro-label UI-SPEC, poids 800). Marge lg (16px)
 * au-dessus du bloc, hauteur bornée à 23px — un pavé compact sous la bulle,
 * jamais une ligne pleine. Sans libellé visible (Copywriting Contract) ;
 * le membre qui n'a pas lu est simplement absent — jamais un avatar grisé.
 */

export interface ReadReceiptReader {
  id: string;
  name: string;
  colorTag: MemberColorTag;
  /** Instant de lecture ; les membres sans lecture n'arrivent pas ici. */
  readAt: string;
}

/** Backstop zero-one-many (UI-SPEC) : au-delà de 5 avatars, un « +N ». */
const MAX_AVATARS = 5;

/**
 * Horodatage relatif court, même gabarit que les horodatages du fil
 * (« À l'instant », l'heure du jour, « Hier », date courte au-delà).
 * Les ISO hétérogènes sont gérés par `formatListTime` (comparaison
 * chronologique, pas lexicographique — Don't Hand-Roll).
 */
export function formatReadAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (Date.now() - date.getTime() < 60_000) return 'À l’instant';
  return formatListTime(iso);
}

export function ReadReceipts({ readers }: { readers: ReadReceiptReader[] }) {
  // Zéro lecteur : pas de rangée du tout (jamais « Vu par personne »).
  if (readers.length === 0) return null;
  const shown = readers.slice(0, MAX_AVATARS);
  const extra = readers.length - shown.length;
  // L'horodatage affiché est la lecture la plus récente : c'est l'instant où
  // le message a été vu « en dernier ».
  const latest = readers.reduce((acc, reader) => latestRead(acc, reader.readAt), '');
  return (
    <div
      aria-label={`Lu par ${readers.map((reader) => reader.name).join(', ')}`}
      className="mt-4 flex h-[23px] items-center gap-1 self-end"
    >
      {shown.map((reader) => (
        <MemberAvatar key={reader.id} name={reader.name} colorTag={reader.colorTag} size="sm" />
      ))}
      {extra > 0 ? (
        <span className="text-[11px] font-extrabold text-muted" aria-hidden="true">
          +{extra}
        </span>
      ) : null}
      <time dateTime={latest} className="text-[11px] font-extrabold text-muted">
        {formatReadAt(latest)}
      </time>
    </div>
  );
}
