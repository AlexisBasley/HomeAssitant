# CLAUDE.md

Voir @README.md pour le contexte du projet et @server/package.json pour les dépendances.

## Commandes

```bash
cd server && npm start     # Démarre sur http://localhost:3000
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
