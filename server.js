// JobRadar — serveur (comptes synchronisés + offres France Travail + sources ouvertes)
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { load, saveSoon, getUser, getUserByEmail, createUser } from './lib/store.js';
import { aggregate } from './lib/aggregate.js';
import { ftConfigured } from './lib/francetravail.js';
import { runScan } from './lib/scan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const app = express();
app.use(express.json());
app.use(cookieParser());

function publicUser(u){
  const { passHash, seen, ...rest } = u;
  return rest;
}
function defaultProfile(){
  return { name:'', sector:'Autre / Généraliste', keywords:'', location:'', contract:'', remote:'',
           pitch:'', skills:'', motivation:'',
           closing:"Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées." };
}
function setAuthCookie(res, id){
  const token = jwt.sign({ id }, JWT_SECRET, { expiresIn:'30d' });
  res.cookie('jr_token', token, { httpOnly:true, sameSite:'lax', maxAge:30*24*3600*1000,
    secure: process.env.NODE_ENV==='production' });
}
function auth(req, res, next){
  const t = req.cookies?.jr_token;
  if(!t) return res.status(401).json({ error:'non connecté' });
  try{ req.userId = jwt.verify(t, JWT_SECRET).id; next(); }
  catch(e){ return res.status(401).json({ error:'session invalide' }); }
}

// ---- Auth ----
app.post('/api/register', async (req, res) => {
  const email = (req.body.email||'').trim().toLowerCase();
  const password = req.body.password||'';
  if(!email || password.length < 6) return res.status(400).json({ error:'e-mail et mot de passe (6+ caractères) requis' });
  if(getUserByEmail(email)) return res.status(409).json({ error:'un compte existe déjà avec cet e-mail' });
  const user = {
    id: crypto.randomUUID(), email, passHash: bcrypt.hashSync(password, 10),
    profile: defaultProfile(), companies:[], saved:[],
    alerts:{ enabled:false, email }, seen:{}, createdAt: Date.now()
  };
  createUser(user);
  setAuthCookie(res, user.id);
  res.json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = (req.body.email||'').trim().toLowerCase();
  const u = getUserByEmail(email);
  if(!u || !bcrypt.compareSync(req.body.password||'', u.passHash))
    return res.status(401).json({ error:'e-mail ou mot de passe incorrect' });
  setAuthCookie(res, u.id);
  res.json({ user: publicUser(u) });
});
app.post('/api/logout', (req, res) => { res.clearCookie('jr_token'); res.json({ ok:true }); });

app.get('/api/me', auth, (req, res) => {
  const u = getUser(req.userId);
  if(!u) return res.status(401).json({ error:'compte introuvable' });
  res.json({ user: publicUser(u), ftConfigured: ftConfigured() });
});

// ---- Profil ----
app.put('/api/profile', auth, (req, res) => {
  const u = getUser(req.userId);
  Object.assign(u.profile, req.body.profile || {});
  if(Array.isArray(req.body.companies)) u.companies = req.body.companies;
  saveSoon();
  res.json({ user: publicUser(u) });
});

// ---- Alertes ----
app.put('/api/alerts', auth, (req, res) => {
  const u = getUser(req.userId);
  u.alerts = { enabled: !!req.body.enabled, email: (req.body.email||u.email).trim().toLowerCase() };
  saveSoon();
  res.json({ alerts: u.alerts });
});

// ---- Offres ----
app.get('/api/jobs', auth, async (req, res) => {
  const u = getUser(req.userId);
  try{ res.json(await aggregate(u.profile)); }
  catch(e){ res.status(500).json({ error:String(e.message||e) }); }
});

// ---- Candidatures suivies ----
app.post('/api/saved', auth, (req, res) => {
  const u = getUser(req.userId);
  const s = req.body.item || {};
  s.id = s.id || crypto.randomUUID(); s.added = Date.now(); s.status = s.status || 'À postuler';
  u.saved.push(s); saveSoon(); res.json({ saved:u.saved });
});
app.put('/api/saved/:id', auth, (req, res) => {
  const u = getUser(req.userId);
  const it = u.saved.find(x => x.id === req.params.id);
  if(it) Object.assign(it, req.body.item || {});
  saveSoon(); res.json({ saved:u.saved });
});
app.delete('/api/saved/:id', auth, (req, res) => {
  const u = getUser(req.userId);
  u.saved = u.saved.filter(x => x.id !== req.params.id);
  saveSoon(); res.json({ saved:u.saved });
});

// ---- Frontend statique ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---- Scan planifié (si activé sur cet hôte) ----
// Sur hébergement gratuit, on préfère GitHub Actions ; mais si RUN_CRON=1 et hôte toujours actif :
if(process.env.RUN_CRON === '1'){
  const expr = process.env.CRON_EXPR || '*/20 * * * *'; // toutes les 20 min
  cron.schedule(expr, () => { runScan().catch(e => console.error('scan error', e)); });
  console.log('Cron interne activé :', expr);
}

const PORT = process.env.PORT || 3000;
if(process.env.NODE_ENV !== 'test'){
  app.listen(PORT, () => console.log(`JobRadar sur http://localhost:${PORT} — France Travail ${ftConfigured()?'configuré':'NON configuré (clés manquantes)'}`));
}
export { app };
