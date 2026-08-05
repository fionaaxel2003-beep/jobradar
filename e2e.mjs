import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Mock France Travail
const mock = http.createServer((req,res)=>{
  if(req.url.startsWith('/token')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({access_token:'TOK',expires_in:1200}));return;}
  if(req.url.startsWith('/search')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({resultats:[
    {id:'1',intitule:'Mécanicien vélo',entreprise:{nom:'CycloParis'},lieuTravail:{libelle:'75 - Paris'},origineOffre:{urlOrigine:'https://x/1'},dateCreation:new Date().toISOString(),typeContratLibelle:'CDI',romeLibelle:'Réparation de cycles'},
    {id:'2',intitule:'Vendeur vélo',entreprise:{nom:'BikeStore'},lieuTravail:{libelle:'92 - Hauts-de-Seine'},origineOffre:{urlOrigine:'https://x/2'},dateCreation:new Date(Date.now()-86400000).toISOString(),typeContratLibelle:'CDD'}
  ]}));return;}
  res.writeHead(404);res.end();
});
await new Promise(r=>mock.listen(0,r));
const mp=mock.address().port;
const tmp=path.join(os.tmpdir(),'jr_e2e_'+Date.now()+'.json');
const PORT=3987;

const srv=spawn('node',['server.js'],{cwd:path.resolve('.'),env:{...process.env,
  PORT:String(PORT),DATA_FILE:tmp,JWT_SECRET:'e2e',
  FT_TOKEN_URL:`http://127.0.0.1:${mp}/token`,FT_SEARCH_URL:`http://127.0.0.1:${mp}/search`,
  FT_CLIENT_ID:'CID',FT_CLIENT_SECRET:'SEC'}});
srv.stdout.on('data',d=>{});srv.stderr.on('data',d=>process.stderr.write('[srv] '+d));
await new Promise(r=>setTimeout(r,1500));

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errors=[];
const page=await browser.newPage();
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
const base=`http://127.0.0.1:${PORT}`;

await page.goto(base);await page.waitForTimeout(300);
console.log('Écran de connexion visible:',await page.isVisible('#authView'));

// Créer un compte
await page.click('#tabReg');
await page.fill('#authEmail','lea@test.fr');await page.fill('#authPass','motdepasse');
await page.click('#authSubmit');await page.waitForTimeout(600);
console.log('App visible après inscription:',await page.isVisible('#appView'));

// Profil
await page.click('nav.tabs button[data-tab="profile"]');
await page.fill('#pName','Léa');await page.selectOption('#pSector','Commerce / Vente / Distribution');
await page.fill('#pKeywords','vélo');await page.fill('#pLocation','Île-de-France');
await page.fill('#pPitch','Vendeuse spécialisée, 3 ans en magasin de sport');
await page.fill('#pSkills','conseil client, vélo, encaissement');
await page.fill('#pMotivation','rejoindre une équipe passionnée de cyclisme');
await page.check('#aEnabled');
await page.click('button[onclick="saveProfile()"]');
await page.waitForTimeout(800);

// Offres
const count=await page.textContent('#liveCount');
const ftBadges=await page.$$eval('.badge-ft',els=>els.length);
const firstTitle=await page.$eval('#liveJobs .jobcard .jt',e=>e.textContent);
console.log('Offres affichées:',count,'| badges France Travail:',ftBadges,'| 1re offre:',firstTitle);

// Entreprise
await page.fill('#companyInput','Décathlon');await page.click('button[onclick="addCompany()"]');
await page.waitForTimeout(300);
const comp=await page.$$eval('#companyGrid .site .sn',els=>els.map(e=>e.textContent));
console.log('Entreprises:',JSON.stringify(comp));

// Lettre
await page.click('nav.tabs button[data-tab="letter"]');
await page.click('button[onclick="fillDemoOffer()"]');await page.click('button[onclick="genLetter()"]');
await page.waitForTimeout(200);
const letter=await page.innerText('#letterOut');
console.log('Lettre générée contient l\'entreprise:',letter.includes('Nova Studio'));

// Suivre une offre
await page.click('nav.tabs button[data-tab="search"]');await page.waitForTimeout(300);
await page.click('#liveJobs .jobcard .actions button[onclick="saveIdx(0)"]');await page.waitForTimeout(300);
await page.click('nav.tabs button[data-tab="tracker"]');await page.waitForTimeout(200);
const rows=await page.$$eval('#trackBody tr',els=>els.length);
console.log('Candidatures suivies:',rows);

// Screenshot desktop
await page.click('nav.tabs button[data-tab="search"]');await page.waitForTimeout(300);
await page.setViewportSize({width:1280,height:900});
await page.screenshot({path:'shot-desktop.png'});

// Sync : déconnexion + reconnexion
await page.click('button[onclick="doLogout()"]');await page.waitForTimeout(500);
await page.fill('#authEmail','lea@test.fr');await page.fill('#authPass','motdepasse');await page.click('#authSubmit');
await page.waitForTimeout(600);
await page.click('nav.tabs button[data-tab="profile"]');await page.waitForTimeout(200);
const kwAfter=await page.inputValue('#pKeywords');
console.log('Synchro après reconnexion — mots-clés conservés:',kwAfter);

// Screenshot mobile
const mobp=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
await mobp.goto(base);await mobp.waitForTimeout(300);
await mobp.fill('#authEmail','lea@test.fr');await mobp.fill('#authPass','motdepasse');await mobp.click('#authSubmit');
await mobp.waitForTimeout(800);
await mobp.screenshot({path:'shot-mobile.png'});

console.log('\nERREURS JS:',errors.length?JSON.stringify(errors):'AUCUNE');
await browser.close();srv.kill();mock.close();
try{fs.unlinkSync(tmp);}catch(e){}
