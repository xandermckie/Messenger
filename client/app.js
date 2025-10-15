class MessengerApp {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentChannel = 'general';
        
        this.initializeEventListeners();
        this.showLoginForm();
    }

    initializeEventListeners() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', () => this.connectToServer());
        
        // Send message on Enter key
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Send button
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        
        // Login form
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
    }

    showLoginForm() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
    }

    hideLoginForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
    }

    handleLogin() {
        const username = document.getElementById('usernameInput').value.trim();
        if (username) {
            this.currentUser = username;
            this.hideLoginForm();
            this.connectToServer();
            this.addSystemMessage(`Welcome, ${username}!`);
        }
    }

    connectToServer() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.addSystemMessage('Already connected to server');
            return;
        }

        try {
            this.ws = new WebSocket('ws://localhost:3000');
            
            this.ws.onopen = () => {
                this.addSystemMessage('Connected to server!');
                // Send join message to server
                this.ws.send(JSON.stringify({
                    type: 'join',
                    user: this.currentUser
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    // If it's not JSON, treat it as a plain text echo (for testing)
                    this.addMessage('Server', event.data);
                }
            };

            this.ws.onerror = (error) => {
                this.addSystemMessage('Connection error: ' + error);
            };

            this.ws.onclose = () => {
                this.addSystemMessage('Disconnected from server');
            };

        } catch (error) {
            this.addSystemMessage('Failed to connect: ' + error);
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'message':
                this.addMessage(data.user, data.content, data.timestamp);
                break;
            case 'user_joined':
                this.addSystemMessage(`${data.user} joined the chat`);
                break;
            case 'user_left':
                this.addSystemMessage(`${data.user} left the chat`);
                break;
            default:
                this.addMessage(data.user || 'Unknown', data.content || data);
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content) return;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send structured message to server
            this.ws.send(JSON.stringify({
                type: 'message',
                user: this.currentUser,
                content: content,
                channel: this.currentChannel,
                timestamp: new Date().toISOString()
            }));
            
            // Show message immediately in UI (optimistic update)
            this.addMessage(this.currentUser, content, new Date().toISOString(), true);
        } else {
            this.addSystemMessage('Not connected to server');
        }
        
        input.value = '';
    }

    addMessage(user, content, timestamp, isOwn = false) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own-message' : ''}`;
        
        const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-user">${user}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
            <div class="message-time">${time}</div> 
        `;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    addSystemMessage(content) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.innerHTML = `<div class="message-content" style="color: #72767d; font-style: italic;">${this.escapeHtml(content)}</div>`;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MessengerApp();
});