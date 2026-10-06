import { describe, expect, it } from 'vitest';
import {
  buildGiftInviteBody,
  buildGiftInviteSubject,
  GIFT_HOST_MESSAGE_MAX,
  stripMailBreaks,
  type GiftInviteMailInput,
} from './email-template';

const BASE: GiftInviteMailInput = {
  inviterName: 'Marie',
  householdName: 'Les Martin',
  listName: 'Noël de Léo',
  link: 'https://app.votredomaine.fr/invitation/cadeau?code=JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj',
  expiresAt: '2026-12-25T00:00:00.000Z',
  hostMessage: null,
};

describe('email-template', () => {
  it('porte le contenu sobre : invitant, foyer, liste, lien, expiration', () => {
    expect(buildGiftInviteSubject(BASE)).toBe('Marie vous partage sa liste « Noël de Léo »');
    const body = buildGiftInviteBody(BASE);
    expect(body).toContain('Marie (Les Martin) vous partage sa liste « Noël de Léo ».');
    expect(body).toContain(`Ouvrir la liste : ${BASE.link}`);
    expect(body).toContain('Ce lien expire le 2026-12-25.');
  });

  it('omet la ligne d’expiration quand le code n’est pas borné', () => {
    const body = buildGiftInviteBody({ ...BASE, expiresAt: null });
    expect(body).not.toContain('expire le');
    expect(body).toContain(`Ouvrir la liste : ${BASE.link}`);
  });

  it('ajoute la section du message hôte seulement quand il est présent', () => {
    const withMessage = buildGiftInviteBody({ ...BASE, hostMessage: 'Pensez aux piles !' });
    expect(withMessage).toContain('Message de Marie :');
    expect(withMessage).toContain('Pensez aux piles !');

    const withoutMessage = buildGiftInviteBody(BASE);
    expect(withoutMessage).not.toContain('Message de');
  });

  it('rejette un message hôte au-delà de la borne, sans le tronquer', () => {
    const tooLong = 'x'.repeat(GIFT_HOST_MESSAGE_MAX + 1);
    expect(() => buildGiftInviteBody({ ...BASE, hostMessage: tooLong })).toThrow(RangeError);
    // À la borne exacte : accepté tel quel.
    const exact = 'y'.repeat(GIFT_HOST_MESSAGE_MAX);
    expect(buildGiftInviteBody({ ...BASE, hostMessage: exact })).toContain(exact);
  });

  it('neutralise l’injection d’en-têtes : aucun retour ligne ne survit', () => {
    const hostile = {
      inviterName: 'Marie\r\nBcc: spam@exemple.fr',
      listName: 'Noël\nX-Injecté: oui',
    };
    const subject = buildGiftInviteSubject(hostile);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain('Marie Bcc: spam@exemple.fr');
    expect(stripMailBreaks('\r\n  spaced \n').trim()).toBe('spaced');
  });
});
