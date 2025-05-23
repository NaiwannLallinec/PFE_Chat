# Utiliser une image Node officielle
FROM node:18

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste des fichiers de l’application
COPY . .

# Exposer le port (à adapter selon l'app)
EXPOSE 3001

# Lancer l'application
CMD ["npm", "start"]
