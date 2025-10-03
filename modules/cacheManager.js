/**
 * Module de gestion du cache pour LMU Tracker
 * Cache les contenus HTML générés pour éviter les recalculs inutiles
 */

(function() {
  // Cache global pour les différentes vues
  const cache = {
    profile: null,
    history: null,
    trackStats: null
  };

  // Générer une clé de cache basée sur les paramètres
  function generateCacheKey(type, params = {}) {
    const keyParts = [type];
    
    // Ajouter les paramètres pertinents pour chaque type de cache
    switch (type) {
      case 'profile':
        keyParts.push(
          params.driverName || '',
          params.filesLength || 0,
          params.selectedCarClass || ''
        );
        break;
      case 'history':
        keyParts.push(
          params.driverName || '',
          params.filesLength || 0,
          params.folderPath || '',
          params.title || ''
        );
        break;
      case 'trackStats':
        keyParts.push(
          params.driverName || '',
          params.filesLength || 0,
          params.selectedCarClass || ''
        );
        break;
    }
    
    return keyParts.join('|');
  }

  // Obtenir un élément du cache
  function getCachedContent(type, params = {}) {
    const cacheKey = generateCacheKey(type, params);
    const cached = cache[type];
    
    if (cached && cached.key === cacheKey && cached.timestamp > (Date.now() - 300000)) { // Cache valide 5 minutes
      console.log(`Cache HIT pour ${type}`);
      return cached.content;
    }
    
    console.log(`Cache MISS pour ${type}`);
    return null;
  }

  // Mettre en cache un contenu
  function setCachedContent(type, content, params = {}) {
    const cacheKey = generateCacheKey(type, params);
    
    cache[type] = {
      key: cacheKey,
      content: content,
      timestamp: Date.now()
    };
    
    console.log(`Cache SET pour ${type}`);
  }

  // Invalider un type de cache spécifique
  function invalidateCache(type = null) {
    if (type) {
      cache[type] = null;
      console.log(`Cache invalidé pour ${type}`);
    } else {
      // Invalider tout le cache
      Object.keys(cache).forEach(key => {
        cache[key] = null;
      });
      console.log('Cache entièrement invalidé');
    }
  }

  // Vérifier si un contenu est en cache
  function isCached(type, params = {}) {
    return getCachedContent(type, params) !== null;
  }

  // Obtenir des statistiques du cache
  function getCacheStats() {
    const stats = {};
    Object.keys(cache).forEach(type => {
      stats[type] = {
        cached: !!cache[type],
        age: cache[type] ? (Date.now() - cache[type].timestamp) : 0
      };
    });
    return stats;
  }

  // Export des fonctions
  if (typeof window !== 'undefined') {
    window.LMUCacheManager = {
      getCachedContent,
      setCachedContent,
      invalidateCache,
      isCached,
      getCacheStats
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getCachedContent,
      setCachedContent,
      invalidateCache,
      isCached,
      getCacheStats
    };
  }

})(); // Fermeture de la fonction IIFE