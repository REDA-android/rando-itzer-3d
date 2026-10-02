@echo off
title Carte Topographique 3D - Projet Rando Zaghfouland ITZER
echo =====================================================================
echo   CARTE TOPOGRAPHIQUE 3D INTERACTIVE - ZAGHFOULAND / ITZER (MAROC)
echo =====================================================================
echo Demarrage du serveur local et ouverture du navigateur...
cd /d "%~dp0"
python serve.py
if errorlevel 1 (
    echo Python non detecte, ouverture directe dans votre navigateur par defaut...
    start index.html
)
pause
