const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration de la cible (Ton serveur Minestrator)
const TARGET_URL = 'http://91.197.6.141:42037';

// Création du Proxy
const mapProxy = createProxyMiddleware({
    target: TARGET_URL,
    changeOrigin: true, // Crucial pour tromper le serveur Hytale
    ws: true,           // Crucial pour voir les joueurs bouger (WebSockets)
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        // On force la connexion à rester ouverte
        proxyReq.setHeader('Connection', 'keep-alive');
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        res.status(502).send('La carte Hytale est inaccessible (Serveur éteint ?)');
    }
});

// Le proxy gère TOUT le trafic du site
app.use('/', mapProxy);

// Démarrage
const server = app.listen(PORT, () => {
    console.log(`🚀 Proxy Hytale actif sur le port ${PORT}`);
    console.log(`🔗 Redirection vers : ${TARGET_URL}`);
});

// Gestion manuelle de l'upgrade WebSocket (Obligatoire pour Koyeb/Render)
server.on('upgrade', (req, socket, head) => {
    mapProxy.upgrade(req, socket, head);
});