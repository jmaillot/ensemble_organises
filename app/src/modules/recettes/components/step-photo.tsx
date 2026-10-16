import { cn } from '@/lib/utils';

export interface StepPhotoProps {
  /** URL affichable (jamais un chemin brut), ou `null` pour une étape nue. */
  url: string | null;
  /** Texte alternatif de l'image. */
  alt: string;
  /**
   * Classes additionnelles, concaténées aux classes de base. Point
   * d'extension du mode cuisine (21-04), qui réduit la hauteur : il fait
   * donc partie du contrat du composant dès maintenant.
   */
  className?: string;
}

/**
 * Photo d'une étape (D-06, D-10) : pleine largeur sous le texte de l'étape.
 * Une étape sans photo ne rend AUCUN élément média — ni trou, ni cadre vide.
 */
export function StepPhoto({ url, alt, className }: StepPhotoProps) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn('mt-2 max-h-[320px] w-full rounded-[10px] object-cover', className)}
    />
  );
}
