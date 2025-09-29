@echo off
echo Building Messenger server...

set CXX=g++
set CXXFLAGS=-std=c++17 -O3 -IC:/msys64/ucrt64/include
set LDFLAGS=-LC:/msys64/ucrt64/lib
set LIBS=-l uWS -l ssl -l z -l uv
set SOURCES=main.cpp
set OUTPUT=server.exe

echo Compiling...
%CXX% %CXXFLAGS% %SOURCES% -o %OUTPUT% %LDFLAGS% %LIBS%

if %errorlevel% equ 0 (
    echo Build successful! Output: %OUTPUT%
    echo Run .\%OUTPUT% to start the server
) else (
    echo Build failed!
    pause
)