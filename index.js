const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration de la carte (Ton serveur Minestrator)
const MAP_TARGET_URL = 'http://91.197.6.141:42037';

// --- SÉCURITÉ CORS ---
app.use(cors({
    origin: [
        'https://ht.spiral-buddies.fr',      
        'https://spiral-buddies.fr',         
        'https://www.spiral-buddies.fr',     
        'https://spiral-buddies.youbieflix.synology.me'           
    ],
    methods: ['GET', 'POST'],
    credentials: true 
}));

// Pour pouvoir lire le JSON dans les requêtes POST entrantes (sécurité)
app.use(express.json());

// ==========================================
// 🔐 ZONE SÉCURISÉE - API DE VOTE
// ==========================================

app.get('/api/vote/check', async (req, res) => {
    const { site, user } = req.query;

    if (!site || !user) {
        return res.status(400).json({ error: "Paramètres manquants (site ou user)" });
    }

    try {
        let apiUrl = '';
        let method = 'GET'; // Par défaut
        let headers = {};
        let body = null;
        
        // Switch selon le site demandé par le frontend
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
                 // === CORRECTION MAJEURE ICI ===
                 // On passe en méthode POST sur /verify pour obtenir le timestamp (vote_time)
                 // Nécessaire pour le compte à rebours précis.
                 const ggId = process.env.SERVEUR_HYTALE_GG_ID;
                 apiUrl = `https://serveur-hytale.gg/api/v1/votes/verify`;
                 method = 'POST';
                 headers = { 'Content-Type': 'application/json' };
                 // On envoie le body requis par leur API "Options avancées"
                 body = JSON.stringify({
                     pseudo: user,
                     server_id: parseInt(ggId) // Conversion en entier par sécurité
                 });
                 break;

            case 'serveurhytale-fr':
                const shId = process.env.SERVEURHYTALE_FR_ID;
                apiUrl = `https://www.ServeurHytale.fr/api/checkVote/${shId}/${encodeURIComponent(user)}`;
                break;

            default:
                return res.status(400).json({ error: "Site inconnu" });
        }

        // Exécution de la requête vers le site de vote
        // On passe method, headers et body (qui sont null/vide pour les GET, remplis pour le POST)
        const response = await fetch(apiUrl, { method, headers, body });
        const data = await response.json();

        // On renvoie la réponse au frontend
        res.json(data);

    } catch (error) {
        console.error(`Erreur Proxy Vote (${site}):`, error);
        res.status(500).json({ error: "Erreur lors de la vérification", details: error.message });
    }
});

// Endpoint pour CLAIM (Validation) - Uniquement pour Hytale.game et Servs
app.post('/api/vote/claim', async (req, res) => {
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
// (Doit être en dernier pour ne pas bloquer l'API)
// ==========================================

const mapProxy = createProxyMiddleware({
    target: MAP_TARGET_URL,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('Connection', 'keep-alive');
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        if (!res.headersSent) {
            res.status(502).send('La carte Hytale est inaccessible');
        }
    }
});

// Le proxy gère tout ce qui n'est PAS /api/vote
app.use('/', mapProxy);

// Démarrage
const server = app.listen(PORT, () => {
    console.log(`🚀 Serveur Koyeb actif sur le port ${PORT}`);
});

// Upgrade WebSocket manuel
server.on('upgrade', (req, socket, head) => {
    mapProxy.upgrade(req, socket, head);
});
