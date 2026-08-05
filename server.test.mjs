import http from 'http';
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ---- Mock France Travail ----
const mock = http.createServer((req,res)=>{
  if(req.url.startsWith('/token')){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({access_token:'TOK',expires_in:1200})); return; }
  if(req.url.startsWith('/search')){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ resultats:[
      { id:'1', intitule:'Mécanicien vélo', entreprise:{nom:'CycloParis'}, lieuTravail:{libelle:'75 - Paris'}, origineOffre:{urlOrigine:'https://x/1'}, dateCreation:'2026-08-05T10:00:00Z', typeContratLibelle:'CDI' },
      { id:'2', intitule:'Vendeur vélo', entreprise:{nom:'BikeStore'}, lieuTravail:{libelle:'92 - Hauts-de-Seine'}, origineOffre:{urlOrigine:'https://x/2'}, dateCreation:'2026-08-04T09:00:00Z' }
    ]}));
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise(r=>mock.listen(0,r));
const p = mock.address().port;

const tmp = path.join(os.tmpdir(), 'jr_test_'+Date.now()+'.json');
process.env.DATA_FILE = tmp;
process.env.FT_TOKEN_URL = `http://127.0.0.1:${p}/token`;
process.env.FT_SEARCH_URL = `http://127.0.0.1:${p}/search`;
process.env.FT_CLIENT_ID='CID'; process.env.FT_CLIENT_SECRET='SEC';
process.env.JWT_SECRET='testsecret'; process.env.NODE_ENV='test';

const { app } = await import('../server.js');
const srv = app.listen(0);
await new Promise(r=>srv.once('listening',r));
const base = `http://127.0.0.1:${srv.address().port}`;

let cookie = '';
async function api(method, url, body){
  const r = await fetch(base+url, { method,
    headers:{ 'Content-Type':'application/json', ...(cookie?{Cookie:cookie}:{}) },
    body: body?JSON.stringify(body):undefined });
  const sc = r.headers.get('set-cookie'); if(sc) cookie = sc.split(';')[0];
  let j=null; try{ j=await r.json(); }catch(e){}
  return { status:r.status, j };
}

// inscription
let r = await api('POST','/api/register',{ email:'lea@test.fr', password:'motdepasse' });
assert.equal(r.status,200,'inscription OK'); assert.equal(r.j.user.email,'lea@test.fr');
assert(!('passHash' in r.j.user),'le hash ne doit jamais sortir');
console.log('✓ Inscription + cookie de session');

// me
r = await api('GET','/api/me');
assert.equal(r.status,200); assert.equal(r.j.ftConfigured,true);
console.log('✓ /api/me connecté, France Travail configuré');

// profil (synchronisé côté serveur)
r = await api('PUT','/api/profile',{ profile:{ keywords:'vélo', location:'Île-de-France', name:'Léa' }, companies:['Décathlon'] });
assert.equal(r.status,200); assert.equal(r.j.user.profile.keywords,'vélo'); assert.deepEqual(r.j.user.companies,['Décathlon']);
console.log('✓ Profil enregistré côté serveur (sync multi-appareils)');

// offres
r = await api('GET','/api/jobs');
assert.equal(r.status,200); assert.equal(r.j.offers.length,2,'2 offres FT');
assert.equal(r.j.offers[0].title,'Mécanicien vélo','triées par date');
assert.equal(r.j.offers[0].source,'France Travail');
console.log('✓ /api/jobs renvoie les offres France Travail triées');

// suivi
r = await api('POST','/api/saved',{ item:{ poste:'Mécanicien vélo', entreprise:'CycloParis', url:'https://x/1' } });
assert.equal(r.j.saved.length,1); console.log('✓ Candidature suivie (persistée serveur)');

// mauvais mot de passe
cookie='';
r = await api('POST','/api/login',{ email:'lea@test.fr', password:'faux' });
assert.equal(r.status,401,'mauvais mot de passe rejeté'); console.log('✓ Connexion refusée si mauvais mot de passe');

// connexion correcte
r = await api('POST','/api/login',{ email:'lea@test.fr', password:'motdepasse' });
assert.equal(r.status,200); console.log('✓ Connexion correcte');

// ---- Scan d'alertes ----
process.env.BREVO_API_KEY=''; // pas d'envoi réel, log seulement
const { runScan } = await import('../lib/scan.js');
await api('PUT','/api/alerts',{ enabled:true });
let s = await runScan();
assert.equal(s.totalNew,2,'2 offres nouvelles au 1er scan');
let s2 = await runScan();
assert.equal(s2.totalNew,0,'0 nouvelle au 2e scan (déjà vues) — pas de spam');
console.log('✓ Scan alertes : 2 nouvelles puis 0 (mémoire des offres vues OK)');

srv.close(); mock.close();
try{ fs.unlinkSync(tmp); }catch(e){}
console.log('\nTOUS LES TESTS SERVEUR PASSENT ✅');
