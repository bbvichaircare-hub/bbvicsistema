// Script: Atualizar estoque com planilha PRECIFICACAO.xlsx
// Usa Firebase Admin SDK (ignora regras de segurança)
// Requer: arquivo de chave de servico do Firebase

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const admin = require('firebase-admin');
const xlsx = require('xlsx');
const fs = require('fs');

// Caminho para o arquivo de chave de servico (baixar no Firebase Console)
const SERVICE_ACCOUNT_PATH = 'C:\\Users\\julie\\Downloads\\bbvic-gestao-premium-firebase-adminsdk-fbsvc-b1455c83b7.json';

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('ERRO: Arquivo de chave de servico nao encontrado!');
  console.error('Caminho esperado:', SERVICE_ACCOUNT_PATH);
  console.error('\nPara gerar:');
  console.error('1. Acesse https://console.firebase.google.com');
  console.error('2. Selecione o projeto bbvic-gestao-premium');
  console.error('3. Engrenagem -> Configuracoes do projeto -> Contas de servico');
  console.error('4. Clique em "Gerar nova chave privada"');
  console.error('5. Salve o arquivo como: C:\\Users\\julie\\Downloads\\bbvic-service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'bbvic-gestao-premium',
});

const db = admin.firestore();

function normalizarNome(nome) {
  if (!nome) return '';
  return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

function calcMargem(venda, custo) {
  if (!custo || custo <= 0) return 0;
  return Math.round(((venda - custo) / custo) * 10000) / 100;
}

async function main() {
  console.log('=== Iniciando importacao de estoque ===\n');

  // 1. Ler planilha
  const workbook = xlsx.readFile('C:\\Users\\julie\\OneDrive\\Desktop\\FATURAS EM ABERTO\\PRECIFICACAO.xlsx');
  const sheet = workbook.Sheets['Estoque'];
  const rows = xlsx.utils.sheet_to_json(sheet);
  console.log(`Planilha lida: ${rows.length} produtos encontrados\n`);

  // 2. Buscar produtos existentes no Firebase
  console.log('Buscando produtos no Firebase...');
  const produtosSnap = await db.collection('produtos').get();
  const produtosExistentes = {};
  produtosSnap.forEach(docSnap => {
    const data = docSnap.data();
    const nomeNorm = normalizarNome(data.nome);
    produtosExistentes[nomeNorm] = { id: docSnap.id, ...data };
  });
  console.log(`Produtos ja no Firebase: ${Object.keys(produtosExistentes).length}\n`);

  let atualizados = 0;
  let criados = 0;
  let erros = 0;

  // 3. Processar cada linha da planilha
  for (const row of rows) {
    const nome = row['Nome'] ? row['Nome'].toString().trim() : null;
    if (!nome) continue;

    const nomeNorm = normalizarNome(nome);
    const precoVenda = parseFloat(row['PreCo Venda ($)']) || 0;
    const precoCusto = parseFloat(row['PreCo Custo ($)']) || 0;
    const categoria = row['Categoria'] ? row['Categoria'].toString().trim() : '';
    const estoque = parseFloat(row['Estoque']) || 0;
    const estoqueMinimo = parseFloat(row['Estoque MInimo']) || 0;
    const unidade = row['Unidade'] ? row['Unidade'].toString().trim() : 'un';
    const margem = calcMargem(precoVenda, precoCusto);

    const dadosProduto = {
      nome: nome,
      nome_normalizado: nomeNorm,
      categoria: categoria,
      preco_venda: precoVenda,
      preco_custo: precoCusto,
      margem_lucro: margem,
      estoque_atual: estoque,
      estoque: estoque,
      quantidade: estoque,
      estoque_minimo: estoqueMinimo,
      unidade: unidade,
      atualizado_em: new Date().toISOString(),
    };

    try {
      if (produtosExistentes[nomeNorm]) {
        const produtoId = produtosExistentes[nomeNorm].id;
        await db.collection('produtos').doc(produtoId).update(dadosProduto);
        atualizados++;
        process.stdout.write('.');
      } else {
        dadosProduto.criado_em = new Date().toISOString();
        await db.collection('produtos').add(dadosProduto);
        criados++;
        process.stdout.write('+');
      }
    } catch (err) {
      erros++;
      console.error(`\n[ERRO] ${nome}: ${err.message}`);
    }
  }

  console.log('\n\n=== RESULTADO ===');
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Criados:     ${criados}`);
  console.log(`Erros:       ${erros}`);
  console.log('\nFaturas e orcamentos existentes NAO foram alterados.');
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
