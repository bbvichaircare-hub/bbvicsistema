import { db } from './firebase'
import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

export async function logActivity(
  acao: string,
  detalhes: string,
  tipo: 'login' | 'fatura' | 'orcamento' | 'cliente' | 'produto' | 'estoque' | 'pagamento' | 'vendedor' | 'compra' | 'geral' = 'geral'
) {
  try {
    const auth = getAuth()
    const user = auth.currentUser
    await addDoc(collection(db, 'audit_log'), {
      acao,
      detalhes,
      tipo,
      usuario_id: user?.uid || 'sistema',
      usuario_email: user?.email || '',
      created_at: Timestamp.now(),
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}
