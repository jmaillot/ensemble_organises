/**
 * Chiffrement et signature des messages Web Push (RFC 8291, RFC 8188, RFC 8292).
 *
 * Ce module ne dépend ni de Deno ni du runtime de la stack : il n'utilise que
 * `globalThis.crypto` (WebCrypto). Il est donc vérifiable par la suite Vitest du
 * frontend (`web-push.test.ts`), et non seulement par un envoi réel — un envoi
 * réel, lui, ne prouve rien tant qu'aucun message n'a été distribué.
 *
 * LE PIÈGE PRINCIPAL : LE SECRET D'AUTHENTIFICATION N'EST PAS UNE CLÉ
 *   L'abonnement Push contient deux choses distinctes, et les confondre produit
 *   un secret partagé faux — donc un message que le récepteur rejette, sans
 *   aucune erreur visible :
 *     * `keys.p256dh` — la clé publique P-256 du RÉCEPTEUR. C'est elle qui
 *       participe à l'ECDH avec la clé éphémère de l'expéditeur ;
 *     * `keys.auth` — 16 octets aléatoires, qui ne sont PAS un scalaire de
 *       courbe. Ils n'interviennent qu'en sel de HKDF, jamais dans l'ECDH.
 *   La RFC 8291 §3.4 le dit dans ses deux pseudo-codes, « pour un agent
 *   utilisateur » et « pour un serveur d'application », et c'est la seule
 *   lecture qui explique pourquoi les deux convergent vers le même secret.
 *
 * AUCUN CHIFFREMENT ÉCRIT À LA MAIN
 *   L'ECDH passe par `crypto.subtle.deriveBits` : l'expéditeur possède sa clé
 *   éphémère complète (d, x, y), et la clé publique du récepteur est
 *   importable telle quelle. Le calcul de courbe n'a donc aucune raison
 *   d'exister ici — et le vecteur de la RFC 8291 le prouve.
 *
 * SOIXANTE SEIZE OCTETS DE TAILLE
 *   Un service Push peut refuser un message dont le corps dépasse 4096 octets
 *   (RFC 8030 §7.2). Le budget se déduit à l'envers : 4096 − 86 (en-tête) − 1
 *   (indicateur d'enregistrement) − 16 (tag AEAD) − 1 (délimiteur de bourrage)
 *   − la taille du JSON. `assertPayloadWithinLimit` refuse tout message trop
 *   long AVANT l'envoi : un corps rejeté silencieusement par le service est
 *   indiscernable d'un rappel oublié.
 */

// ---------------------------------------------------------------------------
// Encodage base64url
// ---------------------------------------------------------------------------

/** Base64url sans bourrage (RFC 4648 §5), comme l'attend la Push API. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalised = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalised.length % 4)) % 4;
  // `atob` lance une `InvalidCharacterError` dont le message est en anglais et
  // ne dit rien de la valeur fautive. Une donnée d'abonnement est stocknée en
  // base : elle peut être tronquée par une migration, ou altérée, et le diagnostic
  // doit rester lisible dans les journaux du serveur.
  let binary: string;
  try {
    binary = atob(normalised + '='.repeat(padding));
  } catch {
    throw new Error('Web Push : valeur base64url illisible.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const encoder = new TextEncoder();

function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

// ---------------------------------------------------------------------------
// Clés P-256 et ECDH
// ---------------------------------------------------------------------------

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** Point public non compressé (65 octets, préfixe 0x04) vers un JWK public. */
export function publicKeyToJwk(publicKey: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('P-256 : clé publique attendue sur 65 octets, préfixe 0x04.');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(publicKey.subarray(1, 33)),
    y: bytesToBase64Url(publicKey.subarray(33, 65)),
    ext: true,
  };
}

/**
 * Une paire de clés vue par ses deux moitiés : le point public, transmis dans
 * l'en-tête `keyid` de la RFC 8188, et la clé privée au format JWK, seule forme
 * que `crypto.subtle` accepte pour une clé EC.
 */
export interface PushKeyPair {
  publicKey: Uint8Array;
  privateJwk: JsonWebKey;
}

/** Paire éphémère de l'expéditeur, jetable dès le message chiffré. */
export async function generateServerKeyPair(): Promise<PushKeyPair> {
  const keyPair = (await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', keyPair.privateKey),
  };
}

