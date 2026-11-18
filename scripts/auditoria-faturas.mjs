// Auditoria SOMENTE LEITURA das faturas. Nao altera nada no banco.
// Mostra apenas totais e contagens (sem nomes de clientes).
import admin from 'firebase-admin'

admin.initializeApp({ projectId: 'bbvic-gestao-premium' })
const db = admin.firestore()

const money = v => '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = v => Math.round((v || 0) * 100) / 100
function dt(v) {
  if (!v) return null
  try {
    if (typeof v.toDate === 'function') return v.toDate()
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000)
    const s = String(v).trim()
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
    const d = new Date(s); return isNaN(d) ? null : d
  } catch { return null }
}
const ym = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'sem-data'

const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
const venceu = d => { if (!d) return false; const x = new Date(d); x.setHours(23, 59, 59, 999); return x < hoje }

const invSnap = await db.collection('invoices').get()
const recSnap = await db.collection('receitas').get()
const invs = invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
console.log(`\n===== AUDITORIA DE FATURAS (${new Date().toISOString().slice(0, 10)}) =====`)
console.log(`Faturas: ${invs.length} | Registros em "receitas": ${recSnap.size}`)

// 1. Por status
const porStatus = {}
for (const i of invs) {
  const s = i.status || '(vazio)'
  porStatus[s] ??= { n: 0, total: 0, pago: 0 }
  porStatus[s].n++; porStatus[s].total += i.total || 0; porStatus[s].pago += i.valor_pago || 0
}
console.log('\n--- 1. Faturas por status ---')
for (const [s, v] of Object.entries(porStatus).sort((a, b) => b[1].n - a[1].n))
  console.log(`${s.padEnd(24)} ${String(v.n).padStart(5)}  total ${money(v.total).padStart(14)}  valor_pago ${money(v.pago).padStart(14)}`)

// 2. O que o card "Receita" mostra hoje (todas as faturas, sem filtro de data)
const cardHoje = invs.filter(i => ['pago', 'parcial'].includes(i.status))
  .reduce((s, i) => s + (i.status === 'pago' ? (i.total - (i.desconto || 0)) : (i.valor_pago || 0)), 0)
const descontoDuplo = invs.filter(i => i.status === 'pago' && (i.desconto || 0) > 0)
console.log('\n--- 2. Card "Receita" atual ---')
console.log(`Valor que o card mostra (todas as datas): ${money(cardHoje)}`)
console.log(`Faturas pagas com desconto descontado 2x no card: ${descontoDuplo.length} (soma dos descontos ${money(descontoDuplo.reduce((s, i) => s + (i.desconto || 0), 0))})`)
const totalBate = invs.filter(i => i.subtotal != null && Math.abs((i.subtotal - (i.desconto || 0) + (i.taxa || 0) + (i.taxa_envio || 0)) - (i.total || 0)) < 0.02).length
console.log(`Faturas em que total = subtotal - desconto + taxa (+envio): ${totalBate} de ${invs.filter(i => i.subtotal != null).length}`)

// 3. Recebido por mes (3 jeitos de medir)
const porMes = {}
const add = (k, campo, v) => { porMes[k] ??= { faturaPaga: 0, parcial: 0, receitas: 0, parcelas: 0 }; porMes[k][campo] += v }
for (const i of invs) {
  if (i.status === 'pago') add(ym(dt(i.data_pagamento) || dt(i.updated_at)), 'faturaPaga', i.total || 0)
  if (i.status === 'parcial') add(ym(dt(i.data_pagamento) || dt(i.updated_at)), 'parcial', i.valor_pago || 0)
  for (const p of (Array.isArray(i.parcelas) ? i.parcelas : [])) if (p.data_pagamento && (p.valor_pago || p.status === 'pago')) add(ym(dt(p.data_pagamento)), 'parcelas', p.valor_pago || p.valor || 0)
}
for (const d of recSnap.docs) { const r = d.data(); const k = r.ano && r.mes ? `${r.ano}-${String(r.mes).padStart(2, '0')}` : ym(dt(r.data)); add(k, 'receitas', r.valor || 0) }
console.log('\n--- 3. Recebido por mes ---')
console.log('mes        | faturas pagas (total) | parciais (valor_pago) | colecao receitas | parcelas pagas')
for (const k of Object.keys(porMes).sort().slice(-14))
  console.log(`${k.padEnd(10)} | ${money(porMes[k].faturaPaga).padStart(21)} | ${money(porMes[k].parcial).padStart(21)} | ${money(porMes[k].receitas).padStart(16)} | ${money(porMes[k].parcelas).padStart(14)}`)
