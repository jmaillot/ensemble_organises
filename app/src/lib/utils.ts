import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const euroFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export const formatEuro = (value: number) => euroFormatter.format(Number.isFinite(value) ? value : 0);

export const formatEuroCompact = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );

export const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const longDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const mediumDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const weekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export const formatLongDate = (iso: string) => longDate.format(toLocalDate(iso));
export const formatMediumDate = (iso: string) => mediumDate.format(toLocalDate(iso));
export const formatShortDate = (iso: string) => shortDate.format(toLocalDate(iso));
export const formatMonthLabel = (date: Date) => monthLabel.format(date);
export const formatWeekday = (iso: string) => weekdayShort.format(toLocalDate(iso));

/** Évite le décalage de fuseau des chaînes ISO courtes (`2026-09-25`). */
export function toLocalDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
}

export const pad = (value: number) => String(value).padStart(2, '0');

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayIso = () => toIsoDate(new Date());

export function addDays(iso: string, days: number) {
  const date = toLocalDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string) {
  const from = toLocalDate(fromIso).getTime();
  const to = toLocalDate(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function relativeDayLabel(iso: string) {
  const delta = daysBetween(todayIso(), iso);
  if (delta === 0) return "Aujourd'hui";
  if (delta === 1) return 'Demain';
  if (delta === -1) return 'Hier';
  if (delta > 1 && delta <= 30) return `Dans ${delta} jours`;
  if (delta < -1) return `En retard de ${Math.abs(delta)} j`;
  return formatMediumDate(iso);
}

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count > 1 ? plural : singular}`;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function randomId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Token d'invitation : 128 bits minimum, encodage base64url court (22 caractères). */
export function generateInviteToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
