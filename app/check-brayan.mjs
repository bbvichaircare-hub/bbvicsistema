import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0",
  authDomain: "bbvic-gestao-premium.firebaseapp.com",
  projectId: "bbvic-gestao-premium",
  storageBucket: "bbvic-gestao-premium.firebasestorage.app",
  messagingSenderId: "214158661970",
  appId: "1:214158661970:web:b7b9746296f5c35159c28b"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

console.log('=== Verificando faturas do Brayan ===\n')

// 1. Buscar TODOS os users para encontrar Brayan
const usersSnap = await getDocs(collection(db, 'users'))
console.log('--- USUARIOS ---')
for (const d of usersSnap.docs) {
  const data = d.data()
  if (data.role === 'vendedor' || data.nome?.toLowerCase().includes('brayan')) {
    console.log(`UID: ${d.id} | Nome: ${data.nome} | Role: ${data.role} | Email: ${data.email}`)
  }
}

// 2. Buscar todas as invoices e mostrar os campos vendedor
console.log('\n--- INVOICES (primeiras 20) ---')
const invSnap = await getDocs(collection(db, 'invoices'))
for (const d of invSnap.docs.slice(0, 20)) {
  const data = d.data()
  console.log(`ID: ${d.id.slice(0,8)}... | vendedor_id: "${data.vendedor_id || '(vazio)'}" | vendedor_nome: "${data.vendedor_nome || '(vazio)'}" | numero: ${data.numero}`)
}

// 3. Buscar estimates
console.log('\n--- ESTIMATES (primeiras 10) ---')
const estSnap = await getDocs(collection(db, 'estimates'))
for (const d of estSnap.docs.slice(0, 10)) {
  const data = d.data()
  console.log(`ID: ${d.id.slice(0,8)}... | vendedor_id: "${data.vendedor_id || '(vazio)'}" | vendedor_nome: "${data.vendedor_nome || '(vazio)'}" | numero: ${data.numero}`)
}
