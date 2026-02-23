# LEPODER Portal

Secure personal gateway to all your services — LAN, cloud, dev tools, remote access, AI, and more.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Internet (HTTPS)                                        │
│  lepoder.com ──▶ Nginx Proxy Manager ──▶ Portal (:3000) │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│  Tailscale VPN (tailnet)                                 │
│  ┌──────────┐ ┌───────────┐ ┌─────────┐ ┌───────────┐  │
│  │ Synology  │ │Home Asst. │ │ Pi-hole │ │  Router   │  │
│  │ NAS+Docker│ │  :8123    │ │  /admin │ │ 192.168.1.1│ │
│  └──────────┘ └───────────┘ └─────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Stack:** Next.js 14 · Prisma (SQLite) · Tailwind CSS · Docker Compose

## Quick Start

### 1. Prerequisites

- Node.js 20+ (for local dev)
- Docker + Docker Compose (for deployment)
- Tailscale account (for VPN integration)

### 2. Local Development

```bash
cd lepoder-portal
cp .env.example .env
# Edit .env: set ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET

npm install
npx prisma db push
npm run dev
# Open http://localhost:3000
```

### 3. Docker Deployment (Synology)

```bash
# On your Synology NAS (SSH or Task Scheduler)
cd /volume1/docker/lepoder-portal

# Copy project files and configure
cp .env.example .env
nano .env  # Fill in all required values

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f portal
```

### 4. Production with Reverse Proxy

```bash
# Deploy Nginx Proxy Manager
cd stacks/npm
docker compose up -d
# Access: http://synology-ip:81 → Change default credentials!

# Add Proxy Host:
#   Domain: lepoder.com
#   Forward: portal container IP:3000
#   SSL: Let's Encrypt (auto)
#   Force HTTPS: yes
```

## Features Overview

| Feature | Status |
|---------|--------|
| Login-protected portal (argon2id + HTTPOnly cookies) | ✅ |
| TOTP 2FA for admin | ✅ |
| CSRF protection | ✅ |
| Rate limiting (IP + account) | ✅ |
| Audit logging | ✅ |
| Config-driven services (YAML) | ✅ |
| Service tiles with status dots | ✅ |
| Favorites + quick actions | ✅ |
| Fuzzy search (Ctrl+K) | ✅ |
| Icon generation (Cloud API + fallback SVG) | ✅ |
| VPN status indicator | ✅ |
| Weather widget | ✅ |
| Markets widget (SPY, watchlist) | ✅ |
| Urgent Inbox (n8n webhook) | ✅ |
| AI Hub (API chat + iframe + notes) | ✅ |
| MCP tool server (3 built-in tools) | ✅ |
| Admin service management + AI suggest | ✅ |
| Reports & analytics | ✅ |
| Backup/export/import | ✅ |
| Bookmarks import (Chrome HTML) | ✅ |
| Iframe detection + fallback | ✅ |
| Shopify connector scaffold | ✅ |
| OneNote/Graph scaffold | ✅ |
| Synology FileStation scaffold | ✅ |
| Guacamole stack | ✅ |
| Nginx Proxy Manager stack | ✅ |
| Docker Compose ready | ✅ |

## Tailscale on Synology — Setup Guide

### Step 1: Install Tailscale on Synology

1. Open **Package Center** in Synology DSM
2. Search for **Tailscale** (available as community package)
3. If not in Package Center, install manually:
   - Download the Synology Tailscale package from https://pkgs.tailscale.com/stable/#spks
   - Choose your architecture (e.g., `x86_64`)
   - In Package Center → Manual Install → Upload the `.spk` file
4. After install, open Tailscale from the main menu
5. Log in with your Tailscale account
6. Your NAS will appear in your tailnet

### Step 2: Enable MagicDNS

1. Go to https://login.tailscale.com/admin/dns
2. Enable **MagicDNS**
3. Your NAS will be reachable as `synology` (or the machine name you set)
4. Other devices on your tailnet can access it by name

### Step 3: Enable Subnet Routing

To reach LAN devices (192.168.1.0/24) from outside your network:

1. SSH into your Synology (enable SSH in DSM → Control Panel → Terminal & SNMP)
2. Run:
   ```bash
   sudo tailscale up --advertise-routes=192.168.1.0/24 --accept-routes
   ```
3. Go to https://login.tailscale.com/admin/machines
4. Find your Synology → Click the `...` menu → **Edit route settings**
5. **Approve** the `192.168.1.0/24` route
6. On your client devices, ensure route acceptance:
   ```bash
   tailscale up --accept-routes
   ```

### Step 4: Verify Connectivity

From a device on your tailnet (NOT on the same LAN), test:

```bash
# Should reach your router
curl -s -o /dev/null -w "%{http_code}" http://192.168.1.1

# Should reach Home Assistant
curl -s -o /dev/null -w "%{http_code}" http://homeassistant.local:8123

# Should reach Pi-hole
curl -s -o /dev/null -w "%{http_code}" http://pihole.local/admin/

# Should reach n8n
curl -s -o /dev/null -w "%{http_code}" http://n8n.lepoder.com:5678
```

### Step 5: Portal Container + Tailscale

For the portal Docker container to reach Tailscale-routed services:

**Option A: Host Network Mode** (simplest)
```yaml
# In docker-compose.yml, change:
services:
  portal:
    network_mode: host
    # Remove the ports: section
```

**Option B: Install Tailscale in Container** (more isolated)
- Use `tailscale/tailscale` as a sidecar
- See Tailscale Docker docs

