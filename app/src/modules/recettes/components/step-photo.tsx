import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { StepPhotoDialog } from './step-photo-dialog';

export interface StepPhotoProps {
  /** URL affichable (jamais un chemin brut), ou `null` pour une étape nue. */
  url: string | null;
  /** Texte alternatif de l'image. */
  alt: string;
  /**
   * Classes additionnelles, concaténées aux classes de base de l'image. Point
   * d'extension du mode cuisine (21-04), qui réduit la hauteur.
   */
  className?: string;
  /**
   * Présent seulement quand le membre peut écrire : rend l'affordance
   * d'ajout (étape nue) ou de modification (étape photographiée). Absent en
   * lecture seule, aucune commande de photo n'est alors rendue.
   */
  onSelectPhoto?: (file: File) => void;
}

/**
 * Photo d'une étape (D-06, D-07, D-10) : pleine largeur sous le texte, ouverte
 * en plein écran au tap. Une étape sans photo ne rend AUCUN élément média — ni
 * trou, ni cadre vide — et un membre qui écrit y voit l'invitation d'ajout.
 */
export function StepPhoto({ url, alt, className, onSelectPhoto }: StepPhotoProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Le champ est remis à vide : choisir deux fois le même fichier doit
        // rejouer le changement.
        event.target.value = '';
        if (file) onSelectPhoto?.(file);
      }}
    />
  );

  if (url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Agrandir : ${alt}`}
          className="mt-2 block w-full cursor-zoom-in rounded-[10px] p-0"
        >
          <img
            src={url}
            alt={alt}
            loading="lazy"
            className={cn('max-h-[320px] w-full rounded-[10px] object-cover', className)}
          />
        </button>
        {onSelectPhoto ? (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-1 inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold text-accent-strong"
            >
              <Icon name="edit" size="sm" /> Modifier la photo
            </button>
            {picker}
          </>
        ) : null}
        <StepPhotoDialog src={url} alt={alt} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  if (!onSelectPhoto) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold text-accent-strong"
      >
        <Icon name="plus" size="sm" /> Ajouter une photo
      </button>
      {picker}
    </>
  );
}
