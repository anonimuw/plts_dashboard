'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { CalendarDays, Lightbulb, CheckCircle, BatteryCharging, BatteryLow, AlertTriangle, Sun } from 'lucide-react';
import { WEATHER_ICONS } from '@/lib/api';
import type { WeeklyForecast } from '@/types';

interface Props {
  data: WeeklyForecast | undefined;
  isLoading: boolean;
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
}

function getDayAdvice(
  label: string,
  wh: number,
  icon: string,
  isActual: boolean,
): { tip: string; level: 'high' | 'medium' | 'low' } {
  const weather = icon === 'rainy' ? ' (hujan)' : icon === 'cloudy' ? ' (mendung)' : '';
  const prefix = isActual ? '[Aktual]' : '[Prediksi]';

  if (wh >= 1200) {
    return {
      level: 'high',
      tip: isActual
        ? `${prefix} ${label}${weather}: Produksi tinggi (${wh.toFixed(0)} Wh) tercatat.`
        : `${prefix} ${label}${weather}: Produksi tinggi (${wh.toFixed(0)} Wh) — jadwalkan beban berat & pastikan baterai penuh.`,
    };
  }
  if (wh >= 600) {
    return {
      level: 'medium',
      tip: isActual
        ? `${prefix} ${label}${weather}: Produksi sedang (${wh.toFixed(0)} Wh) tercatat.`
        : `${prefix} ${label}${weather}: Produksi sedang (${wh.toFixed(0)} Wh) — cukup untuk kebutuhan normal.`,
    };
  }
  return {
    level: 'low',
    tip: isActual
      ? `${prefix} ${label}${weather}: Produksi rendah (${wh.toFixed(0)} Wh) tercatat.`
      : `${prefix} ${label}${weather}: Produksi rendah (${wh.toFixed(0)} Wh) — hemat energi, hanya gunakan beban esensial.`,
  };
}

