export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { RESEND_API_KEY, CLIENT_EMAIL, AGENCY_EMAIL } = process.env;

  const recipients = [];
  if (CLIENT_EMAIL) recipients.push(CLIENT_EMAIL);
  if (AGENCY_EMAIL) recipients.push(AGENCY_EMAIL);

  if (recipients.length === 0) return res.status(200).json({ message: 'No recipients' });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Alerts <onboarding@resend.dev>',
        to: recipients,
        subject: '⚠️ Error: Meta Product Feed Sync Mislukt',
        html: `
          <h2>De automatische update van de voertuigen feed is mislukt!</h2>
          <p>Er is een probleem opgetreden tijdens de dagelijkse synchronisatie. Dit kan komen doordat de bron-website onbereikbaar was, of doordat de code is vastgelopen.</p>
          <p>Kijk op GitHub voor de exacte foutmelding: <br />
          <a href="https://github.com/remcoroos/gert-van-keulen-meta-feed/actions">Bekijk de acties op GitHub</a></p>
          <hr /><p><small>Dit is een automatisch gegenereerd bericht.</small></p>
        `
      })
    });
    return res.status(response.ok ? 200 : 500).json({ success: response.ok });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
