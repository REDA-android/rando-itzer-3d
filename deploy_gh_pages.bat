@echo off
chcp 65001 >nul
echo ========================================================================
echo   DEPLOIEMENT EN 1 CLIC SUR GITHUB PAGES - CARTE 3D RANDO ITZER
echo ========================================================================
echo.

where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Git n'est pas installe ou non present dans le PATH.
    echo Veuillez installer Git depuis https://git-scm.com/
    pause
    exit /b 1
)

if not exist ".git" (
    echo [1/4] Initialisation du depot Git local...
    git init
    git branch -M main
) else (
    echo [1/4] Depot Git existant detecte.
)

echo [2/4] Indexation des fichiers de la carte 3D...
git add index.html style.css app.js web_data.js textures_data.js zone_rando.geojson
git add manifest.json sw.js icon-192.png icon-512.png lib\*
git add README.md DEPLOY_GUIDE.md deploy_gh_pages.bat start_map.bat serve.py

echo [3/4] Creation du commit...
git commit -m "Deploy 3D Hiking Map - Itzer Middle Atlas (PWA, GPS, Weather, Walker Mode)" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo       Commit effectue avec succes.
) else (
    echo       Aucune nouvelle modification a commiter.
)

echo.
echo [4/4] Verification de la configuration distante (Remote)...
git remote -v | findstr "origin" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Aucun depot distant 'origin' n'est configure.
    echo Pour publier sur GitHub Pages :
    echo   1. Creez un depot sur GitHub (ex: rando-itzer-3d)
    echo   2. Executez la commande suivante :
    echo      git remote add origin https://github.com/VOTRE_PSEUDO/rando-itzer-3d.git
    echo   3. Puis relancez ce script deploy_gh_pages.bat pour pousser en 1 clic !
    echo.
) else (
    echo Envoi vers GitHub (branche main / gh-pages)...
    git push -u origin main
    if %ERRORLEVEL% equ 0 (
        echo.
        echo ========================================================================
        echo [SUCCES] Votre application 3D est en ligne sur GitHub Pages !
        echo Activez GitHub Pages dans Settings ^> Pages ^> Source: Deploy from branch 'main' / root.
        echo ========================================================================
    ) else (
        echo.
        echo [ATTENTION] Le push vers origin main a rencontre un probleme.
        echo Verifiez vos identifiants ou permissions GitHub.
    )
)

echo.
pause
