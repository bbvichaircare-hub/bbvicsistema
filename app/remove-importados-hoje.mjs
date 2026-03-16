// Remove produtos importados hoje com pausas para evitar quota exceeded

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\julie\\Downloads\\bbvic-gestao-premium-firebase-adminsdk-fbsvc-b1455c83b7.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'bbvic-gestao-premium' });
const db = admin.firestore();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Buscando todos os produtos (aguarde)...');
  await sleep(2000);

  let snap;
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    try {
      snap = await db.collection('produtos').get();
      break;
    } catch (e) {
      if (tentativa < 5) {
        console.log(`Cota atingida, aguardando 30s (tentativa ${tentativa}/5)...`);
        await sleep(30000);
      } else throw e;
    }
  }

  console.log(`Total atual: ${snap.size} produtos\n`);

  const hoje = '2026-03-16';
  const paraApagar = [];
  const manter = [];

  snap.forEach(d => {
    const data = d.data();
    const criadoEm = data.criado_em || '';
    const foiImportadoHoje = typeof criadoEm === 'string' && criadoEm.startsWith(hoje);
    if (foiImportadoHoje) {
      paraApagar.push({ id: d.id, nome: data.nome });
    } else {
      manter.push(d.id);
    }
  });

  console.log(`Manter (originais): ${manter.length}`);
  console.log(`Apagar (importados hoje): ${paraApagar.length}\n`);

  if (paraApagar.length === 0) {
    console.log('Nenhum produto importado hoje encontrado. Estoque já está limpo!');
    process.exit(0);
  }

  console.log('Primeiros 10 que serão apagados:');
  paraApagar.slice(0, 10).forEach(p => console.log(`  - ${p.nome}`));

  // Apagar em lotes pequenos com pausa
  const BATCH_SIZE = 50;
  let deletados = 0;
  for (let i = 0; i < paraApagar.length; i += BATCH_SIZE) {
    const lote = paraApagar.slice(i, i + BATCH_SIZE);
    let ok = false;
    for (let t = 1; t <= 5; t++) {
      try {
        const batch = db.batch();
        for (const p of lote) batch.delete(db.collection('produtos').doc(p.id));
        await batch.commit();
        ok = true;
        break;
      } catch (e) {
        console.log(`\nCota atingida no lote ${i}, aguardando 20s...`);
        await sleep(20000);
      }
    }
    if (!ok) { console.log('Falhou após 5 tentativas, parando.'); break; }
    deletados += lote.length;
    process.stdout.write(`${deletados}/${paraApagar.length} `);
    await sleep(1000); // pausa entre lotes
  }

  console.log(`\n\n=== CONCLUÍDO ===`);
  console.log(`Removidos: ${deletados}`);
  console.log(`Restantes: ${manter.length} produtos originais`);
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
