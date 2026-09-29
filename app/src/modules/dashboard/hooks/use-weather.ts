import { useQuery } from '@tanstack/react-query';
import type { IconName } from '@/components/shared/icon';

/**
 * Météo en direct (Open-Meteo, sans clé).
 *
 * Deux appels en chaîne, mis en cache par TanStack Query :
 * 1. géocodage du nom de ville -> coordonnées (cache long, la ville bouge peu) ;
 * 2. prévision courante -> température + code WMO.
 *
 * Aucun secret, aucune migration : seul le nom de ville est transmis au
 * service, jamais d'identifiant. La météo est éphémère, elle ne va ni dans
 * Dexie ni dans le précache PWA : hors ligne, on affiche la dernière valeur
 * connue avec sa date plutôt que rien.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export const WEATHER_STALE_MS = 30 * 60 * 1000;

export type WeatherStatus = 'loading' | 'ready' | 'error';

export interface WeatherState {
  status: WeatherStatus;
  /** Température en °C, arrondie à l'affichage. */
  temperature: number | null;
  /** Libellé français du code WMO. */
  label: string;
  icon: IconName;
  /** Nom de lieu renvoyé par le géocodage, tel quel. */
  placeName: string | null;
  /** Heure de la mesure (`current.time` de l'API, ISO locale). */
  measuredAt: string | null;
}

/** Code WMO -> français. Les icônes restent celles du design (`sun`, `cloud`) : le libellé porte la précision. */
export function weatherCodeToFr(code: number): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Dégagé', icon: 'sun' };
  if (code === 1) return { label: 'Peu nuageux', icon: 'sun' };
  if (code === 2) return { label: 'Partiellement nuageux', icon: 'cloud' };
  if (code === 3) return { label: 'Couvert', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: 'cloud' };
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: 'cloud' };
  if (code === 71 || code === 73 || code === 75 || code === 77) return { label: 'Neige', icon: 'cloud' };
  if (code === 85 || code === 86) return { label: 'Averses de neige', icon: 'cloud' };
  if (code === 95 || code === 96 || code === 99) return { label: 'Orage', icon: 'cloud' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: 'cloud' };
  return { label: 'Variable', icon: 'cloud' };
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  name: string;
}

export async function fetchGeocode(city: string, signal?: AbortSignal): Promise<GeocodeResult> {
  const params = new URLSearchParams({ name: city.trim(), count: '1', language: 'fr', format: 'json' });
  const response = await fetch(`${GEOCODE_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Géocodage indisponible (${response.status}).`);
  const body = (await response.json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const first = body.results?.[0];
  if (!first) throw new Error('Ville introuvable pour la météo.');
  return first;
}

export async function fetchForecast(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<{ temperature: number; code: number; time: string }> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,weather_code',
    timezone: 'auto',
  });
  const response = await fetch(`${FORECAST_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Météo indisponible (${response.status}).`);
  const body = (await response.json()) as { current?: { temperature_2m: number; weather_code: number; time: string } };
  if (!body.current) throw new Error('Réponse météo incomplète.');
  return { temperature: body.current.temperature_2m, code: body.current.weather_code, time: body.current.time };
}

const LOADING: WeatherState = { status: 'loading', temperature: null, label: 'Chargement…', icon: 'sun', placeName: null, measuredAt: null };
const ERROR: WeatherState = { status: 'error', temperature: null, label: 'Météo indisponible', icon: 'cloud', placeName: null, measuredAt: null };

export function useWeather(city: string): WeatherState {
  const key = city.trim().toLowerCase();
  const query = useQuery({
    queryKey: ['meteo', key],
    enabled: key.length >= 2,
    staleTime: WEATHER_STALE_MS,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: WEATHER_STALE_MS,
    retry: 1,
    queryFn: async ({ signal }) => {
      const geo = await fetchGeocode(key, signal);
      const forecast = await fetchForecast(geo.latitude, geo.longitude, signal);
      return { geo, forecast };
    },
  });

  if (query.isPending) return LOADING;
  // Données périmées mais affichables : TanStack garde l'ancien `data` quand
  // un réappel échoue, donc le hors-ligne affiche la dernière valeur connue.
  if (query.isError || !query.data) return ERROR;
  const { label, icon } = weatherCodeToFr(query.data.forecast.code);
  return {
    status: 'ready',
    temperature: query.data.forecast.temperature,
    label,
    icon,
    placeName: query.data.geo.name,
    measuredAt: query.data.forecast.time,
  };
}
