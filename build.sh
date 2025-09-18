#!/bin/bash
g++ -std=c++17 -O3 server/main.cpp -o server/bin -l uWS -l ssl -l z -l uv
echo "Server compiled. Run ./server/bin to start."