# FRONTEND.md — Dokumentasi Frontend PLTS Dashboard

Penjelasan lengkap sisi **frontend**: arsitektur, routing, data fetching, komponen,
charting, peta, theming, dan deployment.

---

## 1. Ringkasan

Frontend adalah aplikasi **Next.js (App Router)** — sebuah *single-page dashboard*
untuk memvisualisasikan data & forecast PLTS yang disajikan backend. Navigasi antar
"halaman" dilakukan lewat **React state** (bukan routing URL), dan data diambil via
**SWR** dengan auto-refresh berkala.

**Stack:**
| Library | Kegunaan |
|---|---|
| **Next.js 15** (App Router) + **React 19** | Framework & UI |
| **TypeScript** | Type safety (lihat `types/index.ts`) |
| **Tailwind CSS v4** | Styling utility-first |
| **Recharts** | Grafik (area/bar chart) |
| **Leaflet** + **react-leaflet** | Peta lokasi PLTS |
| **SWR** | Data fetching + cache + revalidasi |
| **Framer Motion** | Animasi & transisi |
| **lucide-react** | Ikon |

---

## 2. Struktur File

```
frontend/
├── next.config.ts            # proxy /api/* → backend (dev)
├── vercel.json               # rewrite /api/* → Hugging Face Space (prod)
├── package.json
└── src/
    ├── app/
    │   ├── layout.tsx        # root layout + CSS Leaflet (CDN) + metadata
    │   ├── page.tsx          # SATU halaman: sidebar routing berbasis state
    │   └── globals.css       # Tailwind + style global
    ├── components/
    │   ├── Sidebar.tsx           # navigasi (desktop kiri / mobile bottom)
    │   ├── ThemeProvider.tsx     # context dark/light + localStorage
    │   ├── AlertBanner.tsx       # banner energi rendah/tinggi
    │   ├── StatusCards.tsx       # kartu status (daya, GHI, suhu, status)
    │   ├── PowerAdvisor.tsx      # rekomendasi penggunaan energi
    │   ├── LocationSystem.tsx    # peta + spesifikasi + performa model
    │   ├── MapInner.tsx          # Leaflet map (di-load dinamis, ssr:false)
    │   ├── DailyForecastChart.tsx   # area chart 24 jam
    │   ├── WeeklyForecastChart.tsx  # bar chart 7 hari
    │   ├── HistoryChart.tsx      # aktual vs prediksi 48 jam
    │   └── About.tsx             # penjelasan fitur & cara kerja
    ├── hooks/
    │   └── useApi.ts         # SWR hooks (4 endpoint)
    ├── lib/
    │   └── api.ts            # konstanta (PLTS_CONFIG, MODEL_METRICS) + fetcher
    └── types/
        └── index.ts         # interface TypeScript untuk response API
```

---

## 3. Arsitektur & Alur Data

```
Browser
  │
  ▼  page.tsx ── useState<Page> activePage  (navigasi tanpa URL)
  │      │
  │      ├─ useStatus()         ─┐
  │      ├─ useDailyForecast()   │  SWR hooks (useApi.ts)
  │      ├─ useWeeklyForecast()  │  fetch /api/* (path relatif)
  │      └─ useHistory()        ─┘
  │              │
  │              ▼  rewrite /api/*  →  backend (Flask di HF Space)
  │
  ▼  komponen di-render kondisional sesuai activePage
```

**Prinsip:** semua data diambil di `page.tsx` lewat SWR, lalu diteruskan sebagai
**props** (`status`, `daily`, `weekly`, `history` + `isLoading`) ke komponen. Komponen
bersifat *presentational* — tidak fetch sendiri.

---

## 4. Routing Berbasis State (`page.tsx`)

Tidak memakai Next.js router/multi-page. Sebuah state tunggal menentukan halaman aktif:

```tsx
const [activePage, setActivePage] = useState<Page>('dashboard');
```

`Page` = `'dashboard' | 'location' | 'daily' | 'weekly' | 'history' | 'about'`.

- **Sidebar** memanggil `setActivePage(key)` saat menu diklik.
- Konten dirender kondisional (`activePage === '...' && <Komponen/>`).
- Transisi antar halaman dianimasikan **Framer Motion** (`AnimatePresence` + `motion.div`
  dengan key = `activePage`, fade + slide).

| Halaman | Komponen yang ditampilkan |
|---|---|
| `dashboard` | `AlertBanner` + `StatusCards` + `PowerAdvisor` |
| `location` | `LocationSystem` (peta + spesifikasi + model) |
| `daily` | `DailyForecastChart` |
| `weekly` | `WeeklyForecastChart` |
| `history` | `HistoryChart` |
| `about` | `About` |

