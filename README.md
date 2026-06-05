# PLTS Dashboard ☀️

Web dashboard interaktif untuk **monitoring & forecasting output daya sistem PLTS off-grid 400Wp**.
Prediksi output daya menggunakan model **LSTM** yang dilatih dengan data cuaca historis, dengan
**physics-based fallback** bila model gagal load.

> Skripsi / Tugas Akhir — Pembangkit Listrik Tenaga Surya (PLTS) off-grid 400Wp.

---

## Arsitektur

```
Browser
  │
  ▼  FRONTEND  — Next.js (Vercel)   ── rewrite /api/* ──┐
  │                                                      │
  ▼  BACKEND   — Flask + LSTM (Hugging Face Space, Docker)
  │
  ▼  Open-Meteo API  — data cuaca historis + prakiraan
```

| Layer | Stack | Deploy |
|---|---|---|
| `frontend/` | Next.js 15, React 19, TypeScript, Tailwind v4, Recharts, Leaflet, SWR, Framer Motion | Vercel |
| `backend/` | Flask, TensorFlow-CPU (LSTM), scikit-learn, pvlib, gunicorn | Hugging Face Spaces (Docker) |
| Data | [Open-Meteo API](https://open-meteo.com) | — |

---

## Struktur Direktori

```
plts-dashboard/
├── frontend/                 # Aplikasi Next.js (UI dashboard)
│   ├── src/
│   │   ├── app/              # layout, page (sidebar routing berbasis state)
│   │   ├── components/       # StatusCards, charts, peta, dll
│   │   ├── hooks/useApi.ts   # SWR data fetching
│   │   ├── lib/api.ts        # konstanta + fetcher
│   │   └── types/            # TypeScript interfaces
│   ├── next.config.ts        # proxy /api/* → backend (dev)
│   └── vercel.json           # rewrite /api/* → Hugging Face Space (prod)
│
├── backend/                  # API Flask + model LSTM (self-contained, deployable)
│   ├── plts_dashboard/
│   │   ├── app.py            # Flask app + route /api/*
│   │   ├── forecast.py       # inference LSTM + physics fallback
│   │   ├── data_fetcher.py   # wrapper Open-Meteo + TTL cache
│   │   ├── plts_physics.py   # kalkulasi fisika PLTS (pvlib)
│   │   └── prediction_logger.py
│   ├── lstm_vanilla_v2.weights.npz   # bobot LSTM (numpy)
│   ├── scaler.pkl            # MinMaxScaler
│   ├── Dockerfile            # image untuk Hugging Face Space (port 7860)
│   └── requirements-prod.txt
│
├── MAINTENANCE.md            # checklist troubleshooting (lokal & production)
└── healthcheck.ps1           # cek kesehatan endpoint (lokal/production)
```

---

## Menjalankan Secara Lokal

Butuh **2 terminal** (backend port 5000, frontend port 3000).

### 1. Backend (Flask)

```bash
cd backend
pip install -r requirements-prod.txt
# forecast.py mencari scaler.pkl & .npz di parent dir dari plts_dashboard/,
# jadi jalankan dari folder backend/:
python plts_dashboard/app.py        # http://localhost:5000
```

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev                          # http://localhost:3000
```

`next.config.ts` mem-proxy `/api/*` ke `http://localhost:5000` saat development.

---

## Deployment

- **Frontend → Vercel.** `vercel.json` me-rewrite `/api/*` ke URL backend Hugging Face.
  Kalau URL backend berubah, update `vercel.json` lalu redeploy.
- **Backend → Hugging Face Spaces (Docker).** `Dockerfile` menjalankan gunicorn di port `7860`
  (default HF). `backend/README.md` berisi frontmatter konfigurasi HF Space.

Detail troubleshooting produksi (HF Space tidur, rate-limit Open-Meteo, dll) ada di
[`MAINTENANCE.md`](./MAINTENANCE.md).

---

## Model

- **Tipe:** LSTM Vanilla 2 layer (64→32), input `(24, 8)` — 24 jam × 8 fitur.
- **Fitur:** `P_out, GHI, T_amb, I_out, T_cell, wind_speed, solar_zenith, solar_azimuth`.
- **Output:** prediksi `P_out` (daya) per jam, auto-regressif untuk forecast harian (24 jam) & mingguan (168 jam).
- **Fallback:** bila model gagal load → kalkulasi fisika murni (ditandai `"method": "physics_fallback"`).
- **Post-processing:** `P_out` di-clamp ke 0 saat `GHI < 10 W/m²` (mencegah prediksi malam hari).

---

## Lisensi

MIT
