# MAINTENANCE.md — Checklist Troubleshooting PLTS Dashboard

Panduan saat dashboard bermasalah. **Urutkan dari Prioritas 1 ke bawah** — cek akar
(data eksternal + backend) dulu sebelum menyentuh frontend.

> **Aturan emas:** selalu `curl` backend langsung (port 5000) SEBELUM debug frontend.
> Itu langsung memisahkan "masalah backend" vs "masalah frontend".
> Cara cepat: jalankan `./healthcheck.ps1`.

---

## ⚡ Alur Diagnosa Cepat (TL;DR)

```
Dashboard kosong / error?
   │
   ├─ curl http://localhost:5000/api/status   → GAGAL?  → Prioritas 1 (Flask / Open-Meteo / model)
   │                                            → SUKSES? → lanjut ↓
   │
   ├─ DevTools → Network: status /api/* ?       → 500/CORS/404? → Prioritas 2 (proxy)
   │                                            → 200 tapi blank? → lanjut ↓
   │
   └─ DevTools → Console: ada error JS?         → Prioritas 3 (types / SWR / komponen)
```

---

## 🔴 Prioritas 1 — Cek Dulu (tersering, dampak total)

### 1. Open-Meteo API (dependency eksternal — paling rapuh)
- [ ] API hidup? Test `archive-api.open-meteo.com` & `api.open-meteo.com`.
- [ ] **Rate limit free tier** — pastikan TTL cache di `data_fetcher.py` jalan (max ~4 req/jam/endpoint).
- [ ] Schema berubah? Cek field `hourly.shortwave_radiation`, `temperature_2m`, `windspeed_10m`.
- ⚠️ Penyebab #1 dashboard "kosong tapi tanpa error".

### 2. Backend Flask hidup (port 5000)
- [ ] Proses `app.py` / gunicorn jalan?
- [ ] Test bypass frontend:
  ```
  curl http://localhost:5000/api/status
  curl http://localhost:5000/api/forecast/daily
  ```
- [ ] Gagal di sini → masalah backend, **STOP debug frontend**.

### 3. Model LSTM ter-load?
- [ ] Cek log startup Flask: model load sukses atau jatuh ke **physics fallback**?
- [ ] Response forecast ada `"method": "physics_fallback"`? → model `.h5`/`.pkl` gagal load.
- [ ] File `results_hourly_multivariate_v2.pkl` (model + scaler) ada & tidak corrupt?

---

## 🟠 Prioritas 2 — Jembatan Frontend ↔ Backend

### 4. Proxy `/api/*` (`next.config.ts`)
- [ ] Frontend manggil path relatif `/api/...` → rewrite ke `localhost:5000`.
- [ ] Backend pindah host/port? Set env `NEXT_PUBLIC_API_URL`.
- [ ] **Production (Vercel):** `localhost:5000` TIDAK jalan — `NEXT_PUBLIC_API_URL` wajib menunjuk backend ter-deploy.
- [ ] DevTools → Network, status `/api/*`:
  - `404` → proxy/route salah
  - `500` → error backend (balik Prioritas 1)
  - `CORS` → proxy mati / URL backend salah
  - `pending`/timeout → backend lambat / mati

---

## 🟡 Prioritas 3 — Frontend (setelah backend terbukti sehat)

### 5. Data fetching (SWR — `useApi.ts`)
- [ ] Endpoint OK di curl tapi dashboard kosong → masalah mapping data.
- [ ] DevTools → Console ada error JS?
- [ ] `types/index.ts` masih cocok dgn JSON backend? (paling sering: backend ganti nama field).

### 6. Build & dependency
- [ ] `npm run build` sukses? (error TS menggagalkan build)
- [ ] `npm install` sinkron dgn `package-lock.json`?
- [ ] Error setelah update React 19 / Next 15?

### 7. Komponen spesifik (kalau HANYA 1 halaman rusak)
- [ ] Peta blank → `MapInner.tsx` (Leaflet butuh `ssr: false` + CSS Leaflet di `layout.tsx`)
- [ ] Chart blank → `DailyForecastChart` / `WeeklyForecastChart` (data array null/kosong?)
- [ ] Alert/status salah → threshold di `lib/api.ts` (`alertLowWh: 200`, `alertHighWh: 500`)

---

## 🟢 Prioritas 4 — Cek Terakhir (jarang, mudah terlupa)

### 8. SQLite logger (`predictions.db`)
- [ ] `prediction_logger.py` error tulis DB (file locked / permission)? Bisa bikin endpoint forecast gagal walau model OK.

### 9. Cache "basi"
- [ ] Forecast di-cache 1–3 jam. Data tak update → tunggu TTL atau manual refresh.

### 10. Timezone
- [ ] Prediksi malam non-zero / jam geser → cek clamp `GHI < 10 W/m²` & `Asia/Jakarta` di backend.

---

## Endpoint Reference

| Endpoint | Refresh (frontend) | Cache (backend) |
|---|---|---|
| `/api/status` | 15 menit | ~15 menit |
| `/api/forecast/daily` | 60 menit | ~1 jam |
| `/api/forecast/weekly` | 60 menit | ~3 jam |
| `/api/history` | 60 menit | — |

---

# 🌐 BAGIAN PRODUCTION (Deployed)

Berbeda dari lokal — ada **3 layer eksternal** yang bisa down sendiri-sendiri:

```
Browser
   │
   ▼  (1) VERCEL  — project "frontend", vercel.json rewrite /api/* ──┐
   │                                                                  │
   ▼  (2) HUGGING FACE SPACE — komekko-plts-dashboard-api.hf.space ◄──┘
   │       (Flask + model LSTM, Docker, free cpu-basic)
   │
   ▼  (3) OPEN-METEO API — archive + forecast
```

