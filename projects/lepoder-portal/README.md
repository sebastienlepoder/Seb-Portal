# 📁 LEPODER Portal

Secure personal gateway to all your services — LAN, cloud, dev tools, remote access, AI, and more.

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Internet (HTTPS)                                           │
│  lepoder.com ──▶ Nginx Proxy Manager ──▶ Portal (:3000)    │
└─────────────────────┬──────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────┐
│  Tailscale VPN (tailnet)                                    │
│  ┌──────────┐ ┌───────────┐ ┌─────────┐ ┌───────────┐     │
│  │ Synology  │ │Home Asst. │ │ Pi-hole │ │  Router   │     │
│  │ NAS+Docker│ │  :8123    │ │  /admin │ │ 192.168.x │     │
│  └──────────┘ └───────────┘ └─────────┘ └───────────┘     │
└────────────────────────────────────────────────────────────┘
```

## 🚀 Stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** SQLite (portable, single file)
- **Auth:** Argon2id, HTTPOnly cookies, TOTP 2FA
- **Deployment:** Docker Compose, Nginx Proxy Manager

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 Secure Auth | Argon2id + TOTP 2FA + CSRF protection |
| 🖼️ Service Dashboard | Tiles with status indicators, favorites, search |
| 📧 Mail Integration | Outlook via Microsoft Graph API |
| 📝 OneNote | Notebooks access (API has 5K item limit) |
| 🤖 AI Hub | OpenAI/Anthropic chat + notes |
| 🔧 MCP Tools | create_portal_tile, trigger_n8n, fetch_shopify |
| 🌤️ Widgets | Weather, Markets, Urgent Inbox |
| 🔄 VPN Status | Tailscale connectivity indicator |
| 📊 Reports | Usage analytics and audit logs |
| 💾 Backup | Export/import JSON/YAML |

## 🔗 Links

- **Production:** https://app.lepoder.com
- **GitHub:** https://github.com/sebastienlepoder/lepoder-portal

## 📖 Documentation

See the [main README](https://github.com/sebastienlepoder/lepoder-portal#readme) for:
- Setup instructions
- Environment variables
- Tailscale configuration
- n8n integration
- Deployment guide

---

_Maintained by Seb with help from Claw 🦀_
