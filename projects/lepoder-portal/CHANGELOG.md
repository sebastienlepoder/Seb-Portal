# 📝 Changelog - LEPODER Portal

## [2026-02-24]

### Added
- 🆕 Page Projets pour suivre la documentation
- 🆕 Table `Project` et `ProjectSession` en DB

### Fixed
- 🐛 Vérification admin case-insensitive
- 🐛 Version "unknown" → fichier .version au build

## [2026-02-23]

### Added
- ✨ Self-update system depuis le panneau admin
- ✨ Script `watch-update.sh` pour Task Scheduler
- ✨ API `/api/admin/update` (GET/POST)
- ✨ Composant `UpdatePanel`
- ✨ Volume `./data:/data` pour trigger files

### Changed
- 📦 Dockerfile: création de `.version` au build
- 📦 API update: utilise GitHub API au lieu de git

## [2026-02-22]

### Added
- 🔐 Session cookie secure configurable
- 🏥 Endpoint `/api/health` public pour Docker healthcheck

---

_Généré et maintenu par Claw 🦀_