**Option C: Route through host** (if Synology has Tailscale)
- The host already has routes; container uses host DNS
- May need `extra_hosts` or DNS configuration in compose

### Security Best Practices

- **NEVER** expose Synology DSM to the public internet
- Keep admin panels (DSM, Portainer, Pi-hole) behind Tailscale only
- Set `requiresVPN: true` for all internal services in the portal config
- Use Tailscale ACLs to restrict which devices can access what
- Rotate Tailscale auth keys regularly
- Enable Tailscale MFA on your account

## Portal VPN Health Check

Configure in `.env`:

```env
# Mode: ping_url | tailscale_local_api | manual
VPN_HEALTHCHECK_MODE=ping_url

# A URL only reachable over Tailscale (any internal service)
VPN_HEALTHCHECK_URL=http://192.168.1.1
```

When VPN is down:
- Banner: "Tailscale not detected — internal services may be unreachable"
- VPN-required tiles show "VPN" badge with softer messaging
- Status dots show gray (not red) for VPN services

## Services Configuration

Edit `config/services.yaml` to add/modify services. Changes apply on restart, or sync via Admin UI.

Each service has:
- `id`: unique slug
- `name`, `url`, `description`
- `type`: internal | external | github | email | remote | bookmark | tool | ai
- `section`: top-level navigation group
- `openMode`: new_tab | iframe | modal | sidepanel
- `requiresVPN`: marks services behind Tailscale
- `statusCheckUrl`: custom health check URL
- `tags`: for search and filtering

## Urgent Inbox — n8n Integration

The portal exposes a webhook endpoint for n8n to push urgent items:

**Endpoint:** `POST /api/webhook/urgent`

**Auth:** `Authorization: Bearer <WEBHOOK_AUTH_TOKEN>`

**Payload:**
```json
{
  "title": "New urgent email from Client X",
  "snippet": "Please review the contract by EOD...",
  "priority": "high",
  "actionUrl": "https://mail.google.com/...",
  "source": "n8n"
}
```

### Sample n8n Flow

1. **Trigger:** Email received (IMAP/Gmail node)
2. **Filter:** Check sender/subject for urgency keywords
3. **HTTP Request:** POST to `https://lepoder.com/api/webhook/urgent`
   - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
   - Body: `{ title, snippet, priority, actionUrl }`
4. The portal displays the item in the Urgent Inbox widget

## AI Hub

### Mode 1: Iframe Embed
Try embedding ChatGPT/Claude in iframe. Most sites block this; fallback to new tab.

### Mode 2: Launcher + Notes
Quick-launch buttons + personal notes with tags, search, export.

### Mode 3: Native API Chat
Set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in `.env` for direct API conversations.

### AI-Assisted Link Creator
When adding a service in Admin, click "AI Suggest Fields" — the AI analyzes the URL and suggests name, description, tags, category, and status check URL.

## MCP Tools

Three built-in MCP tools ship with the portal:

1. **create_portal_tile** — Create a new service tile (admin)
2. **trigger_n8n_workflow** — Trigger n8n via webhook URL
3. **fetch_shopify_metrics** — Get Shopify store metrics (admin)

Access via the wrench icon in the dashboard header. Execute tools with input parameters and see results.

## Stacks

### Apache Guacamole (Remote Desktop)

```bash
cd stacks/guacamole

# Generate init SQL (one-time)
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql > initdb.sql

# Start
docker compose up -d

# Access: http://synology-ip:8080/guacamole
# Login: guacadmin/guacadmin → CHANGE PASSWORD
```

Add connections (RDP/VNC/SSH) in Guacamole admin panel.

### Nginx Proxy Manager

```bash
cd stacks/npm
docker compose up -d

# Access: http://synology-ip:81
# Login: admin@example.com/changeme → CHANGE CREDENTIALS
```

Add proxy hosts for your domains with auto-SSL.

## Backup & Restore

### Via UI
Admin → Export (JSON or YAML)

### Via CLI
```bash
npx tsx scripts/backup.ts
npx tsx scripts/backup.ts --output /path/to/backups
```

### Import
POST to `/api/admin/import` with `{ services: [...], dryRun: true }` to preview, then `dryRun: false` to apply.

## Environment Variables

See `.env.example` for the full list with documentation.

**Required:**
- `AUTH_SECRET` — Session encryption key (generate: `openssl rand -hex 32`)
- `ADMIN_EMAIL` — Admin bootstrap email
- `ADMIN_PASSWORD` — Admin bootstrap password

**Optional integrations:**
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI Hub
- `WEATHER_API_KEY` — Weather widget
- `MARKET_DATA_API_KEY` — Markets widget
- `SHOPIFY_*` — Business metrics
- `MSFT_*` — OneNote integration
- `SYNOLOGY_*` — File browsing
- `WEBHOOK_AUTH_TOKEN` — n8n webhook auth

## Post-Deploy Checklist

- [ ] Set strong `AUTH_SECRET` (random 64+ chars)
- [ ] Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- [ ] Run `docker compose up -d --build`
- [ ] Login at https://lepoder.com
- [ ] Change admin password if needed
- [ ] Enable TOTP 2FA (Settings)
- [ ] Verify VPN connectivity to internal services
- [ ] Configure Nginx Proxy Manager for HTTPS
- [ ] Set `WEBHOOK_AUTH_TOKEN` for n8n integration
- [ ] Optionally configure AI, Weather, Markets API keys
- [ ] Test backup: `npx tsx scripts/backup.ts`
- [ ] Add additional services via Admin UI or config YAML
