import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SERVICE_ACCOUNT = 'C:\\Users\\julie\\Downloads\\bbvic-gestao-premium-firebase-adminsdk-fbsvc-b1455c83b7.json'
const XLSX_PATH = 'C:\\Users\\julie\\OneDrive\\Desktop\\FATURAS EM ABERTO\\PRECIFICACAO.xlsx'

// Passe --dry-run para ver preview sem salvar
const DRY_RUN = process.argv.includes('--dry-run')

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SERVICE_ACCOUNT, 'utf8')))
})
const db = admin.firestore()

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Remove pontuação, espaços duplos e abrevia para comparar
const norm = (s) => (s || '').toUpperCase().trim()
  .replace(/[-.,;:/()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// Retorna score de 0-1: quantas palavras da planilha estão no nome do Firebase
const score = (planilha, firebase) => {
  const wp = norm(planilha).split(' ').filter(Boolean)
  const wf = norm(firebase).split(' ').filter(Boolean)
  if (!wp.length) return 0
  const matches = wp.filter(w => wf.includes(w)).length
  return matches / wp.length
}

const lerPlanilha = () => {
  const wb = XLSX.readFile(XLSX_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

const main = async () => {
  console.log(`=== Atualização de Estoque ${DRY_RUN ? '(DRY RUN - sem salvar)' : ''} ===\n`)
  const rows = lerPlanilha()

  const produtosXLS = rows
    .filter(r => String(r['Nome'] || '').trim().length > 1)
    .map(r => ({
      nome: String(r['Nome'] || '').trim(),
      preco_venda: parseFloat(String(r['PreCo Venda ($)'] || r['Preço Venda ($)'] || '0').replace(/[^0-9.]/g, '')) || 0,
      preco_custo: parseFloat(String(r['PreCo Custo ($)'] || r['Preço Custo ($)'] || '0').replace(/[^0-9.]/g, '')) || 0,
      estoque: parseInt(String(r['Estoque'] || '0').replace(/[^0-9]/g, '')) || 0,
    }))

  console.log(`Produtos na planilha: ${produtosXLS.length}`)
  console.log('Buscando produtos no Firebase (páginado)...\n')

  const firebaseProdutos = []
  let cursor = null

  while (true) {
    let q = db.collection('produtos').limit(100)
    if (cursor) q = q.startAfter(cursor)
    const snap = await q.get()
    if (snap.empty) break
    snap.docs.forEach(d => firebaseProdutos.push({ id: d.id, ...d.data() }))
    cursor = snap.docs[snap.docs.length - 1]
    process.stdout.write(`  ${firebaseProdutos.length} lidos...\r`)
    await sleep(800)
    if (snap.size < 100) break
  }

  console.log(`\nProdutos no Firebase: ${firebaseProdutos.length}\n`)

  const pareamentos = []   // { xls, fb, scoreVal }
  const semMatch = []      // produtos da planilha sem correspondência boa

  for (const xls of produtosXLS) {
    let melhor = null
    let melhorScore = 0

    for (const fb of firebaseProdutos) {
      const s = score(xls.nome, fb.nome)
      if (s > melhorScore) {
        melhorScore = s
        melhor = fb
      }
    }

    // Score >= 0.6 = match confiável (60% das palavras coincidem)
    if (melhor && melhorScore >= 0.6) {
      pareamentos.push({ xls, fb: melhor, scoreVal: melhorScore })
    } else {
      semMatch.push({ xls, melhorScore, melhorNome: melhor?.nome || '?' })
    }
  }

  console.log(`Matches encontrados: ${pareamentos.length}`)
  console.log(`Sem match suficiente: ${semMatch.length}\n`)

  if (semMatch.length > 0) {
    console.log('=== PRODUTOS SEM MATCH (não serão alterados) ===')
    semMatch.forEach(m => console.log(`  [score ${(m.melhorScore*100).toFixed(0)}%] PLANILHA: "${m.xls.nome}" | MELHOR: "${m.melhorNome}"`))
    console.log()
  }

  if (DRY_RUN) {
    console.log('=== PREVIEW DAS ATUALIZAÇÕES (DRY RUN) ===')
    pareamentos.forEach(p => {
      const mudouNome = norm(p.xls.nome) !== norm(p.fb.nome)
      console.log(`  [${(p.scoreVal*100).toFixed(0)}%] "${p.fb.nome}" → "${p.xls.nome}" | Venda: $${p.fb.preco_venda} → $${p.xls.preco_venda} | Custo: $${p.fb.preco_custo} → $${p.xls.preco_custo}${mudouNome ? ' [NOME MUDA]' : ''}`)
    })
    console.log('\nRode sem --dry-run para aplicar as alterações.')
    process.exit(0)
  }

  // Aplicar atualizações em lotes
  console.log('Aplicando atualizações...\n')
  const BATCH_SIZE = 200
  let atualizados = 0

  for (let i = 0; i < pareamentos.length; i += BATCH_SIZE) {
    const lote = pareamentos.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const p of lote) {
      batch.update(db.collection('produtos').doc(p.fb.id), {
        nome: p.xls.nome,
        preco_venda: p.xls.preco_venda,
        preco_custo: p.xls.preco_custo,
        estoque: p.xls.estoque,
        atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
      })
      atualizados++
    }
    await batch.commit()
    console.log(`  ${atualizados} atualizados...`)
    await sleep(600)
  }

  console.log('\n=== Concluído! ===')
  console.log(`  Atualizados: ${atualizados}`)
  console.log(`  Sem match (não alterados): ${semMatch.length}`)
  process.exit(0)
}

main().catch(e => { console.error('\nErro fatal:', e.message || e); process.exit(1) })
