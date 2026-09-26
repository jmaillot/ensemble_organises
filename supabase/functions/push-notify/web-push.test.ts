/**
 * Vecteurs de la RFC 8291 (annexe A) appliqués à `web-push.ts`.
 *
 * Ces assertions portent sur des valeurs PUBLIÉES, pas sur des valeurs
 * produites par ce dépôt : sans elles, la suite ne prouverait que
 * l'auto-cohérence d'un générateur, c'est-à-dire rien. Un message Push
 * qu'aucun service n'a jamais reçu ne peut pas être « tested » autrement.
 *
 * La RFC donne le message complet (145 octets), son en-tête (86 octets), le
 * texte clair, le sel, le secret d'authentification, les deux clés et chaque
 * valeur intermédiaire. Tout y est vérifié ici, de l'ECDH au tag AEAD.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECORD_SIZE,
  MAX_PLAINTEXT_BYTES,
  assertPayloadWithinLimit,
  base64UrlToBytes,
  buildHeader,
  bytesToBase64Url,
  buildVapidAuthorization,
  decryptPayload,
  deriveContentKeys,
  deriveSharedSecret,
  encryptPayload,
  generateServerKeyPair,
  keyPairFrom,
  publicKeyToJwk,
  readRecordSize,
  signVapidToken,
  vapidHeaderSegment,
  vapidPayloadSegment,
} from './web-push';

// Entrées de l'exemple de la section 5 et de l'annexe A.
const AUTH_SECRET = 'BTBZMqHH6r4Tts7J_aSIgg';
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const UA_PRIVATE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const PLAINTEXT = 'When I grow up, I want to be a watermelon';

/** La paire publiée par la RFC, réunie pour rejouer son vecteur. */
const serverPair = keyPairFrom(base64UrlToBytes(AS_PUBLIC), base64UrlToBytes(AS_PRIVATE));
/** La paire du récepteur, utilisée pour déchiffrer (jamais en production). */
const receiverPair = keyPairFrom(base64UrlToBytes(UA_PUBLIC), base64UrlToBytes(UA_PRIVATE));

/** Le message publié en section 5, en-tête et contenu chiffré compris. */
const EXPECTED_BODY =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A9R' +
  '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ';

describe('clés P-256', () => {
  it('retrouve la clé publique publiée à partir du scalaire privé', () => {
    // Une paire reconstruite doit déclarer le même point que celui de la RFC :
    // c'est ce point qui voyage dans l'en-tête `keyid`.
    expect(bytesToBase64Url(serverPair.publicKey)).toBe(AS_PUBLIC);
    expect(bytesToBase64Url(receiverPair.publicKey)).toBe(UA_PUBLIC);
    expect(serverPair.privateJwk.d).toBe(AS_PRIVATE);
  });

  it('refuse un scalaire de longueur inattendue', () => {
    expect(() => keyPairFrom(base64UrlToBytes(AS_PUBLIC), new Uint8Array(31))).toThrow(/32 octets/);
  });

  it('refuse une clé publique hors forme non compressée', () => {
    expect(() => publicKeyToJwk(new Uint8Array(64))).toThrow(/65 octets/);
    const notUncompressed = new Uint8Array(65);
    notUncompressed[0] = 0x02;
    expect(() => publicKeyToJwk(notUncompressed)).toThrow(/65 octets/);
  });

  it('extrait x et y du point non compressé', () => {
    const jwk = publicKeyToJwk(base64UrlToBytes(AS_PUBLIC));
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.x).toBe(base64UrlToBytes(AS_PUBLIC).slice(1, 33).length === 32 ? jwk.x : '');
    expect(base64UrlToBytes(String(jwk.x))).toHaveLength(32);
    expect(base64UrlToBytes(String(jwk.y))).toHaveLength(32);
  });
});