---

## 5. Data Fetching dengan SWR (`hooks/useApi.ts`)

Empat hook membungkus endpoint backend; SWR menangani caching, dedup, dan
auto-refresh berkala (`revalidateOnFocus: false` agar tidak spam API):

```ts
useStatus()          // /api/status          → refresh 15 menit
useDailyForecast()   // /api/forecast/daily   → refresh 60 menit
useWeeklyForecast()  // /api/forecast/weekly  → refresh 60 menit
useHistory()         // /api/history          → refresh 60 menit
```

Fetcher dasar (`lib/api.ts`):
```ts
export async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```
Memanggil **path relatif** (`/api/...`) — bukan URL absolut — supaya proxy/rewrite yang
mengatur tujuan (lihat §10). Tipe response didefinisikan di `types/index.ts`
(`StatusData`, `DailyForecast`, `WeeklyForecast`, `HistoryData`).

---

## 6. Konstanta Terpusat (`lib/api.ts`)

- **`PLTS_CONFIG`** — lat/long, kapasitas 400 Wp, efisiensi, PR, tegangan, tilt, ambang
  alert (`alertLowWh: 200`, `alertHighWh: 500`). Dipakai peta, spesifikasi, dan AlertBanner.
- **`MODEL_METRICS`** — nama/arsitektur model + R², RMSE, MAE, MAPE (untuk halaman Lokasi).
- **`WEATHER_ICONS`** — peta string ikon cuaca → emoji.
- **`REFRESH_INTERVALS`** — interval refresh SWR.

> Catatan: nilai metrik & ambang ini **hard-coded di frontend** untuk ditampilkan; nilai
> "sebenarnya" yang dipakai prediksi ada di backend (`plts_physics.PLTS_CONFIG`). Jaga agar
> konsisten saat salah satunya diubah.

---

## 7. Komponen Utama

### Sidebar (`Sidebar.tsx`)
Daftar menu didefinisikan sekali (`MENU_ITEMS`) lalu dirender 2 bentuk responsif:
- **Desktop (≥768px):** sidebar tetap di kiri (`fixed w-64 md:flex`) + tombol toggle tema.
- **Mobile (<768px):** bottom navigation (`md:hidden`).
Menu aktif disorot amber + titik indikator. Tema diambil dari `useTheme()`.

### ThemeProvider (`ThemeProvider.tsx`)
React Context untuk **dark/light mode**. Menyimpan pilihan ke `localStorage` (`plts-theme`)
dan menambahkan class `dark`/`light` ke `<html>`. Default `dark`.

### StatusCards (`StatusCards.tsx`)
4 kartu metrik real-time: **Daya Output (W)**, **Irradiance GHI (W/m²)**, **Suhu (°C)**,
**Status Sistem** (Aktif/Malam, warna hijau/merah). Di bawahnya ada ringkasan dari data
daily: Energi Hari Ini, Puncak Daya, dan **Metode** (badge `Hybrid (LSTM + Fisika)` vs
`Physics Fallback`). Saat `isLoading`, menampilkan skeleton.

### PowerAdvisor (`PowerAdvisor.tsx`)
Memberi **rekomendasi penggunaan energi** berdasarkan rasio daya saat ini terhadap
kapasitas 400 W (`ratio = power / 400`). Logika `getAdvice()`:
| Kondisi | Status | Saran |
|---|---|---|
| malam (`!is_daytime`) | Mode Malam | hemat baterai, jaga DoD |
| ratio ≥ 0.6 | Tinggi | charging penuh, jalankan beban berat |
| ratio ≥ 0.35 | Sedang | beban ringan-sedang, tunda beban berat |
| ratio ≥ 0.1 | Rendah | hanya beban esensial |
| < 0.1 | Sangat Rendah | minimalisir, cek panel terhalang |
Tiap status punya ikon, warna, deskripsi, dan daftar tips kontekstual.

### AlertBanner (`AlertBanner.tsx`)
Banner yang muncul **hanya** bila total energi prediksi < `alertLowWh` (merah) atau >
`alertHighWh` (hijau). Bisa di-*dismiss* (state lokal). Animasi expand/collapse.

### LocationSystem (`LocationSystem.tsx`)
Menggabungkan 3 hal dalam satu halaman:
1. **Peta** lokasi PLTS (`MapInner`, di-load dinamis).
2. **Tabel Spesifikasi PLTS** (dari `PLTS_CONFIG`).
3. **Tabel Performa Model LSTM** (dari `MODEL_METRICS`, R² ditonjolkan).

