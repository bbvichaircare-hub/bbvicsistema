import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const projectId = 'bbvic-gestao-premium'
const apiKey = 'AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0'

// Login
const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@bbvic.com', password: 'admin123', returnSecureToken: true })
})
const signInData = await signInRes.json()
if (!signInData.idToken) { console.error('Erro login:', signInData); process.exit(1) }
const token = signInData.idToken
console.log('✅ Login OK')

// STEP 1: Delete ALL existing clients
console.log('\n🗑  Apagando todos os clientes existentes...')
let deletedTotal = 0
let pageToken = ''
while (true) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/clientes?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!data.documents || data.documents.length === 0) break
  for (const d of data.documents) {
    await fetch(`https://firestore.googleapis.com/v1/${d.name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    deletedTotal++
  }
  console.log(`  → ${deletedTotal} apagados...`)
  if (!data.nextPageToken) break
  pageToken = data.nextPageToken
}
console.log(`✅ ${deletedTotal} cliente(s) apagado(s)!`)

// STEP 2: Import from Excel
const wb = XLSX.readFile('C:/Users/julie/Downloads/clientes_bbvic_2026-03-10.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`\n📥 Importando ${rows.length} clientes...`)

const getCol = (row, ...keys) => {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim())
    if (found !== undefined && row[found] !== undefined && row[found] !== '') return row[found]
  }
  return ''
}

// Format phone: ensure it's a string
const cleanPhone = (v) => {
  if (!v) return ''
  return String(v).trim()
}

// Format date from Excel serial number or string
const cleanDate = (v) => {
  if (!v) return ''
  // Excel serial date
  if (typeof v === 'number') {
    const date = new Date((v - 25569) * 86400 * 1000)
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }
  return String(v).trim()
}

let success = 0, skipped = 0, errors = 0
const seenEmails = new Set()
const seenPhones = new Set()

for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  const nome = String(getCol(row, 'nome', 'name', 'cliente', 'full name', 'nome completo') || '').trim()
  if (!nome) { skipped++; continue }

  const email = String(getCol(row, 'email', 'e-mail') || '').toLowerCase().trim()
  const telefone = cleanPhone(getCol(row, 'telefone', 'phone', 'tel', 'celular', 'fone'))

  // Skip in-memory duplicates
  if (email && seenEmails.has(email)) { skipped++; continue }
  if (telefone && !email && seenPhones.has(telefone)) { skipped++; continue }

  const body = {
    fields: {
      nome:            { stringValue: nome },
      email:           { stringValue: email },
      telefone:        { stringValue: telefone },
      endereco:        { stringValue: String(getCol(row, 'endereco', 'endereço', 'address', 'rua') || '').trim() },
      cidade:          { stringValue: String(getCol(row, 'cidade', 'city') || '').trim() },
      estado:          { stringValue: String(getCol(row, 'estado', 'state') || '').trim() },
      cep:             { stringValue: String(getCol(row, 'cep', 'zip', 'zipcode') || '').trim() },
      data_nascimento: { stringValue: cleanDate(getCol(row, 'data nascimento', 'data_nascimento', 'birthday', 'nascimento', 'birth')) },
      empresa:         { stringValue: String(getCol(row, 'empresa', 'company') || '').trim() },
      observacoes:     { stringValue: String(getCol(row, 'observacoes', 'observações', 'notes', 'obs') || '').trim() },
      vendedor_id:     { stringValue: '' },
      ativo:           { booleanValue: true },
      created_at:      { timestampValue: new Date().toISOString() },
    }
  }

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/clientes`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
  )

  if (res.ok) {
    success++
    if (email) seenEmails.add(email)
    if (telefone) seenPhones.add(telefone)
    if (success % 50 === 0) console.log(`  → ${success}/${rows.length} importados...`)
  } else {
    const err = await res.json()
    console.error(`  ✗ Erro linha ${i+1} (${nome}):`, err.error?.message)
    errors++
  }
}

console.log(`\n✅ Concluído! ${success} cliente(s) importado(s). ${skipped} ignorado(s). ${errors} erro(s).`)
