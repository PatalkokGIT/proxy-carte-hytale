// ==========================================
// SPIRAL-BUDDIES: API GLOBAL (VOTE + CARTE + DISCORD)
// Hébergé sur Koyeb
// ==========================================

const { Client, GatewayIntentBits } = require("discord.js");
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration de la carte (Ton serveur Minestrator)
const MAP_TARGET_URL = 'http://91.197.6.141:42037';

// Création d'un middleware JSON spécifique
const jsonParser = express.json();

// --- SÉCURITÉ CORS ---
app.use(cors({
    origin: [
        'https://ht.spiral-buddies.fr',      
        'https://spiral-buddies.fr',         
        'https://www.spiral-buddies.fr',     
        'https://spiral-buddies.youbieflix.synology.me',
        'https://carte.spiral-buddies.fr'
    ],
    methods: ['GET', 'POST'],
    credentials: true 
}));

// ==========================================
// 🤖 MODULE DISCORD
// ==========================================

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
let cachedMessages = [];
let discordClient = null;

// Initialisation conditionnelle du bot
if (BOT_TOKEN && CHANNEL_ID) {
    discordClient = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
        ],
    });

    discordClient.once("ready", () => {
        console.log(`✅ [Discord] Connecté en tant que: ${discordClient.user.tag}`);
        fetchMessages();
        // Rafraichissement toutes les 10 minutes
        setInterval(fetchMessages, 10 * 60 * 1000);
    });

    discordClient.on("messageCreate", (message) => {
        if (message.channelId === CHANNEL_ID) {
            // Petit délai pour laisser le temps aux embeds/cache de se propager
            setTimeout(fetchMessages, 2000); 
        }
    });

    discordClient.login(BOT_TOKEN).catch(err => console.error("❌ [Discord] Erreur Login:", err));
} else {
    console.warn("⚠️ [Discord] Variables BOT_TOKEN ou CHANNEL_ID manquantes. Le module Discord est désactivé.");
}

// Fonction de récupération des messages (logique importée)
async function fetchMessages() {
    if (!discordClient) return;
    try {
        const channel = await discordClient.channels.fetch(CHANNEL_ID);
        if (!channel) return;

        const guild = channel.guild;
        const messages = await channel.messages.fetch({ limit: 5 });

        const processedMessages = await Promise.all(
            messages.map(async (m) => {
                // 1. Résolution des mentions Utilisateurs
                const userMentions = [];
                const mentionMatches = m.content.matchAll(/<@!?(\d+)>/g);
                for (const match of mentionMatches) {
                    const userId = match[1];
                    try {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        const user = member ? member.user : await discordClient.users.fetch(userId).catch(() => null);
                        
                        if (user) {
                            userMentions.push({
                                id: userId,
                                username: member ? member.displayName : user.username,
                                avatar: user.displayAvatarURL({ dynamic: true })
                            });
                        }
                    } catch (e) { /* ignore */ }
                }

                // 2. Résolution des mentions Salons
                const channelMentions = [];
                const channelMatches = m.content.matchAll(/<#(\d+)>/g);
                for (const match of channelMatches) {
                    const cId = match[1];
                    const ch = guild.channels.cache.get(cId);
                    if (ch) channelMentions.push({ id: cId, name: ch.name });
                }

                return {
                    id: m.id,
                    author: {
                        id: m.author.id,
                        username: m.author.username,
                        avatar: m.author.displayAvatarURL({ format: "png", size: 128 }),
                        bot: m.author.bot,
                    },
                    content: m.content,
                    timestamp: m.createdTimestamp,
                    date: new Date(m.createdTimestamp).toLocaleString("fr-FR", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    }),
                    mentions: userMentions, 
                    channel_mentions: channelMentions,
                    embeds: m.embeds.map((e) => ({
                        title: e.title,
                        description: e.description,
                        image: e.image?.url,
                        thumbnail: e.thumbnail?.url,
                        color: e.color,
                        url: e.url,
                    })),
                    attachments: m.attachments.map((a) => ({
                        url: a.url,
                        name: a.name,
                        contentType: a.contentType,
                    })),
                };
            })
        );
        cachedMessages = processedMessages.reverse();
        console.log(`✅ [Discord] ${cachedMessages.length} messages mis en cache.`);
    } catch (error) {
        console.error("❌ [Discord] Erreur fetchMessages:", error);
    }
}

