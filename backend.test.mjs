import http from 'http';
import assert from 'assert';

// ---- Serveur France Travail simulé ----
let lastSearchQuery = null;
const mock = http.createServer((req, res) => {
  if(req.url.startsWith('/token')){
    let body=''; req.on('data',d=>body+=d); req.on('end',()=>{
      assert(body.includes('client_id=CID'), 'le client_id doit être envoyé');
      assert(body.includes('grant_type=client_credentials'), 'grant_type attendu');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ access_token:'TOK123', expires_in:1200 }));
    });
    return;
  }
  if(req.url.startsWith('/search')){
    lastSearchQuery = req.url;
    assert(req.headers.authorization === 'Bearer TOK123', 'le token doit être en Authorization');
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ resultats: [
      { id:'2', intitule:'Vendeur vélo', entreprise:{nom:'BikeStore'}, lieuTravail:{libelle:'92 - Hauts-de-Seine'},
        origineOffre:{urlOrigine:'https://candidat.francetravail.fr/offre/2'}, dateCreation:'2026-08-04T09:00:00Z', typeContratLibelle:'CDD' },
      { id:'1', intitule:'Mécanicien vélo', entreprise:{nom:'CycloParis'}, lieuTravail:{libelle:'75 - Paris'},
        origineOffre:{urlOrigine:'https://candidat.francetravail.fr/offre/1'}, dateCreation:'2026-08-05T10:00:00Z',
        typeContratLibelle:'CDI', romeLibelle:'Réparation de cycles' }
    ]}));
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise(r => mock.listen(0, r));
const port = mock.address().port;

// Config env AVANT import du module (URLs lues à l'import)
process.env.FT_TOKEN_URL  = `http://127.0.0.1:${port}/token`;
process.env.FT_SEARCH_URL = `http://127.0.0.1:${port}/search`;
process.env.FT_CLIENT_ID = 'CID';
process.env.FT_CLIENT_SECRET = 'SECRET';

const { aggregate } = await import('../lib/aggregate.js');
const { resolveLoc } = await import('../lib/locations.js');

// ---- Test résolution localisation ----
assert.equal(resolveLoc('IDF').region, '11', 'IDF -> région 11');
assert.equal(resolveLoc('92').departement, '92', '92 -> département 92');
assert.equal(resolveLoc('Hauts-de-Seine (92)').departement, '92', 'label menu -> 92');
console.log('✓ Résolution localisation (IDF->11, 92->dépt)');

// ---- Test agrégation France Travail ----
const res = await aggregate({ keywords:'vélo', location:'Île-de-France' });
assert.equal(res.ftConfigured, true, 'FT doit être configuré');
assert.equal(res.offers.length, 2, 'deux offres attendues');
assert.equal(res.offers[0].title, 'Mécanicien vélo', 'tri par date : la plus récente en premier');
assert.equal(res.offers[0].source, 'France Travail');
assert.equal(res.offers[0].company, 'CycloParis');
assert.equal(res.offers[0].url, 'https://candidat.francetravail.fr/offre/1', 'url de candidature normalisée');
assert(res.offers[0].tags.includes('CDI'), 'tags contrat présents');
console.log('✓ Agrégation FT : 2 offres, triées par date, normalisées');

// ---- Test paramètres envoyés à l'API ----
assert(lastSearchQuery.includes('region=11'), 'la région IDF (11) doit être passée à FT');
assert(lastSearchQuery.includes('sort=1'), 'tri par date (sort=1)');
assert(lastSearchQuery.includes('motsCles=v'), 'mots-clés passés');
console.log('✓ Requête FT correcte : region=11, sort=1, motsCles=vélo');

mock.close();
console.log('\nTOUS LES TESTS BACKEND PASSENT ✅');
