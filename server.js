/**
 * Konkan Proxy Server - Render.com Free Deployment
 * ================================================
 * Free gems + All shop items unlocked + All skins free
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: '*/*' }));

const TARGET = 'https://kwvpupgojslkofjvpyad.supabase.co';
const PORT = process.env.PORT || 10000;

const MOD = {
  gems: 999999,
  allFree: true,
  allSkins: true,
  crownGem: true
};

function log(m) { console.log(`[proxy] ${m}`); }
function logMod(m) { console.log(`[MOD] ⚡ ${m}`); }

function modifyJSON(data, url) {
  if (!data || typeof data !== 'object') return data;
  let mod = false;

  if (Array.isArray(data)) {
    data = data.map(item => {
      const n = { ...item };
      if (MOD.allFree && n.price_gems !== undefined) {
        n.price_gems = 0;
        n.is_purchasable = true;
        mod = true;
      }
      if (MOD.allSkins && (n.type === 'tile_skin' || n.type === 'rack_skin' || n.type === 'table_skin' || n.tile_skin || n.rack_skin || n.table_skin)) {
        n.purchased = true;
        n.owned = true;
        n.unlocked = true;
        mod = true;
      }
      if (MOD.allFree && n.bundle_id) {
        n.price_gems = 0;
        n.is_purchasable = true;
        mod = true;
      }
      return n;
    });
  } else {
    if (data.gems !== undefined) {
      data.gems = MOD.gems;
      mod = true;
      logMod(`gems → ${MOD.gems}`);
    }
    if (data.crownGem !== undefined && MOD.crownGem) {
      data.crownGem = MOD.gems;
      mod = true;
    }
    if (MOD.allSkins && (data.tile_skin || data.rack_skin || data.table_skin)) {
      data.owned = true;
      data.unlocked = true;
      mod = true;
    }
    if (MOD.allFree && data.is_purchasable !== undefined) {
      data.is_purchasable = true;
      mod = true;
    }
    if (data.purchased !== undefined) {
      data.purchased = true;
      mod = true;
    }
    if (data.bundle_id && MOD.allFree) {
      data.price_gems = 0;
      mod = true;
    }
  }
  if (mod) logMod(`modified: ${url}`);
  return data;
}

function proxySetup(pathLabel, onExtra) {
  return createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
      proxyReq: (proxyReq, req) => {
        log(`${req.method} /${pathLabel}${req.url}`);
        // Copy headers
        if (req.headers.authorization) {
          proxyReq.setHeader('Authorization', req.headers.authorization);
        }
        if (req.headers.apikey) {
          proxyReq.setHeader('apikey', req.headers.apikey);
        }
        if (req.headers['content-type']) {
          proxyReq.setHeader('Content-Type', req.headers['content-type']);
        }
        if (req.headers['x-supabase-api-version']) {
          proxyReq.setHeader('x-supabase-api-version', req.headers['x-supabase-api-version']);
        }
        if (req.body && req.method !== 'GET' && typeof req.body === 'string' && req.body.length > 0) {
          proxyReq.setHeader('Content-Length', Buffer.byteLength(req.body));
          proxyReq.write(req.body);
          proxyReq.end();
        }
        if (onExtra) onExtra(req, proxyReq);
      },
      proxyRes: (proxyRes, req, res) => {
        let body = [];
        proxyRes.on('data', chunk => body.push(chunk));
        proxyRes.on('end', () => {
          const buf = Buffer.concat(body);
          try {
            const ct = proxyRes.headers['content-type'] || '';
            if (ct.includes('json')) {
              let data = JSON.parse(buf.toString());
              data = modifyJSON(data, req.url);
              
              // Force purchase success
              if (MOD.allFree && (req.url.includes('buy_item') || req.url.includes('buy_bundle'))) {
                if (data.error) {
                  data = { success: true, purchased: true };
                  logMod(`force purchase OK: ${req.url}`);
                }
              }
              
              const newBuf = Buffer.from(JSON.stringify(data));
              res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, 'content-length': newBuf.length });
              res.end(newBuf);
            } else {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              res.end(buf);
            }
          } catch (e) {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            res.end(buf);
          }
        });
      },
      error: (err, req, res) => {
        console.error(`[${pathLabel}] ERROR:`, err.message);
        if (!res.headersSent) res.status(502).json({ error: err.message });
      }
    }
  });
}

// Auth
app.use('/auth/v1', proxySetup('auth', (req, proxyReq) => {
  // On login, inject gems into user_metadata
}));
app.use('/auth/v1r', proxySetup('auth'));

// REST - database queries
app.use('/rest/v1', proxySetup('rest'));
app.use('/rest/v1r', proxySetup('rest'));

// Storage - pass through
app.use('/storage/v1', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      log(`GET /storage${req.url}`);
      if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
    }
  },
  error: (err, req, res) => {
    console.error('[storage] ERROR:', err.message);
    if (!res.headersSent) res.status(502).send('proxy error');
  }
}));

// Functions - RPC calls (buy_item_with_gems, etc.)
app.use('/functions/v1', proxySetup('functions'));

// Realtime - WebSocket passthrough
app.use('/realtime/v1', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err, req, res) => console.error('[realtime] ERROR:', err.message)
  }
}));

app.get('/', (req, res) => res.json({ status: 'running', mods: MOD, target: TARGET }));

app.listen(PORT, () => {
  console.log('');
  console.log('🎮 Konkan Proxy Running on port ' + PORT);
  console.log('⚡ Gems: UNLIMITED | Shop: FREE | Skins: UNLOCKED');
  console.log('');
});