## 🔗 Link Penting (bookmark semua ini)

| Apa | URL | Kapan dipakai |
|---|---|---|
| Backend langsung (HF) | `https://komekko-plts-dashboard-api.hf.space/api/status` | Test backend tanpa lewat Vercel |
| Halaman HF Space (log/build) | `https://huggingface.co/spaces/komekko/plts-dashboard-api` | Lihat status Build/Running/Sleeping + log error |
| Status Open-Meteo (resmi) | `https://status.open-meteo.com` | Cek apakah Open-Meteo down beneran |
| Open-Meteo production status | `https://open-meteo.com/en/docs/model-updates` | Cek update/incident model cuaca |
| Test Open-Meteo langsung | `https://api.open-meteo.com/v1/forecast?latitude=-7.822269&longitude=112.441299&hourly=shortwave_radiation&forecast_days=1` | Test mentah API, bypass semua |
| Dashboard Vercel | (URL project "frontend" kamu di vercel.com) | Cek deploy & log frontend |

## 🎯 Urutan Prioritas Cek (PRODUCTION)

### P1 — Hugging Face Space "tidur" / cold start  ← PALING SERING
- HF free tier **tidur setelah 48 jam tanpa kunjungan**. Request pertama setelah tidur = lambat (cold start ~beberapa detik s/d ~1 menit) atau muncul halaman "Space is sleeping / Building".
- **Gejala:** dashboard loading lama / blank di kunjungan pertama setelah lama tak dibuka, lalu normal setelah refresh.
- **Cek:** buka halaman HF Space → lihat status (Running / Sleeping / Building / Error).
- **Solusi cepat:** buka backend langsung sekali untuk "membangunkan", tunggu sampai Running, lalu refresh dashboard.
- **Solusi permanen:** uptime pinger (cron) yang hit `/api/status` tiap <48 jam, atau upgrade HF (berbayar) agar tidak tidur.

### P2 — HF Space crash / build gagal (setelah push)
- Habis update kode lalu push ke HF → Docker build bisa gagal, Space stuck "Build error" / "Runtime error".
- **Cek:** halaman HF Space → tab **Logs** (build log & container log). Cari traceback Python / error TensorFlow / dependency.
- Ingat: model harus load saat startup; kalau gagal → jatuh ke physics_fallback (cek field `"method"`).

### P3 — Open-Meteo rate limit (429) atau down
- Free tier ~10.000 panggilan/hari, tanpa jaminan uptime. TTL cache (`data_fetcher.py`) menjaga jauh di bawah limit — TAPI cache di-memori, jadi **hilang tiap Space restart/bangun tidur** → request fresh lagi.
- **Cek down beneran:** buka `status.open-meteo.com`, atau hit URL "Test Open-Meteo langsung" di atas.
  - Dapat JSON → Open-Meteo sehat, masalah di tempat lain.
  - `429` → kena rate limit. `5xx`/timeout → Open-Meteo lagi bermasalah.
- **Catatan penting:** kalau Open-Meteo down, **forecast TIDAK bisa jalan sama sekali** (LSTM maupun physics_fallback sama-sama butuh data cuaca sebagai input). `data_fetcher` akan balikin cache lama bila ada; kalau Space baru restart (cache kosong) → endpoint balikin kosong/None.
- **Realistis:** Open-Meteo jarang down total (server redundan di Eropa & Amerika). Yang lebih mungkin = 429 saat cache kosong + banyak request beruntun.

### P4 — Vercel rewrite menunjuk URL HF yang salah
- `frontend/vercel.json` **hard-code** `https://komekko-plts-dashboard-api.hf.space`. Kalau nama/URL HF Space berubah → semua `/api/*` 404.
- **Cek:** buka backend langsung (jalan) vs lewat dashboard (404)? Berarti rewrite-nya yang salah → perbaiki `vercel.json` lalu **redeploy Vercel**.

### P5 — Vercel down / deploy gagal
- Paling jarang (Vercel sangat andal). Cek dashboard Vercel → tab Deployments, lihat status build terakhir.

## ⚠️ Gotcha Khusus Production (mudah terlupa)

1. **Storage HF itu ephemeral.** `predictions.db` (SQLite) dan cache in-memory **terhapus tiap Space restart/tidur**. Jadi prediction logger untuk backtest praktis tidak persisten di free tier — jangan kaget kalau histori log hilang. Kalau butuh persisten: pakai HF persistent storage (berbayar) atau DB eksternal.
2. **Cold start = request pertama selalu lambat.** Naikkan toleransi timeout saat health check production (script sudah pakai timeout lebih panjang).
3. **Perubahan `vercel.json` butuh redeploy** — tidak otomatis aktif sampai deploy ulang.
4. **Dua deploy terpisah.** Update kode backend → push ke **HF**. Update frontend → push/deploy ke **Vercel**. Jangan tertukar.

## ⚡ Diagnosa Cepat (PRODUCTION)

```
Dashboard production bermasalah?
   │
   ├─ Buka halaman HF Space → Sleeping/Building/Error?  → P1/P2 (bangunkan / cek log)
   │
   ├─ curl https://komekko-plts-dashboard-api.hf.space/api/status
   │     → GAGAL?  → backend (HF) masalah → cek log HF
   │     → SUKSES tapi dashboard tetap blank? → P4 (cek vercel.json rewrite)
   │
   └─ Backend balas 500 / forecast kosong?
         → test Open-Meteo langsung → P3 (rate limit / down)
```

Jalankan health check ke production:
```powershell
./healthcheck.ps1 -ApiUrl https://komekko-plts-dashboard-api.hf.space -Frontend https://<URL-vercel-kamu>
```
https://status.open-meteo.com