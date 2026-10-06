/**
 * Gabarit sobre des e-mails d'invitation aux listes de cadeaux (D-02/D-03).
 *
 * Fonctions pures, sans dépendance au relais : la suite Vitest standard les
 * couvre sans SMTP. L'action Edge `send-email`
 * (`supabase/functions/gift-list-invite/index.ts`, `handleSendEmail`)
 * applique les MÊMES règles côté serveur (même borne, même suppression des
 * retours ligne) — les deux paliers rejettent au-delà de la borne, jamais
 * de troncature silencieuse.
 */

/** Borne du message personnel de l'hôte (D-03) : miroir exact de
 *  `HOST_MESSAGE_MAX` côté Edge. */
export const GIFT_HOST_MESSAGE_MAX = 500;

/**
 * Anti-injection d'en-têtes (T-06-06) : toute valeur interpolée dans
 * l'objet ou l'expéditeur perd ses retours ligne.
 */
export function stripMailBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export interface GiftInviteMailInput {
  inviterName: string;
  householdName: string;
  listName: string;
  link: string;
  /** ISO instant de l'expiration du code, ou null quand non borné. */
  expiresAt: string | null;
  hostMessage?: string | null;
}

/** Objet sobre : qui invite + nom de la liste, rien d'autre en fixe. */
export function buildGiftInviteSubject(input: Pick<GiftInviteMailInput, 'inviterName' | 'listName'>): string {
  return `${stripMailBreaks(input.inviterName)} vous partage sa liste « ${stripMailBreaks(input.listName)} »`;
}

/**
 * Corps sobre (D-02) + message hôte optionnel (D-03). L'expiration n'est
 * mentionnée que quand le code est borné. Un message hôte au-delà de la
 * borne est REJETÉ (RangeError), pas tronqué.
 */
export function buildGiftInviteBody(input: GiftInviteMailInput): string {
  const message = input.hostMessage?.trim() ? input.hostMessage.trim() : null;
  if (message !== null && message.length > GIFT_HOST_MESSAGE_MAX) {
    throw new RangeError(`Le message personnel fait ${GIFT_HOST_MESSAGE_MAX} caractères au plus.`);
  }
  const lines = [
    `${input.inviterName} (${input.householdName}) vous partage sa liste « ${input.listName} ».`,
    `Ouvrir la liste : ${input.link}`,
  ];
  if (input.expiresAt !== null) {
    lines.push(`Ce lien expire le ${input.expiresAt.slice(0, 10)}.`);
  }
  if (message !== null) {
    lines.push('', `Message de ${input.inviterName} :`, message);
  }
  return lines.join('\n');
}