/**
 * Reconstruit une paire à partir du point public et du scalaire, tous deux
 * base64url. Seul usage : rejouer les vecteurs de la RFC 8291, qui publie les
 * deux moitiés sans les réunir.
 */
export function keyPairFrom(publicKey: Uint8Array, privateScalar: Uint8Array): PushKeyPair {
  if (privateScalar.length !== 32) {
    throw new Error('P-256 : le scalaire privé doit faire 32 octets.');
  }
  return { publicKey, privateJwk: { ...publicKeyToJwk(publicKey), d: bytesToBase64Url(privateScalar) } };
}

/**
 * Secret ECDH partagé : l'abscisse du point `priv × pair`.
 *
 * `deriveBits` rend déjà exactement les 32 octets attendus par la RFC 8291.
 * L'import de la clé publique est la seule vérification de la courbe : un point
 * hors courbe est refusé, ce qui dispense de tout contrôle supplémentaire.
 */
export async function deriveSharedSecret(privateJwk: JsonWebKey, peerPublicKey: Uint8Array): Promise<Uint8Array> {
  const [privateKey, peer] = await Promise.all([
    crypto.subtle.importKey('jwk', privateJwk, P256, false, ['deriveBits']),
    crypto.subtle.importKey('jwk', publicKeyToJwk(peerPublicKey), P256, false, []),
  ]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256));
}

