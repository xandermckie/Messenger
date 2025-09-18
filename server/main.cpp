//9/15/25 Create a messaging app similar to discord that is encrypted and has a custom server on my home 
//implement some feature involving music possibly a music status as well as implementation to listen to music together
//-and share music from multiple platforms : ex: if someone shares a spotify link but another person chose apple or 
//-youtube as their service it will give them a link to the song on that platform

//build using linode instead of home pc for better security and eoa
//Server OS: Ubuntu 22.04 LTS
/*
Server Language: C++17/20

WebSocket/HTTP Library: uWebSockets (or Boost.Beast if you want more low-level control)

Database: SQLite3 (to start) -> PostgreSQL (for advanced features)

Security: Let's Encrypt (TLS), Libsodium (password hashing, maybe E2EE later)

Client: Vanilla HTML, CSS, JavaScript

Process Management: systemd

VPS Provider: DigitalOcean/Linode

*/
#include <uWebSockets/App.h>
#include <iostream>
#include <unordered_map>

int main() {
    std::cout << "Starting server...\n";

    uWS::App().ws<std::string>("/*", {
        .open = [](auto *ws) {
            std::cout << "Client connected!\n";
        },
        .message = [](auto *ws, std::string_view message, uWS::OpCode opCode) {
            std::cout << "Received: " << message << "\n";
            ws->send(message, opCode); // Echo the message back
        },
        .close = [](auto *ws, int code, std::string_view message) {
            std::cout << "Client disconnected!\n";
        }
    }).listen(3000, [](auto *listen_socket) {
        if (listen_socket) {
            std::cout << "Server is LIVE on port 3000!\n";
        }
    }).run();

    std::cout << "Server stopped.\n";
    return 0;
}