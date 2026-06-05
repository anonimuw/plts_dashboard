'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Zap } from 'lucide-react';
import { PLTS_CONFIG } from '@/lib/api';

interface Props {
  totalEnergyWh: number | undefined;
}

export default function AlertBanner({ totalEnergyWh }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || totalEnergyWh === undefined) return null;

  const isLow = totalEnergyWh < PLTS_CONFIG.alertLowWh;
  const isHigh = totalEnergyWh > PLTS_CONFIG.alertHighWh;

  if (!isLow && !isHigh) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full"
      >
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            isLow
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-green-500/30 bg-green-500/10 text-green-300'
          }`}
        >
          {isLow ? <AlertTriangle size={18} /> : <Zap size={18} />}
          <span className="flex-1">
            {isLow
              ? `Total energi hari ini diprediksi rendah (${Math.round(totalEnergyWh)} Wh) — pertimbangkan hemat energi sepanjang hari.`
              : `Total energi hari ini diprediksi tinggi (${Math.round(totalEnergyWh)} Wh) — waktu yang baik untuk charging baterai penuh.`}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 transition-colors hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
