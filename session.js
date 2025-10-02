/**
 * Page Session - LMU Tracker
 * Lit ?file=... depuis l'URL, charge le XML et affiche la session
 * Utilise les modules refactorisés
 */

(function() {
  // Obtenir le paramètre file depuis l'URL
  function getQueryParam(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }

  // Initialiser la page session
  async function init() {
    const filePath = getQueryParam('file');
    const root = document.getElementById('sessionRoot');
    
    if (!filePath) {
      root.innerHTML = '<p class="muted">Aucun fichier fourni.</p>';
      return;
    }

    root.innerHTML = `<p class="muted">Chargement…</p>`;

    try {
      // Charger le fichier via l'API Electron
      const res = await window.lmuAPI.openFileByPath(filePath);
      
      if (res.canceled) {
        root.innerHTML = `<p class="muted">Erreur: ${res.error || 'inconnue'}</p>`;
        return;
      }

      // Extraire la session via le module XMLParser
      const session = window.LMUXMLParser ? 
        window.LMUXMLParser.extractSession(res.parsed) : null;

      if (!session) {
        root.innerHTML = `<pre>${JSON.stringify(res.parsed, null, 2)}</pre>`;
        return;
      }

      // Rendre la session via le module RenderEngine
      if (window.LMURenderEngine && window.LMURenderEngine.renderSessionInto) {
        window.LMURenderEngine.renderSessionInto(root, res.filePath, session);
      } else {
        root.innerHTML = '<p class="muted">Module de rendu non disponible.</p>';
      }

    } catch (error) {
      console.error('Erreur lors du chargement de la session:', error);
      root.innerHTML = `<p class="muted">Erreur lors du chargement: ${error.message}</p>`;
    }
  }

  // Démarrer l'initialisation quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();