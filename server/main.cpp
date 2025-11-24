#include <uWebSockets/App.h>
#include <iostream>
#include <unordered_map>
#include <string>
#include <thread>
#include <chrono>
#include <queue>
#include <mutex>

struct User {
    std::string username;
    std::string current_song;
    std::string spotify_id;
    std::vector<std::string> top_artists;
    uWS::WebSocket<false, true> *ws;
};

class MessageServer {
private:
    std::unordered_map<uWS::WebSocket<false, true> *, User> users;
    std::mutex users_mutex;
    
public:
    void run() {
        uWS::App().ws<User>("/*", {
            .open = [this](auto *ws) {
                std::cout << "Client connected!" << std::endl;
            },
            
            .message = [this](auto *ws, std::string_view message, uWS::OpCode opCode) {
                try {
                    // Parse JSON message
                    std::string msg_str(message);
                    handleClientMessage(ws, msg_str);
                } catch (const std::exception& e) {
                    std::cout << "Error parsing message: " << e.what() << std::endl;
                }
            },
            
            .close = [this](auto *ws, int code, std::string_view message) {
                std::lock_guard<std::mutex> lock(users_mutex);
                auto it = users.find(ws);
                if (it != users.end()) {
                    std::cout << "User disconnected: " << it->second.username << std::endl;
                    
                    // Notify other users
                    broadcastUserLeft(it->second.username);
                    users.erase(it);
                }
            }
        }).listen(3000, [](auto *listen_socket) {
            if (listen_socket) {
                std::cout << "🎵 Music Messenger Server started on port 3000! 🎵" << std::endl;
                std::cout << "Ready for Spotify-powered messaging!" << std::endl;
            }
        }).run();
    }
    
private:
    void handleClientMessage(uWS::WebSocket<false, true> *ws, const std::string& message) {
        // Simple JSON parsing (in real app, use a proper JSON library)
        if (message.find("\"type\":\"login\"") != std::string::npos) {
            handleLogin(ws, message);
        } 
        else if (message.find("\"type\":\"message\"") != std::string::npos) {
            handleChatMessage(ws, message);
        }
        else if (message.find("\"type\":\"now_playing\"") != std::string::npos) {
            handleNowPlaying(ws, message);
        }
        else if (message.find("\"type\":\"share_song\"") != std::string::npos) {
            handleShareSong(ws, message);
        }
        else if (message.find("\"type\":\"music_profile\"") != std::string::npos) {
            handleMusicProfile(ws, message);
        }
    }
    
    void handleLogin(uWS::WebSocket<false, true> *ws, const std::string& message) {
        std::lock_guard<std::mutex> lock(users_mutex);
        
        // Extract username (simplified parsing)
        size_t user_pos = message.find("\"username\":\"");
        if (user_pos != std::string::npos) {
            user_pos += 12;
            size_t end_pos = message.find("\"", user_pos);
            std::string username = message.substr(user_pos, end_pos - user_pos);
            
            User user;
            user.username = username;
            user.ws = ws;
            users[ws] = user;
            
            std::cout << "User logged in: " << username << std::endl;
            
            // Send welcome message
            std::string welcome_msg = R"({"type":"system", "content":"Welcome to Music Messenger! Connect Spotify to share your tunes."})";
            ws->send(welcome_msg, uWS::OpCode::TEXT);
            
            // Notify others
            broadcastUserJoined(username);
        }
    }
    
