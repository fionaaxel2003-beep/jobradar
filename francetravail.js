// Client France Travail — API officielle "Offres d'emploi v2" (gratuite).
// Auth OAuth2 client_credentials, puis recherche d'offres.
// URLs configurables pour permettre les tests (mock).

const TOKEN_URL = process.env.FT_TOKEN_URL
  || 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH_URL = process.env.FT_SEARCH_URL
  || 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const SCOPE = process.env.FT_SCOPE || 'api_offresdemploiv2 o2dsoffre';

let tokenCache = { value: null, exp: 0 };

export function ftConfigured(){
  return !!(process.env.FT_CLIENT_ID && process.env.FT_CLIENT_SECRET);
}

export async function getToken(fetchImpl = fetch){
  const now = Date.now();
  if(tokenCache.value && now < tokenCache.exp - 60000) return tokenCache.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.FT_CLIENT_ID || '',
    client_secret: process.env.FT_CLIENT_SECRET || '',
    scope: SCOPE
  });
  const r = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if(!r.ok) throw new Error('France Travail token HTTP ' + r.status);
  const j = await r.json();
  tokenCache = { value: j.access_token, exp: now + (j.expires_in || 1200) * 1000 };
  return tokenCache.value;
}

function normalize(o){
  const ts = o.dateCreation ? Date.parse(o.dateCreation) : (o.dateActualisation ? Date.parse(o.dateActualisation) : 0);
  const tags = [];
  if(o.typeContratLibelle) tags.push(o.typeContratLibelle);
  if(o.experienceLibelle) tags.push(o.experienceLibelle);
  if(o.romeLibelle) tags.push(o.romeLibelle);
  return {
    id: 'ft_' + (o.id || Math.abs(hash(o.intitule + (o.entreprise?.nom||'')))),
    title: o.intitule || 'Offre',
    company: (o.entreprise && o.entreprise.nom) || 'Entreprise non précisée',
    location: (o.lieuTravail && o.lieuTravail.libelle) || '',
    url: (o.origineOffre && o.origineOffre.urlOrigine) || ('https://candidat.francetravail.fr/offres/recherche/detail/' + (o.id||'')),
    ts: ts || 0,
    tags: tags.filter(Boolean).slice(0, 5),
    remote: false,
    source: 'France Travail'
  };
}
function hash(s){ let h=0; s=(s||''); for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return h; }

// params : { motsCles, region, departement, range }
export async function searchFT(params = {}, fetchImpl = fetch){
  if(!ftConfigured()) return { offers: [], configured: false };
  const token = await getToken(fetchImpl);
  const q = new URLSearchParams();
  if(params.motsCles) q.set('motsCles', params.motsCles);
  if(params.departement) q.set('departement', params.departement);
  else if(params.region) q.set('region', params.region);
  q.set('sort', '1');                       // 1 = tri par date décroissante
  q.set('range', params.range || '0-49');
  const r = await fetchImpl(SEARCH_URL + '?' + q.toString(), {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
  });
  if(r.status === 204) return { offers: [], configured: true };
  if(!r.ok && r.status !== 206) throw new Error('France Travail search HTTP ' + r.status);
  const j = await r.json();
  const offers = (j.resultats || []).map(normalize);
  return { offers, configured: true };
}
