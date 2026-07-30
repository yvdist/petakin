# Deploy Petakin — Panduan untuk QA & First-Timer

Petakin punya dua bagian:

| Bagian | Stack | Port lokal | Peran |
|---|---|---|---|
| **Frontend** | Next.js | 3000 | UI editor + mode `/manual` |
| **Backend** | FastAPI (Python) | 8000 | Deteksi palette + generate geometry (mode auto) |

Frontend mem-proxy semua request `/api/*` ke backend lewat env `PETAKIN_BACKEND` (lihat `frontend/next.config.ts`). Browser selalu memanggil same-origin `/api/...`, jadi **CORS biasanya tidak perlu diubah** selama proxy dipakai.

**Mode manual (`/manual`) murni di browser** — tidak butuh backend. Cocok untuk QA yang fokus menggambar asset map.

---

## Pilih jalur (opsi gratis)

| Jalur | Cocok untuk | Biaya | Catatan |
|---|---|---|---|
| **A. Vercel frontend saja** (recommended) | Mode `/manual` untuk QA | Free | Paling simple; auto/generate tidak jalan |
| **B. Vercel + Render** | Manual + auto | Free tier | Backend cold start ~30–60 detik setelah idle |
| **C. Satu tempat (Docker di Render)** | Satu URL untuk FE+BE | Free tier | Setup lebih panjang |
| **D. Tunnel lokal** | Demo cepat tanpa hosting | Free | Laptop kamu harus tetap nyala |

**Rekomendasi untuk team QA sekarang:** Jalur **A**. Kalau nanti perlu coba mode auto, naik ke Jalur **B**.

```
QA browser
    │
    ├─ /manual ──────────────► Vercel (frontend saja)     ← Jalur A
    │
    └─ / + /api/* ──proxy───► Render (FastAPI)            ← Jalur B
              ▲
         Vercel FE
```

---

## Jalur A — Vercel frontend saja (recommended QA)

Hasil: URL publik (mis. `https://petakin-xxx.vercel.app`). QA buka `/manual`, gambar unit, export SVG/JSON. **Tidak perlu deploy FastAPI.**

### Prasyarat

