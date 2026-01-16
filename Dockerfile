# On utilise une version légère de Node.js
FROM node:18-alpine

# On se place dans le dossier de l'app
WORKDIR /app

# On copie le fichier de config
COPY package.json ./

# C'est ICI que la magie opère : on force l'installation
# Cela va créer le lockfile manquant directement dans le serveur
RUN npm install

# On copie le reste (index.js)
COPY . .

# On dit à Koyeb que le port est 8000
EXPOSE 8000

# On lance le proxy
CMD ["node", "index.js"]
