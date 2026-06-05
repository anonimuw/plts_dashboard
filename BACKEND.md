# BACKEND.md — Dokumentasi Backend PLTS Dashboard

Penjelasan lengkap sisi **backend**: API server, model forecasting, fisika PLTS,
pengambilan data cuaca, caching, dan deployment.

---

## 1. Ringkasan

Backend adalah **REST API berbasis Flask** yang:
1. Mengambil data cuaca (irradiance, suhu, angin) dari **Open-Meteo API**.
2. Menghitung output daya PLTS via **model fisika** (pvlib) dan **model LSTM**.
3. Menggabungkan keduanya (**hybrid blend 50/50**) untuk menghasilkan forecast.
4. Menyajikan hasil sebagai JSON ke frontend lewat 4 endpoint.

**Stack:** Python 3.11 · Flask · TensorFlow-CPU (LSTM) · scikit-learn (scaler) ·
pvlib (fisika surya) · gunicorn (production server).

```
Open-Meteo API ──► data_fetcher.py ──► forecast.py ──► app.py (Flask) ──► JSON ──► Frontend
                     (cuaca+cache)      (LSTM+fisika)     (endpoint)
                                              │
                                       plts_physics.py (rumus PLTS)
                                       prediction_logger.py (SQLite)
```

---

## 2. Struktur File

```
backend/
├── Dockerfile                 # image untuk Hugging Face Space (gunicorn :7860)
├── requirements-prod.txt      # dependency produksi (tensorflow-cpu, dll)
├── README.md                  # frontmatter konfigurasi HF Space
├── lstm_vanilla_v2.weights.npz  # bobot model LSTM (numpy raw)
├── scaler.pkl                 # MinMaxScaler (sklearn)
└── plts_dashboard/
    ├── app.py                 # Flask app + 4 route /api/*
    ├── forecast.py            # load model + inference + blend + cache
    ├── plts_physics.py        # rumus fisika PLTS (pvlib)
    ├── data_fetcher.py        # wrapper Open-Meteo + TTL cache
    └── prediction_logger.py   # log prediksi ke SQLite (untuk backtest)
```

> **Catatan path:** `forecast.py` mencari `scaler.pkl` & `.npz` di **parent dir** dari
> `plts_dashboard/` (`ROOT_DIR`). Itu sebabnya di Docker file model di-copy ke `/app/`
> dan kode dijalankan dari `/app/plts_dashboard/`.

---

## 3. API Endpoint (`app.py`)

Flask app dengan CORS aktif. Model di-load **sekali** saat startup (`forecast.init()`),
bukan per request. Semua route dibungkus `try/except` — kalau gagal, jatuh ke fallback
(tidak pernah crash / 500 ke user).

| Method | Endpoint | Fungsi | Sumber data |
|---|---|---|---|
| GET | `/api/status` | Kondisi PLTS saat ini (daya, GHI, suhu, siang/malam) | cuaca *current* + fisika |
| GET | `/api/forecast/daily` | Prediksi 24 jam ke depan (per jam) | LSTM + fisika |
| GET | `/api/forecast/weekly` | Energi harian minggu ini (Senin–Minggu) | LSTM + fisika |
| GET | `/api/history` | Data 48 jam terakhir (aktual vs prediksi) | archive + LSTM |

### Bentuk Response

**`/api/status`**
```json
{
  "power_w": 287.5,
  "ghi_wm2": 820,
  "temperature_c": 28.3,
  "timestamp": "2026-06-05T13:00:00+07:00",
  "is_daytime": true,
  "status": "Produksi Aktif"
}
```

**`/api/forecast/daily`**
```json
{
  "labels": ["13:00", "14:00", ...],     // 24 jam
  "values": [287.5, 265.1, ...],          // prediksi P_out (W)
  "confidence_upper": [...],              // +30.43% (MAPE)
  "confidence_lower": [...],              // -30.43%
  "total_energy_wh": 1820.4,
  "peak_power_w": 312.0,
  "method": "lstm",                       // atau "physics_fallback"
  "generated_at": "2026-06-05T13:00:00+07:00"
}
```

**`/api/forecast/weekly`** — sama, plus `dates`, `is_actual` (hari yang sudah lewat =
data aktual), `weather_icons`, `avg_daily_wh`.

**`/api/history`** — `labels`, `values` (aktual dari fisika), `predicted_values`
(prediksi LSTM, 24 nilai pertama `null` karena dipakai sebagai seed window), plus
`ghi`, `t_amb`, `t_cell`, `humidity`, `wind_speed`, `i_out`.

---

## 4. Model LSTM (`forecast.py`)

### Arsitektur (dibangun dari kode, bukan di-load utuh)

Untuk menghindari masalah kompatibilitas serialisasi antar versi TensorFlow, **arsitektur
direkonstruksi di kode** (`_build_model_arch`) lalu **bobotnya** di-load dari `.npz`:

