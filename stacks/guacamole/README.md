# Apache Guacamole - Web-based Remote Desktop

Clientless remote desktop gateway supporting VNC, RDP, SSH, and Telnet.

## Deployment on Coolify

### Step 1: Generate DB init script
Before deploying, you need the Guacamole database schema:

```bash
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgresql > initdb/001-schema.sql
```

### Step 2: Deploy via Coolify
1. Create new Docker Compose service
2. Paste the docker-compose.coolify.yml content
3. Set domain (e.g., `guac.lepoder.com`)
4. Deploy

### Step 3: First Login
- URL: https://guac.lepoder.com/guacamole/
- Default user: `guacadmin`
- Default pass: `guacadmin`
- **CHANGE THIS IMMEDIATELY**

## Adding Connections

After login, go to Settings → Connections:

### RDP (Windows)
- Protocol: RDP
- Hostname: target IP
- Port: 3389
- Username/Password or NLA

### VNC (Linux/Mac)
- Protocol: VNC
- Hostname: target IP  
- Port: 5900
- Password if set

### SSH
- Protocol: SSH
- Hostname: target IP
- Port: 22
- Username + password/key

## Portal Integration

Guacamole has a REST API for:
- Listing connections
- Getting active sessions
- Authentication tokens

We'll integrate this into LEPODER Portal for seamless access.
