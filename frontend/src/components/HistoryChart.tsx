'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Clock } from 'lucide-react';
import type { HistoryData } from '@/types';

interface Props {
  data: HistoryData | undefined;
  isLoading: boolean;
}

type SeriesKey = 'actual' | 'predicted' | 'ghi' | 't_amb' | 't_cell' | 'humidity' | 'wind_speed' | 'i_out';

interface SeriesConfig {
  key: SeriesKey;
  label: string;
  color: string;
  unit: string;
  axis: 'left' | 'right';
  dashed?: boolean;
}

const SERIES: SeriesConfig[] = [
  { key: 'actual',     label: 'P_out Aktual',   color: '#3b82f6', unit: 'W',    axis: 'left' },
  { key: 'predicted',  label: 'P_out Prediksi',  color: '#f59e0b', unit: 'W',    axis: 'left', dashed: true },
  { key: 'ghi',        label: 'GHI',             color: '#f97316', unit: 'W/m²', axis: 'right' },
  { key: 't_amb',      label: 'Suhu Udara',      color: '#ef4444', unit: '°C',   axis: 'right' },
  { key: 't_cell',     label: 'Suhu Panel',      color: '#ec4899', unit: '°C',   axis: 'right' },
  { key: 'humidity',   label: 'Kelembaban',      color: '#a855f7', unit: '%',    axis: 'right' },
  { key: 'wind_speed', label: 'Kec. Angin',      color: '#22c55e', unit: 'm/s',  axis: 'right' },
  { key: 'i_out',      label: 'Arus Output',     color: '#06b6d4', unit: 'A',    axis: 'right' },
];

const UNIT_MAP: Record<SeriesKey, string> = {
  actual: 'W', predicted: 'W', ghi: 'W/m²',
  t_amb: '°C', t_cell: '°C', humidity: '%',
  wind_speed: 'm/s', i_out: 'A',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-blue-500/30 bg-slate-800 p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-slate-200">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-medium text-slate-200">
            {entry.value != null
              ? `${entry.value} ${UNIT_MAP[entry.dataKey as SeriesKey] ?? ''}`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function HistoryChart({ data, isLoading }: Props) {
  const [enabled, setEnabled] = useState<Set<SeriesKey>>(new Set<SeriesKey>(['actual', 'predicted']));

  const hasPredicted = data?.predicted_values?.some(v => v !== null) ?? false;
  const hasRightAxis = SERIES.some(s => s.axis === 'right' && enabled.has(s.key));

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.labels.map((label, i) => ({
      time: label,
      actual:     data.values[i],
      predicted:  data.predicted_values?.[i] ?? undefined,
      ghi:        data.ghi?.[i],
      t_amb:      data.t_amb?.[i],
      t_cell:     data.t_cell?.[i],
      humidity:   data.humidity?.[i],
      wind_speed: data.wind_speed?.[i],
      i_out:      data.i_out?.[i],
    }));
  }, [data]);

  function toggle(key: SeriesKey) {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <Clock size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Historis (48 Jam Terakhir)
          </h2>
        </div>

        {/* Toggle chips */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-3">
          {SERIES.map(s => {
            const isDisabled = s.key === 'predicted' && !hasPredicted;
            const isOn = enabled.has(s.key) && !isDisabled;
            return (
              <button
                key={s.key}
                onClick={() => !isDisabled && toggle(s.key)}
                disabled={isDisabled}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ${
                  isDisabled
                    ? 'cursor-not-allowed border-white/5 text-slate-600'
                    : isOn
                    ? 'border-white/25 bg-white/10 text-slate-200 shadow-sm'
                    : 'border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-400'
                }`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: isDisabled ? '#374151' : isOn ? s.color : '#4b5563' }}
                />
                {s.label}
                <span className={`text-[10px] ${isOn ? 'text-slate-400' : 'text-slate-600'}`}>
                  ({s.unit})
                </span>
              </button>
            );
          })}
        </div>

        {hasRightAxis && (
          <p className="px-4 pt-2 text-[10px] text-slate-600">
            * Sumbu kanan menampilkan data sekunder — satuan berbeda, lihat tooltip untuk nilai pasti.
          </p>
        )}

        <div className="p-4">
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ left: 0, right: hasRightAxis ? 8 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Daya (W)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#94a3b8',
                    fontSize: 11,
                    dy: 36,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={hasRightAxis ? 60 : 0}
                  tick={hasRightAxis ? { fill: '#94a3b8', fontSize: 11 } : false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Daya — sumbu kiri */}
                {enabled.has('actual') && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="actual"
                    name="P_out Aktual"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#3b82f6' }}
                  />
                )}
                {enabled.has('predicted') && hasPredicted && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="predicted"
                    name="P_out Prediksi"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                  />
                )}

                {/* Data sekunder — sumbu kanan */}
                {enabled.has('ghi') && (
                  <Line yAxisId="right" type="monotone" dataKey="ghi"
                    name="GHI" stroke="#f97316" strokeWidth={1.5} dot={false} />
                )}
                {enabled.has('t_amb') && (
                  <Line yAxisId="right" type="monotone" dataKey="t_amb"
                    name="Suhu Udara" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                )}
                {enabled.has('t_cell') && (
                  <Line yAxisId="right" type="monotone" dataKey="t_cell"
                    name="Suhu Panel" stroke="#ec4899" strokeWidth={1.5} dot={false} />
                )}
                {enabled.has('humidity') && (
                  <Line yAxisId="right" type="monotone" dataKey="humidity"
                    name="Kelembaban" stroke="#a855f7" strokeWidth={1.5} dot={false} />
                )}
                {enabled.has('wind_speed') && (
                  <Line yAxisId="right" type="monotone" dataKey="wind_speed"
                    name="Kec. Angin" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                )}
                {enabled.has('i_out') && (
                  <Line yAxisId="right" type="monotone" dataKey="i_out"
                    name="Arus Output" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
}
