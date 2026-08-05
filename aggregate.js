// Agrégation : France Travail (filtré région/département par l'API) + sources ouvertes,
// filtrées par mots-clés et localisation, triées par date décroissante.
import { searchFT } from './francetravail.js';
import { openSources } from './sources.js';
import { resolveLoc, norm } from './locations.js';

function matchKw(text, kws){
  if(!kws.length) return true;
  text = (text || '').toLowerCase();
  return kws.some(k => k && text.includes(k));
}

export async function aggregate(profile = {}, opts = {}){
  const fetchImpl = opts.fetch || fetch;
  const kws = (profile.keywords || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const loc = resolveLoc(profile.location || '');
  const wantsLoc = !!norm(loc.canon);
  const locTerm = norm(loc.canon);

  let ft = { offers: [], configured: false };
  try {
    ft = await searchFT({ motsCles: profile.keywords || '', region: loc.region, departement: loc.departement }, fetchImpl);
  } catch(e){ ft = { offers: [], configured: true, error: String(e.message || e) }; }

  let open = [];
  try { open = await openSources(fetchImpl); } catch(e){ open = []; }

  // France Travail : déjà filtré géographiquement par l'API -> on garde tel quel (filtre mots-clés léger de secours)
  const ftFiltered = ft.offers.filter(o => matchKw(o.title + ' ' + (o.tags||[]).join(' '), kws) || kws.length === 0 || true);

  // Sources ouvertes : filtre mots-clés + localisation (remote ou zone correspondante)
  function locOk(o){
    if(!wantsLoc) return true;
    if(o.remote) return true;
    const L = norm(o.location || '');
    if(!L) return false;
    if(['remote','teletravail','anywhere','france','worldwide'].some(t => L.includes(t))) return true;
    return locTerm && L.includes(locTerm);
  }
  const openFiltered = open.filter(o => matchKw(o.title + ' ' + (o.tags||[]).join(' ') + ' ' + o.company, kws) && locOk(o));

  const all = [...ftFiltered, ...openFiltered];
  all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return {
    ftConfigured: ft.configured,
    ftError: ft.error || null,
    counts: { franceTravail: ftFiltered.length, ouvertes: openFiltered.length },
    offers: all.slice(0, 60)
  };
}
