// Sources ouvertes complémentaires (télétravail / tech), côté serveur.
// Résilientes : si une source échoue, on continue avec les autres.

function hash(s){ let h=0; s=(s||''); for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return h; }

async function arbeitnow(fetchImpl){
  const r = await fetchImpl('https://www.arbeitnow.com/api/job-board-api');
  const j = await r.json();
  return (j.data || []).map(o => ({
    id: 'an_' + (o.slug || Math.abs(hash(o.title))),
    title: o.title, company: o.company_name,
    location: o.location || (o.remote ? 'Remote' : ''),
    url: o.url, ts: o.created_at ? o.created_at * 1000 : 0,
    tags: o.tags || [], remote: !!o.remote, source: 'Arbeitnow'
  }));
}
async function remoteok(fetchImpl){
  const r = await fetchImpl('https://remoteok.com/api');
  const j = await r.json();
  return j.slice(1).map(o => ({
    id: 'rok_' + (o.id || Math.abs(hash(o.position||o.title))),
    title: o.position || o.title, company: o.company,
    location: o.location || 'Remote',
    url: o.apply_url || o.url,
    ts: o.epoch ? o.epoch * 1000 : (o.date ? Date.parse(o.date) : 0),
    tags: o.tags || [], remote: true, source: 'RemoteOK'
  }));
}

export async function openSources(fetchImpl = fetch){
  const out = [];
  for(const fn of [arbeitnow, remoteok]){
    try { out.push(...await fn(fetchImpl)); } catch(e){ /* source indisponible : on ignore */ }
  }
  return out;
}
