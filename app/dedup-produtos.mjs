// Script: Remover produtos duplicados do Firebase
// Mantém o produto com mais dados (maior preço de venda) e apaga os duplicatas

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\julie\\Downloads\\bbvic-gestao-premium-firebase-adminsdk-fbsvc-b1455c83b7.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'bbvic-gestao-premium' });
const db = admin.firestore();

function normNome(nome) {
  return (nome || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log('Buscando todos os produtos...');
  const snap = await db.collection('produtos').get();
  console.log(`Total: ${snap.size} produtos\n`);

  // Agrupar por nome normalizado
  const grupos = new Map();
  snap.forEach(d => {
    const key = normNome(d.data().nome);
    if (!key) return;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push({ id: d.id, ...d.data() });
  });

  let duplicatas = 0;
  let deletados = 0;
  const batch_size = 400;
  let toDelete = [];

  for (const [nome, lista] of grupos.entries()) {
    if (lista.length <= 1) continue;
    duplicatas++;

    // Manter o que tem maior preço_venda (mais completo), senão o mais antigo
    lista.sort((a, b) => {
      const va = (a.preco_venda || a.preco || 0);
      const vb = (b.preco_venda || b.preco || 0);
      if (vb !== va) return vb - va; // maior preço primeiro
      // se igual, manter o que tem custo
      const ca = a.preco_custo || 0;
      const cb = b.preco_custo || 0;
      return cb - ca;
    });

    const manter = lista[0];
    const apagar = lista.slice(1);
    console.log(`[DUP x${lista.length}] ${nome} → mantendo ${manter.id} (venda=$${manter.preco_venda || 0})`);

    for (const p of apagar) {
      toDelete.push(p.id);
      deletados++;
    }
  }

  if (toDelete.length === 0) {
    console.log('\nNenhuma duplicata encontrada!');
    process.exit(0);
  }

  console.log(`\nApagando ${toDelete.length} duplicatas em lotes...`);
  for (let i = 0; i < toDelete.length; i += batch_size) {
    const lote = toDelete.slice(i, i + batch_size);
    const batch = db.batch();
    for (const id of lote) batch.delete(db.collection('produtos').doc(id));
    await batch.commit();
    process.stdout.write(`${i + lote.length}/${toDelete.length} `);
  }

  console.log(`\n\n=== CONCLUÍDO ===`);
  console.log(`Grupos duplicados encontrados: ${duplicatas}`);
  console.log(`Documentos removidos: ${deletados}`);
  console.log(`Produtos únicos restantes: ${snap.size - deletados}`);
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
