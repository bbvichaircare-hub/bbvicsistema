import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const sa = JSON.parse(readFileSync('C:/Users/julie/Downloads/bbvic-service-account.json', 'utf8'))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const INVOICE_ID = 'ij6xHsvEHpYzoBAVza5P'

const snap = await db.collection('invoices').doc(INVOICE_ID).get()
if (!snap.exists) { console.log('Fatura não encontrada'); process.exit(1) }

const data = snap.data()
const parcelas = data.parcelas || []
const valorPago = data.valor_pago || 0

console.log(`Fatura: ${data.numero} | Total: ${data.total} | Valor pago: ${valorPago}`)
console.log('Parcelas atuais:')
parcelas.forEach((p, i) => console.log(`  ${i+1}ª: $${p.valor} | status: ${p.status}`))

// Marcar parcelas como pagas baseado no valor_pago acumulado
let acumulado = 0
const novasParcelas = parcelas.map((p) => {
  if (p.status === 'pago') { acumulado += p.valor; return p }
  if (acumulado + p.valor <= valorPago + 0.01) {
    acumulado += p.valor
    return { ...p, status: 'pago', data_pagamento: data.data_pagamento || new Date().toISOString().split('T')[0], forma_pagamento: data.forma_pagamento_recebido || '' }
  }
  return p
})

console.log('\nParcelas corrigidas:')
novasParcelas.forEach((p, i) => console.log(`  ${i+1}ª: $${p.valor} | status: ${p.status}`))

await db.collection('invoices').doc(INVOICE_ID).update({ parcelas: novasParcelas })
console.log('\n✅ Fatura corrigida com sucesso!')
process.exit(0)