    void handleChatMessage(uWS::WebSocket<false, true> *ws, const std::string& message) {
        std::lock_guard<std::mutex> lock(users_mutex);
        auto user_it = users.find(ws);
        if (user_it == users.end()) return;
        
        // Extract message content
        size_t content_pos = message.find("\"content\":\"");
        if (content_pos != std::string::npos) {
            content_pos += 11;
            size_t end_pos = message.find("\"", content_pos);
            std::string content = message.substr(content_pos, end_pos - content_pos);
            
            // Broadcast message to all users
            std::string broadcast_msg = R"({"type":"message", "user":")" + user_it->second.username + 
                                       R"(", "content":")" + content + "\"}";
            broadcastMessage(broadcast_msg);
            
            std::cout << "Message from " << user_it->second.username << ": " << content << std::endl;
        }
    }
    
    void handleNowPlaying(uWS::WebSocket<false, true> *ws, const std::string& message) {
        std::lock_guard<std::mutex> lock(users_mutex);
        auto user_it = users.find(ws);
        if (user_it == users.end()) return;
        
        // Extract song info
        size_t song_pos = message.find("\"song\":\"");
        size_t artist_pos = message.find("\"artist\":\"");
        
        if (song_pos != std::string::npos && artist_pos != std::string::npos) {
            song_pos += 8;
            size_t song_end = message.find("\"", song_pos);
            artist_pos += 10;
            size_t artist_end = message.find("\"", artist_pos);
            
            std::string song = message.substr(song_pos, song_end - song_pos);
            std::string artist = message.substr(artist_pos, artist_end - artist_pos);
            
            user_it->second.current_song = song + " by " + artist;
            
            // Broadcast now playing status
            std::string now_playing_msg = R"({"type":"now_playing", "user":")" + user_it->second.username + 
                                         R"(", "song":")" + song + R"(", "artist":")" + artist + "\"}";
            broadcastMessage(now_playing_msg);
            
            std::cout << user_it->second.username << " is now listening to: " << song << " by " << artist << std::endl;
        }
    }
    
    void handleShareSong(uWS::WebSocket<false, true> *ws, const std::string& message) {
        std::lock_guard<std::mutex> lock(users_mutex);
        auto user_it = users.find(ws);
        if (user_it == users.end()) return;
        
        // Extract shared song info
        size_t url_pos = message.find("\"url\":\"");
        size_t song_pos = message.find("\"song\":\"");
        size_t artist_pos = message.find("\"artist\":\"");
        
        if (url_pos != std::string::npos && song_pos != std::string::npos && artist_pos != std::string::npos) {
            url_pos += 7;
            size_t url_end = message.find("\"", url_pos);
            song_pos += 8;
            size_t song_end = message.find("\"", song_pos);
            artist_pos += 10;
            size_t artist_end = message.find("\"", artist_pos);
            
            std::string url = message.substr(url_pos, url_end - url_pos);
            std::string song = message.substr(song_pos, song_end - song_pos);
            std::string artist = message.substr(artist_pos, artist_end - artist_pos);
            
            // Broadcast shared song
            std::string share_msg = R"({"type":"shared_song", "user":")" + user_it->second.username + 
                                   R"(", "song":")" + song + R"(", "artist":")" + artist + 
                                   R"(", "url":")" + url + "\"}";
            broadcastMessage(share_msg);
            
            std::cout << user_it->second.username << " shared: " << song << " by " << artist << std::endl;
        }
    }
    
    void handleMusicProfile(uWS::WebSocket<false, true> *ws, const std::string& message) {
        std::lock_guard<std::mutex> lock(users_mutex);
        auto user_it = users.find(ws);
        if (user_it == users.end()) return;
        
        // Calculate and send music compatibility with other users
        std::string compatibility_msg = R"({"type":"compatibility_update", "user":")" + 
                                       user_it->second.username + R"(", "compatibility":{)";
        
        // Simple mock compatibility calculation
        for (auto& [other_ws, other_user] : users) {
            if (other_ws != ws) {
                int compatibility = calculateCompatibility(user_it->second, other_user);
                compatibility_msg += "\"" + other_user.username + "\":" + std::to_string(compatibility) + ",";
            }
        }
        
        if (compatibility_msg.back() == ',') compatibility_msg.pop_back();
        compatibility_msg += "}}";
        
        ws->send(compatibility_msg, uWS::OpCode::TEXT);
    }
    
    int calculateCompatibility(const User& user1, const User& user2) {
        // Mock compatibility calculation based on shared artists
        // In a real app, this would analyze Spotify data
        int base_compatibility = 50 + (std::rand() % 50); // Random 50-100%
        return base_compatibility;
    }
    
    void broadcastMessage(const std::string& message) {
        for (auto& [ws, user] : users) {
            ws->send(message, uWS::OpCode::TEXT);
        }
    }
    
    void broadcastUserJoined(const std::string& username) {
        std::string msg = R"({"type":"user_joined", "user":")" + username + "\"}";
        broadcastMessage(msg);
    }
    
    void broadcastUserLeft(const std::string& username) {
        std::string msg = R"({"type":"user_left", "user":")" + username + "\"}";
        broadcastMessage(msg);
    }
};

int main() {
    std::cout << "🎵 Starting Music Messenger Server... 🎵" << std::endl;
    MessageServer server;
    server.run();
    return 0;
}