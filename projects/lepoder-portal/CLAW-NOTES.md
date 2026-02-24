# 🦀 Claw Notes - LEPODER Portal

## État actuel
**Status:** 🟢 Actif  
**Dernière session:** 2026-02-24  
**Version déployée:** En cours de déploiement

## Fonctionnalités récentes

### ✅ Self-Update System (2026-02-23)
- Panneau admin pour déclencher les mises à jour
- Script `watch-update.sh` pour le Task Scheduler Synology
- Détection des versions via GitHub API
- Fichier `.version` créé au build time

### 🔧 En cours
- [ ] Page Projets (ce qu'on fait maintenant!)
- [ ] Sync config depuis GitHub

## Architecture

```
lepoder-portal/
├── src/app/           # Next.js 14 App Router
├── prisma/            # SQLite + Prisma ORM
├── config/            # services.yaml
├── projects/          # Documentation projets (NEW)
└── scripts/           # update.sh, watch-update.sh
```

## Décisions techniques

| Date | Décision | Raison |
|------|----------|--------|
| 2026-02-23 | SQLite + volume Docker | Simplicité, backup facile |
| 2026-02-23 | GitHub API pour versions | .git non dispo dans container |
| 2026-02-24 | Dossier projects/ pour docs | Séparation claire par projet |

## TODO

- [ ] Finaliser page /projects
- [ ] API pour éditer les notes depuis Claw
- [ ] Sync automatique README depuis GitHub
- [ ] Dashboard avec overview de tous les projets

## Notes

- Déploiement sur Synology NAS via Docker Compose
- Accessible sur portal.lepoder.com
- Admin: sebastien@lepoder.com
