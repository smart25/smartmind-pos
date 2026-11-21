@echo off
title SmartMind POS Desktop
cd /d "%~dp0"
set ELECTRON_DEV=true
"C:\Program Files\nodejs\node.exe" "node_modules\electron\cli.js" .
