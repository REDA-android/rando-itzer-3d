# Guide de Déploiement en 1 Clic - Carte Topographique 3D Itzer

Ce guide explique comment publier la carte 3D interactive et le topoguide en ligne gratuitement via **GitHub Pages**, pour une consultation instantanée sur smartphone sur le terrain.

---

## 🚀 Méthode 1 : Déploiement Automatique (Script 1 Clic)

1. Double-cliquez sur le fichier **`deploy_gh_pages.bat`** à la racine du projet.
2. Si vous n'avez pas encore lié de dépôt distant GitHub :
   - Créez un nouveau dépôt sur [GitHub.com](https://github.com/new) nommé par exemple `rando-itzer-3d` (public).
   - Liez-le dans le terminal :
     ```bash
     git remote add origin https://github.com/<VOTRE_UTILISATEUR>/rando-itzer-3d.git
     ```
   - Relancez `deploy_gh_pages.bat`.
3. Sur GitHub, rendez-vous dans :
   **Settings > Pages > Build and deployment > Branch** : sélectionnez `main` (ou `gh-pages`) et `/ (root)`.
4. En quelques secondes, votre application est accessible en ligne à l'adresse :
   `https://<VOTRE_UTILISATEUR>.github.io/rando-itzer-3d/`

---

## 📱 Utilisation PWA & Flashage QR Code sur Smartphone

1. Dans l'application web, cliquez sur le bouton **🔗 Partager** en haut à droite.
2. Le QR Code officiel s'affiche à l'écran.
3. Visez le QR code avec l'appareil photo de votre smartphone (iPhone / Android).
4. Cliquez sur le lien détecté :
   - Sur Android (Chrome) : Touchez `⋮ > Ajouter à l'écran d'accueil` (ou "Installer l'application").
   - Sur iOS (Safari) : Touchez le bouton Partager `⎙ > Sur l'écran d'accueil`.
5. Grâce au **Service Worker (`sw.js`)**, toutes les données cartographiques, le relief 3D, les textures et le topoguide restent accessibles **100% hors-ligne**, même sans réseau GSM au fin fond des gorges de Zaghfouland ou au Col du Zad !

---

## 📍 Fonctionnalités Terrain Disponibles sur Mobile :

- **📍 GPS Direct** : géolocalisation en temps réel projetée sur le relief 3D.
- **Suivre ma position** : recentrage automatique de la caméra au fil de votre marche.
- **🌤️ Météo Massif** : prévisions Open-Meteo pour Itzer et les crêtes du Zad (avec données de secours hors-ligne).
- **💧 Calculateur d'Eau** : calcul instantané du volume d'hydratation selon l'étape et la température.
- **🚶‍♂️ Vue Marcheur** : immersion à la première personne (hauteur d'œil 1.8m) sur les sentiers du Moyen Atlas.
- **📖 Topoguide A4** : fiches techniques et carnet de route imprimable ou exportable en PDF.
