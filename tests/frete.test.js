import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function loadApp() {
  const element = {
    style: {}, value: '', classList: { add() {}, remove() {} },
    closest() { return this; }, addEventListener() {}
  };
  const context = vm.createContext({
    document: { getElementById: () => element, querySelectorAll: () => [] },
    fetch() { throw new Error('Os testes não podem fazer consultas externas'); }
  });
  vm.runInContext(script, context);
  const app = vm.runInContext('({parseSERPROData, buildRows, buildRowsProduto, exportar, S})', context);
  return { app, context };
}

function response(total = {}, det = []) {
  return {
    nfeProc: {
      protNFe: { infProt: { cStat: 100 } },
      NFe: { infNFe: { total: { ICMSTot: { vNF: 500, ...total } }, det } }
    }
  };
}

test('preserva frete declarado, inclusive zero, e mantém ausência em branco', () => {
  const { app } = loadApp();
  const cases = [
    [125.75, 125.75], ['125.75', 125.75], [0, 0], ['0.00', 0],
    [undefined, null], [null, null], ['', null], ['   ', null],
    ['invalido', null], ['12abc', null], [false, null], [[], null], [Infinity, null]
  ];
  for (const [input, expected] of cases) {
    const result = app.parseSERPROData(response({ vFrete: input }), 'chave');
    assert.equal(result.vFrete, expected, `frete recebido: ${String(input)}`);
    const rows = app.buildRows([result]);
    assert.equal(rows[0].at(-1), 'Valor do frete (R$)');
    assert.equal(rows[1].at(-1), expected);
    assert.equal(rows[1][13], 500, 'valor total original preservado');
    assert.equal(rows[1][14], '100', 'posição original do status preservada');
  }
});

test('lê frete nos formatos de resposta já aceitos pelo parser', () => {
  const { app } = loadApp();
  const wrapped = response({ vFrete: 42.35 });
  for (const payload of [wrapped, wrapped.nfeProc, { infNFe: wrapped.nfeProc.NFe.infNFe }]) {
    assert.equal(app.parseSERPROData(payload, 'chave').vFrete, 42.35);
  }
});

test('não infere frete de itens, diferença de totais, erro ou consulta NFC-e', () => {
  const { app } = loadApp();
  const payload = response({ vProd: 450 }, [{ prod: { vFrete: 50 } }]);
  for (const input of [payload, {}, { protNFe: { infProt: { cStat: '217' } } }]) {
    assert.equal(app.parseSERPROData(input, 'chave').vFrete, null);
  }
  for (const result of [{ cStat: 'ERR' }, { cStat: '100', mod: '65' }]) {
    assert.equal(app.buildRows([result])[1].at(-1), null);
    assert.equal(app.buildRowsProduto([result])[1].at(-1), null);
  }
});

test('exportação por produto registra frete uma vez por nota, inclusive sem itens', () => {
  const { app } = loadApp();
  const products = [{ prod: { cProd: 'A' } }, { prod: { cProd: 'B' } }];
  const results = [
    app.parseSERPROData(response({ vFrete: 30 }, products), 'primeira'),
    app.parseSERPROData(response({ vFrete: 0 }, products), 'segunda'),
    app.parseSERPROData(response({ vFrete: 12.5 }), 'terceira'),
    app.parseSERPROData(response({}, products), 'quarta')
  ];
  const rows = app.buildRowsProduto(results);
  assert.equal(rows[0].at(-1), 'Frete total da NF-e (R$)');
  assert.deepEqual(Array.from(rows.slice(1), row => row.at(-1)), [30, null, 0, null, 12.5, null, null]);
  assert.equal(rows[1][5], 'A');
  assert.equal(rows[2][5], 'B');
  assert.ok(rows.every(row => row.length === 13));
});

test('exportação completa e filtrada inclui frete numérico com duas casas decimais', () => {
  const { app, context } = loadApp();
  let exported;
  // Captura os dados enviados ao SheetJS sem gravar arquivo ou acessar a rede.
  context.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet(rows) {
        const sheet = { '!ref': rows };
        rows.forEach((row, r) => row.forEach((value, c) => {
          if (value != null) sheet[`${r}:${c}`] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
        }));
        return sheet;
      },
      decode_range: rows => ({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }),
      encode_cell: ({ r, c }) => `${r}:${c}`,
      book_append_sheet: (book, sheet) => { book.sheet = sheet; }
    },
    writeFile: book => { exported = book.sheet; }
  };
  vm.runInContext('toast = () => {}', context);
  app.S.results = [
    app.parseSERPROData(response({ vFrete: 19.9 }), 'com-frete'),
    app.parseSERPROData(response({ vFrete: 0 }), 'zero'),
    app.parseSERPROData(response(), 'sem-frete')
  ];
  app.S.filtered = app.S.results.slice(1);
  for (const mode of ['nfe', 'produto']) {
    app.S.viewMode = mode;
    const col = mode === 'nfe' ? 18 : 12;
    app.exportar();
    assert.equal(exported[`1:${col}`].v, 19.9);
    assert.equal(exported[`1:${col}`].z, '#,##0.00');
    assert.equal(exported[`2:${col}`].v, 0);
    assert.equal(exported[`3:${col}`], undefined);
    app.exportar('filtered');
    assert.equal(exported[`1:${col}`].v, 0);
    assert.equal(exported[`1:${col}`].t, 'n');
    assert.equal(exported[`1:${col}`].z, '#,##0.00');
    assert.equal(exported[`2:${col}`], undefined);
    assert.equal(exported['!cols'].length, col + 1);
  }
});
