// api/serpro-token.js — Vercel Serverless Function
// Obtém Bearer token do SERPRO via OAuth2 client_credentials

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { consumerKey, consumerSecret } = req.body;
    if (!consumerKey || !consumerSecret)
      return res.status(400).json({ error: 'Consumer Key e Consumer Secret obrigatorios' });

    const creds = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const resp = await fetch('https://gateway.apiserpro.serpro.gov.br/token', {
      method : 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type' : 'application/x-www-form-urlencoded'
      },
      body  : 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000)
    });

    const data = await resp.json();

    if (!data.access_token)
      return res.status(401).json({ error: data.description || data.message || 'Credenciais invalidas' });

    return res.status(200).json(data);

  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Timeout (8s) ao obter token SERPRO' : err.message;
    return res.status(500).json({ error: msg });
  }
}
