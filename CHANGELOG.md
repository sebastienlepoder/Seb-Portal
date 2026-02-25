# Changelog

All notable changes to LEPODER Portal are documented here.

## [Unreleased]

### Added
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
