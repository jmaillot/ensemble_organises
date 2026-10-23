/**
 * Lecteur vCard pour l'import de contacts.
 *
 * Un fichier `.vcf` exporté d'un téléphone ou de Google Contacts contient des
 * fiches vCard 2.1, 3.0 ou 4.0. Ce lecteur n'en retient que ce que le module
 * Contacts sait porter : un nom et, quand elle existe, une date de naissance.
 * Tout le reste — photos, téléphones, adresses — est ignoré : une fiche
 * importée se complète ensuite dans l'application, comme une fiche saisie.
 *
 * Choix assumés, écrits ici pour ne pas être redécidés :
 * - les fiches de structure (sociétés, `KIND:org`, `X-ABShowAs:COMPANY`,
 *   ou `ORG` sans nom de personne) ne sont PAS importées : l'espace Contacts
 *   porte des personnes, et l'Ardoise/Prestataires demanderaient un type que
 *   le fichier ne dit pas ; elles sont comptées, jamais perdues en silence ;
 * - une `BDAY` sans année (`--09-27`) ne peut pas devenir une date complète :
 *   la fiche s'importe sans date plutôt qu'avec une année inventée ;
 * - les lignes pliées (RFC 6350 §3.2) sont dépliées, le quoted-printable est
 *   décodé — Google Contacts exporte encore des noms accentués ainsi en 2.1.
 */

/** Taille maximale d'un fichier accepté (512 Ko) : au-delà, ce n'est plus un
 * carnet d'adresses familial, et lire tout coûte pour rien. */
export const VCARD_MAX_BYTES = 512 * 1024;
/** Nombre maximal de fiches lues : au-delà, le résultat est tronqué et dit. */
export const VCARD_MAX_CARDS = 300;

/** Une personne importable : un nom, une date ISO `YYYY-MM-DD` ou `null`. */
export interface VcardPerson {
  name: string;
  birthDate: string | null;
}

export interface VcardImport {
  /** Personnes exploitables, dans l'ordre du fichier, sans doublon interne. */
  people: VcardPerson[];
  /** Fiches de structure ignorées (sociétés, organisations). */
  organizations: number;
  /** Fiches illisibles ignorées (pas de nom exploitable). */
  invalid: number;
  /** `true` si le fichier contenait plus de fiches que la limite de lecture. */
  truncated: boolean;
}

/** Décode un valeur quoted-printable (`=C3=A9`, continuations `=`). */
function decodeQuotedPrintable(value: string): string {
  if (!value.includes('=')) return value;
  const bytes: number[] = [];
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '=' && index + 2 < value.length + 1) {
      const hex = value.slice(index + 1, index + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 3;
        continue;
      }
    }
    bytes.push(char.charCodeAt(0));
    index += 1;
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

/** Déplie les continuations (ligne suivante commençant par espace ou tab). */
function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Sépare nom de propriété, paramètres et valeur. Le premier `:` hors guillemets
 * sépare de la valeur : un paramètre cité peut en contenir un (`TYPE="a:b"`).
 */
function splitLine(line: string): { property: string; params: string[]; value: string } | null {
  let inQuotes = false;
  let separator = -1;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ':' && !inQuotes) {
      separator = index;
      break;
    }
  }
  if (separator <= 0) return null;
  const head = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const parts = head.split(';');
  // Préfixe de groupe (`item1.FN`) : la partie avant le dernier point du
  // premier segment est le groupe, la propriété est ce qui suit.
  let property = parts[0];
  const dot = property.indexOf('.');
  if (dot > 0) property = property.slice(dot + 1);
  return {
    property: property.trim().toUpperCase(),
    params: parts.slice(1).map((part) => part.trim()),
    value,
  };
}

/** Retire les échappements vCard (`\,` `\;` `\n`) d'une valeur de texte. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function cleanText(value: string): string {
  return unescapeText(value).replace(/\s+/g, ' ').trim();
}

/**
 * Date de naissance d'une valeur `BDAY` : ISO `YYYY-MM-DD`, compact
 * `YYYYMMDD`, ou horodaté `…T…`. Une date sans année vaut `null` — on
 * n'invente pas une année. Un jour/mois impossible vaut `null` aussi.
 */
export function parseVcardDate(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith('--')) return null; // `--MM-DD` : pas d'année
  const timeIndex = value.indexOf('T');
  if (timeIndex > 0) value = value.slice(0, timeIndex);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  const match = iso ?? compact;
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Nom affichable depuis `N` (« Family;Given;; ») : prénom puis nom. */
function nameFromStructuredN(value: string): string | null {
  const parts = value.split(';').map((part) => cleanText(part));
  const given = parts[1] ?? '';
  const family = parts[0] ?? '';
  const joined = [given, family].filter((part) => part !== '').join(' ').trim();
  return joined === '' ? null : joined;
}

function isOrganization(propertyValues: Map<string, string[]>): boolean {
  const kind = propertyValues.get('KIND')?.map((value) => value.trim().toLowerCase()) ?? [];
  if (kind.includes('org')) return true;
  const showAs = propertyValues.get('X-ABSHOWAS')?.map((value) => value.trim().toUpperCase()) ?? [];
  if (showAs.includes('COMPANY')) return true;
  // Une `ORG` sans aucun nom de personne est une fiche de structure.
  const hasPersonName = propertyValues.has('FN') || propertyValues.has('N');
  return propertyValues.has('ORG') && !hasPersonName;
}

/** Lit un texte vCard complet et rend ce qui est importable. */
export function parseVcf(text: string): VcardImport {
  const lines = unfoldLines(text);
  const people: VcardPerson[] = [];
  let organizations = 0;
  let invalid = 0;
  let truncated = false;
  let cards = 0;

  let current: Map<string, string[]> | null = null;

  const flush = () => {
    if (current === null) return;
    const properties = current;
    current = null;
    if (properties.size === 0) return;
    if (isOrganization(properties)) {
      organizations += 1;
      return;
    }
    // FN d'abord ; sinon N structuré. Une valeur FN peut être répétée :
    // la première gagne.
    let name = properties.has('FN') ? cleanText(properties.get('FN')![0]) : null;
    if (!name && properties.has('N')) {
      name = nameFromStructuredN(properties.get('N')![0]);
    }
    if (!name) {
      invalid += 1;
      return;
    }
    const bday = properties.get('BDAY')?.[0];
    const birthDate = bday ? parseVcardDate(decodeQuotedPrintable(bday)) : null;
    people.push({ name, birthDate });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase() === 'BEGIN:VCARD') {
      flush();
      cards += 1;
      if (cards > VCARD_MAX_CARDS) {
        truncated = true;
        break;
      }
      current = new Map();
      continue;
    }
    if (trimmed.toUpperCase() === 'END:VCARD') {
      flush();
      continue;
    }
    if (current === null || trimmed === '') continue;
    const split = splitLine(trimmed);
    if (!split) continue;
    // Quoted-printable : Google Contacts en 2.1 encode les accents ainsi.
    let value = split.value;
    const isEncoded = split.params.some((param) => /quoted-printable/i.test(param));
    if (isEncoded) value = decodeQuotedPrintable(value);
    const bucket = current.get(split.property) ?? [];
    bucket.push(value);
    current.set(split.property, bucket);
  }
  flush();

  // Fichier tronqué : les fiches déjà lues restent importables, le compteur
  // `truncated` le dit au dialogue.
  return { people, organizations, invalid, truncated };
}
