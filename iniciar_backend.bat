@echo off
title Sistema Inovar - Backend

cd /d "%~dp0sistema_inovar"

echo Iniciando backend Django em http://localhost:8000
echo.

python manage.py runserver 0.0.0.0:8000

echo.
echo Backend encerrado.
pause
