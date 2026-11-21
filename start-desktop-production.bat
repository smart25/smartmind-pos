@echo off
title SmartMind POS Production Desktop
cd /d "%~dp0"
set NODE_ENV=production
set ELECTRON_DEV=false
"C:\Program Files\nodejs\node.exe" "node_modules\electron\cli.js" .
