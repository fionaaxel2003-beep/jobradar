// Datastore : fichier JSON (local / hôte avec disque) OU Upstash Redis (gratuit, persistant, partagé)
// Upstash est utilisé automatiquement si UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN sont définis.
import fs from 'fs';
import path from 'path';

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'db.json');
const U_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const U_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const U_KEY = process.env.STORE_KEY || 'jobradar:db';
const useUpstash = !!(U_URL && U_TOKEN);

let cache = null;
let pending = Promise.resolve();

function ensureDir(){ const d=path.dirname(DATA_FILE); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }

async function upstash(cmd){
  const r = await fetch(U_URL, {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+U_TOKEN, 'Content-Type':'application/json' },
    body: JSON.stringify(cmd)
  });
  if(!r.ok) throw new Error('Upstash HTTP '+r.status);
  return r.json(); // { result: ... }
}

// À appeler au démarrage (serveur et scanner) pour charger la base en mémoire.
export async function initStore(){
  if(useUpstash){
    try{ const j = await upstash(['GET', U_KEY]); cache = j.result ? JSON.parse(j.result) : { users:{} }; }
    catch(e){ console.error('initStore Upstash:', e.message); cache = { users:{} }; }
  } else {
    ensureDir();
    try{ cache = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){ cache = { users:{} }; }
  }
  if(!cache.users) cache.users = {};
  return cache;
}

export function load(){
  if(cache) return cache;
  if(!useUpstash){
    ensureDir();
    try{ cache = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){ cache = { users:{} }; }
  } else {
    cache = { users:{} };
  }
  if(!cache.users) cache.users = {};
  return cache;
}

export function save(){
  if(useUpstash){
    const blob = JSON.stringify(cache);
    pending = upstash(['SET', U_KEY, blob]).catch(e=>console.error('save Upstash:', e.message));
    return pending;
  }
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let saveTimer=null;
export function saveSoon(){ if(saveTimer)clearTimeout(saveTimer); saveTimer=setTimeout(save,300); }

// Garantit que la dernière écriture Upstash est terminée (utile pour le scanner avant de quitter).
export async function flush(){ if(saveTimer){ clearTimeout(saveTimer); save(); } await pending; }

export function getUserByEmail(email){ const db=load(); email=(email||'').trim().toLowerCase(); return Object.values(db.users).find(u=>u.email===email)||null; }
export function getUser(id){ return load().users[id]||null; }
export function createUser(user){ const db=load(); db.users[user.id]=user; save(); return user; }