function WeeklyAdvisor({ data }: { data: WeeklyForecast }) {
  const avg = data.avg_daily_wh;
  const min = Math.min(...data.values);
  const max = Math.max(...data.values);

  const forecastValues = data.values.filter((_, i) => !data.is_actual?.[i]);
  const lowDays = forecastValues.filter((v) => v < 600).length;
  const highDays = forecastValues.filter((v) => v >= 1200).length;
  const actualDays = data.is_actual?.filter(Boolean).length ?? 0;

  const dailyAdvice = data.labels.map((label, i) =>
    getDayAdvice(
      label,
      data.values[i],
      data.weather_icons?.[i] ?? 'partly_cloudy',
      data.is_actual?.[i] ?? false,
    ),
  );

  let overallIcon = Sun;
  let overallColor = 'text-amber-400';
  let overallBg = 'bg-amber-400/5';
  let overallBorder = 'border-amber-400/20';
  let overallTitle = 'Produksi Normal Minggu Ini';
  let overallDesc = `Rata-rata ${avg.toFixed(0)} Wh/hari (${actualDays} hari aktual, ${7 - actualDays} hari prediksi).`;

  if (avg >= 1200) {
    overallIcon = BatteryCharging;
    overallColor = 'text-emerald-400';
    overallBg = 'bg-emerald-400/5';
    overallBorder = 'border-emerald-400/20';
    overallTitle = 'Minggu Produksi Tinggi';
    overallDesc = `Rata-rata ${avg.toFixed(0)} Wh/hari — manfaatkan untuk beban berat dan charging penuh.`;
  } else if (avg < 600) {
    overallIcon = AlertTriangle;
    overallColor = 'text-red-400';
    overallBg = 'bg-red-400/5';
    overallBorder = 'border-red-400/20';
    overallTitle = 'Minggu Produksi Rendah';
    overallDesc = `Rata-rata hanya ${avg.toFixed(0)} Wh/hari — hemat energi sepanjang minggu.`;
  } else if (lowDays >= 2) {
    overallIcon = BatteryLow;
    overallColor = 'text-orange-400';
    overallBg = 'bg-orange-400/5';
    overallBorder = 'border-orange-400/20';
    overallTitle = 'Beberapa Hari Produksi Rendah';
    overallDesc = `${lowDays} hari ke depan diprediksi produksi rendah — siapkan strategi hemat energi.`;
  }

  const OverallIcon = overallIcon;
  const iconColors = { high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-red-400' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className={`overflow-hidden rounded-2xl border ${overallBorder} ${overallBg} backdrop-blur-sm`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Lightbulb size={16} className="text-amber-400" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Rekomendasi Mingguan
        </h2>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${overallBg}`}>
            <OverallIcon size={24} className={overallColor} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">{overallTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{overallDesc}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {dailyAdvice.map((advice, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.4 + i * 0.06 }}
              className="flex items-start gap-2"
            >
              <CheckCircle size={14} className={`mt-0.5 shrink-0 ${iconColors[advice.level]}`} />
              <p className="text-xs leading-relaxed text-slate-300">{advice.tip}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-slate-500">Hari Aktual</p>
            <p className="text-sm font-bold text-blue-400">{actualDays} hari</p>
          </div>
          <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-slate-500">Hari Prediksi</p>
            <p className="text-sm font-bold text-amber-400">{7 - actualDays} hari</p>
          </div>
          <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-slate-500">Rentang</p>
            <p className="text-sm font-bold text-slate-200">{min.toFixed(0)}&ndash;{max.toFixed(0)} Wh</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const ACTUAL_COLOR = '#60a5fa';

export default function WeeklyForecastChart({ data, isLoading }: Props) {
  const [useKwh, setUseKwh] = useState(false);
  const convert = (v: number) => (useKwh ? v / 1000 : v);
  const unit = useKwh ? 'kWh' : 'Wh';

  const chartData = data
    ? data.labels.map((label, i) => {
        const icon = WEATHER_ICONS[data.weather_icons?.[i]] || '';
        const date = data.dates?.[i] ? formatDate(data.dates[i]) : '';
        const isActual = data.is_actual?.[i] ?? false;
        return {
          day: `${icon} ${label} ${date}`,
          value: convert(data.values[i]),
          rawValue: data.values[i],
          isActual,
          upper: convert(data.confidence_upper?.[i] ?? data.values[i]),
          lower: convert(data.confidence_lower?.[i] ?? data.values[i]),
        };
      })
    : [];

  const getForecastColor = (rawWh: number) => {
    if (rawWh < 600) return '#ef4444';
    if (rawWh >= 1200) return '#22c55e';
    return '#f59e0b';
  };

  const todayIndex = data?.is_actual
    ? data.is_actual.lastIndexOf(true) + 1
    : -1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Minggu Ini (Senin &ndash; Minggu)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseKwh(!useKwh)}
              className="rounded-lg border border-white/10 px-3 py-1 font-mono text-xs font-bold text-amber-400 transition-all hover:border-amber-400/50 hover:bg-amber-400/10"
            >
              {unit}
            </button>
            {data?.method && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  data.method === 'lstm'
                    ? 'bg-amber-400/15 text-amber-400'
                    : 'bg-red-400/15 text-red-400'
                }`}
              >
                {data.method === 'lstm' ? 'Hybrid 50/50' : 'Fallback'}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        {data && (
          <div className="flex items-center gap-4 border-b border-white/10 px-5 py-2">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: ACTUAL_COLOR }} />
              <span className="text-[11px] font-medium text-slate-400">Aktual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-amber-500" />
              <span className="text-[11px] font-medium text-slate-400">Prediksi</span>
            </div>
          </div>
        )}

        <div className="p-4">
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: '#e2e8f0', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: '#cbd5e1', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: `Energi (${unit})`,
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#cbd5e1',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: '#f1f5f9',
                  }}
                  labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number, _: string, props: { payload?: (typeof chartData)[0] }) => {
                    const item = props.payload;
                    if (!item) return [`${value.toFixed(1)} ${unit}`, 'Energi'];
                    const typeLabel = item.isActual ? 'Aktual' : 'Prediksi';
                    if (item.isActual) {
                      return [`${value.toFixed(1)} ${unit}`, typeLabel];
                    }
                    return [
                      `${value.toFixed(1)} ${unit} (${item.lower.toFixed(1)}–${item.upper.toFixed(1)})`,
                      typeLabel,
                    ];
                  }}
                />
                {todayIndex > 0 && todayIndex < 7 && (
                  <ReferenceLine
                    x={chartData[todayIndex]?.day}
                    stroke="rgba(148,163,184,0.4)"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Hari ini',
                      position: 'top',
                      fill: '#94a3b8',
                      fontSize: 10,
                    }}
                  />
                )}
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={60}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isActual ? ACTUAL_COLOR : getForecastColor(entry.rawValue)}
                      fillOpacity={entry.isActual ? 0.9 : 0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {data && (
          <div className="flex flex-wrap gap-6 border-t border-white/10 px-5 py-3">
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Total Minggu Ini
              </span>
              <div className="font-mono text-sm font-bold text-white">
                {convert(data.total_energy_wh).toFixed(1)} {unit}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Rata-rata/Hari
              </span>
              <div className="font-mono text-sm font-bold text-white">
                {convert(data.avg_daily_wh).toFixed(1)} {unit}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Dibuat
              </span>
              <div className="font-mono text-sm text-slate-400">
                {new Date(data.generated_at).toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        )}
      </div>

      {data && <WeeklyAdvisor data={data} />}
    </motion.div>
  );
}
