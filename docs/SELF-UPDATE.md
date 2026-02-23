# Self-Update Feature

Le portail peut se mettre à jour automatiquement depuis GitHub via l'interface admin.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Portal (Docker Container)                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Settings → Update Panel                            ││
│  │  - Vérifie les mises à jour (git fetch)             ││
│  │  - Affiche le changelog                             ││
│  │  - Écrit un trigger file quand update demandé       ││
│  └─────────────────────────────────────────────────────┘│
│                         │                                │
│                         ▼ /data/update-trigger           │
└─────────────────────────┼───────────────────────────────┘
                          │ (volume monté)
┌─────────────────────────┼───────────────────────────────┐
│  Synology Host          │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Task Scheduler (cron)                              ││
│  │  → watch-update.sh (toutes les 5 min)               ││
│  │  → Détecte trigger file                             ││
│  │  → Exécute update.sh                                ││
│  └─────────────────────────────────────────────────────┘│
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────────┐│
│  │  update.sh                                          ││
│  │  1. git pull                                        ││
│  │  2. docker compose build                            ││
│  │  3. docker compose up -d                            ││
│  │  4. prisma db push (si migrations)                  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Installation sur Synology

### 1. Rendre les scripts exécutables

```bash
cd /volume1/docker/lepoder-portal
chmod +x scripts/update.sh
chmod +x scripts/watch-update.sh
```

### 2. Monter le dossier data dans Docker

Dans `docker-compose.yml`, ajouter le volume:

```yaml
services:
  portal:
    # ...
    volumes:
      - ./data:/data  # Pour le trigger file
      - .:/app        # Pour git (optionnel, permet de voir la version)
```

### 3. Configurer le Task Scheduler (Synology)

1. Ouvrir **Control Panel** → **Task Scheduler**
2. Créer une **Triggered Task** → **User-defined script**
3. Configurer:
   - **Task**: `Portal Update Watcher`
   - **User**: `root`
   - **Schedule**: Every 5 minutes
   - **Script**:
     ```bash
     /volume1/docker/lepoder-portal/scripts/watch-update.sh
     ```

### 4. Variables d'environnement (optionnel)

Dans `.env` du container:

```env
# Fichier de status d'update
UPDATE_STATUS_FILE=/data/update-status.json

# Fichier trigger pour déclencher l'update
UPDATE_TRIGGER_FILE=/data/update-trigger

# Webhook URL (alternative au trigger file)
# UPDATE_WEBHOOK_URL=http://localhost:5678/webhook/portal-update
```

## Utilisation

1. Aller dans **Settings** (icône engrenage)
2. La section **Mises à jour** affiche:
   - Version actuelle
   - Version disponible
   - Changelog des commits
3. Cliquer sur **Mettre à jour maintenant**
4. Le portail redémarrera automatiquement (délai ~1-2 minutes)

## Mise à jour manuelle

Si la mise à jour automatique ne fonctionne pas:

```bash
ssh admin@synology
cd /volume1/docker/lepoder-portal
sudo ./scripts/update.sh
```

## Rollback

Pour revenir à une version précédente:

```bash
cd /volume1/docker/lepoder-portal
git log --oneline -10  # Voir les commits récents
git checkout <commit>   # Revenir à un commit spécifique
docker compose build
docker compose up -d
```

## Sécurité

- Seuls les admins peuvent déclencher les mises à jour
- Le script vérifie que le trigger file existe avant d'agir
- Les logs sont enregistrés dans `update.log`
- Pas d'exposition de credentials git dans l'interface
