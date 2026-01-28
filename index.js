const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration de la carte (Ton serveur Minestrator)
const MAP_TARGET_URL = 'http://91.197.6.141:42037';

// Création d'un middleware JSON spécifique pour ne pas gêner le proxy carte
const jsonParser = express.json();

// --- SÉCURITÉ CORS ---
app.use(cors({
    origin: [
        'https://ht.spiral-buddies.fr',      
        'https://spiral-buddies.fr',         
        'https://www.spiral-buddies.fr',     
        'https://spiral-buddies.youbieflix.synology.me',
        'https://carte.spiral-buddies.fr' // Ajout de sécurité si accès direct
    ],
    methods: ['GET', 'POST'],
    credentials: true 
}));

// ==========================================
// 🔐 ZONE SÉCURISÉE - API DE VOTE
// ==========================================

// NOTE: J'ai ajouté 'jsonParser' comme second argument ici. 
// Cela permet de ne parser le JSON QUE pour cette route, pas pour la map.
app.get('/api/vote/check', jsonParser, async (req, res) => {
    const { site, user } = req.query;

    if (!site || !user) {
        return res.status(400).json({ error: "Paramètres manquants (site ou user)" });
    }

    try {
        let apiUrl = '';
        let method = 'GET';
        let headers = {};
        let body = null;
        
        switch (site) {
            case 'hytale-game':
                const hgKey = process.env.HYTALE_GAME_SECRET; 
                apiUrl = `https://hytale.game/wp-json/hytale-api/v1/check?username=${encodeURIComponent(user)}&secret_key=${hgKey}`;
                break;

            case 'hytale-servs':
                const hsKey = process.env.HYTALE_SERVS_API_KEY;
                apiUrl = `https://hytale-servs.fr/api/v1/servers/vote-check?api_key=${hsKey}&player=${encodeURIComponent(user)}`;
                break;

            case 'top-serveurs':
                const tsToken = process.env.TOP_SERVEURS_TOKEN;
                apiUrl = `https://api.top-serveurs.net/v1/votes/check?server_token=${tsToken}&playername=${encodeURIComponent(user)}`;
                break;
            
            case 'serveur-hytale-gg':
                 const ggId = process.env.SERVEUR_HYTALE_GG_ID;
                 apiUrl = `https://serveur-hytale.gg/api/v1/votes/verify`;
                 method = 'POST';
                 headers = { 'Content-Type': 'application/json' };
                 body = JSON.stringify({
                     pseudo: user,
                     server_id: parseInt(ggId)
                 });
                 break;

            case 'serveurhytale-fr':
                const shId = process.env.SERVEURHYTALE_FR_ID;
                apiUrl = `https://www.ServeurHytale.fr/api/checkVote/${shId}/${encodeURIComponent(user)}`;
                break;

            default:
                return res.status(400).json({ error: "Site inconnu" });
        }

        const response = await fetch(apiUrl, { method, headers, body });
        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error(`Erreur Proxy Vote (${site}):`, error);
        res.status(500).json({ error: "Erreur lors de la vérification", details: error.message });
    }
});

// Idem ici, on ajoute jsonParser uniquement pour cette route
app.post('/api/vote/claim', jsonParser, async (req, res) => {
    const { site, user, voteId } = req.query; 

    try {
        let url = '';
        let method = 'POST';
        let body = null;
        let headers = {};

        if (site === 'hytale-game') {
            const hgKey = process.env.HYTALE_GAME_SECRET;
            url = `https://hytale.game/wp-json/hytale-api/v1/claim?vote_id=${voteId}&secret_key=${hgKey}`;
        } 
        else if (site === 'hytale-servs') {
            const hsKey = process.env.HYTALE_SERVS_API_KEY;
            url = `https://hytale-servs.fr/api/v1/servers/vote-claim?api_key=${hsKey}`;
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({ player: user });
        }

        const response = await fetch(url, { method, headers, body });
        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error(`Erreur Claim (${site}):`, error);
        res.status(500).json({ error: "Erreur validation" });
    }
});


// ==========================================
// 🗺️ PROXY CARTE HYTALE
// ==========================================

const mapProxy = createProxyMiddleware({
    target: MAP_TARGET_URL,
    changeOrigin: true, // Important pour le vhost
    ws: true, // Websocket pour les positions
    logLevel: 'debug',
    
    // Modification critique pour les images et HTTPS
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('Connection', 'keep-alive');
        // On dit au backend que l'utilisateur vient de HTTPS
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('X-Forwarded-Port', '443');
    },
    
    // Gestion des réponses pour éviter les problèmes de compression
    onProxyRes: (proxyRes, req, res) => {
        // Optionnel : Si vous avez des soucis de CORS sur les images spécifiquement
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },

    onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        // Eviter de crasher si les headers sont déjà envoyés
        if (!res.headersSent) {
            res.status(502).send('La carte Hytale est inaccessible');
        }
    }
});

// Le proxy gère tout le reste (fichiers statiques, images tiles, websocket)
app.use('/', mapProxy);

// Démarrage
const server = app.listen(PORT, () => {
    console.log(`🚀 Serveur Koyeb actif sur le port ${PORT}`);
});

// Upgrade WebSocket manuel
server.on('upgrade', (req, socket, head) => {
    mapProxy.upgrade(req, socket, head);
});

