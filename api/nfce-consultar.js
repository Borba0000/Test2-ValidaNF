// api/nfce-consultar.js — Vercel Serverless Function
// Consulta NFC-e (modelo 65) via SEFAZ estadual com mTLS (pfx stateless)

import https from 'node:https';

const SVRS = 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx';
const SVAN = 'https://www.nfe.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx';
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF';

// AC, AL, AP, DF, MS, PB, PI, RN, RO, RR, SE
const SVRS_UF = new Set(['11','12','14','16','22','24','25','27','28','50','53']);

const WS = {
  '35': 'https://nfe.fazenda.sp.gov.br/ws/nfeConsultaProtocolo4.asmx',
  '13': 'https://nfe.sefaz.am.gov.br/services2/NfeConsulta2',
  '51': 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta2',
  '29': 'https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
};

function getUrl(cUF) {
  if (WS[cUF]) return WS[cUF];
  if (SVRS_UF.has(cUF)) return SVRS;
  return SVAN;
}

function buildSOAP(chave, cUF) {
  const ns = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4';
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
        'Content-Type'  : 'application/soap+xml; charset=utf-8',
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
