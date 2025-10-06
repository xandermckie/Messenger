#include <iostream>
#include <thread>
#include <vector>
#include <unordered_set>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

typedef websocketpp::server<websocketpp::config::asio> server;

using websocketpp::connection_hdl;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

class WebSocketServer {
public:
    WebSocketServer() {
        m_server.init_asio();
        
        m_server.set_open_handler(bind(&WebSocketServer::on_open, this, ::_1));
        m_server.set_close_handler(bind(&WebSocketServer::on_close, this, ::_1));
        m_server.set_message_handler(bind(&WebSocketServer::on_message, this, ::_1, ::_2));
    }
    
    void on_open(connection_hdl hdl) {
        std::cout << "Client connected!" << std::endl;
        m_connections.insert(hdl);
    }
    
    void on_close(connection_hdl hdl) {
        std::cout << "Client disconnected!" << std::endl;
        m_connections.erase(hdl);
    }
    
    void on_message(connection_hdl hdl, server::message_ptr msg) {
        std::cout << "Received: " << msg->get_payload() << std::endl;
        
        // Echo the message back to all clients
        for (auto conn : m_connections) {
            m_server.send(conn, msg->get_payload(), msg->get_opcode());
        }
    }
    
    void run(uint16_t port) {
        std::cout << "Starting server on port " << port << std::endl;
        m_server.listen(port);
        m_server.start_accept();
        m_server.run();
    }

private:
    server m_server;
    std::unordered_set<connection_hdl, std::hash<connection_hdl>> m_connections;
};

int main() {
    try {
        WebSocketServer server;
        server.run(3000);
    } catch (websocketpp::exception const & e) {
        std::cout << "Error: " << e.what() << std::endl;
    } catch (...) {
        std::cout << "Unknown error" << std::endl;
    }
    return 0;
}