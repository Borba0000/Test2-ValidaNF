# ValidaNFe — Consulta NF-e via SERPRO

Aplicativo web para validação de Notas Fiscais Eletrônicas via API SERPRO (Consulta NF-e Direto na Faixa).

## 🚀 Deploy no Vercel (recomendado)

### 1. Suba para o GitHub

```bash
git init
git add .
git commit -m "feat: ValidaNFe inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/validanfe.git
git push -u origin main
```

### 2. Importe no Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Conecte ao repositório GitHub `validanfe`
3. Clique em **Deploy** — sem nenhuma configuração adicional

O Vercel detecta automaticamente o `vercel.json` e cria as Serverless Functions da pasta `/api/`.

### 3. Acesse

Após o deploy, acesse a URL gerada pelo Vercel (ex: `validanfe.vercel.app`).

---

## 🔧 Desenvolvimento local (opcional)

```bash
npm install -g vercel
vercel dev
# Acesse http://localhost:3000
```

---

## 📁 Estrutura do projeto

```
validanfe/
├── public/
│   └── index.html          ← Frontend completo (single-file)
├── api/
│   ├── serpro-token.js     ← Serverless: obtém Bearer token SERPRO
│   └── serpro-consultar.js ← Serverless: consulta NF-e no SERPRO
├── package.json
├── vercel.json             ← Configuração Vercel
└── .gitignore
```

---

## ⚙️ Configuração no app

Após acessar o deploy:
1. Clique em **⚙️ Config**
2. Insira sua **Consumer Key** e **Consumer Secret** do SERPRO
3. Selecione o ambiente **🟢 Produção**
4. Clique em **Salvar**

> As credenciais são armazenadas apenas na memória do navegador — nunca em servidor.

---

## 📋 Pré-requisitos SERPRO

- Contrato ativo na [Loja SERPRO](https://loja.serpro.gov.br/consultanfe) — produto **Consulta NFe (Alocado na Faixa)**
- Consumer Key e Consumer Secret disponíveis em **Área do Cliente → Chaves de Acesso**

---

## ⚠️ Limites Vercel (Hobby)

| | Hobby (grátis) | Pro |
|---|---|---|
| Timeout função | 10s | 60s |
| Requisições/mês | 100k | Ilimitado |

> Para volumes altos (2000+ notas), considere o plano **Pro** para evitar timeout nas consultas SERPRO.
