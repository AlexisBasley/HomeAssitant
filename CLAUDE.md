# CLAUDE.md

Voir @README.md pour le contexte du projet et @server/package.json pour les dépendances.

## Architecture globale

```
Utilisateurs : Telegram (partout) + Dashboard tablette (salle à manger)
       │
       ▼
Mac Mini M4 (cœur) :
  ├─ OpenClaw (IA permanente, raisonnement)
  ├─ Express + Dashboard (ce repo)
  ├─ gog CLI → Google (Gmail, Calendar, Tasks)
  └─ Skill Tuya → Garage
       │
       ▼
Services cloud : Google, Tuya API, wttr.in (météo sans clé)
       │
       ▼
Domotique : Garage (Tuya) ✅ | Netatmo, Caméras (apps) ⏳ | Alarme/Vidéo IA (phase 2)
```

**Ce repo = Dashboard + API Express uniquement.** OpenClaw, Telegram, Tuya skill → gérés ailleurs.

## Commandes

```bash
cd server && npm start     # Démarre sur http://localhost:3000
docker compose up -d       # Alternative Docker
```

## Style de code

- ES Modules (`import/export`), jamais CommonJS
- Vanilla JS uniquement - JAMAIS de frameworks (React, Vue, jQuery)
- Commentaires en français

## Google CLI (gog)

```bash
# Toujours utiliser --json --no-input
gog --account $GOG_ACCOUNT calendar events primary --from ISO --to ISO --json --no-input
gog --account $GOG_ACCOUNT tasks list @default --json --no-input
```

## Workflow

- IMPORTANT : Demander avant d'ajouter une dépendance npm
- IMPORTANT : Ne pas modifier .env sans prévenir
- Interface tablette : gros boutons, touch-friendly
- Tester le serveur après chaque modification backend