```
Input(24, 8)
 → LSTM(64, return_sequences=True)
 → Dropout(0.2)
 → LSTM(32)
 → Dropout(0.2)
 → Dense(1)        // output: P_out ternormalisasi
```

- **Input shape:** `(24, 8)` — 24 jam (timestep) × 8 fitur.
- **8 fitur (urutan WAJIB):**
  `['P_out', 'GHI', 'T_amb', 'I_out', 'T_cell', 'wind_speed', 'solar_zenith', 'solar_azimuth']`
- **Bobot:** `lstm_vanilla_v2.weights.npz` (tensor numpy murni — portabel lintas instalasi TF).
- **Scaler:** `scaler.pkl` (MinMaxScaler sklearn) — di-fit pada 8 fitur saat training.
- **Metrik (dari training):** R² ≈ 0.96, RMSE ≈ 14 W, MAE ≈ 7 W, MAPE ≈ 30%.

### Loading & Fallback

- `init()` dipanggil saat startup → `_load_pkl()` load bobot + scaler.
- Kalau bobot **atau** scaler gagal load → `_model`/`_scaler = None` → seluruh prediksi
  otomatis pakai **physics fallback** (ditandai `"method": "physics_fallback"` di response).
- Inference pakai **direct call** `model(x, training=False)` (lebih cepat dari `.predict()`
  untuk inferensi tunggal/batch di CPU — tanpa overhead batching/callbacks).

---

## 5. Logika Forecasting (Hybrid Blend)

Kunci sistem ini: hasil akhir bukan LSTM murni, melainkan **blend 50/50** antara
prediksi LSTM dan estimasi fisika:

```python
BLEND_ALPHA = 0.5
blended = BLEND_ALPHA * p_lstm + (1 - BLEND_ALPHA) * p_physics
```

LSTM menangkap pola temporal & koreksi data-driven; fisika menjaga hasil tetap masuk
akal secara fisik (kurva harian matahari). Setelah blend, selalu ada **post-processing**:
`P_out = 0` bila `GHI < 10 W/m²` (mencegah "kebocoran" prediksi di malam hari).

### Daily — 24 jam ke depan (`forecast_daily`)

1. Ambil 48 jam data terakhir (`get_recent_hours`) → 24 jam terakhir jadi **seed window**.
2. Ambil prakiraan cuaca (`get_forecast_hours`) untuk 24 jam ke depan.
3. Untuk tiap jam ke depan: bangun 8 fitur (`build_feature_row`) + hitung P_out fisika.
4. Normalisasi semua baris dengan scaler, susun window `(24, 24, 8)`.
5. **Batch predict** LSTM → inverse transform → `p_lstm`.
6. Blend `p_lstm` + `p_physics`, clamp malam, hitung total energi & puncak.
7. Confidence band: `± MAPE (0.3043)`.
8. Cache hasil **1 jam** + log ke SQLite.

### Weekly — minggu ini Senin–Minggu (`forecast_weekly`)

1. Ambil data per jam minggu berjalan (`get_current_week_hours`, pakai `past_days` + `forecast_days`).
2. Jam yang **sudah lewat** → P_out dari fisika data aktual (`is_actual = true`).
3. Jam **ke depan** → blend LSTM + fisika (seperti daily).
4. Agregasi 168 jam → energi per hari (7 nilai).
5. Confidence band hari depan lebih lebar (`± MAPE × 1.5`); hari lampau tanpa band.
6. Tambah ikon cuaca harian (`get_weekly_weather_icons`). Cache **3 jam** + log SQLite.

### History (`get_history`)

Ambil 48 jam terakhir. `values` = P_out aktual (fisika dari cuaca historis).
`predicted_values` = output LSTM di-geser sepanjang window (24 nilai pertama `null`
karena dipakai sebagai seed). Berguna membandingkan prediksi vs "aktual" secara visual.

---

## 6. Fisika PLTS (`plts_physics.py`)

Menghitung output daya dari irradiance & suhu — identik dengan perhitungan saat training
model (penting agar fitur konsisten). Menggunakan **pvlib** dengan datetime
**tz-aware Asia/Jakarta**.

### Alur perhitungan
1. **Posisi matahari** (`solar_position`): zenith & azimuth via pvlib (`get_solarposition`).
2. **G_tilt** (`compute_g_tilt`): transposisi GHI ke bidang panel miring (tilt 12°) pakai
   model **isotropic** (`irradiance.get_total_irradiance`), dengan estimasi DNI=0.8·GHI, DHI=0.2·GHI.
3. **P_out** (`calculate_plts_output`):
   ```
   T_cell      = T_amb + ((NOCT - 20) / 800) × G_tilt
   P_irr       = total_Wp × (G_tilt / G_STC)
   P_corrected = P_irr × (1 + γ × (T_cell - T_STC))     # γ = -0.0045 /°C
   P_out       = max(0, P_corrected × PR)               # PR = 0.77
   I_out       = P_out / system_voltage                 # 24 V
   ```
   Mengembalikan `P_out`, `T_cell`, `I_out`, `G_tilt`, dst. `P_out = 0` saat GHI≤0.01,
   matahari di bawah horizon, atau G_tilt≤0.
