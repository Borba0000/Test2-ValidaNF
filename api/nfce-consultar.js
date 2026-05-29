// api/nfce-consultar.js — Vercel Serverless Function
// Consulta NFC-e (modelo 65) via SEFAZ estadual com mTLS (pfx stateless)

import https from 'node:https';

const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NfceConsultaProtocolo4/nfceConsultaNF';

// Estados que usam SVRS para NFC-e
const SVRS_NFCE = ['11','12','13','14','15','16','17','21','22',
  '23','24','25','26','27','28','29','31','32','33','41','42',
  '43','50','51','52','53'];

// URL base SVRS NFC-e (diferente da NF-e)
const urlSVRS = 'https://nfce.svrs.rs.gov.br/ws/NfceConsultaProtocolo/NfceConsultaProtocolo4.asmx';

// SP usa endpoint próprio para NFC-e
const NFC_ENDPOINTS = {
  '35': 'https://nfce.fazenda.sp.gov.br/ws/NfceConsultaProtocolo4.asmx'
};

function getUrl(cUF) {
  const url = NFC_ENDPOINTS[cUF] || urlSVRS;
  console.log('[NFC-e] cUF:', cUF, '→ URL:', url);
  return url;
}

function buildSOAP(chave, cUF) {
  const ns = 'http://www.portalfiscal.inf.br/nfe/wsdl/NfceConsultaProtocolo4';
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><nfeCabecMsg xmlns="${ns}"><cUF>${cUF}</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg></soap12:Header><soap12:Body><nfeDadosMsg xmlns="${ns}"><consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function extractTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)<\\/${name}>`));
  return m ? m[1].trim() : '';
}

function httpsPost(url, body, agent) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: u.hostname,
      port    : u.port || 443,
      path    : u.pathname + (u.search || ''),
      method  : 'POST',
      agent,
      headers : {
        'Content-Type'  : `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
        'Content-Length': bodyBuf.length,
        'SOAPAction'    : SOAP_ACTION,
      },
    }, (r) => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout (15s)')); });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { chave, pfxBase64, pfxPassword } = req.body;

    if (!chave || !pfxBase64 || !pfxPassword)
      return res.status(400).json({ error: 'chave, pfxBase64 e pfxPassword obrigatorios' });
    if (chave.length !== 44)
      return res.status(400).json({ error: 'Chave deve ter 44 digitos' });

    const cUF  = chave.slice(0, 2);
    const url  = getUrl(cUF);
    const soap = buildSOAP(chave, cUF);

    const agent = new https.Agent({
      pfx              : Buffer.from(pfxBase64, 'base64'),
      passphrase       : pfxPassword,
      rejectUnauthorized: false,
    });

    const { status, body: xml } = await httpsPost(url, soap, agent);
    console.log('[NFC-e] SOAP status:', status);

    if (status !== 200)
      return res.status(200).json({ cStat: 'ERR', xMotivo: `SEFAZ HTTP ${status}`, nProt: '', dhRecbto: '' });

    const cStat    = extractTag(xml, 'cStat');
    const xMotivo  = extractTag(xml, 'xMotivo');
    const nProt    = extractTag(xml, 'nProt');
    const dhRecbto = extractTag(xml, 'dhRecbto');

    if (!cStat)
      return res.status(200).json({ cStat: 'ERR', xMotivo: 'Resposta SEFAZ invalida ou sem cStat', nProt: '', dhRecbto: '' });

    return res.status(200).json({ cStat, xMotivo, nProt, dhRecbto });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}
