// Script: corrigir-status-rascunho.mjs
// Corrige faturas com status 'rascunho' para o status correto
// Executar: node corrigir-status-rascunho.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'

// Procura a chave de serviço em locais comuns
const caminhos = [
  'C:/Users/julie/Downloads/bbvic-gestao-premium-firebase-adminsdk-fbsvc-b1455c83b7.json',
  'C:/Users/julie/Downloads/bbvic-service-account.json',
  './bbvic-service-account.json',
]

let serviceAccount = null
for (const c of caminhos) {
  if (existsSync(c)) {
    serviceAccount = JSON.parse(readFileSync(c, 'utf8'))
    console.log(`Chave encontrada: ${c}`)
    break
  }
}

if (!serviceAccount) {
  console.error('❌ Chave de serviço não encontrada. Coloque o arquivo bbvic-service-account.json em C:/Users/julie/Downloads/')
  process.exit(1)
}

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const parseData = (v) => {
  if (!v) return null
  try {
    if (typeof v?.toDate === 'function') return v.toDate()
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000)
    if (v instanceof Date) return v
    const s = String(v).trim()
    const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (dm) return new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00`)
    const ym = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (ym) return new Date(`${ym[1]}-${ym[2]}-${ym[3]}T12:00:00`)
    return new Date(s)
  } catch { return null }
}

const definirStatus = (doc) => {
  const d = doc
  const total = d.total || 0
  const valorPago = d.valor_pago || 0
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

  // 1. Totalmente pago
  if (valorPago >= total && total > 0) return 'pago'

  // 2. Parcialmente pago (não parcelado)
  if (valorPago > 0 && !d.parcelas_ativo) return 'parcial'

  // 3. Parcelado: verifica parcelas
  if (Array.isArray(d.parcelas) && d.parcelas.length > 0) {
    const totalParcelasPagas = d.parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + (p.valor || 0), 0)
    if (totalParcelasPagas >= total && total > 0) return 'pago'
    if (totalParcelasPagas > 0) return 'parcial'
  }

  // 4. Verifica se está atrasado
  const camposVenc = ['data', 'data_vencimento', 'vencimento', 'due_date', 'dataVencimento']
  for (const c of camposVenc) {
    if (d[c]) {
      const dt = parseData(d[c])
      if (dt) {
        const v = new Date(dt); v.setHours(23, 59, 59, 999)
        if (v < hoje) return 'atrasado'
        break
      }
    }
  }

  // 5. Parcelado: verifica parcelas com data passada
  if (Array.isArray(d.parcelas) && d.parcelas.length > 0) {
    for (const p of d.parcelas.filter(pp => pp.status !== 'pago')) {
      const dt = parseData(p.data_vencimento ?? p.data ?? p.vencimento)
      if (dt) {
        const v = new Date(dt); v.setHours(23, 59, 59, 999)
        if (v < hoje) return 'atrasado'
      }
    }
  }

  // 6. Default: enviado
  return 'enviado'
}

async function corrigir() {
  console.log('\n=== Corrigindo faturas com status RASCUNHO ===\n')

  const snap = await db.collection('invoices').where('status', '==', 'rascunho').get()
  console.log(`Encontradas: ${snap.size} faturas com status rascunho\n`)

  if (snap.size === 0) {
    console.log('Nenhuma fatura para corrigir.')
    process.exit(0)
  }

  const batch = db.batch()
  const resumo = { pago: 0, parcial: 0, atrasado: 0, enviado: 0 }
  const detalhes = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const novoStatus = definirStatus(data)
    resumo[novoStatus] = (resumo[novoStatus] || 0) + 1
    detalhes.push({ id: doc.id, cliente: data.cliente_nome || '?', total: data.total || 0, novoStatus })
    batch.update(doc.ref, { status: novoStatus })
  }

  console.log('Preview das alterações:')
  for (const d of detalhes) {
    console.log(`  ${d.cliente.padEnd(40)} $${String(d.total.toFixed(2)).padStart(8)} → ${d.novoStatus}`)
  }

  console.log('\nResumo:')
  for (const [s, q] of Object.entries(resumo)) {
    console.log(`  ${s}: ${q}`)
  }

  console.log('\nAplicando alterações no Firestore...')
  await batch.commit()
  console.log('✅ Concluído! Todas as faturas foram corrigidas.')
}

corrigir().catch(e => { console.error('Erro:', e.message); process.exit(1) })
