// Music Messenger client.
// Chat is end-to-end encrypted with AES-GCM. The key is derived in-browser from
// the room passphrase via PBKDF2 — the passphrase never leaves this page.
class MusicMessenger {
  constructor() {
    this.ws = null;
    this.currentUser = null;
    this.cryptoKey = null;   // AES-GCM key derived from room passphrase
    this.pendingAuth = null; // {type, username, password}
    this.bind();
  }

  bind() {
    const $ = (id) => document.getElementById(id);
    $('loginBtn').onclick = () => this.auth('login');
    $('registerBtn').onclick = () => this.auth('register');
    $('passwordInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.auth('login'); });
    $('sendBtn').onclick = () => this.sendMessage();
    $('messageInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
    $('saveProfileBtn').onclick = () => this.saveProfile();
    $('setNowPlayingBtn').onclick = () => this.setNowPlaying();
    $('shareCurrentSongBtn').onclick = () => this.shareCurrentSong();
  }

  // ---- crypto: derive AES key from room passphrase (PBKDF2) ----
  async deriveKey(passphrase) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    // Fixed salt so everyone with the same passphrase derives the same key.
    // ponytail: shared static salt is fine for a shared-room key; per-user salts
    // would defeat the point. Upgrade path is per-recipient keypairs (chosen out).
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('music-messenger-room-v1'), iterations: 100000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async encrypt(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.cryptoKey, new TextEncoder().encode(text));
    return { iv: this.b64(iv), ct: this.b64(new Uint8Array(ct)) };
  }
  async decrypt(ivB64, ctB64) {
    const iv = this.unb64(ivB64), ct = this.unb64(ctB64);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.cryptoKey, ct);
    return new TextDecoder().decode(pt);
  }
  b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
  unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

