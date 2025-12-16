/**
 * Module d'interface pour la base de données SQLite
 * Gère l'affichage des statistiques et les actions de maintenance
 */

(function() {
  // Éléments DOM
  let dbStatsFiles = null;
  let dbStatsSessions = null;
  let dbStatsDrivers = null;
  let dbStatsLaps = null;
  let dbStatsSize = null;
  let btnRefreshDbStats = null;
  let btnCleanupDb = null;
  let btnResetDb = null;

  // Initialiser le module
  function initDatabaseUI() {
    dbStatsFiles = document.getElementById('dbStatsFiles');
    dbStatsSessions = document.getElementById('dbStatsSessions');
    dbStatsDrivers = document.getElementById('dbStatsDrivers');
    dbStatsLaps = document.getElementById('dbStatsLaps');
    dbStatsSize = document.getElementById('dbStatsSize');
    btnRefreshDbStats = document.getElementById('btnRefreshDbStats');
    btnCleanupDb = document.getElementById('btnCleanupDb');
    btnResetDb = document.getElementById('btnResetDb');

    // Ajouter les événements
    if (btnRefreshDbStats) {
      btnRefreshDbStats.addEventListener('click', refreshDatabaseStats);
    }

    if (btnCleanupDb) {
      btnCleanupDb.addEventListener('click', cleanupDatabase);
    }

    if (btnResetDb) {
      btnResetDb.addEventListener('click', resetDatabase);
    }

    // Charger les statistiques au démarrage
    refreshDatabaseStats();
  }

  // Rafraîchir les statistiques de la BDD
  async function refreshDatabaseStats() {
    if (!window.lmuAPI || !window.lmuAPI.dbGetStats) {
      console.warn('[DB UI] API de base de données non disponible');
      return;
    }

    try {
      const result = await window.lmuAPI.dbGetStats();
      
      if (result.ok && result.stats) {
        updateStatsDisplay(result.stats);
      } else {
        console.error('[DB UI] Erreur lors de la récupération des stats:', result.error);
        displayStatsError();
      }
    } catch (error) {
      console.error('[DB UI] Erreur:', error);
      displayStatsError();
    }
  }

  // Mettre à jour l'affichage des statistiques
  function updateStatsDisplay(stats) {
    if (dbStatsFiles) {
      dbStatsFiles.textContent = formatNumber(stats.files);
    }
    
    if (dbStatsSessions) {
      dbStatsSessions.textContent = formatNumber(stats.sessions);
    }
    
    if (dbStatsDrivers) {
      dbStatsDrivers.textContent = formatNumber(stats.drivers);
    }
    
    if (dbStatsLaps) {
      dbStatsLaps.textContent = formatNumber(stats.laps);
    }
    
    if (dbStatsSize) {
      dbStatsSize.textContent = formatFileSize(stats.dbSize);
    }
  }

  // Afficher une erreur dans les stats
  function displayStatsError() {
    const errorText = 'Erreur';
    
    if (dbStatsFiles) dbStatsFiles.textContent = errorText;
    if (dbStatsSessions) dbStatsSessions.textContent = errorText;
    if (dbStatsDrivers) dbStatsDrivers.textContent = errorText;
    if (dbStatsLaps) dbStatsLaps.textContent = errorText;
    if (dbStatsSize) dbStatsSize.textContent = errorText;
  }

  // Nettoyer la base de données (supprimer les entrées de fichiers inexistants)
  async function cleanupDatabase() {
    if (!window.lmuAPI || !window.lmuAPI.dbCleanup) {
      console.warn('[DB UI] API de nettoyage non disponible');
      return;
    }

    if (!confirm('Voulez-vous nettoyer la base de données ?\n\nCette action supprimera les entrées des fichiers qui n\'existent plus sur le disque.')) {
      return;
    }

    try {
      const btnText = btnCleanupDb.innerHTML;
      btnCleanupDb.innerHTML = '<i class=\"fas fa-sync-alt\"></i> Nettoyage...';
      btnCleanupDb.disabled = true;

      console.log('[DB UI] Lancement du nettoyage...');
      const result = await window.lmuAPI.dbCleanup();
      console.log('[DB UI] Résultat du nettoyage:', result);
      
      if (result.ok) {
        const message = result.deleted > 0 
          ? `Nettoyage terminé !\n\n${result.deleted} fichier(s) supprimé(s) de la base de données.`
          : `Nettoyage terminé !\n\nAucun fichier manquant trouvé. Tous les fichiers indexés existent toujours sur le disque.`;
        
        alert(message);
        
        // Rafraîchir les statistiques
        await refreshDatabaseStats();
        
        // Invalider le cache pour forcer un rechargement
        if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
          window.LMUCacheManager.invalidateCache();
        }
      } else {
        alert(`Erreur lors du nettoyage :\n\n${result.error}`);
      }
    } catch (error) {
      console.error('[DB UI] Erreur lors du nettoyage:', error);
      alert(`Erreur lors du nettoyage :\n\n${error.message}`);
    } finally {
      btnCleanupDb.innerHTML = '<i class="fas fa-broom"></i> Nettoyer';
      btnCleanupDb.disabled = false;
    }
  }

  // Réinitialiser complètement la base de données
  async function resetDatabase() {
    if (!window.lmuAPI || !window.lmuAPI.dbReset) {
      console.warn('[DB UI] API de réinitialisation non disponible');
      return;
    }

    if (!confirm('ATTENTION : Voulez-vous vraiment supprimer et réinitialiser la base de données ?\n\nToutes les données indexées seront perdues et devront être rechargées au prochain scan.\n\nCette action est utile si vous changez de dossier de résultats.')) {
      return;
    }

    try {
      const btnText = btnResetDb.innerHTML;
      btnResetDb.innerHTML = '<i class="fas fa-sync-alt"></i> Réinitialisation...';
      btnResetDb.disabled = true;

      console.log('[DB UI] Lancement de la réinitialisation...');
      const result = await window.lmuAPI.dbReset();
      console.log('[DB UI] Résultat de la réinitialisation:', result);
      
      if (result.ok) {
        alert('Base de données réinitialisée avec succès !\n\nToutes les données ont été supprimées. Les fichiers seront réindexés au prochain scan.');
        
        // Rafraîchir les statistiques
        await refreshDatabaseStats();
        
        // Invalider le cache pour forcer un rechargement
        if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
          window.LMUCacheManager.invalidateCache();
        }
      } else {
        alert(`Erreur lors de la réinitialisation :\n\n${result.error}`);
      }
    } catch (error) {
      console.error('[DB UI] Erreur lors de la réinitialisation:', error);
      alert(`Erreur lors de la réinitialisation :\n\n${error.message}`);
    } finally {
      btnResetDb.innerHTML = '<i class="fas fa-trash-alt"></i> Réinitialiser';
      btnResetDb.disabled = false;
    }
  }

  // Formater un nombre avec séparateurs
  function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toLocaleString('fr-FR');
  }

  // Formater une taille de fichier
  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + units[i];
  }

  // Exposer les fonctions publiques
  window.LMUDatabaseUI = {
    init: initDatabaseUI,
    refreshStats: refreshDatabaseStats,
    cleanup: cleanupDatabase,
    reset: resetDatabase
  };

  // Initialiser automatiquement quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDatabaseUI);
  } else {
    initDatabaseUI();
  }

})();
