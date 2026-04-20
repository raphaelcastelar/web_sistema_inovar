@echo off
title Sistema Inovar - Frontend

cd /d "%~dp0sistema_inovar\frontend"

echo Iniciando frontend React em http://localhost:3000
echo.

set HOST=0.0.0.0
set PORT=3000
npm start

echo.
echo Frontend encerrado.
pause
