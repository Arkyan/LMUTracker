# LMU Tracker

<p align="center">
  <img src="LMUTrackerLogo.webp" alt="LMU Tracker Logo" width="200"/>
</p>

## 📋 Description

LMU Tracker est une application de bureau développée avec Electron pour suivre et gérer vos données LMU.  L'application offre une interface moderne et intuitive pour visualiser et analyser vos informations.  

## ✨ Fonctionnalités

- 🖥️ Application de bureau native (Windows)
- 💾 Base de données SQLite intégrée pour le stockage local
- 📊 Suivi des sessions avec historique complet
- 🔄 Mise à jour automatique via GitHub Releases
- 🎨 Interface utilisateur moderne et responsive
- 📦 Traitement XML avec fast-xml-parser
- ⚡ Traitement en arrière-plan avec Worker Threads

## 🚀 Installation

### Pour les utilisateurs

1. Téléchargez la dernière version depuis la [page des releases](https://github.com/Arkyan/LMUTracker/releases)
2. Exécutez l'installateur NSIS (`.exe`)

> ⚠️ **Note importante pour Windows** :  Lors de l'installation, Windows Defender SmartScreen peut afficher un avertissement de sécurité indiquant que l'application n'est pas reconnue.  **Ceci est normal** car l'application n'est pas signée numériquement avec un certificat de signature de code. 
> 
> Pour continuer l'installation : 
> - Cliquez sur "**Informations complémentaires**" (ou "More info")
> - Puis cliquez sur "**Exécuter quand même**" (ou "Run anyway")
> 
> L'application est sûre à utiliser.  L'avertissement apparaît uniquement parce que l'application n'a pas de signature numérique payante.

3. Suivez les instructions d'installation
4. Lancez l'application depuis le raccourci créé

### Pour les développeurs

#### Prérequis

- Node.js (version 18 ou supérieure recommandée)
- npm ou yarn
- Git

#### Installation

```bash
# Cloner le repository
git clone https://github.com/Arkyan/LMUTracker. git

# Accéder au dossier
cd LMUTracker

# Installer les dépendances
npm install

# Lancer l'application en mode développement
npm start
```

## 🛠️ Développement

### Scripts disponibles

```bash
# Démarrer l'application en mode développement
npm start

# Construire l'application pour Windows
npm run build

# Publier une nouvelle version sur GitHub
npm run publish
```

### Configuration

1. Copiez le fichier `.env.example` en `.env`
2. Remplissez les variables d'environnement nécessaires : 

```env
# Token GitHub pour les releases (obligatoire pour publier)
# Obtenez-le sur : https://github.com/settings/tokens
# Permissions nécessaires : repo
GH_TOKEN=votre_token_github
```

### Structure du projet

```
LMUTracker/
├── main. js              # Point d'entrée principal d'Electron
├── preload.js           # Script de préchargement pour le contexte de rendu
├── renderer. js          # Logique du processus de rendu
├── session.js           # Gestion des sessions
├── index.html           # Interface principale
├── session. html         # Interface de session
├── styles.css           # Styles de l'application
├── modules/             # Modules Node.js personnalisés
├── workers/             # Worker threads pour le traitement en arrière-plan
├── build/               # Scripts de build et configuration
└── LMUTrackerLogo.ico   # Icône de l'application
```

## 🔧 Technologies utilisées

### Dépendances principales

- **Electron** (v38.2.0) - Framework pour applications de bureau
- **better-sqlite3** (v12.5.0) - Base de données SQLite3
- **electron-updater** (v6.6.2) - Système de mise à jour automatique
- **fast-xml-parser** (v5.2.5) - Parser XML performant

### Dépendances de développement

- **electron-builder** (v26.0.12) - Construction et packaging de l'application
- **dotenv** (v17.2.3) - Gestion des variables d'environnement
- **rcedit** (v5.0.2) - Édition des ressources Windows

## 📦 Build et distribution

L'application utilise `electron-builder` pour créer des installateurs Windows avec les caractéristiques suivantes :

- Installation personnalisable (dossier d'installation modifiable)
- Création de raccourcis bureau et menu démarrer
- Pas d'élévation de privilèges requise
- Désinstallation propre

## 🔄 Mises à jour automatiques

L'application vérifie automatiquement les mises à jour au démarrage via GitHub Releases.  Les utilisateurs sont notifiés lorsqu'une nouvelle version est disponible et peuvent choisir de la télécharger et l'installer.

## 🔒 Sécurité

L'application n'est actuellement pas signée numériquement.  La signature de code nécessite un certificat payant. Le code source est entièrement disponible sur GitHub pour inspection et vérification.

## 📝 Licence

ISC

## 👤 Auteur

**Arkyan**

- GitHub: [@Arkyan](https://github.com/Arkyan)

## 🤝 Contribution

Les contributions, issues et feature requests sont les bienvenues ! 

1. Fork le projet
2. Créez votre branche de fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📌 Notes

- L'application est actuellement optimisée pour Windows
- La base de données SQLite est stockée localement dans le répertoire de l'utilisateur
- Les données sont conservées lors des mises à jour de l'application

---

<p align="center">Fait avec ❤️ par Arkyan</p>