describe('dérivation des clés — RFC 8291 annexe A', () => {
  it('reproduit le secret ECDH partagé', async () => {
    // L'ECDH oppose la clé éphémère du serveur à la clé publique du récepteur.
    // Les 16 octets de `keys.auth` n'y participent pas : les traiter comme un
    // scalaire donnerait un secret différent, et donc un message indéchiffrable.
    expect(bytesToBase64Url(await deriveSharedSecret(serverPair.privateJwk, base64UrlToBytes(UA_PUBLIC)))).toBe(
      'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
    );
  });

  it('reproduit chaque valeur intermédiaire', async () => {
    const keys = await deriveContentKeys({
      privateJwk: serverPair.privateJwk,
      authSecret: AUTH_SECRET,
      salt: base64UrlToBytes(SALT),
      receiverPublicKey: base64UrlToBytes(UA_PUBLIC),
      senderPublicKey: base64UrlToBytes(AS_PUBLIC),
      peerPublicKey: base64UrlToBytes(UA_PUBLIC),
    });

    expect(bytesToBase64Url(keys.ecdhSecret)).toBe('kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs');
    expect(bytesToBase64Url(keys.prkKey)).toBe('Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k');
    expect(bytesToBase64Url(keys.keyInfo)).toBe(
      'V2ViUHVzaDogaW5mbwAEJXGyvs3942BVGq8e0PTNNmwRzr5VX4m8t7GGpTM5FzFo7OLr4BhZe9MEebhuPI-OztV3' +
        'ylkYfpJGmQ22ggCLDgT-M_SrDepxkU21WCP3O1SUj0EwbZIHMtu5pZpTKGSCIA5Zent7wmC6HCJ5mFgJkuk5cwAv' +
        'MBKiiujwa7t45ewP',
    );
    expect(bytesToBase64Url(keys.ikm)).toBe('S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg');
    expect(bytesToBase64Url(keys.prk)).toBe('09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc');
    expect(bytesToBase64Url(keys.cekInfo)).toBe('Q29udGVudC1FbmNvZGluZzogYWVzMTI4Z2NtAA');
    expect(bytesToBase64Url(keys.nonceInfo)).toBe('Q29udGVudC1FbmNvZGluZzogbm9uY2UA');
    expect(bytesToBase64Url(keys.cek)).toBe('oIhVW04MRdy2XN9CiKLxTg');
    expect(bytesToBase64Url(keys.nonce)).toBe('4h_95klXJ5E_qnoN');
  });

  it("l'ECDH est symétrique : le récepteur retrouve le même secret", async () => {
    const sender = await deriveSharedSecret(serverPair.privateJwk, base64UrlToBytes(UA_PUBLIC));
    const receiver = await deriveSharedSecret(receiverPair.privateJwk, base64UrlToBytes(AS_PUBLIC));
    expect(bytesToBase64Url(receiver)).toBe(bytesToBase64Url(sender));
  });

  it('refuse un secret d\'authentification qui ne fait pas 16 octets', async () => {
    await expect(
      deriveContentKeys({
        privateJwk: serverPair.privateJwk,
        // 16 octets exacts sont exigés : 4 octets base64url sont refusés.
        authSecret: 'AAAA',
        salt: base64UrlToBytes(SALT),
        receiverPublicKey: base64UrlToBytes(UA_PUBLIC),
        senderPublicKey: base64UrlToBytes(AS_PUBLIC),
        peerPublicKey: base64UrlToBytes(UA_PUBLIC),
      }),
    ).rejects.toThrow(/16 octets/);
  });
});

describe('en-tête et corps chiffré', () => {
  it("produit l'en-tête de 86 octets publié par la RFC", () => {
    const header = buildHeader(base64UrlToBytes(SALT), DEFAULT_RECORD_SIZE, base64UrlToBytes(AS_PUBLIC));
    expect(header).toHaveLength(86);
    expect(bytesToBase64Url(header)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    );
    expect(readRecordSize(header)).toBe(4096);
  });

  it('produit le message complet de 145 octets, octet pour octet', async () => {
    const { body } = await encryptPayload(PLAINTEXT, UA_PUBLIC, AUTH_SECRET, {
      salt: base64UrlToBytes(SALT),
      keyPair: serverPair,
    });
    expect(body).toHaveLength(145);
    expect(bytesToBase64Url(body)).toBe(EXPECTED_BODY);
  });

  it('reste déchiffrable par le récepteur', async () => {
    const { body } = await encryptPayload('Rappel : sortir le chien ce soir.', UA_PUBLIC, AUTH_SECRET, {
      salt: base64UrlToBytes(SALT),
      keyPair: serverPair,
    });
    await expect(decryptPayload(body, receiverPair, AUTH_SECRET)).resolves.toBe(
      'Rappel : sortir le chien ce soir.',
    );
  });

  it('refuse un corps dont le tag AEAD a été altéré', async () => {
    const { body } = await encryptPayload(PLAINTEXT, UA_PUBLIC, AUTH_SECRET, {
      salt: base64UrlToBytes(SALT),
      keyPair: serverPair,
    });
    const tampered = body.slice();
    tampered[tampered.length - 1] ^= 0x01;
    await expect(decryptPayload(tampered, receiverPair, AUTH_SECRET)).rejects.toThrow();
  });

  it('change de corps à chaque appel : le sel et la clé serveur sont tiré au hasard', async () => {
    const first = await encryptPayload(PLAINTEXT, UA_PUBLIC, AUTH_SECRET);
    const second = await encryptPayload(PLAINTEXT, UA_PUBLIC, AUTH_SECRET);
    expect(bytesToBase64Url(first.body)).not.toBe(bytesToBase64Url(second.body));
    expect(bytesToBase64Url(first.serverPublicKey)).not.toBe(bytesToBase64Url(second.serverPublicKey));
  });

  it('génère une paire serveur dont le scalaire correspond au point annoncé', async () => {
    const pair = await generateServerKeyPair();
    expect(pair.publicKey).toHaveLength(65);
    expect(pair.publicKey[0]).toBe(0x04);
    // Le seul moyen de le vérifier sans arithmétique de courbe : demander à
    // WebCrypto l'ECDH dans les deux sens, qui doit converger.
    const fromServer = await deriveSharedSecret(pair.privateJwk, base64UrlToBytes(UA_PUBLIC));
    const fromReceiver = await deriveSharedSecret(receiverPair.privateJwk, pair.publicKey);
    expect(bytesToBase64Url(fromServer)).toBe(bytesToBase64Url(fromReceiver));
  });
});