const primeiraReceita = recSnap.docs.map(d => dt(d.data().created_at) || dt(d.data().data)).filter(Boolean).sort((a, b) => a - b)[0]
console.log(`Primeiro registro em "receitas": ${primeiraReceita ? primeiraReceita.toISOString().slice(0, 10) : 'nenhum'}`)
console.log(`Faturas pagas sem data_pagamento: ${invs.filter(i => i.status === 'pago' && !i.data_pagamento).length}`)

// 4. Inconsistencias
const abertas = invs.filter(i => !['pago', 'cancelado'].includes(i.status))
const anom = {
  'status pago mas valor_pago < total': invs.filter(i => i.status === 'pago' && (i.valor_pago || 0) > 0 && i.valor_pago < (i.total || 0) - 0.01).length,
  'status parcial mas valor_pago >= total (ja quitada)': invs.filter(i => i.status === 'parcial' && (i.valor_pago || 0) >= (i.total || 0) - 0.01).length,
  'status parcial com valor_pago = 0': invs.filter(i => i.status === 'parcial' && !(i.valor_pago > 0)).length,
  'aberta (nao paga) com valor_pago >= total': abertas.filter(i => (i.valor_pago || 0) >= (i.total || 0) - 0.01 && (i.total || 0) > 0).length,
  'parcelada: soma das parcelas != total': invs.filter(i => i.parcelas_ativo && Array.isArray(i.parcelas) && i.parcelas.length && Math.abs(i.parcelas.reduce((s, p) => s + (p.valor || 0), 0) - (i.total || 0)) > 0.05).length,
  'parcelada: parcelas em aberto somam mais que o saldo': invs.filter(i => i.parcelas_ativo && Array.isArray(i.parcelas) && i.parcelas.length && i.status !== 'pago' && i.parcelas.filter(p => p.status !== 'pago').reduce((s, p) => s + (p.valor || 0) - (p.valor_pago || 0), 0) > r2((i.total || 0) - (i.valor_pago || 0)) + 0.05).length,
  'aberta sem data_vencimento': abertas.filter(i => !i.data_vencimento).length,
  'status gravado "atrasado"': invs.filter(i => i.status === 'atrasado').length,
  'total zero ou negativo': invs.filter(i => !((i.total || 0) > 0)).length,
}
console.log('\n--- 4. Inconsistencias ---')
for (const [k, v] of Object.entries(anom)) console.log(`${String(v).padStart(5)}  ${k}`)

// 5. Em aberto / em atraso (regra nova)
let atrasoValor = 0, atrasoQtd = 0, aReceber = 0, saldoTotal = 0
const idade = { '1-30 dias': 0, '31-90 dias': 0, '91-365 dias': 0, '+1 ano': 0 }
for (const i of abertas) {
  if (i.status === 'rascunho') continue
  const saldo = Math.max(0, r2((i.total || 0) - (i.valor_pago || 0)))
  if (saldo <= 0.01) continue
  saldoTotal += saldo
  let atraso = 0, vencMaisAntigo = null
  if (Array.isArray(i.parcelas) && i.parcelas.length && i.parcelas_ativo !== false) {
    for (const p of i.parcelas) {
      const d = dt(p.data_vencimento ?? p.data ?? p.vencimento)
      if (p.status !== 'pago' && venceu(d)) { atraso += Math.max(0, (p.valor || 0) - (p.valor_pago || 0)); if (!vencMaisAntigo || d < vencMaisAntigo) vencMaisAntigo = d }
    }
    atraso = Math.min(saldo, atraso)
  } else {
    let d = dt(i.data_vencimento ?? i.vencimento ?? i.due_date)
    if (!d) { const e = dt(i.data_emissao ?? i.created_at); if (e) { d = new Date(e); d.setDate(d.getDate() + 30) } }
    if (venceu(d)) { atraso = saldo; vencMaisAntigo = d }
  }
  if (atraso > 0.01) {
    atrasoQtd++; atrasoValor += atraso
    const dias = Math.floor((hoje - vencMaisAntigo) / 86400000)
    idade[dias <= 30 ? '1-30 dias' : dias <= 90 ? '31-90 dias' : dias <= 365 ? '91-365 dias' : '+1 ano'] += atraso
  }
  aReceber += saldo - atraso
}
console.log('\n--- 5. Saldo em aberto (regra nova, sem rascunhos) ---')
console.log(`Saldo total em aberto: ${money(saldoTotal)}`)
console.log(`  Em atraso:  ${money(atrasoValor)} em ${atrasoQtd} faturas`)
console.log(`  A vencer:   ${money(aReceber)}`)
console.log('Atraso por idade (desde o vencimento mais antigo):')
for (const [k, v] of Object.entries(idade)) console.log(`  ${k.padEnd(12)} ${money(v)}`)
console.log('\n===== FIM (nenhum dado foi alterado) =====')
