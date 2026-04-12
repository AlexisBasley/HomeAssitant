# HomeAssitant

Dashboard familial affiché en permanence sur une tablette Android (salle à manger).  
Cerveau IA : **OpenClaw**, installé sur Mac Mini M4 24 Go.

## Stack

- **Serveur** : Node.js + Express (ESM)
- **Dashboard** : Vanilla HTML/CSS/JS
- **Google** : via `gog` CLI (déjà authentifié)
- **Domotique** : Tuya API (garage — à connecter)

## Structure

```
HomeAssitant/
├── server/
│   ├── index.js          # Serveur Express
│   ├── package.json
│   └── .env.example
└── dashboard/
    └── index.html        # Dashboard tablette
```

## Installation

```bash
cd server
npm install
cp .env.example .env
# Éditer .env avec votre adresse Gmail
npm start
```

Accès tablette : `http://<IP-Mac-Mini>:3000`

## Endpoints API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/events?days=7` | Événements Google Calendar |
| POST | `/api/events` | Créer un événement |
| DELETE | `/api/events/:id` | Supprimer un événement |
| GET | `/api/tasks` | Liste des tâches |
| POST | `/api/tasks` | Créer une tâche |
| PATCH | `/api/tasks/:id/complete` | Cocher une tâche |
| DELETE | `/api/tasks/:id` | Supprimer une tâche |
