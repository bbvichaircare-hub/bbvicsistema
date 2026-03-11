import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

// Read Excel
const wb = XLSX.readFile('C:/Users/julie/Downloads/estoque_bbvic_2026-03-11.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

// Clean numeric values (handles "$ 35,00" format)
const cleanNum = (v) => {
  if (v === undefined || v === null || v === '') return 0
  const s = String(v).replace(/[$\s]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// Firebase config
const projectId = 'bbvic-gestao-premium'
const apiKey = 'AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0'

// Sign in as admin to get auth token
const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@bbvic.com', password: 'admin123', returnSecureToken: true })
})
const signInData = await signInRes.json()
if (!signInData.idToken) {
  console.error('Erro ao fazer login:', signInData)
  process.exit(1)
}
const token = signInData.idToken
console.log(`✅ Login OK. Importando ${rows.length} produtos...`)

let success = 0
let errors = 0

for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  const nome = String(row['NOME'] || row['Nome'] || row['nome'] || '').trim()
  if (!nome) continue

  const venda = cleanNum(row['Preço Venda ($)'] || row['Preco Venda ($)'] || row['preco_venda'] || 0)
  const custo = cleanNum(row['Preço Custo ($)'] || row['Preco Custo ($)'] || row['preco_custo'] || 0)
  const margem = venda > 0 ? Math.round(((venda - custo) / venda) * 10000) / 100 : 0
  const estoque = Math.round(cleanNum(row['Estoque'] || row['estoque'] || 0))
  const estoqueMin = Math.round(cleanNum(row['Estoque Mínimo'] || row['Estoque Minimo'] || row['estoque_minimo'] || 0))

  const body = {
    fields: {
      nome:           { stringValue: nome },
      categoria:      { stringValue: String(row['Categoria'] || row['categoria'] || '').trim() },
      preco:          { doubleValue: venda },
      preco_venda:    { doubleValue: venda },
      preco_custo:    { doubleValue: custo },
      margem_lucro:   { doubleValue: margem },
      estoque:        { integerValue: estoque },
      estoque_minimo: { integerValue: estoqueMin },
      unidade:        { stringValue: String(row['Unidade'] || row['unidade'] || 'un').trim() || 'un' },
      ativo:          { booleanValue: true },
      created_at:     { timestampValue: new Date().toISOString() },
      updated_at:     { timestampValue: new Date().toISOString() },
    }
  }

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/produtos`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
  )

  if (res.ok) {
    success++
    if (success % 50 === 0) console.log(`  → ${success}/${rows.length} importados...`)
  } else {
    const err = await res.json()
    console.error(`  ✗ Erro linha ${i+1} (${nome}):`, err.error?.message)
    errors++
  }
}

console.log(`\n✅ Concluído! ${success} produto(s) importado(s). ${errors} erro(s).`)
