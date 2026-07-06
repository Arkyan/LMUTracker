/**
 * Aide à l'intégration de Chart.js pour les graphiques d'évolution
 * (progression temps au tour, classement, consistance secteurs).
 * Dépend de: Chart.js (chargé en <script> avant ce fichier)
 */

(function() {
  const instances = new Map();

  // Lit les tokens de thème courants (les canvas ne comprennent pas var(--x))
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name) => cs.getPropertyValue(name).trim();
    return {
      accent: get('--accent') || '#d1121f',
      purple: get('--purple') || '#bc8cff',
      green: get('--green') || '#3fb950',
      textPrimary: get('--text-primary') || '#f2f2f0',
      textSecondary: get('--text-secondary') || '#9a9a9e',
      textMuted: get('--text-muted') || '#55555a',
      border: get('--border') || '#2a2a2e',
      panel: get('--panel') || '#17171b',
      fontMono: get('--font-mono') || 'monospace'
    };
  }

  // Détruit l'instance existante liée à ce canvas avant d'en créer une nouvelle
  // (évite "Canvas is already in use" quand on change de circuit/véhicule ou
  // qu'une vue est régénérée).
  function renderChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    const existing = instances.get(canvasId);
    if (existing) {
      existing.destroy();
      instances.delete(canvasId);
    }

    const chart = new Chart(canvas.getContext('2d'), config);
    instances.set(canvasId, chart);
    return chart;
  }

  // Réapplique les couleurs de thème sur tous les graphiques déjà affichés
  // (appelé au toggle clair/sombre, sans regénérer le HTML).
  function refreshTheme() {
    const colors = themeColors();
    for (const [canvasId, chart] of instances) {
      if (!document.getElementById(canvasId)) {
        // Le canvas n'existe plus dans le DOM (vue changée) - nettoyer le registre
        chart.destroy();
        instances.delete(canvasId);
        continue;
      }
      applyThemeToChart(chart, colors);
      chart.update();
    }
  }

  function applyThemeToChart(chart, colors) {
    const scales = chart.options.scales || {};
    for (const scale of Object.values(scales)) {
      if (scale.ticks) scale.ticks.color = colors.textSecondary;
      if (scale.grid) scale.grid.color = colors.border;
      if (scale.title) scale.title.color = colors.textSecondary;
    }
    if (chart.options.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.color = colors.textSecondary;
    }
  }

  function destroyChart(canvasId) {
    const existing = instances.get(canvasId);
    if (existing) {
      existing.destroy();
      instances.delete(canvasId);
    }
  }

  if (typeof window !== 'undefined') {
    window.LMUCharts = { renderChart, refreshTheme, themeColors, destroyChart };
  }
})();
