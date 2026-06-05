export const PLTS_CONFIG = {
  latitude: -7.822269,
  longitude: 112.441299,
  totalPowerWp: 400,
  panelCount: 2,
  panelPowerWp: 200,
  panelEfficiency: 0.19,
  performanceRatio: 0.77,
  systemVoltage: 24,
  sccEfficiency: 0.95,
  noct: 45,
  tiltAngle: 12,
  alertLowWh: 200,
  alertHighWh: 500,
} as const;

export const MODEL_METRICS = {
  name: 'LSTM Vanilla Hourly Multivariate',
  architecture: '2 Layer LSTM (64→32)',
  inputShape: '(24, 8)',
  features: '8 fitur',
  r2: 0.9617,
  rmse: 14.21,
  mae: 6.86,
  mape: 33.11,
} as const;

export const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀️',
  partly_cloudy: '⛅',
  cloudy: '☁️',
  rainy: '🌧️',
  stormy: '⛈️',
};

export const REFRESH_INTERVALS = {
  status: 15 * 60 * 1000,
  forecast: 60 * 60 * 1000,
} as const;

export async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
