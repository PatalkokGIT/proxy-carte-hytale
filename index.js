const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config(); // Pour tester en local avec un fichier .env

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration de la carte (Ton serveur Minestrator)
const MAP_TARGET_URL = 'http://91.197.6.141:42037';

// --- SÉCURITÉ CORS ---
// Autorise uniquement ton site web à utiliser cette API
app.use(cors({
    origin: ['https://ht.spiral-buddies.fr', 'http://127.0.0.1:5500'], // Ajoute tes domaines ici
    methods: ['GET', 'POST']
}));

// ==========================================
// 🔐 ZONE SÉCURISÉE - API DE VOTE
// C'est ici qu'on utilise les clés secrètes stockées sur Koyeb
// ==========================================

app.get('/api/vote/check', async (req, res) => {
    const { site, user } = req.query;

    if (!site || !user) {
        return res.status(400).json({ error: "Paramètres manquants (site ou user)" });
    }

    try {
        let apiUrl = '';
        let apiData = {};
        
        // Switch selon le site demandé par le frontend
        switch (site) {
            case 'hytale-game':
                // Utilise la variable d'environnement (Invisible pour le client)
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
                 // Pas de clé secrète critique ici, mais on centralise quand même
                 const ggId = process.env.SERVEUR_HYTALE_GG_ID;
                 apiUrl = `https://serveur-hytale.gg/api/v1/votes/status?pseudo=${encodeURIComponent(user)}&server_id=${ggId}`;
                 break;

            case 'serveurhytale-fr':
                const shId = process.env.SERVEURHYTALE_FR_ID;
                apiUrl = `https://www.ServeurHytale.fr/api/checkVote/${shId}/${encodeURIComponent(user)}`;
                break;

            default:
                return res.status(400).json({ error: "Site inconnu" });
        }

        // Exécution de la requête vers le site de vote (Côté Serveur)
        // Note: fetch est natif depuis Node 18+. Si erreur, utilise axios.
        const response = await fetch(apiUrl);
        const data = await response.json();

        // On renvoie la réponse propre au frontend
        res.json(data);

    } catch (error) {
        console.error(`Erreur Proxy Vote (${site}):`, error);
        res.status(500).json({ error: "Erreur lors de la vérification", details: error.message });
    }
});

// Endpoint pour CLAIM (Validation) - Uniquement pour Hytale.game et Servs
app.post('/api/vote/claim', async (req, res) => {
    const { site, user, voteId } = req.query; // On peut aussi utiliser req.body avec body-parser

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
        // On évite d'envoyer une réponse si les headers sont déjà partis
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