  // ---- auth ----
  async auth(kind) {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const room = document.getElementById('roomKeyInput').value;
    if (!username || !password) return this.authError('Username and password required.');
    if (!room) return this.authError('Room passphrase required (it encrypts chat).');

    this.cryptoKey = await this.deriveKey(room);
    this.pendingAuth = { type: kind, username, password };
    this.connect();
  }
  authError(msg) { document.getElementById('authError').textContent = msg; }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.hostname || 'localhost'}:3000`);
    this.ws.onopen = () => this.ws.send(JSON.stringify(this.pendingAuth));
    this.ws.onmessage = (e) => { try { this.onServer(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    this.ws.onclose = () => this.system('Disconnected from server');
    this.ws.onerror = () => this.authError('Could not reach server. Is it running?');
  }

  onServer(d) {
    switch (d.type) {
      case 'auth_ok':
        this.currentUser = d.username;
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('currentUserDisplay').textContent = d.username;
        document.getElementById('artistsInput').value = (d.artists || []).join(', ');
        document.getElementById('genresInput').value = (d.genres || []).join(', ');
        this.system(`Logged in as ${d.username}.`);
        break;
      case 'auth_error': this.authError(d.error); break;
      case 'user_joined': this.system(`🎉 ${d.user} joined`); break;
      case 'user_left': this.system(`👋 ${d.user} left`); break;
      case 'msg': this.onEncryptedMsg(d.user, d.iv, d.ct); break;
      case 'now_playing': this.updateNowPlaying(d.user, d.song, d.artist); break;
      case 'shared_song': this.addSharedSong(d.user, d.song, d.artist, d.url); break;
      case 'matches': this.updateMatches(d.scores, d.recommendations); break;
    }
  }

  // ---- profile / music ----
  saveProfile() {
    const parse = (id) => document.getElementById(id).value.split(',').map((s) => s.trim()).filter(Boolean);
    this.ws.send(JSON.stringify({ type: 'profile', artists: parse('artistsInput'), genres: parse('genresInput') }));
    this.system('Taste saved — matches updated.');
  }
  setNowPlaying() {
    const v = document.getElementById('nowPlayingInput').value.trim();
    if (!v) return;
    const [song, artist] = v.split('—').map((s) => s.trim());
    this.ws.send(JSON.stringify({ type: 'now_playing', song: song || v, artist: artist || '' }));
    document.getElementById('nowPlayingInput').value = '';
  }
  shareCurrentSong() {
    const v = document.getElementById('nowPlayingInput').value.trim() ||
              prompt('Share a song as "Song — Artist":');
    if (!v) return;
    const [song, artist] = v.split('—').map((s) => s.trim());
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(`${song} ${artist || ''} listen`);
    this.ws.send(JSON.stringify({ type: 'share_song', song: song || v, artist: artist || '', url }));
  }

  // ---- chat ----
  async sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const { iv, ct } = await this.encrypt(content);
    this.ws.send(JSON.stringify({ type: 'msg', iv, ct }));
    input.value = '';
    // Our own message echoes back via broadcast; nothing else to do.
  }
  async onEncryptedMsg(user, iv, ct) {
    let text;
    try { text = await this.decrypt(iv, ct); }
    catch { text = '🔒 [encrypted — wrong room passphrase]'; }
    this.addMessage(user, text, user === this.currentUser);
  }

  // ---- rendering ----
  el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  push(node) {
    const m = document.getElementById('messages');
    m.appendChild(node); m.scrollTop = m.scrollHeight;
  }
  addMessage(user, content, isOwn = false) {
    this.push(this.el(
      `<div class="message ${isOwn ? 'own-message' : ''}">
         <div class="message-user"></div>
         <div class="message-content"></div>
         <div class="message-time">${new Date().toLocaleTimeString()}</div>
       </div>`));
    const last = document.getElementById('messages').lastElementChild;
    last.querySelector('.message-user').textContent = user;
    last.querySelector('.message-content').textContent = content;
  }
  system(content) {
    const node = this.el('<div class="message system-message"><div class="message-content"></div></div>');
    node.querySelector('.message-content').textContent = content;
    this.push(node);
  }
  addSharedSong(user, song, artist, url) {
    const node = this.el(
      `<div class="message shared-song-message">
         <div class="message-user"></div>
         <div class="shared-song">
           <div class="song-title"></div>
           <div class="song-artist"></div>
           <a target="_blank" class="song-link">🎧 Listen</a>
         </div>
         <div class="message-time">${new Date().toLocaleTimeString()}</div>
       </div>`);
    node.querySelector('.message-user').textContent = `${user} 🎵 shared a song`;
    node.querySelector('.song-title').textContent = song;
    node.querySelector('.song-artist').textContent = artist ? `by ${artist}` : '';
    node.querySelector('.song-link').href = url;
    this.push(node);
  }
  updateNowPlaying(user, song, artist) {
    const id = 'np-' + encodeURIComponent(user);
    let item = document.getElementById(id);
    if (!item) {
      item = this.el('<div class="now-playing-item"></div>');
      item.id = id;
      document.getElementById('nowPlayingList').appendChild(item);
    }
    item.innerHTML = '<div class="now-playing-user"></div><div class="now-playing-song"></div><div class="now-playing-artist"></div>';
    item.querySelector('.now-playing-user').textContent = user;
    item.querySelector('.now-playing-song').textContent = song;
    item.querySelector('.now-playing-artist').textContent = artist;
  }
  updateMatches(scores, recommendations) {
    const box = document.getElementById('compatibilityScores');
    box.innerHTML = '<h4>Music Compatibility</h4>';
    const entries = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
    if (!entries.length) box.appendChild(this.el('<div class="compatibility-item"><div>No other users yet</div></div>'));
    for (const [user, score] of entries) {
      const item = this.el('<div class="compatibility-item"><div class="compatibility-user"></div><div class="compatibility-score"></div></div>');
      item.querySelector('.compatibility-user').textContent = user;
      item.querySelector('.compatibility-score').textContent = `${score}% match`;
      box.appendChild(item);
    }
    const rec = document.getElementById('recommendations');
    rec.innerHTML = '<h4>Recommended for you</h4>';
    if (!(recommendations || []).length) rec.appendChild(this.el('<div class="compatibility-item"><div>—</div></div>'));
    for (const artist of recommendations || []) {
      const item = this.el('<div class="compatibility-item"><div></div></div>');
      item.firstElementChild.textContent = `🎵 ${artist}`;
      rec.appendChild(item);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new MusicMessenger(); });
