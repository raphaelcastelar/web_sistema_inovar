@echo off
title Sistema Inovar - Backend

cd /d "C:\Users\User\Documents\GitHub\web_sistema_inovar\sistema_inovar"

echo Iniciando backend Django em http://localhost:8000
echo.

python manage.py runserver 0.0.0.0:8000

echo.
echo Backend encerrado.
pause
