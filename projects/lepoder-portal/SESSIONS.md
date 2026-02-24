# 💬 Sessions - LEPODER Portal

## 2026-02-24 - Page Projets

**Participants:** Seb, Claw  
**Durée:** ~1h  
**Tags:** #feature #documentation

### Résumé
Création d'une page Projets dans le portail pour organiser la documentation de chaque projet. Permet à Claw de maintenir des notes structurées accessibles via l'UI.

### Décisions
- Structure par projet dans `projects/{slug}/`
- Fichiers: CLAW-NOTES.md, CHANGELOG.md, SESSIONS.md
- Table Project en DB pour métadonnées
- API pour lecture/écriture des fichiers markdown

### Résultat
- [ ] Page /projects créée
- [ ] API fonctionnelle
- [ ] Premier projet documenté (lepoder-portal)

---

## 2026-02-23 - Self-Update System

**Participants:** Seb, Claw  
**Durée:** ~3h  
**Tags:** #feature #devops #synology

### Résumé
Mise en place d'un système de self-update pour le portail. Un bouton dans le panneau admin permet de déclencher une mise à jour qui sera exécutée par un cron job sur le Synology.

### Décisions
- Trigger file approach (pas de webhook)
- Script watch-update.sh toutes les 5 minutes
- Version stockée dans `.version` au build time
- GitHub API pour récupérer la dernière version

### Problèmes rencontrés
1. SSH non accessible depuis le sandbox Claw
2. Volume `./data:/data` manquant initialement
3. Rôle "ADMIN" vs "admin" (case sensitivity)
4. `.git` dans .dockerignore → version "unknown"

### Résultat
- ✅ Panneau visible pour admin
- ✅ Trigger file créé au clic
- ✅ Task Scheduler configuré
- ✅ Versions affichées correctement

---

## 2026-02-23 - Setup OpenClaw

**Participants:** Seb, Claw  
**Durée:** ~2h  
**Tags:** #setup #openclaw #whatsapp

### Résumé
Configuration initiale d'OpenClaw avec authentification Anthropic (setup-token) et canal WhatsApp.

### Décisions
- Setup-token comme ANTHROPIC_API_KEY (workaround pour le check de l'entrypoint)
- Volumes pour persistence: openclaw-data, openclaw-config
- WhatsApp connecté via QR code

### Résultat
- ✅ OpenClaw fonctionnel
- ✅ WhatsApp connecté (+16318382121)
- ✅ Webchat actif

---

_Maintenu par Claw 🦀_
