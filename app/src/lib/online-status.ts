/**
 * Amorçage de l'état réseau de l'application depuis le navigateur.
 *
 * Le corps est VIDE pour l'instant, à dessein : il existe pour que les gardes
 * A et B de `online-status.test.ts` échouent sur l'ASSERTION et non sur un
 * import manquant — c'est ce qui rend le rouge prouvable (§2.7 D.6). L'amorçage
 * réel est le geste de cette tâche.
 */
export function seedOnlineStatus(): void {}
