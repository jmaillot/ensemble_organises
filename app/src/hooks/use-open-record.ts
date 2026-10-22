import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { OPEN_RECORD_PARAM } from '@/lib/record-paths';

/**
 * Ouvre la fiche demandée par l'URL.
 *
 * Le lien profond d'une recherche (`/taches?ouvrir=task-1`) porte un
 * identifiant de LIGNE, pas une position : la page ouvre la fiche quand la
 * ligne est arrivée.
 *
 * DEUX DETAILS QUI COMPTENT :
 *
 * - la fiche s'ouvre UNE FOIS. Les enregistrements arrivent en différé, et
 *   l'effet se rejoue à chaque rendu ; sans le verrou, la boîte s'ouvrirait,
 *   se fermerait, et rouvrirait sans cesse. Le verrou retient l'identifiant
 *   déjà traité, pas un booléen : rejouer la MÊME fiche doit rester possible
 *   (un lien reçu deux fois) ;
 * - une fiche INTROUVABLE n'ouvre rien, et ne laisse pas de trace : l'URL
 *   reste, la liste est simplement celle du module.
 */
export function useOpenRecord<T extends { id: string }>(
  records: readonly T[],
  open: (record: T) => void,
): void {
  const [searchParams] = useSearchParams();
  const wanted = searchParams.get(OPEN_RECORD_PARAM);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || opened.current === wanted) return;
    const record = records.find((entry) => entry.id === wanted);
    if (!record) return;
    opened.current = wanted;
    open(record);
  }, [open, records, wanted]);
}
