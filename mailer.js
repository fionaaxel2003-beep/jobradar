// Envoi d'e-mails via Brevo (offre gratuite 300 mails/jour). Optionnel : sans clé, on log seulement.
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const FROM_EMAIL = process.env.MAIL_FROM || 'jobradar@example.com';
const FROM_NAME  = process.env.MAIL_FROM_NAME || 'JobRadar';

export async function sendEmail({ to, subject, html }, fetchImpl = fetch){
  if(!BREVO_KEY){
    console.log(`[mailer] (pas de BREVO_API_KEY) e-mail non envoyé à ${to} — sujet: ${subject}`);
    return { sent:false, reason:'no_key' };
  }
  const r = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method:'POST',
    headers:{ 'api-key':BREVO_KEY, 'Content-Type':'application/json', 'Accept':'application/json' },
    body: JSON.stringify({
      sender:{ email:FROM_EMAIL, name:FROM_NAME },
      to:[{ email:to }],
      subject, htmlContent: html
    })
  });
  if(!r.ok){ const t=await r.text().catch(()=> ''); throw new Error('Brevo HTTP '+r.status+' '+t.slice(0,120)); }
  return { sent:true };
}
