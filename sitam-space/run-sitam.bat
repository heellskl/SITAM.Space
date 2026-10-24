@echo off
title SITAM SPACE dev server
cd /d "%~dp0shatyr-hub"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again. & pause & exit /b 1)
echo Node:
node -v
if not exist node_modules (
  echo Installing dependencies, this takes a few minutes the first time...
  call npm install --no-audit --no-fund
  if errorlevel 1 (echo npm install failed - see the messages above. & pause & exit /b 1)
)
echo Starting SITAM SPACE... open the URL printed below (usually http://localhost:8080)
call npm run dev
pause
