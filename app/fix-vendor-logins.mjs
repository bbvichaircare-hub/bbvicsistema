// ============================================================
// BBVIC — Correção de Login de Vendedores (Admin SDK)
// 
// ANTES de executar:
//   1. Baixe a chave de serviço do Firebase Console:
//      https://console.firebase.google.com/project/bbvic-gestao-premium/settings/serviceaccounts/adminsdk
//      Clique em "Gerar nova chave privada" → salve o JSON
//   2. Coloque o arquivo JSON nessa pasta com o nome: serviceAccountKey.json
//   3. Execute: node fix-vendor-logins.mjs
// ============================================================

import { readFileSync, existsSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const TEMP_PASSWORD = 'Bbvic@2024'
const SERVICE_KEY_PATH = './serviceAccountKey.json'

console.log('═══════════════════════════════════════════════')
console.log('  BBVIC — Correção de Login de Vendedores')
console.log('═══════════════════════════════════════════════\n')

if (!existsSync(SERVICE_KEY_PATH)) {
  console.error('❌ ARQUIVO serviceAccountKey.json NÃO ENCONTRADO!\n')
  console.error('Para corrigir:')
  console.error('1. Acesse: https://console.firebase.google.com/project/bbvic-gestao-premium/settings/serviceaccounts/adminsdk')
  console.error('2. Clique em "Gerar nova chave privada"')
  console.error('3. Salve o arquivo como: serviceAccountKey.json')
  console.error('4. Coloque ele nessa pasta:', process.cwd())
  console.error('5. Execute novamente: node fix-vendor-logins.mjs')
  process.exit(1)
}

let admin
try {
  admin = require('firebase-admin')
} catch {
  console.error('❌ firebase-admin não instalado.')
  console.error('   Execute: npm install firebase-admin')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_KEY_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()
const authAdmin = admin.auth()

console.log('✅ Firebase Admin SDK inicializado\n')
console.log('📋 Buscando vendedores no Firestore...')

const snapshot = await db.collection('users').where('role', '==', 'vendedor').get()
const vendors = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }))

console.log(`✅ ${vendors.length} vendedor(es) encontrado(s)\n`)

if (vendors.length === 0) {
  console.log('⚠️  Nenhum vendedor encontrado.')
  console.log('   Crie vendedores primeiro pela página de Vendedores no sistema.\n')
  process.exit(0)
}

const resultados = []

for (const v of vendors) {
  const { uid, nome = 'Sem nome', email = '', ativo } = v
  console.log(`───────────────────────────────────────────────`)
  console.log(`👤 ${nome}  |  ${email || '(sem email)'}  |  UID: ${uid}`)

  if (!email) {
    console.log(`   ⚠️  Sem email — pulando\n`)
    resultados.push({ nome, email, status: 'sem_email' })
    continue
  }

  if (ativo === false) {
    console.log(`   ⏸️  Conta desativada — pulando\n`)
    resultados.push({ nome, email, status: 'desativado' })
    continue
  }

  try {
    // Try to update existing Auth user password
    await authAdmin.updateUser(uid, { password: TEMP_PASSWORD })
    console.log(`   ✅ Senha redefinida com sucesso!`)
    console.log(`   🔑 Nova senha: ${TEMP_PASSWORD}`)
    resultados.push({ nome, email, status: 'senha_redefinida' })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Not in Firebase Auth — create the account
      try {
        await authAdmin.createUser({ uid, email, password: TEMP_PASSWORD, displayName: nome })
        console.log(`   ✅ Conta criada no Firebase Auth!`)
        console.log(`   🔑 Senha: ${TEMP_PASSWORD}`)
        resultados.push({ nome, email, status: 'criado' })
      } catch (createErr) {
        // UID in use with different email? Try without specific UID
        try {
          const newUser = await authAdmin.createUser({ email, password: TEMP_PASSWORD, displayName: nome })
          // Update Firestore doc with new UID
          const oldData = (await db.collection('users').doc(uid).get()).data()
          await db.collection('users').doc(newUser.uid).set({ ...oldData, uid: newUser.uid })
          await db.collection('users').doc(uid).delete()
          console.log(`   ✅ Conta criada (novo UID: ${newUser.uid}) e Firestore atualizado!`)
          console.log(`   🔑 Senha: ${TEMP_PASSWORD}`)
          resultados.push({ nome, email, status: 'criado_novo_uid', newUid: newUser.uid })
        } catch (e2) {
          console.log(`   ❌ Erro ao criar: ${e2.message}`)
          resultados.push({ nome, email, status: 'erro', erro: e2.message })
        }
      }
    } else {
      console.log(`   ❌ Erro inesperado: ${err.message}`)
      resultados.push({ nome, email, status: 'erro', erro: err.message })
    }
  }
  console.log('')
}

console.log('\n═══════════════════════════════════════════════')
console.log('                   RESUMO FINAL')
console.log('═══════════════════════════════════════════════')

const ok       = resultados.filter(r => ['senha_redefinida','criado','criado_novo_uid'].includes(r.status))
const erros    = resultados.filter(r => r.status === 'erro')
const outros   = resultados.filter(r => ['desativado','sem_email'].includes(r.status))

if (ok.length > 0) {
  console.log(`\n✅ CORRIGIDOS (${ok.length}) — senha temporária: ${TEMP_PASSWORD}`)
  ok.forEach(r => console.log(`   • ${r.nome}  →  ${r.email}`))
}
if (erros.length > 0) {
  console.log(`\n❌ ERROS (${erros.length}):`)
  erros.forEach(r => console.log(`   • ${r.nome}  →  ${r.email}: ${r.erro}`))
}
if (outros.length > 0) {
  console.log(`\n⏸️  NÃO ALTERADOS: ${outros.map(r => r.nome).join(', ')}`)
}

if (ok.length > 0) {
  console.log(`\n📌 Informe aos vendedores:`)
  console.log(`   ✉️  Email: (o email cadastrado de cada um)`)
  console.log(`   🔑 Senha: ${TEMP_PASSWORD}`)
  console.log(`\n   Eles devem trocar a senha após o primeiro login.\n`)
}
