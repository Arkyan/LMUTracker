// Page Session: lit ?file=... depuis l'URL, charge le XML et réutilise le rendu existant
(function(){
  function getQueryParam(name){
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }
  const filePath = getQueryParam('file');
  const root = document.getElementById('sessionRoot');
  if (!filePath) {
    root.innerHTML = '<p class="muted">Aucun fichier fourni.</p>';
    return;
  }
  // Fonctions utilitaires minimales copiées de renderer.js
  function arrayify(x){ return x==null? [] : (Array.isArray(x)? x : [x]); }
  function toNumber(v){ if(v==null) return NaN; const n = typeof v==='number'? v : parseFloat(String(v).replace(',', '.')); return isNaN(n)? NaN : n; }
  function fmtTime(sec){ if(!isFinite(sec)||sec<=0) return '—'; const m=Math.floor(sec/60); const s=sec-m*60; const ms=Math.round((s-Math.floor(s))*1000); const sInt=Math.floor(s); return `${m}:${String(sInt).padStart(2,'0')}.${String(ms).padStart(3,'0')}`; }
  function getRaceResultsRoot(data){ return data?.rFactorXML?.RaceResults || data?.RaceResults || null; }
  function pickSession(rr){ if(!rr) return null; const entries=Object.entries(rr).filter(([k,v])=>v && typeof v==='object' && ('Driver' in v)); if(!entries.length) return null; const pr=(k)=>{ const kk=k.toLowerCase(); if(kk.includes('race'))return 100; if(kk.includes('qual'))return 80; if(kk.includes('practice')||kk.includes('practise'))return 60; if(kk.includes('warm'))return 50; return 10; }; entries.sort((a,b)=>pr(b[0])-pr(a[0])); const [name,node]=entries[0]; return {name,node}; }
  function extractDrivers(sessionNode){
    const drivers = arrayify(sessionNode.Driver).map((d, idx)=>{
      const lapsRaw = arrayify(d.Lap);
      const laps = lapsRaw.map(lap=>{
        if(lap==null) return null;
        if(typeof lap==='string' || typeof lap==='number'){
          const t = toNumber(lap);
          return { num: NaN, timeSec:t, s1:NaN, s2:NaN, s3:NaN, topSpeed:NaN, pit:false };
        }
        const at = (k)=> toNumber(lap[`@_${k}`]);
        const timeSec = toNumber(lap['#text']);
        return { num: toNumber(lap['@_num']), timeSec, s1:at('s1'), s2:at('s2'), s3:at('s3'), topSpeed:at('topspeed'), pit:String(lap['@_pit']??'')==='1'};
      }).filter(Boolean);
      const valid = laps.map(l=>l.timeSec).filter(t=>isFinite(t)&&t>0);
      const bestLapSec = isFinite(toNumber(d.BestLapTime))? toNumber(d.BestLapTime) : Math.min(...valid);
      const avgLapSec = valid.length? (valid.reduce((a,b)=>a+b,0)/valid.length): NaN;
      const maxTop = Math.max(...laps.map(l=>l.topSpeed).filter(x=>isFinite(x)));
      return { position:toNumber(d.Position), classPosition:toNumber(d.ClassPosition), name:d.Name||`Driver ${idx+1}`, car:d.CarType||d.VehName||'', carClass:d.CarClass||'', number:d.CarNumber||'', team:d.TeamName||'', lapsCount:toNumber(d.Laps)||laps.length, pitstops:toNumber(d.Pitstops)||0, bestLapSec, avgLapSec, topSpeedMax:isFinite(maxTop)? maxTop:NaN, laps };
    });
    drivers.sort((a,b)=>{ if(isFinite(a.position)&&isFinite(b.position)) return a.position-b.position; return a.bestLapSec-b.bestLapSec; });
    return drivers;
  }
  function extractSession(parsed){
    const rr = getRaceResultsRoot(parsed); if(!rr) return null; const picked = pickSession(rr); if(!picked) return null; const {name,node} = picked;
    const stream = node.Stream || rr.Stream || null;
    const sectors = arrayify(stream?.Sector).map(s=>({ et:toNumber(s?.['@_et']??s?.et), text: typeof s==='string'? s : (s?.['#text']||'')}));
    const scores = arrayify(stream?.Score).map(s=>({ et:toNumber(s?.['@_et']??s?.et), text: typeof s==='string'? s : (s?.['#text']||'')}));
    const incidents = arrayify(stream?.Incident).map(s=>({ et:toNumber(s?.['@_et']??s?.et), text: typeof s==='string'? s : (s?.['#text']||'')}));
    
    // Formatage de la date en français à partir du timestamp DateTime
    let formattedTime = '';
    if (rr.DateTime) {
      try {
        const timestamp = parseInt(rr.DateTime) * 1000; // Convertir en millisecondes
        const date = new Date(timestamp);
        formattedTime = date.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' à ' + date.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
      } catch {
        formattedTime = rr.TimeString || '';
      }
    } else {
      formattedTime = rr.TimeString || '';
    }
    
    const meta = { session:name, track: rr.TrackVenue||rr.TrackCourse||'', event: rr.TrackEvent||'', time: formattedTime, mostLaps: toNumber(node.MostLapsCompleted)||toNumber(rr.MostLapsCompleted)||NaN, sectors, scores, incidents };
    const drivers = extractDrivers(node);
    return { meta, drivers };
  }
  function renderSessionInto(container, fileLabel, session){
    const { meta, drivers } = session;
    let html = '';
    if (fileLabel) html += `<h3 style="margin-bottom:12px;">${fileLabel}</h3>`;
    html += `<div style="background:linear-gradient(135deg,rgba(96,165,250,0.1),rgba(167,139,250,0.1));border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--accent);">🏁 ${meta.event || 'Session'}</div>
      <div class="row" style="gap:16px;flex-wrap:wrap;">
        <span class="chip">🏎️ ${meta.track || ''}</span>
        <span class="chip">📅 ${meta.session}</span>
        <span class="chip">🕐 ${meta.time || ''}</span>
        <span class="chip">🔄 Tours max: ${isFinite(meta.mostLaps) ? meta.mostLaps : '—'}</span>
      </div>
    </div>`;
    html += `<table class="table"><thead><tr>
      <th>🏆</th><th>Pilote</th><th>Classe</th><th>Voiture</th><th>⏱️ Meilleur</th><th>📊 Moyenne</th><th>🔄 Tours</th><th>⛽ Pits</th><th>🚀 V.Max</th>
    </tr></thead><tbody>`;
    for (const d of drivers) {
      const driverId = `drv_${(d.name||'').replace(/[^a-z0-9]/gi,'_')}_${Math.random().toString(36).slice(2,7)}`;
      const positionBadge = isFinite(d.position) && d.position>0 ? `<div class="badge" style="background:${d.position===1?'linear-gradient(135deg,#fbbf24,#f59e0b)':d.position===2?'linear-gradient(135deg,#94a3b8,#64748b)':d.position===3?'linear-gradient(135deg,#fb923c,#ea580c)':'linear-gradient(135deg,var(--accent),var(--brand))'}">${d.position}</div>` : '';
      const classUpper = (d.carClass || '').toUpperCase();
      let classBg = 'var(--muted)';
      if (classUpper.includes('HYPER')) classBg = '#ef4444';
      else if (classUpper.includes('GT3') || classUpper.includes('LMGT3')) classBg = '#22c55e';
      else if (classUpper.includes('LMP2')) classBg = '#f97316';
      else if (classUpper.includes('LMP3')) classBg = '#a855f7';
      else if (classUpper.includes('LMGTE') || classUpper.includes('GTE')) classBg = '#eab308';
      const classTag = d.carClass ? `<span class="chip" style="background:${classBg};color:#fff;border:none;font-weight:600;font-size:11px;">${d.carClass}</span>` : '';
      html += `<tr class="section-header" data-target="${driverId}" style="cursor:pointer;">
        <td>${positionBadge}</td>
        <td style="font-weight:600;color:var(--text);">${d.name}</td>
        <td>${classTag}</td>
        <td><span class="chip">${d.car || ''}</span></td>
        <td style="font-weight:600;color:var(--ok);">${fmtTime(d.bestLapSec)}</td>
        <td style="color:var(--muted);">${fmtTime(d.avgLapSec)}</td>
        <td>${d.lapsCount}</td>
        <td>${d.pitstops}</td>
        <td style="font-weight:600;color:var(--accent);">${isFinite(d.topSpeedMax) ? d.topSpeedMax.toFixed(1)+' km/h' : '—'}</td>
      </tr>
      <tr class="section-content" id="${driverId}" style="display:none;">
        <td colspan="9">
          <div class="card" style="margin:8px;background:var(--panel);">
            <div style="font-weight:600;margin-bottom:12px;color:var(--accent);">📋 Tours détaillés</div>
            <table class="table">
              <thead><tr>
                <th>#</th><th>Temps</th><th>S1</th><th>S2</th><th>S3</th><th>TopSpeed</th><th>Pit</th>
              </tr></thead>
              <tbody>
                ${d.laps.map(l => `<tr>
                  <td>${isFinite(l.num)? l.num : ''}</td>
                  <td style="font-weight:500;">${fmtTime(l.timeSec)}</td>
                  <td>${isFinite(l.s1)? l.s1.toFixed(3): ''}</td>
                  <td>${isFinite(l.s2)? l.s2.toFixed(3): ''}</td>
                  <td>${isFinite(l.s3)? l.s3.toFixed(3): ''}</td>
                  <td>${isFinite(l.topSpeed) && l.topSpeed > 0 ? l.topSpeed.toFixed(1)+' km/h': '—'}</td>
                  <td>${l.pit? '<span class="chip" style="background:var(--warn);color:#000;">⛽ Pit</span>' : ''}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </td>
      </tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
    container.querySelectorAll('.section-header').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-target');
        const block = container.querySelector(`#${CSS.escape(id)}`);
        if (!block) return;
        const isHidden = getComputedStyle(block).display === 'none';
        block.style.display = isHidden ? '' : 'none';
      });
    });
  }
  async function init(){
    root.innerHTML = `<p class="muted">Chargement…</p>`;
    const res = await window.lmuAPI.openFileByPath(filePath);
    if (res.canceled) {
      root.innerHTML = `<p class="muted">Erreur: ${res.error||'inconnue'}</p>`;
      return;
    }
    const session = (function(parsed){
      const rr = getRaceResultsRoot(parsed);
      if (!rr) return null;
      const picked = pickSession(rr);
      if (!picked) return null;
      const { node } = picked;
      return extractSession(parsed);
    })(res.parsed);
    if (!session) {
      root.innerHTML = `<pre>${JSON.stringify(res.parsed, null, 2)}</pre>`;
      return;
    }
    renderSessionInto(root, res.filePath, session);
  }
  init();
})();
