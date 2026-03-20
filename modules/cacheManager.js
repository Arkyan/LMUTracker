/**
 * Module de gestion du cache pour LMU Tracker
 * Cache les contenus HTML générés pour éviter les recalculs inutiles
 */

(function() {
  const cache = {
    profile: null,
    history: null,
    trackStats: null
  };

  function generateCacheKey(type, params = {}) {
    const keyParts = [type];
    switch (type) {
      case 'profile':
        keyParts.push(params.driverName || '', params.filesLength || 0, params.selectedCarClass || '');
        break;
      case 'history':
        keyParts.push(params.driverName || '', params.filesLength || 0, params.folderPath || '', params.title || '');
        break;
      case 'trackStats':
        keyParts.push(params.driverName || '', params.filesLength || 0, params.selectedCarClass || '');
        break;
    }
    return keyParts.join('|');
  }

  function getCachedContent(type, params = {}) {
    const cacheKey = generateCacheKey(type, params);
    const cached = cache[type];
    if (cached && cached.key === cacheKey && cached.timestamp > (Date.now() - 300000)) {
      return cached.content;
    }
    return null;
  }

  function setCachedContent(type, content, params = {}) {
    const cacheKey = generateCacheKey(type, params);
    cache[type] = { key: cacheKey, content, timestamp: Date.now() };
  }

  function invalidateCache(type = null) {
    if (type) {
      cache[type] = null;
    } else {
      Object.keys(cache).forEach(key => { cache[key] = null; });
    }
  }

  function isCached(type, params = {}) {
    return getCachedContent(type, params) !== null;
  }

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
    module.exports = { getCachedContent, setCachedContent, invalidateCache, isCached, getCacheStats };
  }

})();
