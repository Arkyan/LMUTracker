/**
 * Module de gestion de la vue Circuits pour LMU Tracker
 * Dépend de: utils.js, statsCalculator.js, navigation.js
 */

(function() {

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtLap(sec) {
    if (!isFinite(sec) || sec <= 0) return '–';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const ss = Math.floor(s);
    const ms = Math.round((s - ss) * 1000);
    return `${m}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function fmtDelta(sec) {
    if (!isFinite(sec)) return '–';
    const sign = sec >= 0 ? '+' : '-';
    const abs = Math.abs(sec);
    const m = Math.floor(abs / 60);
    const s = abs - m * 60;
    const ss = Math.floor(s);
    const ms = Math.round((s - ss) * 1000);
    if (m > 0) return `${sign}${m}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    return `${sign}${ss}.${String(ms).padStart(3, '0')}`;
  }

  function fmtSec(sec) {
    if (!isFinite(sec) || sec <= 0) return '–';
    const ss = Math.floor(sec);
    const ms = Math.round((sec - ss) * 1000);
    return `${ss}.${String(ms).padStart(3, '0')}`;
  }

  function sessionTypeLabel(type, raw) {
    if (type === 'race') return 'Course';
    if (type === 'qual') return 'Qualif';
    if (type === 'practice') return 'Essais';
    return esc(raw || type || '–');
  }

  function sessionTypeBadgeStyle(type) {
    if (type === 'race') return 'background:rgba(96,165,250,0.18);color:var(--accent);';
    if (type === 'qual') return 'background:rgba(167,139,250,0.18);color:var(--purple);';
    if (type === 'practice') return 'background:rgba(52,211,153,0.15);color:#34d399;';
    return 'background:rgba(255,255,255,0.08);color:var(--muted);';
  }

  // ── Tracés SVG des circuits ────────────────────────────────────────────────
  // Coordonnées approximatives dans un viewBox 200×110
  // Sources: silhouettes simplifiées des circuits LMU

  const TRACK_PATHS = {
    lemans: 'M 22,18 L 22,88 L 30,98 L 44,98 L 49,92 L 54,98 L 68,98 L 80,88 L 100,72 L 138,54 L 168,38 L 178,24 L 166,12 L 128,6 L 58,6 L 32,12 Z',
    spa: 'M 52,8 L 118,8 L 148,20 L 155,34 Q 158,44 148,52 L 132,58 Q 128,66 138,72 L 148,80 L 138,92 L 108,98 L 72,98 L 48,90 L 32,76 L 22,58 L 26,38 L 38,22 Z',
    monza: 'M 55,10 L 135,10 L 162,18 L 174,34 Q 180,52 172,70 L 158,84 L 130,92 L 58,92 L 34,84 L 20,68 Q 14,50 22,32 L 38,18 Z',
    portimao: 'M 38,14 L 98,10 L 148,20 Q 172,32 174,54 L 168,72 Q 158,88 138,96 L 96,102 L 58,98 L 34,86 L 18,68 Q 12,46 20,28 Z',
    bahrain: 'M 62,12 L 128,12 L 162,24 Q 178,40 174,60 L 158,72 Q 166,80 162,92 L 128,100 L 80,100 L 52,94 L 36,80 L 24,62 Q 18,42 28,26 Z',
    sebring: 'M 18,32 L 20,52 L 30,64 L 24,76 L 34,86 L 72,88 L 118,86 L 148,88 L 168,80 Q 180,64 174,46 L 158,34 Q 172,22 158,12 L 106,8 L 52,12 L 34,22 Z',
    fuji: 'M 28,18 L 162,16 Q 178,24 180,44 L 172,60 L 156,70 L 148,60 L 134,56 L 112,62 L 90,74 L 62,78 L 34,70 L 20,54 Q 14,36 28,18 Z',
    imola: 'M 58,12 L 112,12 Q 148,20 162,38 L 158,54 Q 148,66 162,76 L 166,90 L 144,102 L 98,106 L 64,102 L 44,90 L 36,76 Q 40,62 54,54 L 38,42 L 32,26 Z',
    roadatlanta: 'M 48,18 L 122,16 Q 158,24 166,44 L 156,60 L 136,70 L 130,84 L 118,94 L 90,98 L 62,94 L 42,80 L 28,62 L 32,40 Z',
    daytona: 'M 76,12 L 142,12 Q 172,22 180,44 L 172,66 L 142,76 L 118,70 L 98,80 L 74,74 L 46,68 L 22,56 Q 16,38 28,22 Z',
    interlagos: 'M 44,16 L 108,12 L 148,22 Q 170,36 166,58 L 148,72 Q 138,84 148,94 L 130,104 L 86,106 L 54,100 L 32,86 L 22,66 Q 18,44 32,28 Z',
    oultonpark: 'M 60,14 L 118,14 Q 154,24 162,48 L 148,64 Q 136,74 148,82 L 152,94 L 116,102 L 76,100 L 48,88 L 32,70 L 28,48 Q 32,26 60,14 Z',
  };

  // Matching par mots-clés dans venue/course (lowercase)
  const TRACK_KEYWORDS = [
    { key: 'lemans',      words: ['sarthe', 'mans', 'le mans', 'lemans'] },
    { key: 'spa',         words: ['spa', 'francorchamps', 'eau rouge'] },
    { key: 'monza',       words: ['monza', 'autodromo nazionale'] },
    { key: 'portimao',    words: ['portimao', 'portimão', 'algarve'] },
    { key: 'bahrain',     words: ['bahrain', 'bahrein', 'sakhir'] },
    { key: 'sebring',     words: ['sebring'] },
    { key: 'fuji',        words: ['fuji'] },
    { key: 'imola',       words: ['imola', 'enzo e dino', 'dino ferrari'] },
    { key: 'roadatlanta', words: ['road atlanta', 'roadatlanta', 'petit le mans', 'braselton'] },
    { key: 'daytona',     words: ['daytona'] },
    { key: 'interlagos',  words: ['interlagos', 'jose carlos pace', 'sao paulo'] },
    { key: 'oultonpark',  words: ['oulton'] },
  ];

  function getTrackSVG(venue, course) {
    const haystack = `${venue} ${course}`.toLowerCase();
    for (const { key, words } of TRACK_KEYWORDS) {
      if (words.some(w => haystack.includes(w))) {
        return buildTrackSVG(TRACK_PATHS[key]);
      }
    }
    return null;
  }

  function buildTrackSVG(pathData) {
    return `<svg viewBox="0 0 200 110" width="100%" height="100%"
              xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <path d="${pathData}"
            fill="none"
            stroke="var(--accent)"
            stroke-width="5"
            stroke-linejoin="round"
            stroke-linecap="round"
            opacity="0.7"/>
      <path d="${pathData}"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            stroke-width="9"
            stroke-linejoin="round"
            stroke-linecap="round"/>
    </svg>`;
  }

  // Fallback : icône générique si le circuit n'est pas reconnu
  function genericTrackIcon() {
    return `<svg viewBox="0 0 200 110" width="100%" height="100%"
              xmlns="http://www.w3.org/2000/svg" style="display:block;opacity:0.25;">
      <ellipse cx="100" cy="55" rx="70" ry="38" fill="none" stroke="var(--accent)" stroke-width="5"/>
    </svg>`;
  }

  // ── SVG Sparkline ──────────────────────────────────────────────────────────

  function generateSparkline(laps) {
    if (!laps || laps.length === 0) {
      return `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">Pas de données de tours</div>`;
    }
    const validLaps = laps.filter(l => isFinite(l.timeSec) && l.timeSec > 0);
    const nonPitLaps = validLaps.filter(l => !l.pit);
    if (nonPitLaps.length === 0) {
      return `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">Pas de tours valides</div>`;
    }

    const times = nonPitLaps.map(l => l.timeSec);
    let minT = Math.min(...times);
    let maxT = Math.max(...times);
    if (maxT === minT) { minT -= 1; maxT += 1; }

    const avgT = times.reduce((a, b) => a + b, 0) / times.length;
    const W = 600, H = 80, PAD_X = 8, PAD_Y = 10;
    const plotW = W - PAD_X * 2, plotH = H - PAD_Y * 2;
    const toY = (t) => PAD_Y + plotH - ((t - minT) / (maxT - minT)) * plotH;
    const toX = (i) => PAD_X + (nonPitLaps.length <= 1 ? plotW / 2 : (i / (nonPitLaps.length - 1)) * plotW);
    const avgY = toY(avgT);

    const polyPoints = nonPitLaps.map((l, i) => `${toX(i).toFixed(1)},${toY(l.timeSec).toFixed(1)}`).join(' ');

    // Pit markers
    const allSeq = validLaps;
    const pitDots = [];
    for (let i = 0; i < allSeq.length; i++) {
      if (allSeq[i].pit) {
        const xFrac = allSeq.length <= 1 ? 0.5 : i / (allSeq.length - 1);
        const px = PAD_X + xFrac * plotW;
        pitDots.push(`<rect x="${(px-2).toFixed(1)}" y="${(H-PAD_Y-4).toFixed(1)}" width="4" height="4" rx="1" fill="rgba(156,163,175,0.5)"/>`);
      }
    }

    let bestDot = '';
    const bestLap = nonPitLaps.find(l => l.isBest);
    if (bestLap) {
      const bi = nonPitLaps.indexOf(bestLap);
      bestDot = `<circle cx="${toX(bi).toFixed(1)}" cy="${toY(bestLap.timeSec).toFixed(1)}" r="5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>`;
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow:visible;" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${PAD_X}" y1="${avgY.toFixed(1)}" x2="${W-PAD_X}" y2="${avgY.toFixed(1)}"
              stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4,4"/>
        <polyline points="${PAD_X.toFixed(1)},${(H-PAD_Y).toFixed(1)} ${polyPoints} ${(W-PAD_X).toFixed(1)},${(H-PAD_Y).toFixed(1)}"
                  fill="url(#sparkGrad)" stroke="none" opacity="0.18"/>
        <polyline points="${polyPoints}" fill="none" stroke="var(--accent)"
                  stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>
        ${nonPitLaps.map((l, i) => l.isBest ? '' :
          `<circle cx="${toX(i).toFixed(1)}" cy="${toY(l.timeSec).toFixed(1)}" r="2.5" fill="var(--accent)" opacity="0.45"/>`
        ).join('')}
        ${bestDot}
        ${pitDots.join('')}
      </svg>`;
  }

  // ── Barres secteurs ────────────────────────────────────────────────────────

  function generateSectorBars(bestS1, bestS2, bestS3, avgS1, avgS2, avgS3) {
    const sectors = [
      { label: 'S1', best: bestS1, avg: avgS1 },
      { label: 'S2', best: bestS2, avg: avgS2 },
      { label: 'S3', best: bestS3, avg: avgS3 }
    ].filter(s => isFinite(s.best) && s.best > 0 && isFinite(s.avg) && s.avg > 0);
    if (sectors.length === 0) return '';

    const maxVal = Math.max(...sectors.flatMap(s => [s.best, s.avg]));
    return `<div style="display:flex;flex-direction:column;gap:8px;">
      ${sectors.map(s => {
        const bestPct = (s.best / maxVal * 100).toFixed(1);
        const avgPct  = (s.avg  / maxVal * 100).toFixed(1);
        return `<div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:var(--muted);">${s.label}</span>
            <span style="font-size:12px;color:var(--muted);">Meil: <span style="color:var(--accent);font-weight:600;">${fmtSec(s.best)}</span> / Moy: ${fmtSec(s.avg)}</span>
          </div>
          <div style="position:relative;height:18px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;height:100%;width:${avgPct}%;background:rgba(167,139,250,0.35);border-radius:4px;"></div>
            <div style="position:absolute;top:2px;left:0;height:calc(100% - 4px);width:${bestPct}%;background:var(--accent);border-radius:3px;opacity:0.85;"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Vue index des circuits ─────────────────────────────────────────────────

  function generateTracksPage(tracksData) {
    const tracks = Object.entries(tracksData || {});

    if (tracks.length === 0) {
      return `<div class="card no-hover" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-map-marker-alt"></i></div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucun circuit trouvé</h3>
        <p class="muted">Aucun circuit dans les sessions scannées pour ce pilote.</p>
      </div>`;
    }

    tracks.sort((a, b) => {
      const diff = b[1].sessionCount - a[1].sessionCount;
      return diff !== 0 ? diff : (a[1].venue + a[1].course).localeCompare(b[1].venue + b[1].course);
    });

    const cards = tracks.map(([, t]) => {
      const trackName  = t.course && t.course !== t.venue ? t.course : (t.venue || 'Circuit inconnu');
      const venueName  = t.course && t.course !== t.venue ? t.venue : '';
      const bestLapStr = isFinite(t.bestLapSec) && t.bestLapSec > 0 ? fmtLap(t.bestLapSec) : '–';
      const vehicles   = t.vehicles ? Array.from(t.vehicles) : [];
      const venueEsc   = esc(t.venue);
      const courseEsc  = esc(t.course);
      const firstVeh   = vehicles[0] ? esc(vehicles[0]) : '';

      return `
        <div class="card" style="cursor:pointer;display:flex;flex-direction:column;transition:transform 0.15s,box-shadow 0.15s;"
             onclick="navigateToTrackDetail('${venueEsc}','${courseEsc}','${firstVeh}')"
             onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.35)'"
             onmouseout="this.style.transform='';this.style.boxShadow=''">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
            <div style="font-size:32px;color:var(--accent);opacity:0.7;flex-shrink:0;">
              <i class="fas fa-map-marker-alt"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(trackName)}</div>
              ${venueName ? `<div style="font-size:12px;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(venueName)}</div>` : ''}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">Meilleur temps</div>
            <div style="font-family:monospace;font-size:15px;font-weight:700;color:var(--accent);">${bestLapStr}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;">
              <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Sessions</div>
              <div style="font-size:16px;font-weight:700;color:var(--text);">${t.sessionCount}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;">
              <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Tours</div>
              <div style="font-size:16px;font-weight:700;color:var(--text);">${t.lapCount}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div style="padding:8px 0 16px;">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:var(--text);">
          <i class="fas fa-map-marker-alt" style="color:var(--accent);margin-right:8px;"></i>Circuits
          <span style="font-size:13px;font-weight:400;color:var(--muted);margin-left:8px;">${tracks.length}</span>
        </h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
          ${cards}
        </div>
      </div>`;
  }

  // ── Graphe progression meilleur temps par session ──────────────────────────

  function generateSessionProgressionChart(sessions, overallBestLapSec) {
    if (!sessions || sessions.length === 0) return '';

    const validSessions = sessions.filter(s => isFinite(s.bestLapSec) && s.bestLapSec > 0);
    if (validSessions.length === 0) return '';

    const times = validSessions.map(s => s.bestLapSec);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime;

    const W = 100, H = 60, PAD = 6;
    const plotW = W - PAD * 2, plotH = H - PAD * 2;

    const normalize = (t) => {
      if (timeRange === 0) return plotW / 2;
      return ((t - minTime) / timeRange) * plotW;
    };

    const bars = validSessions.map((s, i) => {
      const x = PAD + (i / Math.max(1, validSessions.length - 1)) * plotW;
      const w = Math.max(3, Math.min(8, plotW / validSessions.length - 1));
      const y = PAD + plotH - (normalize(s.bestLapSec) / plotW) * plotH;
      const h = (normalize(s.bestLapSec) / plotW) * plotH;
      const isPersonalBest = s.bestLapSec === overallBestLapSec;
      const color = isPersonalBest ? 'var(--accent)' : 'rgba(255,255,255,0.3)';
      return `<rect x="${(x - w/2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1" opacity="0.8"/>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:20px;">
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
          <i class="fas fa-trending-up" style="color:var(--accent);margin-right:8px;"></i>Meilleur temps par session
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="80px" xmlns="http://www.w3.org/2000/svg" style="display:block;">
          <line x1="${PAD}" y1="${(H-PAD).toFixed(1)}" x2="${(W-PAD).toFixed(1)}" y2="${(H-PAD).toFixed(1)}"
                stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
          ${bars}
        </svg>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:center;">
          ${validSessions.length} session${validSessions.length > 1 ? 's' : ''} · Progression du meilleur temps
        </div>
      </div>`;
  }

  // ── Vue détail d'un circuit ────────────────────────────────────────────────

  function generateTrackDetailPage(trackVenue, trackCourse, stats, allVehicles, selectedVehicle) {
    const trackName = trackCourse && trackCourse !== trackVenue ? trackCourse : (trackVenue || 'Circuit inconnu');
    const venueName = trackCourse && trackCourse !== trackVenue ? trackVenue : '';

    const vehicleOptions = (allVehicles || []).map(v =>
      `<option value="${esc(v)}" ${v === selectedVehicle ? 'selected' : ''}>${esc(v)}</option>`
    ).join('');
    const vehicleSelector = allVehicles && allVehicles.length > 1
      ? `<select id="trackVehicleSelector" style="background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;">${vehicleOptions}</select>`
      : (selectedVehicle ? `<span style="background:rgba(167,139,250,0.15);color:var(--purple);border-radius:6px;padding:6px 12px;font-size:13px;">${esc(selectedVehicle)}</span>` : '');

    const header = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button class="btn" onclick="switchView('tracks')" style="padding:6px 12px;font-size:13px;">
          <i class="fas fa-arrow-left"></i> Circuits
        </button>
        <div style="flex:1;min-width:0;">
          <h2 style="margin:0;font-size:20px;font-weight:700;color:var(--text);">
            <i class="fas fa-map-marker-alt" style="color:var(--accent);margin-right:8px;"></i>${esc(trackName)}
          </h2>
          ${venueName ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(venueName)}</div>` : ''}
        </div>
        ${vehicleSelector}
      </div>`;

    if (!stats) {
      return `<div style="padding:8px 0 16px;">${header}
        <div class="card no-hover" style="text-align:center;padding:40px;margin-top:16px;">
          <p class="muted">Aucune donnée disponible pour ce circuit et ce véhicule.</p>
        </div>
      </div>`;
    }

    // KPIs
    const stdDevColor = !isFinite(stats.stdDev) ? 'var(--muted)'
      : stats.stdDev < 0.5 ? '#34d399'
      : stats.stdDev < 1.5 ? '#fbbf24'
      : '#f87171';

    const topSpeeds = stats.allLaps.filter(l => isFinite(l.topSpeed) && l.topSpeed > 0).map(l => l.topSpeed);
    const maxTopSpeed = topSpeeds.length ? Math.max(...topSpeeds) : NaN;
    const pitCount = stats.allLaps.filter(l => l.pit).length;

    const kpis = [
      { label: 'Meilleur tour',  value: fmtLap(stats.bestLapSec),  accent: true },
      { label: 'Tour moyen',     value: fmtLap(stats.avgLapSec) },
      { label: 'Constance',      value: isFinite(stats.stdDev) ? `±${fmtSec(stats.stdDev)}` : '–', customColor: stdDevColor },
      { label: 'Meilleur S1',    value: fmtSec(stats.bestS1) },
      { label: 'Meilleur S2',    value: fmtSec(stats.bestS2) },
      { label: 'Meilleur S3',    value: fmtSec(stats.bestS3) },
      { label: 'Vit. max',       value: isFinite(maxTopSpeed) ? Math.round(maxTopSpeed) + ' km/h' : '–' },
      { label: 'Tours pit',      value: String(pitCount) },
    ].map(item => `
      <div class="card" style="text-align:center;padding:14px 10px;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${item.label}</div>
        <div style="font-size:${item.accent ? '18px' : '16px'};font-weight:700;color:${item.customColor || (item.accent ? 'var(--accent)' : 'var(--text)')};font-family:monospace;">
          ${item.value}
        </div>
      </div>`).join('');

    // Secteurs moyens pour les barres
    const avg = (arr) => { const v = arr.filter(x => isFinite(x) && x > 0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : NaN; };
    const avgS1 = avg(stats.allLaps.map(l => l.s1));
    const avgS2 = avg(stats.allLaps.map(l => l.s2));
    const avgS3 = avg(stats.allLaps.map(l => l.s3));
    const sectorBarsHtml = generateSectorBars(stats.bestS1, stats.bestS2, stats.bestS3, avgS1, avgS2, avgS3);

    // Graphe progression meilleur temps par session
    const sessionProgression = generateSessionProgressionChart(stats.sessions, stats.bestLapSec);

    return `
      <div style="padding:8px 0 16px;">
        ${header}

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:16px;margin-bottom:20px;">
          ${kpis}
        </div>

        <div class="card" style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
            <i class="fas fa-chart-line" style="color:var(--accent);margin-right:8px;"></i>Évolution des temps au tour
          </div>
          ${generateSparkline(stats.allLaps)}
        </div>

        ${sessionProgression}

        ${sectorBarsHtml ? `
        <div class="card" style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
            <i class="fas fa-flag" style="color:var(--accent);margin-right:8px;"></i>Secteurs
          </div>
          ${sectorBarsHtml}
        </div>` : ''}

        <div class="card" style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
            <i class="fas fa-calendar-alt" style="color:var(--accent);margin-right:8px;"></i>Sessions (${stats.sessions.length})
          </div>
          ${generateSessionsTable(stats.sessions)}
        </div>

        <div class="card" style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
            <i class="fas fa-list" style="color:var(--accent);margin-right:8px;"></i>Tours (${stats.allLaps.length})
          </div>
          ${generateLapsTable(stats.allLaps, stats.bestLapSec)}
        </div>
      </div>`;
  }

  function generateSessionsTable(sessions) {
    if (!sessions || sessions.length === 0) {
      return `<p class="muted" style="text-align:center;padding:16px;">Aucune session</p>`;
    }
    const rows = sessions.map(s => `
      <tr>
        <td style="white-space:nowrap;">${esc(s.date || '–')}</td>
        <td><span style="${sessionTypeBadgeStyle(s.sessionType)}border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;">${sessionTypeLabel(s.sessionType, s.sessionName)}</span></td>
        <td style="text-align:center;">${s.lapCount}</td>
        <td style="font-family:monospace;color:var(--accent);">${fmtLap(s.bestLapSec)}</td>
        <td style="font-family:monospace;color:var(--muted);">${fmtLap(s.avgLapSec)}</td>
      </tr>`).join('');

    return `<div style="overflow-x:auto;">
      <table class="table" style="width:100%;font-size:13px;">
        <thead><tr>
          <th>Date</th><th>Type</th>
          <th style="text-align:center;">Tours</th>
          <th>Meilleur</th><th>Moyen</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function generateLapsTable(allLaps, bestLapSec) {
    if (!allLaps || allLaps.length === 0) {
      return `<p class="muted" style="text-align:center;padding:16px;">Aucun tour</p>`;
    }
    const rows = allLaps.map((lap, idx) => {
      const isBest = lap.isBest;
      const isPit  = lap.pit;
      const rowStyle = isBest ? 'background:rgba(96,165,250,0.1);' : isPit ? 'opacity:0.5;' : '';
      const delta = isFinite(lap.timeSec) && isFinite(bestLapSec) && !isBest ? lap.timeSec - bestLapSec : null;
      const deltaStr = isBest
        ? `<span style="color:var(--accent);font-weight:700;">REF</span>`
        : delta !== null
          ? `<span style="color:${delta > 2 ? '#f87171' : '#e5e7eb'};">${fmtDelta(delta)}</span>`
          : '–';
      const pitBadge = isPit
        ? `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;border-radius:3px;padding:1px 5px;font-size:10px;margin-left:4px;">PIT</span>`
        : '';

      return `<tr style="${rowStyle}">
        <td style="text-align:center;font-weight:${isBest?'700':'400'};">${isFinite(lap.num)?lap.num:idx+1}${pitBadge}</td>
        <td style="font-family:monospace;font-weight:${isBest?'700':'400'};color:${isBest?'var(--accent)':isPit?'var(--muted)':'var(--text)'};">${fmtLap(lap.timeSec)}</td>
        <td style="font-family:monospace;font-size:12px;">${deltaStr}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--muted);">${fmtSec(lap.s1)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--muted);">${fmtSec(lap.s2)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--muted);">${fmtSec(lap.s3)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--muted);">${isFinite(lap.topSpeed)&&lap.topSpeed>0?Math.round(lap.topSpeed)+' km/h':'–'}</td>
      </tr>`;
    }).join('');

    return `<div style="overflow-x:auto;max-height:420px;overflow-y:auto;">
      <table class="table" style="width:100%;font-size:13px;">
        <thead style="position:sticky;top:0;background:var(--panel);z-index:1;">
          <tr>
            <th style="text-align:center;">Tour</th>
            <th>Temps</th><th>Delta</th>
            <th>S1</th><th>S2</th><th>S3</th>
            <th>Vit. max</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.LMUTrackManager = { generateTracksPage, generateTrackDetailPage };
  }

})();