4. **build_feature_row**: merakit 8 fitur dalam urutan `FEATURE_COLS` untuk input LSTM.

### Konfigurasi (`PLTS_CONFIG`)
Panel 2×200 Wp (total **400 Wp**), efisiensi 19%, PR 0.77, tegangan sistem 24 V,
NOCT 45°C, tilt 12°, lokasi **Pujon, Malang** (lat −7.822269, lon 112.441299),
threshold malam `GHI < 10 W/m²`, ambang alert 200/500 Wh.

---

## 7. Pengambilan Data Cuaca (`data_fetcher.py`)

Wrapper **Open-Meteo** dengan **TTL cache in-memory** (dict global; cek `time - ts > ttl`).
Pada error/timeout, mengembalikan **cache lama** bila ada (graceful degradation).

| Fungsi | Endpoint Open-Meteo | TTL | Kegunaan |
|---|---|---|---|
| `fetch_current_weather` | forecast `current=` | 15 mnt | status real-time |
| `get_recent_hours(n)` | forecast `past_days` | 15 mnt | seed window LSTM |
| `get_forecast_hours(days)` | forecast | 60 mnt | prakiraan ke depan |
| `get_current_week_hours` | forecast past+future | 15 mnt | data minggu berjalan |
| `get_weekly/daily_weather_icons` | forecast `daily=` | 60 mnt | ikon cuaca (WMO code → ikon) |

- **Parameter hourly:** `shortwave_radiation, temperature_2m, relative_humidity_2m, wind_speed_10m`.
- **Timezone:** `Asia/Jakarta`. Lokasi fixed dari `PLTS_CONFIG`.
- **WMO_TO_ICON:** memetakan kode cuaca Open-Meteo → `sunny/partly_cloudy/cloudy/rainy`.
  Ikon "rainy" diturunkan ke "cloudy" bila presipitasi < 5 mm.

---

## 8. Caching (2 lapis)

1. **Data cuaca** (`data_fetcher`): TTL 15–60 menit per kombinasi parameter — menjaga
   panggilan ke Open-Meteo jauh di bawah rate-limit free tier.
2. **Hasil forecast** (`forecast.py`): `_forecast_cache` — daily **1 jam**, weekly **3 jam**.

> ⚠️ Cache ini **in-memory**, hilang setiap proses restart / Space bangun-tidur.

---

## 9. Prediction Logger (`prediction_logger.py`)

SQLite (`predictions.db`) untuk menyimpan prediksi (backtest aktual vs prediksi).
Tabel `predictions(id, type, timestamp, hour, predicted_value, actual_value, method, created_at)`.
`log_batch()` dipanggil setiap forecast; `update_actual()` mengisi nilai aktual belakangan.

> ⚠️ Di Hugging Face free tier, **storage ephemeral** — DB ini terhapus tiap restart.
> Untuk backtest persisten butuh storage eksternal/persisten.

---

## 10. Menjalankan & Deploy

### Lokal (port 5000)
```bash
cd backend
pip install -r requirements-prod.txt
python plts_dashboard/app.py      # http://localhost:5000
```
Test: `curl http://localhost:5000/api/status`

### Production — Hugging Face Spaces (Docker, port 7860)
`Dockerfile`:
- Base `python:3.11-slim`, install `requirements-prod.txt`.
- Copy `lstm_vanilla_v2.weights.npz` + `scaler.pkl` ke `/app/`, source ke `/app/plts_dashboard/`.
- Jalankan **gunicorn** `--workers 1 --threads 1 --timeout 120` (1 worker karena model TF
  di-load sekali ke memori; timeout 120s karena weekly 168-step bisa lama).

### Dependency kunci (`requirements-prod.txt`)
`tensorflow-cpu==2.15.0` · `scikit-learn==1.3.0` · `numpy==1.24.3` · `pandas==2.0.3` ·
`pvlib==0.10.5` · `flask==2.3.3` · `flask-cors==4.0.0` · `gunicorn==21.2.0`.

---

## 11. Prinsip Desain Penting

- **Graceful degradation berlapis:** model gagal → fisika; cuaca gagal → cache lama →
  default aman. Endpoint tidak pernah crash.
- **Konsistensi fitur train↔serve:** fisika di `plts_physics.py` identik dengan saat
  training, supaya 8 fitur input LSTM tidak "drift".
- **Timezone-aware:** semua perhitungan posisi matahari pakai `Asia/Jakarta` (kalau salah
  zona, kurva matahari & prediksi ikut geser).
- **Clamp malam:** `P_out = 0` saat `GHI < 10` — wajib, di semua jalur (LSTM & fisika).

Untuk troubleshooting produksi (Space tidur, rate-limit, dll) lihat [`MAINTENANCE.md`](./MAINTENANCE.md).
