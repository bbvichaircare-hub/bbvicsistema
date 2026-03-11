import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const wb = XLSX.readFile('C:/Users/julie/Downloads/clientes_bbvic_2026-03-10.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

const getCol = (row, ...keys) => {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim())
    if (found !== undefined && row[found] !== undefined && row[found] !== '') return row[found]
  }
  return ''
}

const projectId = 'bbvic-gestao-premium'
const apiKey = 'AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0'

const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@bbvic.com', password: 'admin123', returnSecureToken: true })
})
const signInData = await signInRes.json()
if (!signInData.idToken) { console.error('Erro login:', signInData); process.exit(1) }
const token = signInData.idToken
console.log(`✅ Login OK. Importando ${rows.length} clientes...`)

// Fetch existing emails/phones to avoid duplicates
const existingRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/clientes?pageSize=1000`,
  { headers: { Authorization: `Bearer ${token}` } }
)
const existingData = await existingRes.json()
const existingEmails = new Set()
const existingPhones = new Set()
if (existingData.documents) {
  for (const d of existingData.documents) {
    const email = d.fields?.email?.stringValue
    const tel = d.fields?.telefone?.stringValue
    if (email) existingEmails.add(email.toLowerCase().trim())
    if (tel) existingPhones.add(tel.trim())
  }
}
console.log(`  (${existingEmails.size} clientes já cadastrados verificados)`)

let success = 0, skipped = 0, duplicates = 0, errors = 0

for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  const nome = String(getCol(row, 'nome', 'name', 'cliente', 'full name', 'nome completo') || '').trim()
  if (!nome) { skipped++; continue }

  const email = String(getCol(row, 'email', 'e-mail') || '').toLowerCase().trim()
  const telefone = String(getCol(row, 'telefone', 'phone', 'tel', 'celular', 'fone') || '').trim()

  if (email && existingEmails.has(email)) { duplicates++; continue }
  if (telefone && !email && existingPhones.has(telefone)) { duplicates++; continue }

  const body = {
    fields: {
      nome:            { stringValue: nome },
      email:           { stringValue: email },
      telefone:        { stringValue: telefone },
      endereco:        { stringValue: String(getCol(row, 'endereco', 'endereço', 'address', 'rua') || '').trim() },
      cidade:          { stringValue: String(getCol(row, 'cidade', 'city') || '').trim() },
      estado:          { stringValue: String(getCol(row, 'estado', 'state') || '').trim() },
      cep:             { stringValue: String(getCol(row, 'cep', 'zip', 'zipcode') || '').trim() },
      data_nascimento: { stringValue: String(getCol(row, 'data nascimento', 'data_nascimento', 'birthday', 'nascimento', 'birth') || '').trim() },
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
    if (email) existingEmails.add(email)
    if (telefone) existingPhones.add(telefone)
    if (success % 50 === 0) console.log(`  → ${success}/${rows.length} importados...`)
  } else {
    const err = await res.json()
    console.error(`  ✗ Erro linha ${i+1} (${nome}):`, err.error?.message)
    errors++
  }
}

console.log(`\n✅ Concluído! ${success} cliente(s) importado(s). ${duplicates} duplicado(s) ignorado(s). ${skipped} linha(s) vazia(s). ${errors} erro(s).`)
