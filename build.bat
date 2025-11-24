@echo off
echo Building Music Messenger Server...
echo.

set CXX=g++
set CXXFLAGS=-std=c++17 -O3 -IC:/msys64/ucrt64/include
set LDFLAGS=-LC:/msys64/ucrt64/lib
set LIBS=-l uWS -l ssl -l z -l uv
set SOURCES=main.cpp
set OUTPUT=server.exe

echo Compiling music messenger server...
%CXX% %CXXFLAGS% %SOURCES% -o %OUTPUT% %LDFLAGS% %LIBS%

if %errorlevel% equ 0 (
    echo.
    echo 🎵 Build successful! 🎵
    echo Server: %OUTPUT%
    echo.
    echo To start the server:
    echo   .\%OUTPUT%
    echo.
    echo Then open client/index.html in your browser!
) else (
    echo.
    echo ❌ Build failed!
    echo.
    pause
)