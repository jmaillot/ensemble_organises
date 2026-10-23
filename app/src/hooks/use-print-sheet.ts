import { useEffect, useState } from 'react';

/**
 * Feuille imprimable (`@media print`), commune à Courses et au Calendrier.
 *
 * `print()` monte le bloc de la feuille, l'effet ouvre le dialogue
 * d'impression, puis `afterprint` le démonte — annulation comprise. La feuille
 * n'existe donc dans le DOM que le temps de l'impression : rendue en
 * permanence avec `display: none`, elle doublerait chaque ligne pour les
 * lecteurs d'écran et pour les requêtes de test.
 *
 * Un navigateur qui n'émet pas `afterprint` laisse un bloc masqué à l'écran,
 * sans autre conséquence.
 */
export function usePrintSheet() {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(false);
    window.addEventListener('afterprint', finish);
    window.print();
    return () => window.removeEventListener('afterprint', finish);
  }, [printing]);

  return { printing, print: () => setPrinting(true) };
}
