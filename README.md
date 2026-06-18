# Music Messenger 🎵

A small, secure chat app for meeting people with similar music taste. Real
accounts, end-to-end encrypted chat, and music compatibility/recommendations
computed from what people actually listen to.

## Run

```bash
cd server
npm install
npm start          # ws on port 3000 (no TLS)
```

Then open `client/index.html` in a browser. Register a username + password and a
**room passphrase**, set your top artists/genres, and chat.

`npm test` runs the crypto + compatibility self-check.

## How it works

- **Accounts** — username + scrypt-hashed password, persisted in SQLite
  (`server/messenger.db`, via Node's built-in `node:sqlite`).
- **Encryption** — chat messages are AES-GCM encrypted in the browser. The key
  is derived from the room passphrase with PBKDF2; the passphrase never leaves
  your browser, so the server relays ciphertext it cannot read. Everyone using
  the same room passphrase can read each other.
- **Compatibility** — Jaccard similarity over each user's artists + genres.
- **Recommendations** — artists liked by your most-compatible peers that you
  don't already list.

### TLS

Drop `key.pem` and `cert.pem` into `server/` and the server upgrades to `wss`
automatically. For local testing:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout server/key.pem -out server/cert.pem -days 365 -subj "/CN=localhost"
```

## Not built (on purpose)

- **Listen-together (synced playback)** — needs real Spotify/Apple Music player
  SDK + OAuth; large feature, deferred.
- **Now-playing is manual** — you type the song. Auto-detection needs a streaming
  service OAuth integration.
- Music metadata (artists/genres/now-playing) is intentionally server-visible —
  it has to be for compatibility/recommendations. Only *chat* is end-to-end encrypted.