- Akun [GitHub](https://github.com) (repo Petakin sudah di-push)
- Akun [Vercel](https://vercel.com) (gratis, login pakai GitHub)

### Langkah

1. Push repo ke GitHub (jika belum).
2. Di Vercel: **Add New… → Project** → pilih repo Petakin.
3. Set **Root Directory** = `frontend` (penting — jangan root repo).
4. Framework Preset biasanya terdeteksi **Next.js**. Biarkan default:
   - Build Command: `next build` / `npm run build`
   - Output: default Next.js
5. **Jangan** isi `PETAKIN_BACKEND` (tidak perlu untuk manual).
6. Deploy. Tunggu selesai, buka URL yang diberikan Vercel.
7. Bagikan ke QA: `https://<project>.vercel.app/manual`

### Instruksi singkat untuk QA

1. Buka `/manual`.
2. Upload denah (raster) sebagai background.
3. Gambar unit (rect/poly), pilih kategori, atur warna bila perlu.
4. Export SVG untuk asset map; export JSON project untuk backup / pindah ke browser lain.
5. Data tersimpan di **localStorage browser** — tidak ikut pindah device/akun otomatis. Selalu export JSON kalau mau share antar orang.

### Batasan Jalur A

- Halaman `/` (auto) dan `/batch` akan gagal memanggil API (tidak ada backend).
- Seed-from-auto (kalau ada) yang bergantung generate juga tidak tersedia tanpa backend.

---

## Jalur B — Full stack gratis (first-time FastAPI)

Pakai ini kalau QA / kamu masih ingin mencoba mode generate di `/` atau `/batch`.

### Konsep singkat (FastAPI first-timer)

1. **FastAPI** = aplikasi Python yang melayani HTTP API (`/api/detect`, `/api/process`, …).
2. **Uvicorn** = server yang menjalankan app FastAPI itu.
3. Di cloud, Render menjalankan: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Vercel (frontend) meneruskan `/api/*` ke URL Render lewat env `PETAKIN_BACKEND`.
5. Browser tetap berbicara ke Vercel saja — tidak langsung ke Render.

Backend Petakin **stateless** (tidak simpan file di disk server): image + config masuk → geometry/SVG keluar. Cocok di-host sebagai Web Service biasa. Dependency berat (`numpy`, `scipy`, `opencv`) → **jangan** pakai serverless Python “tipis”; pakai container/VM seperti Render Web Service.

### B1. Deploy backend di Render

1. Buat akun di [Render](https://render.com) (gratis).
2. **New → Web Service** → connect repo GitHub.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Pilih instance **Free**.
5. Deploy. Catat URL, mis. `https://petakin-api.onrender.com`.
6. Tes di browser atau curl:

```bash
curl https://petakin-api.onrender.com/api/health
# diharapkan: {"ok":true}
```

**Catatan free tier Render:** setelah idle, service “tidur”. Request pertama bisa 30–60 detik (cold start). Request berikutnya cepat lagi sampai idle lagi. Untuk QA sesekali ini biasanya cukup.

Python 3.11 atau 3.12 biasanya aman. Pastikan `opencv-python-headless` (sudah di `requirements.txt`) — bukan paket GUI `opencv-python`.

### B2. Hubungkan frontend di Vercel

1. Deploy frontend seperti Jalur A (Root Directory = `frontend`), atau buka project yang sudah ada.
2. **Settings → Environment Variables** tambahkan:

| Name | Value |
|---|---|
| `PETAKIN_BACKEND` | `https://petakin-api.onrender.com` |

Tanpa trailing slash (`/` di akhir).

3. **Redeploy** frontend (env rewrite dibaca saat build/runtime Next — redeploy memastikan aktif).
4. Tes: buka `/`, upload gambar, jalankan detect/process. Kalau backend baru bangun tidur, tunggu cold start.

### Alternatif hosting backend (juga ada free / trial)

| Platform | Catatan singkat |
|---|---|
| **Render** (di atas) | Free sleep + cold start; paling umum untuk FastAPI pemula |
| **Railway** | Trial/credit; sering lebih responsif, cek kuota saat ini |
| **Fly.io** | Free allowance terbatas; butuh `flyctl` + Dockerfile |
| **Hugging Face Spaces** (Docker) | Bisa untuk demo API; UX beda |

Frontend tetap paling nyaman di **Vercel** (gratis untuk Next.js).

---

## Jalur C — Deploy sekaligus di satu tempat (Docker di Render)

Satu service berisi frontend (Next.js production) + backend (uvicorn), diproxy internal. Cocok kalau mau **satu URL** tanpa Vercel terpisah.

Contoh struktur (copy-paste ke root repo sebagai `Dockerfile` kalau mau dipakai):

```dockerfile
# --- backend deps + app ---
FROM python:3.12-slim AS backend
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# --- frontend build ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
# Backend di container yang sama → localhost:8000
ENV PETAKIN_BACKEND=http://127.0.0.1:8000
RUN npm run build

# --- runtime: both processes ---
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Node untuk next start
COPY --from=frontend /usr/local /usr/local
COPY --from=frontend /app/frontend /app/frontend
COPY --from=backend /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend /app/backend /app/backend
WORKDIR /app

# Simple process starter (production-ish demo)
CMD sh -c "cd /app/backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 & \
  cd /app/frontend && PORT=\${PORT:-3000} npm run start -- -H 0.0.0.0 -p \${PORT:-3000}"
```

### Di Render

1. **New → Web Service** → repo yang sudah punya `Dockerfile` di root.
2. **Environment:** Docker.
3. Pastikan port yang di-expose = port Next (`PORT` biasanya di-set Render).
4. Health: buka `/` (UI) dan `/api/health` (harus diproxy Next → uvicorn).

**Catatan:** Dockerfile di atas adalah contoh panduan — belum ada di repo. Kalau mau di-commit + diuji, minta follow-up terpisah (sering perlu penyesuaian image Node di stage akhir).

Alternatif all-in-one tanpa Docker: **VPS gratis** (mis. Oracle Cloud Always Free) + `systemd` dua service + nginx reverse proxy. Lebih fleksibel, tapi setup server Linux lebih panjang.

---

## Jalur D — Tunnel lokal (paling cepat, zero cloud)

Pakai kalau “QA perlu akses hari ini” dan laptop kamu bisa tetap online.

1. Jalankan backend + frontend lokal seperti biasa (lihat README):

```bash
# terminal 1
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm run dev
```

2. Install [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/) (`cloudflared`) atau [ngrok](https://ngrok.com).

3. Expose **port 3000** (frontend). Proxy Next sudah meneruskan `/api` ke backend lokal:

```bash
# Cloudflare (quick tunnel)
cloudflared tunnel --url http://localhost:3000

# atau ngrok
ngrok http 3000
```

4. Bagikan URL HTTPS yang muncul ke QA.

**Batasan:** laptop sleep/mati → URL mati. Cocok demo, bukan hosting permanen.

---

## Checklist QA (mode manual)

- [ ] Buka `https://<deploy>/manual` (bukan hanya `/`).
- [ ] Upload denah sebagai background; opacity bisa disesuaikan.
- [ ] Gambar beberapa unit tiap kategori (fnb, fashion, zone, …).
- [ ] Export **SVG** → cek di Figma/browser: path per unit, warna solid, tanpa teks denah.
- [ ] Export **JSON project** → simpan di Drive/Slack team sebagai backup.
- [ ] Import ulang JSON di browser lain → pastikan shapes kembali.
- [ ] Ingat: **localStorage per browser/device** — clear site data = hilang project (kecuali sudah export JSON).
- [ ] Kalau pakai Jalur B: sekali tes `/` auto (optional); toleransi cold start Render.

### Share hasil antar QA

| Yang di-share | Cara |
|---|---|
| Asset map final | File SVG (dan PNG kalau di-export dari UI) |
| Work-in-progress | JSON project dari `/manual` |
| Preset warna (auto) | JSON preset dari localStorage / export preset (mode auto) |

---

## Troubleshooting

| Gejala | Kemungkinan | Perbaikan |
|---|---|---|
| `/manual` kosong / error load | Deploy salah root | Root Directory Vercel harus `frontend` |
| `/` atau detect gagal, `/manual` OK | Tidak ada backend (Jalur A) | Normal di A; naik ke Jalur B jika perlu auto |
| `/api/*` 502 / failed | `PETAKIN_BACKEND` salah atau Render sleep | Cek URL tanpa `/` akhir; hit `/api/health` dulu; tunggu cold start |
| Process timeout / crash | Gambar terlalu besar / memory free tier | Resize denah; coba lagi; naik plan jika sering |
| CORS error di browser | Frontend memanggil URL backend langsung (bukan `/api`) | Pastikan tetap fetch ke `/api/...` lewat proxy Next |
| Data hilang setelah ganti browser | localStorage tidak sync | Export/import JSON project |
| `ModuleNotFoundError` / OpenCV di Render | Build salah directory | Root = `backend`, pakai `requirements.txt` yang ada |

Jangan commit folder `.venv`, `node_modules`, atau file secret/token.

---

## Ringkasan keputusan

| Kebutuhan | Pilih |
|---|---|
| QA gambar map manual, gratis, cepat | **Jalur A** (Vercel) |
| Masih perlu coba auto/generate | **Jalur B** (Vercel + Render) |
| Satu URL saja | **Jalur C** (Docker) atau follow-up VPS |
| Demo hari ini, tanpa daftar hosting | **Jalur D** (tunnel) |

Scope panduan ini: **agar team QA bisa akses dan buat asset map**. Belum mencakup auth login, custom domain berbayar, CI/CD kompleks, atau scale production.
