# RustDesk Self-Hosted Server

## Ports Required

| Port | Protocol | Purpose |
|------|----------|---------|
| 21115 | TCP | NAT type test |
| 21116 | TCP+UDP | ID server / hole punching |
| 21117 | TCP | Relay server |
| 21118 | TCP | Web client WebSocket (hbbs) |
| 21119 | TCP | Web client WebSocket (hbbr) |

## Deployment on Coolify

1. Create new "Docker Compose" resource in Coolify
2. Paste the docker-compose.yml content
3. Deploy
4. After first start, check `data/id_ed25519.pub` for the public key

## Client Configuration

Once deployed, configure RustDesk clients with:

- **ID Server:** `rustdesk.lepoder.com` (or your domain/IP)
- **Relay Server:** `rustdesk.lepoder.com`
- **Key:** (contents of id_ed25519.pub)

## Web Client

RustDesk web client can connect via:
- `https://rustdesk.lepoder.com:21118` (needs SSL termination)

For portal integration, we'll proxy through the portal's backend.
