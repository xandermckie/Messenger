class MusicMessenger {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.spotifyConnected = false;
        this.nowPlayingInterval = null;
        
        this.initializeEventListeners();
        this.showLoginForm();
    }

    initializeEventListeners() {
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
        document.getElementById('connectSpotifyBtn').addEventListener('click', () => this.connectSpotify());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('shareCurrentSongBtn').addEventListener('click', () => this.shareCurrentSong());
    }

    showLoginForm() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
    }

    hideLoginForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('currentUserDisplay').textContent = this.currentUser;
    }

    handleLogin() {
        const username = document.getElementById('usernameInput').value.trim();
        if (username) {
            this.currentUser = username;
            this.hideLoginForm();
            this.connectToServer();
            this.addSystemMessage(`Welcome, ${username}! Connect Spotify to share your music.`);
        }
    }

    connectToServer() {
        try {
            this.ws = new WebSocket('ws://localhost:3000');
            
            this.ws.onopen = () => {
                this.addSystemMessage('Connected to server!');
                this.ws.send(JSON.stringify({
                    type: 'login',
                    username: this.currentUser
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            };

            this.ws.onerror = (error) => {
                this.addSystemMessage('Connection error');
            };

            this.ws.onclose = () => {
                this.addSystemMessage('Disconnected from server');
                if (this.nowPlayingInterval) {
                    clearInterval(this.nowPlayingInterval);
                }
            };

        } catch (error) {
            this.addSystemMessage('Failed to connect: ' + error);
        }
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'system':
                this.addSystemMessage(data.content);
                break;
            case 'message':
                this.addMessage(data.user, data.content);
                break;
            case 'user_joined':
                this.addSystemMessage(`🎉 ${data.user} joined the chat`);
                break;
            case 'user_left':
                this.addSystemMessage(`👋 ${data.user} left the chat`);
                break;
            case 'now_playing':
                this.updateNowPlaying(data.user, data.song, data.artist);
                break;
            case 'shared_song':
                this.addSharedSong(data.user, data.song, data.artist, data.url);
                break;
            case 'compatibility_update':
                this.updateCompatibility(data.user, data.compatibility);
                break;
        }
    }

    // Mock Spotify Integration (Replace with real Spotify Web API)
    connectSpotify() {
        this.addSystemMessage('🎵 Connecting to Spotify... (Mock Implementation)');
        
        // Simulate API connection delay
        setTimeout(() => {
            this.spotifyConnected = true;
            document.getElementById('spotifyStatus').textContent = 'Connected 🎵';
            document.getElementById('connectSpotifyBtn').style.display = 'none';
            this.addSystemMessage('Spotify connected! Your music will be shared with friends.');
            
            // Start monitoring "now playing"
            this.startNowPlayingUpdates();
            
            // Mock user's top artists
            this.ws.send(JSON.stringify({
                type: 'music_profile',
                top_artists: ['Taylor Swift', 'The Weeknd', 'Dua Lipa', 'Kendrick Lamar']
            }));
            
        }, 1500);
    }

    startNowPlayingUpdates() {
        // Mock now playing updates - replace with real Spotify Web API polling
        this.nowPlayingInterval = setInterval(() => {
            const mockSongs = [
                {song: "Blinding Lights", artist: "The Weeknd"},
                {song: "Cruel Summer", artist: "Taylor Swift"},
                {song: "Levitating", artist: "Dua Lipa"},
                {song: "Flowers", artist: "Miley Cyrus"},
                {song: "As It Was", artist: "Harry Styles"}
            ];
            
            const randomSong = mockSongs[Math.floor(Math.random() * mockSongs.length)];
            
            // Send now playing update to server
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'now_playing',
                    song: randomSong.song,
                    artist: randomSong.artist
                }));
            }
        }, 30000); // Update every 30 seconds
        
        // Send initial now playing
        const initialSong = {song: "Blinding Lights", artist: "The Weeknd"};
        this.ws.send(JSON.stringify({
            type: 'now_playing',
            song: initialSong.song,
            artist: initialSong.artist
        }));
    }

    shareCurrentSong() {
        if (!this.spotifyConnected) {
            this.addSystemMessage('Please connect Spotify first!');
            return;
        }
        
        const mockSongs = [
            {song: "Blinding Lights", artist: "The Weeknd", url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"},
            {song: "Anti-Hero", artist: "Taylor Swift", url: "https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIegu"},
            {song: "Dance Monkey", artist: "Tones and I", url: "https://open.spotify.com/track/2XU0oxnq2qxCpomAAuJY8K"}
        ];
        
        const randomSong = mockSongs[Math.floor(Math.random() * mockSongs.length)];
        
        this.ws.send(JSON.stringify({
            type: 'share_song',
            song: randomSong.song,
            artist: randomSong.artist,
            url: randomSong.url
        }));
        
        this.addSystemMessage(`You shared: ${randomSong.song} by ${randomSong.artist}`);
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content) return;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'message',
                content: content
            }));
            
            this.addMessage(this.currentUser, content, true);
        } else {
            this.addSystemMessage('Not connected to server');
        }
        
        input.value = '';
    }

    addMessage(user, content, isOwn = false) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own-message' : ''}`;
        
        messageDiv.innerHTML = `
            <div class="message-user">${user}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    addSystemMessage(content) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(content)}</div>`;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    addSharedSong(user, song, artist, url) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message shared-song-message';
        
        messageDiv.innerHTML = `
            <div class="message-user">${user} 🎵 Shared a song</div>
            <div class="shared-song">
                <div class="song-title">${song}</div>
                <div class="song-artist">by ${artist}</div>
                <a href="${url}" target="_blank" class="song-link">🎧 Listen on Spotify</a>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    updateNowPlaying(user, song, artist) {
        // Update the now playing sidebar
        const nowPlayingDiv = document.getElementById('nowPlayingList');
        let userElement = document.getElementById(`now-playing-${user}`);
        
        if (!userElement) {
            userElement = document.createElement('div');
            userElement.className = 'now-playing-item';
            userElement.id = `now-playing-${user}`;
            nowPlayingDiv.appendChild(userElement);
        }
        
        userElement.innerHTML = `
            <div class="now-playing-user">${user}</div>
            <div class="now-playing-song">${song}</div>
            <div class="now-playing-artist">${artist}</div>
        `;
    }

    updateCompatibility(user, compatibility) {
        // Update compatibility scores in sidebar
        const compatibilityDiv = document.getElementById('compatibilityScores');
        compatibilityDiv.innerHTML = '<h4>Music Compatibility</h4>';
        
        for (const [otherUser, score] of Object.entries(compatibility)) {
            const compElement = document.createElement('div');
            compElement.className = 'compatibility-item';
            compElement.innerHTML = `
                <div class="compatibility-user">${otherUser}</div>
                <div class="compatibility-score">${score}% match</div>
            `;
            compatibilityDiv.appendChild(compElement);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MusicMessenger();
});