/** Les 16 octets de `keys.auth`, qui ne sont pas une clé de courbe. */
function readAuthSecret(authSecret: string): Uint8Array {
  const bytes = base64UrlToBytes(authSecret);
  if (bytes.length !== 16) {
    throw new Error('Web Push : le secret d\'authentification doit faire 16 octets.');
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Dérivation des clés (RFC 8291 §3.4, puis RFC 8188 §2.2)
// ---------------------------------------------------------------------------

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

export interface ContentKeys {
  /** Secret ECDH partagé, avant combinaison. */
  ecdhSecret: Uint8Array;
  /** PRK de la combinaison des secrets (HKDF-Extract, sel = `keys.auth`). */
  prkKey: Uint8Array;
  /** `key_info` : "WebPush: info" || 0x00 || ua_public || as_public. */
  keyInfo: Uint8Array;
  /** Matière d'entrée de la dérivation RFC 8188 (HKDF-Expand, L = 32). */
  ikm: Uint8Array;
  /** PRK de la dérivation du contenu (HKDF-Extract, sel = `salt`). */
  prk: Uint8Array;
  cekInfo: Uint8Array;
  nonceInfo: Uint8Array;
  /** Clé de chiffrement du contenu (16 octets). */
  cek: Uint8Array;
  /** Nonce du premier enregistrement (12 octets). */
  nonce: Uint8Array;
}

const CEK_INFO = utf8('Content-Encoding: aes128gcm\0');
const NONCE_INFO = utf8('Content-Encoding: nonce\0');

/**
 * Entrées de la dérivation, nommées comme la RFC 8291 §3.4.
 *
 * Les deux clés publiques sont des paramètres distincts et non derivatives :
 * `key_info` les concatène dans l'ordre `ua_public || as_public`, quel que soit
 * le côté depuis lequel on parle. Donner une paire et « l'autre » conduit donc à
 * inverser cet ordre côté récepteur, et à dériver une autre clé — un message que
 * seul le récepteur légitime refuse, sans le moindre message d'erreur.
 */
export interface DeriveInput {
  /** Clé privée du côté qui dérive : l'expéditeur, ou le récepteur en test. */
  privateJwk: JsonWebKey;
  /** `keys.auth` de l'abonnement, 16 octets. */
  authSecret: string;
  /** Sel du message, 16 octets. */
  salt: Uint8Array;
  /** `ua_public` : clé publique du récepteur. */
  receiverPublicKey: Uint8Array;
  /** `as_public` : clé publique éphémère de l'expéditeur. */
  senderPublicKey: Uint8Array;
  /**
   * Clé publique de l'interlocuteur, celle contre laquelle l'ECDH se fait.
   *
   * Elle est distincte des deux précédentes parce que les deux rôles ne se
   * ressemblent pas : l'expéditeur fait l'ECDH avec `ua_public`, le récepteur
   * avec `as_public`, alors que `key_info` les concatène toujours dans l'ordre
   * `ua_public || as_public`. Un seul couple de clés ne peut donc pas décrire
   * les deux côtés, et confondre « l'autre » avec « le récepteur » dérive une
   * clé que seul le récepteur légitime refuse.
   */
  peerPublicKey: Uint8Array;
}

/** Chaîne de dérivation complète, exposée pour être vérifiée étape par étape. */
export async function deriveContentKeys(input: DeriveInput): Promise<ContentKeys> {
  const auth = readAuthSecret(input.authSecret);
  const ecdhSecret = await deriveSharedSecret(input.privateJwk, input.peerPublicKey);

  // HKDF-Extract(salt = keys.auth, IKM = ecdh_secret)
  const prkKey = await hmacSha256(auth, ecdhSecret);
  // HKDF-Expand(PRK_key, key_info, L = 32)
  const keyInfo = concatBytes(utf8('WebPush: info'), new Uint8Array([0]), input.receiverPublicKey, input.senderPublicKey);
  const ikm = await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])));

  // RFC 8188 : PRK = HKDF-Extract(salt, IKM)
  const prk = await hmacSha256(input.salt, ikm);
  const cekExpanded = await hmacSha256(prk, concatBytes(CEK_INFO, new Uint8Array([1])));
  const nonceExpanded = await hmacSha256(prk, concatBytes(NONCE_INFO, new Uint8Array([1])));

  return {
    ecdhSecret,
    prkKey,
    keyInfo,
    ikm,
    prk,
    cekInfo: CEK_INFO,
    nonceInfo: NONCE_INFO,
    cek: cekExpanded.slice(0, 16),
    nonce: nonceExpanded.slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// En-tête et chiffrement
// ---------------------------------------------------------------------------

const HEADER_FIXED_LENGTH = 21;

/** Taille d'enregistrement annoncée : un multiple de la taille de bloc. */
export const DEFAULT_RECORD_SIZE = 4096;

/** Un enregistrement de plus de 2³²−1 octets ne serait pas adressable. */
export function assertRecordSize(recordSize: number): void {
  if (!Number.isInteger(recordSize) || recordSize < 18 || recordSize > 0xffffffff) {
    throw new Error('Web Push : taille d\'enregistrement invalide.');
  }
}

export function buildHeader(salt: Uint8Array, recordSize: number, serverPublicKey: Uint8Array): Uint8Array {
  assertRecordSize(recordSize);
  if (salt.length !== 16) throw new Error('Web Push : le sel doit faire 16 octets.');
  if (serverPublicKey.length !== 65) throw new Error('Web Push : clé serveur attendue sur 65 octets.');

  const header = new Uint8Array(HEADER_FIXED_LENGTH + serverPublicKey.length);
  header.set(salt, 0);
  // `rs` occupe exactement quatre octets, en grand-boutiste : le champ existe
  // avant `idlen` et le `keyid`, et le déborder décalerait l'identifiant de la
  // clé serveur — un message que le récepteur lirait sans comprendre.
  const size = BigInt(recordSize);
  header[16] = Number((size >> 24n) & 0xffn);
  header[17] = Number((size >> 16n) & 0xffn);
  header[18] = Number((size >> 8n) & 0xffn);
  header[19] = Number(size & 0xffn);
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, HEADER_FIXED_LENGTH);
  return header;
}

export interface EncryptedPayload {
  /** Corps complet : en-tête, indicateur d'enregistrement, puis contenu chiffré. */
  body: Uint8Array;
  salt: Uint8Array;
  serverPublicKey: Uint8Array;
  recordSize: number;
}

export interface EncryptOptions {
  /** Sel de 16 octets ; tiré au hasard par défaut (fourni par les tests). */
  salt?: Uint8Array;
  recordSize?: number;
  /** Paire éphémère fournie : permet de rejouer un vecteur de test. */
  keyPair?: PushKeyPair;
}