### MapInner (`MapInner.tsx`)
Peta **Leaflet** (OpenStreetMap tiles) dengan marker di koordinat PLTS + popup
spesifikasi. Memperbaiki bug ikon marker default Leaflet (URL ikon dari CDN unpkg).
**Wajib di-load dinamis** dengan `next/dynamic({ ssr: false })` karena Leaflet butuh
`window` (tidak bisa SSR) — lihat pemanggilan di `LocationSystem`.

### Chart: DailyForecastChart / WeeklyForecastChart / HistoryChart
Memakai **Recharts** dalam `ResponsiveContainer`:
- **DailyForecastChart** — *area chart* 24 jam dengan **confidence band** (upper/lower),
  toggle satuan **W ↔ kW**, badge metode (`Hybrid 50/50` / `Fallback`), ringkasan total
  energi & puncak. Spinner saat loading.
- **WeeklyForecastChart** — *bar chart* energi harian 7 hari (Senin–Minggu), membedakan
  hari aktual vs prediksi (`is_actual`), menampilkan ikon cuaca per hari.
- **HistoryChart** — membandingkan **aktual vs prediksi** 48 jam terakhir (24 titik
  prediksi pertama kosong karena dipakai sebagai seed window di backend).

### About (`About.tsx`)
Halaman statis berisi penjelasan fitur dashboard & cara kerja (LSTM + fisika, sumber data
Open-Meteo, dll) untuk pengguna awam.

---

## 8. Styling

- **Tailwind CSS v4** (via `@tailwindcss/postcss`) — semua styling pakai utility class,
  tanpa CSS module/inline style. Tema gelap: latar slate, aksen **amber/kuning** (warna surya).
- Pola UI konsisten: kartu `rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm`.
- `globals.css` memuat direktif Tailwind + sedikit style global.
- **CSS Leaflet** dimuat dari CDN di `<head>` (`layout.tsx`).

---

## 9. Konvensi Kode

- Komponen = **functional component + hooks**, file `PascalCase.tsx`, hooks `camelCase.ts`.
- Komponen yang butuh browser API (Leaflet, localStorage, event) memakai directive
  `'use client'`.
- Data fetching **hanya** via SWR hooks — hindari `useEffect + fetch` manual.
- Animasi via `motion.*` (Framer Motion). Ikon via `lucide-react`.
- Tipe response API didefinisikan di `types/index.ts` dan dipakai di hooks & komponen —
  bila backend mengubah nama field, **update tipe ini** agar TypeScript menangkap mismatch.

---

## 10. Proxy / Rewrite `/api/*` (penting)

Frontend selalu memanggil **path relatif** `/api/...`. Tujuan aktualnya diatur 2 tempat:

- **Development** — `next.config.ts` me-*rewrite* `/api/:path*` ke
  `http://localhost:5000` (atau `NEXT_PUBLIC_API_URL`). Jadi dev cukup jalankan Flask di
  port 5000, tanpa masalah CORS.
- **Production (Vercel)** — `vercel.json` me-*rewrite* `/api/:path*` ke
  `https://komekko-plts-dashboard-api.hf.space/api/:path*` (backend di Hugging Face).

> ⚠️ Kalau URL backend berubah, **update `vercel.json` lalu redeploy Vercel** —
> perubahan tidak otomatis aktif.

---

## 11. Menjalankan & Deploy

### Lokal (port 3000)
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```
Butuh backend jalan di port 5000 agar `/api/*` berfungsi (lihat `BACKEND.md`).

### Build / Production
```bash
npm run build
npm start
```

### Deploy ke Vercel
Project Next.js terhubung ke Vercel. `vercel.json` mengatur rewrite ke backend HF.
Push ke repo / `vercel --prod` untuk deploy.

---

## 12. Catatan Penting

- **Navigasi state, bukan URL** → refresh browser selalu kembali ke halaman `dashboard`,
  dan tiap halaman tidak punya URL sendiri (tidak bisa di-bookmark/di-share langsung).
- **Leaflet harus `ssr: false`** — kalau lupa, build/SSR error karena `window` undefined.
- **Konsistensi konstanta** frontend (`lib/api.ts`) vs backend (`plts_physics.py`) harus
  dijaga manual.
- **Cold start backend** (HF Space tidur) membuat request `/api/*` pertama lambat —
  bukan bug frontend. Detail di [`MAINTENANCE.md`](./MAINTENANCE.md).

Lihat juga: [`BACKEND.md`](./BACKEND.md) · [`README.md`](./README.md) · [`MAINTENANCE.md`](./MAINTENANCE.md).
