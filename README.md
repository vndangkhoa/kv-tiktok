# kv-tiktok

**A self-hosted, ad-free TikTok client** — browse, search, and download TikTok videos on your own server or NAS.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)](https://www.docker.com)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com)
[![Frontend](https://img.shields.io/badge/Frontend-React-61DAFB)](https://react.dev)
[![Image](https://img.shields.io/badge/Image-vndangkhoa%2Fkv--tiktok-8A2BE2)](https://hub.docker.com)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [First-Time Setup](#first-time-setup-tiktok-cookies)
- [Configuration](#configuration)
- [Synology NAS Deployment](#synology-nas-deployment)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Support the Project](#support-the-project)
- [License](#license)

---

## Features

| | |
|---|---|
| **For You Feed** | Video feed from popular TikTok creators |
| **Search** | Search videos and users |
| **Following** | Track your favorite creators |
| **Download** | Download videos directly |
| **Autoplay** | Muted autoplay with tap-to-unmute |
| **Mobile-friendly** | Responsive design for any screen |
| **Docker-ready** | Single container, easy deployment on Synology NAS |
| **Letterboxed video** | Videos preserve original aspect ratio |

### Architecture

- **Backend** — Python FastAPI with Playwright for TikTok interaction
- **Frontend** — React + Vite (SPA)
- **Platform** — `linux/amd64` (compatible with Synology NAS x86/x64 models)
- **Video source** — CDN-first with fallback proxy, forces full download for playback

---

## Quick Start

### Option A: Docker (Recommended)

**Prerequisites:** Docker + Docker Compose, minimum 2GB RAM.

```bash
git clone https://git.khoavo.myds.me/vndangkhoa/kv-tiktok.git
cd kv-tiktok
docker compose up -d --build
```

Or pull the prebuilt image directly:

```bash
docker pull vndangkhoa/kv-tiktok:latest
```

Access at `http://your-server-ip:8002`

### Option B: Local Development

Requires Python 3.9–3.12 and Node.js. The script sets everything up for you
(venv, dependencies, Playwright browsers) on first run.

```bash
./start.sh            # start backend (:8002) + frontend (:5173)
./start.sh status     # check what's running
./start.sh restart    # restart both servers
./start.sh stop       # stop both servers
./start.sh docker     # or run via Docker Compose
```

- Backend API: `http://localhost:8002`
- Frontend UI (dev): `http://localhost:5173`

---

## First-Time Setup (TikTok Cookies)

The app requires TikTok session cookies to load the feed.

### Get Your Cookies (Desktop Recommended)

1. Install the [Cookie-Editor](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) browser extension
2. Go to [tiktok.com](https://www.tiktok.com) and log in to your account
3. Click the Cookie-Editor icon → **Export** → **Copy** (select "Export as JSON")
4. Save the exported JSON to `cookies.json` in the project directory
5. Restart the app:

   ```bash
   docker compose restart
   ```

### Alternative: Setup via Admin Page

1. Start the app and visit `http://your-server-ip:8002/admin`
2. Login with the default password: `admin123` (change this!)
3. Follow the on-screen instructions to paste your cookies

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHONUNBUFFERED` | `1` | Real-time Python logging |
| `ADMIN_PASSWORD` | `admin123` | Password for the `/admin` page |

### Volumes

| Path | Description |
|------|-------------|
| `/app/cache` | Video cache (LRU, max usage limited by disk space) |
| `/app/cookies.json` | TikTok session cookies (persist across restarts) |

### Health Check

```bash
curl http://localhost:8002/health
# Expected: {"status":"ok"}
```

---

## Synology NAS Deployment

### Option 1: Build on NAS via SSH (Recommended)

**Requirements:** SSH access enabled on your NAS (Control Panel → Terminal & SNMP → Enable SSH)

```bash
ssh admin@your-nas-ip

cd /volume1/docker
git clone https://git.khoavo.myds.me/vndangkhoa/kv-tiktok.git
cd kv-tiktok

# Build and start
docker compose up -d --build

# Watch logs to confirm it's running
docker compose logs -f
```

Once running, access at `http://your-nas-ip:8002`

### Option 2: Build on PC, Deploy via GUI

If your NAS has limited resources:

**Step 1: Build on your PC**

```bash
git clone https://github.com/vndangkhoa/kv-tiktok.git
cd kv-tiktok
docker build -t kv-tiktok:latest .
docker save kv-tiktok:latest -o kv-tiktok.tar
```

**Step 2: Transfer to NAS**

Copy `kv-tiktok.tar` to your NAS using File Station or SCP:

```bash
scp kv-tiktok.tar admin@your-nas-ip:/volume1/docker/
```

**Step 3: Import via Container Manager**

1. Open **Container Manager** on your Synology
2. Go to **Registry** → **Image** → **Import**
3. Select `kv-tiktok.tar` from the shared folder
4. Wait for import to complete

**Step 4: Create Container**

1. Go to **Container** → **Create**
2. Select the image: `kv-tiktok:latest`
3. Configure:

   | Setting | Value |
   |---------|-------|
   | Container Name | `kv-tiktok` |
   | Port Settings | Local: `8002` → Container: `8002` |
   | Memory Limit | Minimum `2GB` |
   | Shared Memory | `2GB` |

4. **Volume Settings:** Click **Add Folder**, create `kv-tiktok-cache`, mount to `/app/cache`
5. **Environment Variables:** Click **Add**
   - `PYTHONUNBUFFERED` = `1`
   - `ADMIN_PASSWORD` = `your_secure_password`
6. **Restart Policy:** Select `unless-stopped`
7. Click **Apply**

**Step 5: Verify**

```bash
docker ps       # check container is running
docker logs kv-tiktok
```

### Option 3: Via docker-compose (SSH)

```bash
cd /volume1/docker/kv-tiktok
docker compose up -d
docker compose logs -f
```

---

## Troubleshooting

### Videos Not Loading

```bash
# Check backend health
curl http://localhost:8002/health

# View logs
docker compose logs -f

# Verify cookies exist
cat cookies.json
```

### Container Won't Start

```bash
# Check logs
docker compose logs

# Verify port 8002 is not in use
netstat -tlnp | grep 8002
```

### Out of Memory

Increase the memory limit or clear the cache:

```bash
rm -rf ./cache/*
docker compose restart
```

### Update to Latest Version

```bash
git pull
docker compose up -d --build
```

---

## Project Structure

```
kv-tiktok/
├── backend/
│   ├── api/routes/      # API endpoints
│   ├── core/            # Core services (Playwright, Crawler)
│   └── main.py          # FastAPI application
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   └── App.tsx
│   └── package.json
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Container orchestration
├── start.sh             # Local dev launcher
└── README.md
```

### Synology NAS Compatibility

Tested on Synology models with x86/x64 processors. For ARM-based models
(e.g., DS220+, DS920+), the `linux/amd64` image works via emulation, but
performance may be slower.

---

## Support the Project

If kv-tiktok has been useful to you, consider a small donation to support
development and keep the project alive. Your generosity is greatly appreciated!

![Support the project with a donation](donation.jpg)

---

## License

[MIT](LICENSE)
