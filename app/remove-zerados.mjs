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
  console.log('Buscando produtos com custo e venda zerados...');
  await sleep(2000);

  let snap;
  for (let t = 1; t <= 5; t++) {
    try { snap = await db.collection('produtos').get(); break; }
    catch (e) { console.log(`Aguardando 30s (tentativa ${t}/5)...`); await sleep(30000); }
  }

  const paraApagar = [];
  const manter = [];

  snap.forEach(d => {
    const data = d.data();
    const venda = parseFloat(data.preco_venda || data.preco || 0);
    const custo = parseFloat(data.preco_custo || 0);
    if (venda === 0 && custo === 0) {
      paraApagar.push({ id: d.id, nome: data.nome || '(sem nome)' });
    } else {
      manter.push(d.id);
    }
  });

  console.log(`Total: ${snap.size} | Manter: ${manter.length} | Apagar (zerados): ${paraApagar.length}\n`);

  if (paraApagar.length === 0) {
    console.log('Nenhum produto zerado encontrado!');
    process.exit(0);
  }

  console.log('Primeiros 15 que serão apagados:');
  paraApagar.slice(0, 15).forEach(p => console.log(`  - ${p.nome}`));
  if (paraApagar.length > 15) console.log(`  ... e mais ${paraApagar.length - 15}`);

  console.log('\nApagando em lotes de 50...');
  let deletados = 0;
  for (let i = 0; i < paraApagar.length; i += 50) {
    const lote = paraApagar.slice(i, i + 50);
    for (let t = 1; t <= 5; t++) {
      try {
        const batch = db.batch();
        for (const p of lote) batch.delete(db.collection('produtos').doc(p.id));
        await batch.commit();
        break;
      } catch (e) { console.log(`\nAguardando 20s...`); await sleep(20000); }
    }
    deletados += lote.length;
    process.stdout.write(`${deletados}/${paraApagar.length} `);
    await sleep(500);
  }

  console.log(`\n\n=== CONCLUÍDO ===`);
  console.log(`Removidos: ${deletados} produtos zerados`);
  console.log(`Restantes: ${manter.length} produtos com valores`);
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
