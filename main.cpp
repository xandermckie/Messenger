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