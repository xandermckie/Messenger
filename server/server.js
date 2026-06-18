// Music Messenger server: accounts + persistence + relay.
// Chat messages are end-to-end encrypted in the browser (AES-GCM, PBKDF2 room
// key). The server only ever sees ciphertext for chat — it relays, never reads.
// Music metadata (artists/genres/now-playing) IS server-visible on purpose:
// compatibility and recommendations are computed from it.

const { WebSocketServer } = require('ws');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'messenger.db');
const PORT = process.env.PORT || 3000;

// ---- storage ----
const db = new DatabaseSync(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  pwhash   TEXT NOT NULL,
  artists  TEXT NOT NULL DEFAULT '[]',
  genres   TEXT NOT NULL DEFAULT '[]'
)`);

// ---- auth (scrypt) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}
function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// ---- music similarity ----
const norm = (arr) => new Set((arr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
// Jaccard over the union of artists+genres. 0..100.
function compatibility(a, b) {
  const A = new Set([...norm(a.artists), ...norm(a.genres)]);
  const B = new Set([...norm(b.artists), ...norm(b.genres)]);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return Math.round((inter / union) * 100);
}
// Recommend artists liked by your most-compatible peers that you don't have yet,
// ranked by how often they show up among those peers.
function recommend(me, others) {
  const mine = norm([...(me.artists || []), ...(me.genres || [])]);
  const ranked = others
    .map((o) => ({ o, score: compatibility(me, o) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
  const counts = new Map();
  for (const { o } of ranked) {
    for (const artist of o.artists || []) {
      const k = artist.trim();
      if (k && !mine.has(k.toLowerCase())) counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
}

// ---- live connections ----
const clients = new Map(); // ws -> { username }

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }
function broadcast(obj, exclude) {
  const data = JSON.stringify(obj);
  for (const ws of clients.keys()) if (ws !== exclude) { try { ws.send(data); } catch {} }
}
function profileOf(username) {
  const row = db.prepare('SELECT artists, genres FROM users WHERE username = ?').get(username);
  return row ? { username, artists: JSON.parse(row.artists), genres: JSON.parse(row.genres) } : null;
}
function allOtherProfiles(username) {
  return db.prepare('SELECT username, artists, genres FROM users WHERE username != ?').all(username)
    .map((r) => ({ username: r.username, artists: JSON.parse(r.artists), genres: JSON.parse(r.genres) }));
}
// Push fresh compatibility + recommendations to one user.
function pushMatches(ws, username) {
  const me = profileOf(username);
  if (!me) return;
  const others = allOtherProfiles(username);
  const scores = {};
  for (const o of others) scores[o.username] = compatibility(me, o);
  send(ws, { type: 'matches', scores, recommendations: recommend(me, others) });
}

function handle(ws, msg) {
  const me = clients.get(ws);

  if (msg.type === 'register' || msg.type === 'login') {
    const username = String(msg.username || '').trim();
    const password = String(msg.password || '');
    if (!username || !password) return send(ws, { type: 'auth_error', error: 'Username and password required.' });

    const existing = db.prepare('SELECT pwhash FROM users WHERE username = ?').get(username);
    if (msg.type === 'register') {
      if (existing) return send(ws, { type: 'auth_error', error: 'Username taken.' });
      db.prepare('INSERT INTO users (username, pwhash) VALUES (?, ?)').run(username, hashPassword(password));
    } else {
      if (!existing || !verifyPassword(password, existing.pwhash))
        return send(ws, { type: 'auth_error', error: 'Invalid username or password.' });
    }
    clients.set(ws, { username });
    const p = profileOf(username);
    send(ws, { type: 'auth_ok', username, artists: p.artists, genres: p.genres });
    broadcast({ type: 'user_joined', user: username }, ws);
    pushMatches(ws, username);
    return;
  }

  if (!me) return send(ws, { type: 'auth_error', error: 'Not logged in.' });

  switch (msg.type) {
    case 'profile': {
      const artists = (Array.isArray(msg.artists) ? msg.artists : []).map(String).slice(0, 50);
      const genres = (Array.isArray(msg.genres) ? msg.genres : []).map(String).slice(0, 50);
      db.prepare('UPDATE users SET artists = ?, genres = ? WHERE username = ?')
        .run(JSON.stringify(artists), JSON.stringify(genres), me.username);
      // Recompute matches for everyone — someone's taste changed.
      for (const [c, info] of clients) pushMatches(c, info.username);
      break;
    }
    case 'msg':
      // Encrypted payload {iv, ct}. Server cannot read it — just relay with sender.
      broadcast({ type: 'msg', user: me.username, iv: msg.iv, ct: msg.ct });
      break;
    case 'now_playing':
      broadcast({ type: 'now_playing', user: me.username, song: String(msg.song || ''), artist: String(msg.artist || '') });
      break;
    case 'share_song':
      broadcast({ type: 'shared_song', user: me.username, song: String(msg.song || ''),
                  artist: String(msg.artist || ''), url: String(msg.url || '') });
      break;
  }
}

function start() {
  const certDir = __dirname;
  const keyFile = path.join(certDir, 'key.pem');
  const certFile = path.join(certDir, 'cert.pem');
  let wss;
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    const httpsServer = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) });
    wss = new WebSocketServer({ server: httpsServer });
    httpsServer.listen(PORT, () => console.log(`🎵 Music Messenger (wss/TLS) on port ${PORT}`));
  } else {
    wss = new WebSocketServer({ port: PORT });
    console.log(`🎵 Music Messenger (ws, no TLS) on port ${PORT} — add key.pem/cert.pem for wss.`);
  }

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data); } catch { return; }
      try { handle(ws, msg); } catch (e) { console.error('handler error:', e.message); }
    });
    ws.on('close', () => {
      const info = clients.get(ws);
      clients.delete(ws);
      if (info) broadcast({ type: 'user_left', user: info.username });
    });
  });
}

// ---- self-check: node server.js --selftest ----
function selftest() {
  const assert = require('node:assert');
  const stored = hashPassword('hunter2');
  assert.ok(verifyPassword('hunter2', stored), 'password verify roundtrip');
  assert.ok(!verifyPassword('wrong', stored), 'wrong password rejected');
  const a = { artists: ['Radiohead', 'Bjork'], genres: ['rock'] };
  const b = { artists: ['Radiohead', 'Bjork'], genres: ['rock'] };
  const c = { artists: ['Drake'], genres: ['rap'] };
  assert.strictEqual(compatibility(a, b), 100, 'identical taste = 100');
  assert.strictEqual(compatibility(a, c), 0, 'no overlap = 0');
  assert.ok(compatibility(a, { artists: ['Radiohead'], genres: [] }) > 0, 'partial overlap > 0');
  const recs = recommend({ artists: ['Radiohead'], genres: ['rock'] },
    [{ username: 'x', artists: ['Radiohead', 'Bjork'], genres: ['rock'] }]);
  assert.deepStrictEqual(recs, ['Bjork'], 'recommends a peer artist you lack');
  console.log('selftest OK');
}

if (process.argv.includes('--selftest')) selftest();
else start();
