// api/serpro-consultar.js — Vercel Serverless Function
// Consulta uma NF-e pelo SERPRO usando token Bearer

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { token, chave, base } = req.body;
    if (!token || !chave)
      return res.status(400).json({ error: 'token e chave obrigatorios' });

    const url = `${base}${chave}`;

    const resp = await fetch(url, {
      method : 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept'       : 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    // NF-e não encontrada
    if (resp.status === 404)
      return res.status(200).json({
        protNFe: { infProt: { cStat: '217', xMotivo: 'NF-e nao encontrada', chNFe: chave } }
      });

    // Token expirado
    if (resp.status === 401)
      return res.status(401).json({ error: 'Token expirado — sera renovado automaticamente' });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: `SERPRO HTTP ${resp.status}: ${txt.slice(0, 200)}` });
    }

    const data = await resp.json();
    return res.status(200).json(data);

  } catch (err) {
    const msg = err.name === 'TimeoutError'
      ? 'Timeout (8s) — SERPRO nao respondeu a tempo'
      : err.message;
    return res.status(500).json({ error: msg });
  }
}
