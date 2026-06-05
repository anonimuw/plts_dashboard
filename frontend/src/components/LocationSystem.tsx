'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { MapPin, Cpu, BarChart3 } from 'lucide-react';
import { PLTS_CONFIG, MODEL_METRICS } from '@/lib/api';

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
    </div>
  ),
});

export default function LocationSystem() {
  return (
    <div className="space-y-4">
      {/* Map */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <MapPin size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Lokasi PLTS — Pujon, Malang
          </h2>
          <span className="ml-auto font-mono text-xs text-slate-500">
            {PLTS_CONFIG.latitude}, {PLTS_CONFIG.longitude}
          </span>
        </div>
        <div className="h-[300px] sm:h-[380px]">
          <MapInner />
        </div>
      </motion.div>

      {/* Specs + Model side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* PLTS Specs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
            <Cpu size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Spesifikasi PLTS
            </h3>
          </div>
          <div className="p-5">
            <table className="w-full">
              <tbody className="text-sm">
                {([
                  ['Panel', `${PLTS_CONFIG.panelCount} × ${PLTS_CONFIG.panelPowerWp} Wp`],
                  ['Total Kapasitas', `${PLTS_CONFIG.totalPowerWp} Wp`],
                  ['Efisiensi Panel', `${(PLTS_CONFIG.panelEfficiency * 100).toFixed(0)}%`],
                  ['Performance Ratio', `${PLTS_CONFIG.performanceRatio}`],
                  ['Tegangan Sistem', `${PLTS_CONFIG.systemVoltage} V`],
                  ['SCC Efficiency', `${(PLTS_CONFIG.sccEfficiency * 100).toFixed(0)}%`],
                  ['NOCT', `${PLTS_CONFIG.noct} °C`],
                  ['Tilt Angle', `${PLTS_CONFIG.tiltAngle}°`],
                  ['Lokasi', 'Pujon, Kab. Malang — Jawa Timur'],
                ] as const).map(([label, value]) => (
                  <tr key={label} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 text-slate-400">{label}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-slate-200">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Model Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
            <BarChart3 size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Performa Model LSTM
            </h3>
          </div>
          <div className="p-5">
            <table className="w-full">
              <tbody className="text-sm">
                {([
                  ['Model', MODEL_METRICS.name],
                  ['Arsitektur', MODEL_METRICS.architecture],
                  ['Input Shape', MODEL_METRICS.inputShape],
                  ['Fitur', MODEL_METRICS.features],
                ] as const).map(([label, value]) => (
                  <tr key={label} className="border-b border-white/5">
                    <td className="py-2.5 text-slate-400">{label}</td>
                    <td className="py-2.5 text-right font-mono text-sm font-semibold text-slate-200">
                      {value}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-white/5">
                  <td className="py-2.5 text-slate-400">R&sup2;</td>
                  <td className="py-2.5 text-right font-mono text-lg font-bold text-emerald-400">
                    {MODEL_METRICS.r2}
                  </td>
                </tr>
                {([
                  ['RMSE', `${MODEL_METRICS.rmse}`],
                  ['MAE', `${MODEL_METRICS.mae}`],
                  ['MAPE', `${MODEL_METRICS.mape}%`],
                ] as const).map(([label, value]) => (
                  <tr key={label} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 text-slate-400">{label}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-slate-200">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
