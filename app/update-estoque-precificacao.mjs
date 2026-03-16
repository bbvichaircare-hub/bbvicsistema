// Script: Atualizar estoque com planilha PRECIFICACAO.xlsx
// - Atualiza produtos existentes (nome, precos, categoria, estoque)
// - Cria produtos novos que nao existem
// - NAO toca em faturas, orcamentos, relatorios ja criados
// - Produtos de faturas/orcamentos continuam com nome original salvo neles

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

// Firebase config - copiar do arquivo firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0",
  authDomain: "bbvic-gestao-premium.firebaseapp.com",
  projectId: "bbvic-gestao-premium",
  storageBucket: "bbvic-gestao-premium.firebasestorage.app",
  messagingSenderId: "214158661970",
  appId: "1:214158661970:web:b7b9746296f5c35159c28b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Normaliza nome para comparacao (remove espacos extras, uppercase)
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

// Calcula margem markup (custo como base)
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
  const produtosSnap = await getDocs(collection(db, 'produtos'));
  const produtosExistentes = {};
  produtosSnap.forEach(docSnap => {
    const data = docSnap.data();
    const nomeNorm = normalizarNome(data.nome);
    produtosExistentes[nomeNorm] = { id: docSnap.id, ...data };
  });
  console.log(`Produtos no Firebase: ${Object.keys(produtosExistentes).length}\n`);

  let atualizados = 0;
  let criados = 0;
  let erros = 0;
  const log = [];

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
      estoque_minimo: estoqueMinimo,
      unidade: unidade,
      atualizado_em: new Date().toISOString(),
    };

    try {
      if (produtosExistentes[nomeNorm]) {
        // Produto existe: atualizar
        const produtoId = produtosExistentes[nomeNorm].id;
        await updateDoc(doc(db, 'produtos', produtoId), dadosProduto);
        atualizados++;
        log.push(`[ATUALIZADO] ${nome}`);
      } else {
        // Produto novo: criar
        dadosProduto.criado_em = new Date().toISOString();
        await addDoc(collection(db, 'produtos'), dadosProduto);
        criados++;
        log.push(`[CRIADO] ${nome}`);
      }
    } catch (err) {
      erros++;
      log.push(`[ERRO] ${nome}: ${err.message}`);
    }
  }

  // 4. Resultado
  console.log('\n=== RESULTADO ===');
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Criados:     ${criados}`);
  console.log(`Erros:       ${erros}`);
  console.log('\nDetalhes:');
  log.forEach(l => console.log(l));
  console.log('\nIMPORTANTE: Faturas e orcamentos existentes NAO foram alterados.');
  console.log('Os produtos neles continuam com os nomes e valores originais.');

  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
