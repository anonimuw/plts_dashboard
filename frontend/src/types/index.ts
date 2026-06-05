export interface StatusData {
  power_w: number;
  ghi_wm2: number;
  temperature_c: number;
  timestamp: string;
  is_daytime: boolean;
  status: string;
}

export interface DailyForecast {
  labels: string[];
  values: number[];
  confidence_upper: number[];
  confidence_lower: number[];
  total_energy_wh: number;
  peak_power_w: number;
  method: 'lstm' | 'physics_fallback';
  generated_at: string;
}

export interface WeeklyForecast {
  labels: string[];
  dates: string[];
  values: number[];
  is_actual: boolean[];
  confidence_upper: number[];
  confidence_lower: number[];
  weather_icons: string[];
  total_energy_wh: number;
  avg_daily_wh: number;
  method: 'lstm' | 'physics_fallback';
  generated_at: string;
}

export interface HistoryData {
  labels: string[];
  values: number[];
  predicted_values: (number | null)[];
  ghi?: number[];
  t_amb?: number[];
  t_cell?: number[];
  humidity?: number[];
  wind_speed?: number[];
  i_out?: number[];
}
