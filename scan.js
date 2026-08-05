// Scan des nouvelles offres par utilisateur + envoi d'alertes e-mail.
// Lancé soit par le cron interne (RUN_CRON=1), soit — recommandé en gratuit — par GitHub Actions.
import { load, save } from './store.js';
import { searchFT } from './francetravail.js';
import { resolveLoc } from './locations.js';
import { sendEmail } from './mailer.js';

const MAX_SEEN = 500;      // on borne la mémoire des offres déjà vues
const MAX_PER_MAIL = 15;

function alertHtml(name, offers){
  const rows = offers.map(o => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">
        <a href="${o.url}" style="color:#2b59ff;font-weight:600;text-decoration:none">${escape(o.title)}</a><br>
        <span style="color:#555">${escape(o.company)} — ${escape(o.location||'')}</span>
      </td>
    </tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#1a1f3a">Bonjour ${escape(name||'')}, ${offers.length} nouvelle(s) offre(s) 🎯</h2>
    <p style="color:#555">Repérées à l'instant sur France Travail selon ton profil. Sois parmi les premiers à postuler :</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="color:#999;font-size:12px;margin-top:18px">JobRadar — pour ne plus recevoir ces alertes, désactive-les dans l'appli.</p>
  </div>`;
}
function escape(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

export async function runScan(){
  const db = load();
  const users = Object.values(db.users).filter(u => u.alerts && u.alerts.enabled);
  let totalNew = 0;
  for(const u of users){
    try{
      const loc = resolveLoc(u.profile.location || '');
      const { offers, configured } = await searchFT({
        motsCles: u.profile.keywords || '', region: loc.region, departement: loc.departement, range:'0-49'
      });
      if(!configured) continue;
      if(!u.seen) u.seen = {};
      const fresh = offers.filter(o => !u.seen[o.id]);
      // on marque tout comme vu (même ce qu'on n'enverra pas, pour ne pas spammer)
      offers.forEach(o => { u.seen[o.id] = Date.now(); });
      // borne la taille de "seen"
      const ids = Object.keys(u.seen);
      if(ids.length > MAX_SEEN){
        ids.sort((a,b)=>u.seen[a]-u.seen[b]).slice(0, ids.length-MAX_SEEN).forEach(id => delete u.seen[id]);
      }
      if(fresh.length){
        totalNew += fresh.length;
        const to = (u.alerts.email || u.email);
        try{
          await sendEmail({ to, subject:`JobRadar — ${fresh.length} nouvelle(s) offre(s) pour toi`,
                            html: alertHtml(u.profile.name, fresh.slice(0, MAX_PER_MAIL)) });
        }catch(e){ console.error('mail error pour', to, e.message); }
      }
    }catch(e){ console.error('scan user error', u.email, e.message); }
  }
  save();
  console.log(`[scan] ${users.length} utilisateur(s) avec alertes, ${totalNew} nouvelle(s) offre(s) au total.`);
  return { users: users.length, totalNew };
}

// Permet `node lib/scan.js`
if(import.meta.url === `file://${process.argv[1]}`){
  runScan().then(()=> process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