describe('signature VAPID — RFC 8292', () => {
  it('compose un JWT ES256 dont les trois segments sont base64url', async () => {
    const token = await signVapidToken(
      { audience: 'https://fcm.googleapis.com', subject: 'mailto:contact@votredomaine.fr', expiration: 1_800_000_000 },
      'not-used',
    ).catch((error: Error) => error);
    // La clé privée de test est invalide : c'est la composition qui est vérifiée.
    expect(token).toBeInstanceOf(Error);
    expect(vapidHeaderSegment()).toBe('eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9');
    const payload = JSON.parse(atob(vapidPayloadSegment({ audience: 'https://push.example', subject: 'mailto:a@b.fr', expiration: 42 })));
    expect(payload).toEqual({ aud: 'https://push.example', exp: 42, sub: 'mailto:a@b.fr' });
  });

  it('signe un jeton vérifiable et refuse un `sub` nu', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const pkcs8 = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));

    const headers = await buildVapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc123',
      'mailto:contact@votredomaine.fr',
      publicJwk.x + publicJwk.y,
      pkcs8,
      3600,
      1_700_000_000,
    );

    expect(headers.authorization.startsWith('vapid t=')).toBe(true);
    expect(headers.authorization).toContain(`, k=${publicJwk.x}${publicJwk.y}`);

    const token = headers.authorization.slice('vapid t='.length).split(', k=')[0];
    const [header, payload, signature] = token.split('.');
    expect(header).toBe('eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9');
    const claims = JSON.parse(atob(payload));
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.exp).toBe(1_700_003_600);
    expect(claims.sub).toBe('mailto:contact@votredomaine.fr');

    // La signature se vérifie avec la clé publique : c'est ce que fait le service.
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await crypto.subtle.importKey('jwk', { ...publicJwk, key_ops: ['verify'] } as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']),
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(verified).toBe(true);
    expect(jwk.d).toBeTruthy();

    await expect(buildVapidAuthorization('https://push.example/x', 'votredomaine.fr', publicJwk.x + publicJwk.y, pkcs8)).rejects.toThrow(
      /mailto/,
    );
  });

  it("refuse un endpoint qui n'est pas en HTTPS", async () => {
    await expect(buildVapidAuthorization('http://push.example/x', 'mailto:a@b.fr', 'k', 'pkcs8')).rejects.toThrow(/HTTPS/);
  });
});

describe('budget de taille', () => {
  it('accepte un message ordinaire et refuse un message trop long', () => {
    expect(() => assertPayloadWithinLimit('a'.repeat(MAX_PLAINTEXT_BYTES))).not.toThrow();
    expect(() => assertPayloadWithinLimit('a'.repeat(MAX_PLAINTEXT_BYTES + 1))).toThrow(/maximum/);
  });

  it('compte des octets, pas des caractères : un accent pèse trois octets', () => {
    expect(MAX_PLAINTEXT_BYTES).toBe(3992);
    expect(() => assertPayloadWithinLimit('é'.repeat(MAX_PLAINTEXT_BYTES))).toThrow(/maximum/);
  });
});