/**
 * Chiffre un message pour un abonnement, selon la RFC 8291.
 *
 * Un seul enregistrement, sans bourrage : le vecteur `rs` vaut 4096, taille
 * maximale acceptée par tous les services Push, et un bourrage serait rejeté par
 * un récepteur minimal (RFC 8291 §4). Le texte clair est suivi du seul
 * délimiteur 0x02, « dernier enregistrement, aucun bourrage ».
 */
export async function encryptPayload(
  plaintext: string,
  receiverPublicKey: string,
  authSecret: string,
  options: EncryptOptions = {},
): Promise<EncryptedPayload> {
  assertPayloadWithinLimit(plaintext);

  const recordSize = options.recordSize ?? DEFAULT_RECORD_SIZE;
  assertRecordSize(recordSize);

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error('Web Push : le sel doit faire 16 octets.');

  const keyPair = options.keyPair ?? (await generateServerKeyPair());
  const receiverKey = base64UrlToBytes(receiverPublicKey);
  const keys = await deriveContentKeys({
    privateJwk: keyPair.privateJwk,
    authSecret,
    salt,
    receiverPublicKey: receiverKey,
    senderPublicKey: keyPair.publicKey,
    peerPublicKey: receiverKey,
  });
  const header = buildHeader(salt, recordSize, keyPair.publicKey);

  // Dernier enregistrement (1), type 0101 = aes128gcm (RFC 8188 §2.1).
  const padded = concatBytes(utf8(plaintext), new Uint8Array([0x02]));
  // AUCUNE donnée associée, et c'est délibéré : pour `aes128gcm`, le tag AEAD
  // ne couvre pas l'en-tête. Il ne faut pas en conclure que l'en-tête est
  // manipulable — le sel et les deux clés publiques entrent dans la dérivation
  // de la CEK, donc un en-tête modifié donne une autre clé et le déchiffrement
  // échoue. Le vecteur de la RFC 8291 tranche : les 145 octets publiés ne
  // sortent qu'avec un AAD vide.
  const ciphertext = await encryptAesGcm(keys.cek, keys.nonce, padded);

  return {
    body: concatBytes(header, new Uint8Array([0x51]), ciphertext),
    salt,
    serverPublicKey: keyPair.publicKey,
    recordSize,
  };
}

async function encryptAesGcm(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, cryptoKey, plaintext as BufferSource),
  );
}

async function decryptAesGcm(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, cryptoKey, ciphertext as BufferSource),
  );
}

// ---------------------------------------------------------------------------
// Décryptage : le test d'aller-retour n'a de sens que s'il décode vraiment
// ---------------------------------------------------------------------------

/**
 * Déchiffre un corps produit par `encryptPayload`.
 *
 * Cette fonction n'est utilisée par aucun chemin de production : elle existe
 * pour que le test d'aller-retour prouve que le message produit est
 * déchiffrable par le récepteur, et non seulement produit. Un générateur
 * déterministe qui s'auto-vérifierait ne prouverait rien.
 */
export async function decryptPayload(
  body: Uint8Array,
  receiverKeyPair: PushKeyPair,
  authSecret: string,
): Promise<string> {
  if (body.length <= HEADER_FIXED_LENGTH) throw new Error('Web Push : corps trop court pour être déchiffré.');

  const salt = body.subarray(0, 16);
  const idLength = body[20];
  if (idLength !== 65) throw new Error('Web Push : clé serveur absente ou mal formée dans l\'en-tête.');
  const serverPublicKey = body.subarray(HEADER_FIXED_LENGTH, HEADER_FIXED_LENGTH + idLength);

  // Le récepteur refait l'ECDH avec SA clé privée et la clé publique du serveur :
  // les rôles s'inversent, le résultat est le même.
  const keys = await deriveContentKeys({
    privateJwk: receiverKeyPair.privateJwk,
    authSecret,
    salt,
    receiverPublicKey: receiverKeyPair.publicKey,
    senderPublicKey: serverPublicKey,
    peerPublicKey: serverPublicKey,
  });

  // L'octet qui suit l'en-tête décrit l'enregistrement : dernier (1) et type
  // 0101 = aes128gcm. Le contenu chiffré commence APRÈS lui — l'inclure dans
  // le texte chiffré décalerait tout d'un octet, et l'échec se manifesterait
  // comme un tag invalide, sans rapport avec la cause.
  const recordFlag = body[HEADER_FIXED_LENGTH + idLength];
  if (recordFlag !== 0x51) {
    throw new Error(`Web Push : enregistrement inattendu (0x${recordFlag.toString(16)}).`);
  }
  const ciphertext = body.subarray(HEADER_FIXED_LENGTH + idLength + 1);
  // Le dernier octet du texte clair est le délimiteur de bourrage ; sa valeur
  // doit être 0x02, faute de quoi le message est rejeté (RFC 8291 §4).
  const plaintext = await decryptAesGcm(keys.cek, keys.nonce, ciphertext);
  if (plaintext.length === 0) throw new Error('Web Push : texte clair vide.');
  const delimiter = plaintext[plaintext.length - 1];
  if (delimiter !== 0x02) throw new Error(`Web Push : délimiteur de bourrage inattendu (0x${delimiter.toString(16)}).`);

  return new TextDecoder().decode(plaintext.subarray(0, plaintext.length - 1));
}

