# kv-tiktok

**Self-hosted TikTok viewer** — A clean, ad-free TikTok client you can run on your own NAS or server.

## Features

- **For You Feed** — Video feed from popular TikTok creators
- **Search** — Search videos and users
- **Following** — Track your favorite creators
- **Liked Videos** — Save favorites to a persistent Liked tab
- **Download** — Download videos directly
- **Autoplay** — Muted autoplay with tap-to-unmute
- **Mobile-friendly** — Responsive design for any screen
- **Docker-ready** — Single container, easy deployment on Synology NAS

## Architecture

- **Backend**: Python FastAPI with Playwright for TikTok interaction
- **Frontend**: React + Vite
- **Platform**: `linux/amd64` (compatible with Synology NAS x86/x64 models)

## Prerequisites

- Docker and Docker Compose installed
- For Synology NAS: Container Manager (Docker) package installed
- Minimum 2GB RAM recommended for browser automation

## Quick Start

### Clone and Run

```bash
git clone https://github.com/vndangkhoa/kv-tiktok.git
cd kv-tiktok
docker compose up -d --build
```

Access at `http://your-server-ip:8002`

---

## Synology NAS Deployment

### Option 1: Build on NAS via SSH (Recommended)

**Requirements**: SSH access enabled on your NAS (Control Panel → Terminal & SNMP → Enable SSH)

```bash
# SSH into your NAS
ssh admin@your-nas-ip

# Navigate to your shared folder
cd /volume1/docker

# Clone the repository
git clone https://github.com/vndangkhoa/kv-tiktok.git
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
2. Select image: `kv-tiktok:latest`
3. Configure:

   | Setting | Value |
   |---------|-------|
   | Container Name | `kv-tiktok` |
   | Port Settings | Local: `8002` → Container: `8002` |
   | Memory Limit | Minimum `2GB` |
   | Shared Memory | `2GB` |

4. **Volume Settings**: Click **Add Folder**
   - Create a folder named `kv-tiktok-cache` in your shared folder
   - Mount path: `/app/cache`

5. **Environment Variables**: Click **Add**
   - `PYTHONUNBUFFERED` = `1`
   - `ADMIN_PASSWORD` = `your_secure_password`

6. **Restart Policy**: Select `unless-stopped`

7. Click **Apply**

**Step 5: Verify**

```bash
# Check container is running
docker ps

# Check logs
docker logs kv-tiktok
```

### Option 3: Via docker-compose (SSH)

```bash
# On your NAS via SSH
cd /volume1/docker/kv-tiktok
docker compose up -d
docker compose logs -f
```

---

## First-Time Setup (TikTok Cookies)

The app requires TikTok session cookies to load the feed.

### Get Your Cookies (Desktop Recommended)

1. Install [Cookie-Editor](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) browser extension

2. Go to [tiktok.com](https://www.tiktok.com) and log in to your account

3. Click the Cookie-Editor icon → **Export** → **Copy** (select "Export as JSON")

4. Save the exported JSON to `cookies.json` file in the project directory

5. Restart the container:
   ```bash
   docker compose restart
   ```

### Alternative: Setup via Admin Page

1. Start the container and visit `http://your-server-ip:8002/admin`
2. Login with default password: `admin123` (change this!)
3. Follow on-screen instructions to paste cookies

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHONUNBUFFERED` | `1` | Real-time Python logging |
| `ADMIN_PASSWORD` | `admin123` | Password for `/admin` page |

### Volumes

| Path | Description |
|------|-------------|
| `/app/cache` | Video cache (LRU, max usage limited by disk space) |
| `/app/cookies.json` | TikTok session cookies (persist across restarts) |

### Health Check

The container includes a health check endpoint. You can verify with:

```bash
curl http://localhost:8002/health
# Expected: {"status":"ok"}
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

Increase memory limits or clear cache:

```bash
# Clear video cache
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
└── README.md
```

## Synology NAS Compatibility

Tested on Synology models with x86/x64 processors. For ARM-based models (e.g., DS220+, DS920+), the `linux/amd64` image works via emulation, but performance may be slower.

## License

MIT License