// Datastore JSON simple et robuste (parfait pour quelques utilisateurs).
// En production, DATA_FILE doit pointer sur un disque persistant.
import fs from 'fs';
import path from 'path';

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'db.json');

function ensureDir(){
  const dir = path.dirname(DATA_FILE);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let cache = null;

export function load(){
  if(cache) return cache;
  ensureDir();
  try{
    cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }catch(e){
    cache = { users: {} };
  }
  if(!cache.users) cache.users = {};
  return cache;
}

let saveTimer = null;
export function save(){
  ensureDir();
  // écriture atomique
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
// sauvegarde différée pour éviter d'écrire à chaque petite modif
export function saveSoon(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

export function getUserByEmail(email){
  const db = load();
  email = (email||'').trim().toLowerCase();
  return Object.values(db.users).find(u => u.email === email) || null;
}
export function getUser(id){ return load().users[id] || null; }

export function createUser(user){
  const db = load();
  db.users[user.id] = user;
  save();
  return user;
}