// ==========================================
// 🔐 ROUTES API (DOIVENT ÊTRE AVANT LE PROXY)
// ==========================================

// 1. Route Discord
app.get("/api/messages", (req, res) => {
    res.json({
        success: true,
        messages: cachedMessages,
        lastUpdate: Date.now()
    });
});

// 2. Routes de Vote
app.get('/api/vote/check', jsonParser, async (req, res) => {
    const { site, user } = req.query;
    if (!site || !user) return res.status(400).json({ error: "Paramètres manquants" });

    try {
        let apiUrl = '';
        let method = 'GET';
        let headers = {};
        let body = null;
        
        switch (site) {
            case 'hytale-game':
                apiUrl = `https://hytale.game/wp-json/hytale-api/v1/check?username=${encodeURIComponent(user)}&secret_key=${process.env.HYTALE_GAME_SECRET}`;
                break;
            case 'hytale-servs':
                apiUrl = `https://hytale-servs.fr/api/v1/servers/vote-check?api_key=${process.env.HYTALE_SERVS_API_KEY}&player=${encodeURIComponent(user)}`;
                break;
            case 'top-serveurs':
                apiUrl = `https://api.top-serveurs.net/v1/votes/check?server_token=${process.env.TOP_SERVEURS_TOKEN}&playername=${encodeURIComponent(user)}`;
                break;
            case 'serveur-hytale-gg':
                 apiUrl = `https://serveur-hytale.gg/api/v1/votes/verify`;
                 method = 'POST';
                 headers = { 'Content-Type': 'application/json' };
                 body = JSON.stringify({ pseudo: user, server_id: parseInt(process.env.SERVEUR_HYTALE_GG_ID) });
                 break;
            case 'serveurhytale-fr':
                apiUrl = `https://www.ServeurHytale.fr/api/checkVote/${process.env.SERVEURHYTALE_FR_ID}/${encodeURIComponent(user)}`;
                break;
            default:
                return res.status(400).json({ error: "Site inconnu" });
        }

        const response = await fetch(apiUrl, { method, headers, body });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error(`Erreur Proxy Vote (${site}):`, error);
        res.status(500).json({ error: "Erreur vérification", details: error.message });
    }
});

app.post('/api/vote/claim', jsonParser, async (req, res) => {
    const { site, user, voteId } = req.query; 
    try {
        let url = '';
        let method = 'POST';
        let body = null;
        let headers = {};

        if (site === 'hytale-game') {
            url = `https://hytale.game/wp-json/hytale-api/v1/claim?vote_id=${voteId}&secret_key=${process.env.HYTALE_GAME_SECRET}`;
        } else if (site === 'hytale-servs') {
            url = `https://hytale-servs.fr/api/v1/servers/vote-claim?api_key=${process.env.HYTALE_SERVS_API_KEY}`;
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
// 🗺️ PROXY CARTE HYTALE (CATCH-ALL)
// ==========================================
// Ce proxy capture tout le reste ('/') donc il doit être EN DERNIER

const mapProxy = createProxyMiddleware({
    target: MAP_TARGET_URL,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('Connection', 'keep-alive');
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('X-Forwarded-Port', '443');
    },
    onProxyRes: (proxyRes, req, res) => {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        if (!res.headersSent) res.status(502).send('La carte Hytale est inaccessible');
    }
});

app.use('/', mapProxy);

// Démarrage Serveur
const server = app.listen(PORT, () => {
    console.log(`🚀 Serveur Unifié (Carte+Vote+Discord) actif sur le port ${PORT}`);
});

// Upgrade WebSocket manuel pour la carte
server.on('upgrade', (req, socket, head) => {
    mapProxy.upgrade(req, socket, head);
});
