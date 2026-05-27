# Changelog

All notable changes to LEPODER Portal are documented here.

## [Unreleased]

### Added
- **Web SSH Terminal** (admin-only) at `/terminal` — Xterm.js + ssh2-backed WebSocket bridge for interactive SSH into any host reachable from the portal server (Tailscale + LAN). Controlled by `DISABLE_TERMINAL`, `TERMINAL_HOST_ALLOWLIST`, and `BASE_URL` (WS origin check). See `docs/WEB-SSH-TERMINAL.md`.
- **1Password Connect integration** — admin-only Settings panel; Connect token stored encrypted (AES-256-GCM); per-project env-var → 1Password field mappings; worker injects resolved secrets via `extraEnv` at task-start without logging values
- **Unified Help center** at `/manage/help` — replaces and handles the previous `/agents/help` link
- **Unified sidebar navigation** across all pages (dashboard, mail, projects)
- **Microsoft Graph integration** — OneNote notebooks and Outlook email
- **Mail page** — View and compose emails directly in the portal
- **Projects page** — Documentation and project tracking
- **Service editor improvements** — Help icons, tooltips, required field indicators
- **Self-update feature** — Check for updates and pull from GitHub via admin panel
- **Build-time versioning** — Version displayed in UI with update checking

### Fixed
- SQLite concurrent write timeouts in status checker (batch inserts)
- Navbar scrolling issue on mail/projects pages
- OneNote API error handling for 5K/20K item limits
- Tooltip positioning and overflow issues
- Case-insensitive admin role check

### Changed
- Removed OneNote from main nav (API limitation workaround)
- Session cookie secure flag now configurable

---

## [1.0.0] - 2026-02-23

### Added
- **Core Portal**
  - Login-protected portal with argon2id password hashing
  - HTTPOnly secure cookies for sessions
  - TOTP 2FA for admin accounts
  - CSRF protection on all mutations
  - Rate limiting (IP + account based)
  - Audit logging

- **Dashboard**
  - Service tiles with status indicators (green/yellow/red/gray)
  - Favorites system with quick actions
  - Fuzzy search (Ctrl+K)
  - Section-based navigation
  - VPN status indicator with banner

- **Widgets**
  - Weather widget (configurable location)
  - Markets widget (SPY + watchlist)
  - Urgent Inbox (n8n webhook integration)
  - Outlook email preview
  - OneNote notebooks

- **AI Hub**
  - Native API chat (OpenAI/Anthropic)
  - Iframe embed with fallback
  - Personal notes with tags and search
  - AI-assisted service creation

- **MCP Tools**
  - create_portal_tile — Add services via MCP
  - trigger_n8n_workflow — Webhook triggers
  - fetch_shopify_metrics — Business metrics

- **Admin Features**
  - Service management UI
  - AI-powered field suggestions
  - Reports and analytics
  - Backup/export/import (JSON/YAML)
  - Chrome bookmarks import

- **Infrastructure**
  - Docker Compose ready
  - Nginx Proxy Manager stack
  - Apache Guacamole stack
  - Tailscale VPN integration guide
  - Health check endpoint

### Technical
- Next.js 14 with App Router
- Prisma ORM with SQLite
- Tailwind CSS styling
- TypeScript throughout
