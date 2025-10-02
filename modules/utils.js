/**
 * Module des fonctions utilitaires pour LMU Tracker
 */

// Conversion en array pour gérer les éléments simples ou multiples du XML
function arrayify(x) {
  return x == null ? [] : (Array.isArray(x) ? x : [x]);
}

// Conversion sécurisée en nombre
function toNumber(v) {
  if (v == null) return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

// Formatage du temps en mm:ss.fff
function fmtTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const sInt = Math.floor(s);
  const mm = String(m).padStart(1, '0');
  const ss = String(sInt).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

// Formatage des dates et heures
function formatDateTime(rr, dt) {
  let timeString = 'Date inconnue';
  if (rr?.DateTime) {
    try {
      const timestamp = parseInt(rr.DateTime) * 1000;
      const date = new Date(timestamp);
      timeString = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) + ' à ' + date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      timeString = rr?.TimeString || 'Date inconnue';
    }
  } else if (rr?.TimeString) {
    try {
      const dateParts = rr.TimeString.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (dateParts) {
        const [, year, month, day, hour, min] = dateParts;
        timeString = `${day}/${month}/${year} à ${hour}:${min}`;
      } else {
        timeString = rr.TimeString;
      }
    } catch {
      timeString = rr.TimeString;
    }
  } else if (dt) {
    timeString = dt.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' à ' + dt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return timeString;
}

// Obtenir la priorité d'une classe de voiture pour le tri
function getClassPriority(carClass) {
  const classPriorities = {
    'Hyper': 1,
    'LMP2_ELMS': 2,
    'LMP2': 3,
    'LMP3': 4,
    'GT3': 5,
    'GTE': 6,
  };
  return classPriorities[carClass] || 999; // Classes inconnues à la fin
}

// Obtenir les icônes et couleurs par classe
function getClassInfo(carClass) {
  const classInfos = {
    'Hyper': { icon: '⚡', color: '#ef4444' },
    'LMP2': { icon: '🚀', color: '#f97316' },
    'LMP2_ELMS': { icon: '🚀', color: '#f97316' },
    'LMP3': { icon: '🏃', color: '#a855f7' },
    'GT3': { icon: '🏎️', color: '#22c55e' },
    'GTE': { icon: '🔥', color: '#eab308' }
  };
  return classInfos[carClass] || { icon: '🏁', color: 'var(--muted)' };
}

// Détecter si une session est une course, qualification, etc.
function getSessionInfo(sessionName) {
  const sessionType = sessionName.toLowerCase();
  let sessionIcon = '🏎️';
  let sessionBadge = '';
  
  if (sessionType.includes('race')) {
    sessionIcon = '🏁';
    sessionBadge = '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">COURSE</span>';
  } else if (sessionType.includes('qual')) {
    sessionIcon = '⏱️';
    sessionBadge = '<span style="background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">QUALIF</span>';
  } else if (sessionType.includes('practice') || sessionType.includes('practise')) {
    sessionIcon = '🏃';
    sessionBadge = '<span style="background:#22c55e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRACTICE</span>';
  } else {
    sessionIcon = '📊';
    sessionBadge = '<span style="background:var(--muted);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SESSION</span>';
  }
  
  return { icon: sessionIcon, badge: sessionBadge };
}

// Détecter le mode de jeu (Solo/Multijoueur)
function getGameMode(rr) {
  const setting = rr?.Setting || '';
  const isMultiplayer = setting.toLowerCase().includes('multiplayer');
  return isMultiplayer ? 'Multijoueur' : 'Solo';
}

// Export des fonctions pour les rendre disponibles globalement
if (typeof window !== 'undefined') {
  window.LMUUtils = {
    arrayify,
    toNumber,
    fmtTime,
    formatDateTime,
    getClassPriority,
    getClassInfo,
    getSessionInfo,
    getGameMode
  };
}

// Export pour modules (si support ES6)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    arrayify,
    toNumber,
    fmtTime,
    formatDateTime,
    getClassPriority,
    getClassInfo,
    getSessionInfo,
    getGameMode
  };
}