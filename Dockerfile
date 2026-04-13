FROM node:20-alpine

WORKDIR /app

# Copie les fichiers de dépendances
COPY server/package*.json ./server/

# Installe les dépendances
WORKDIR /app/server
RUN npm install

# Copie le reste du projet
WORKDIR /app
COPY . .

WORKDIR /app/server

EXPOSE 3000

CMD ["npm", "start"]