/** Taille d'enregistrement annoncée dans l'en-tête (champ `rs`, 4 octets). */
export function readRecordSize(body: Uint8Array): number {
  return ((body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19]) >>> 0;
}

// ---------------------------------------------------------------------------
// Signature VAPID (RFC 8292)
// ---------------------------------------------------------------------------

export interface VapidClaims {
  /** Origine du service Push, sans chemin : `https://fcm.googleapis.com`. */
  audience: string;
  /** `mailto:` ou `https:` — une origine nue n'est pas acceptée. */
  subject: string;
  expiration: number;
}

export interface VapidHeaders {
  authorization: string;
}

function originOf(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new Error('Web Push : un endpoint doit être en HTTPS.');
  }
  return url.origin;
}

export function assertVapidSubject(subject: string): void {
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) {
    throw new Error('VAPID : `sub` doit être une adresse `mailto:` ou une URL `https:`.');
  }
}

/** En-tête JWS non signé : `{"typ":"JWT","alg":"ES256"}`. */
export function vapidHeaderSegment(): string {
  return bytesToBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
}

export function vapidPayloadSegment(claims: VapidClaims): string {
  return bytesToBase64Url(
    utf8(JSON.stringify({ aud: claims.audience, exp: claims.expiration, sub: claims.subject })),
  );
}

/**
 * Signature ES256 (ECDSA P-256 + SHA-256, signature brute r‖s de 64 octets).
 *
 * WebCrypto rend la signature au format brut, ce qui est exactement ce
 * qu'attend JWS : aucune conversion DER n'est nécessaire, et c'est la forme que
 * les services Push vérifient.
 */
export async function signVapidToken(
  claims: VapidClaims,
  privateKeyPkcs8: string,
): Promise<string> {
  assertVapidSubject(claims.subject);
  const signingInput = `${vapidHeaderSegment()}.${vapidPayloadSegment(claims)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlToBytes(privateKeyPkcs8) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput) as BufferSource),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

export async function buildVapidAuthorization(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKeyPkcs8: string,
  expirationSeconds = 12 * 3600,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VapidHeaders> {
  const claims: VapidClaims = {
    audience: originOf(endpoint),
    subject,
    expiration: nowSeconds + expirationSeconds,
  };
  const token = await signVapidToken(claims, privateKeyPkcs8);
  return { authorization: `vapid t=${token}, k=${publicKey}` };
}

// ---------------------------------------------------------------------------
// Budget de taille
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 4096;
const HEADER_BYTES = 86;
const RECORD_FLAG_BYTES = 1;
const AEAD_TAG_BYTES = 16;
const PADDING_DELIMITER_BYTES = 1;

/** Taille maximale du texte clair encryptable pour un service Push. */
export const MAX_PLAINTEXT_BYTES = MAX_BODY_BYTES - HEADER_BYTES - RECORD_FLAG_BYTES - AEAD_TAG_BYTES - PADDING_DELIMITER_BYTES;

export function assertPayloadWithinLimit(plaintext: string): void {
  const size = utf8(plaintext).length;
  if (size > MAX_PLAINTEXT_BYTES) {
    throw new Error(`Web Push : message de ${size} octets, maximum ${MAX_PLAINTEXT_BYTES}.`);
  }
}
