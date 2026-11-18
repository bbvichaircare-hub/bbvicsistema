import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { parseDataFlex } from '@/lib/faturas'

interface Linha {
  data: Date | null
  valor: number
  forma: string
  tipo: string
  obs?: string
}

const TIPO: Record<string, string> = {
  fatura: 'Quitação',
  fatura_parcial: 'Pagamento parcial',
  parcela: 'Parcela',
  correcao_pagamento: 'Correção de valor',
}

/**
 * Histórico detalhado dos pagamentos de uma fatura: data, valor, forma e tipo.
 * Fonte: registros de pagamento (coleção "receitas") + adiantamento da fatura.
 * Se houver valor pago sem registro detalhado, mostra a diferença numa linha à parte.
 */
export function HistoricoPagamentos({ invoiceId, invoice }: { invoiceId: string; invoice: any }) {
  const { user, isAdmin } = useAuth()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!invoiceId || !invoice || !user) return
    let cancel = false
    ;(async () => {
      try {
        const q = isAdmin
          ? query(collection(db, 'receitas'), where('invoice_id', '==', invoiceId))
          : query(collection(db, 'receitas'), where('invoice_id', '==', invoiceId), where('vendedor_id', '==', user.uid))
        const snap = await getDocs(q)
        const lista: Linha[] = snap.docs.map(d => {
          const r: any = d.data()
          const data = parseDataFlex(r.data) ?? (r.ano && r.mes ? new Date(r.ano, r.mes - 1, 1, 12) : parseDataFlex(r.created_at))
          const forma = r.forma_pagamento
            || (r.origem === 'fatura' ? invoice.forma_pagamento_recebido : '')
            || ''
          const sub = r.forma_pagamento_sub || (r.origem === 'fatura' ? invoice.forma_pagamento_sub : '')
          const tipo = r.origem === 'parcela'
            ? (String(r.descricao || '').match(/Parcela \d+\/\d+/)?.[0] || 'Parcela')
            : (TIPO[r.origem] || 'Pagamento')
          return { data, valor: Number(r.valor) || 0, forma: sub ? `${forma} (${sub})` : forma, tipo, obs: r.origem === 'fatura' ? invoice.observacao_pagamento || undefined : undefined }
        })

        // Adiantamento / depósito informado na fatura
        if ((invoice.deposit || 0) > 0) {
          lista.push({ data: parseDataFlex(invoice.data_emissao ?? invoice.created_at), valor: invoice.deposit, forma: '', tipo: 'Adiantamento / Depósito' })
        }

        // Valor pago sem registro detalhado (pagamentos antigos ou feitos por outra tela)
        const registrado = snap.docs.reduce((s, d) => s + (Number((d.data() as any).valor) || 0), 0)
        const pago = invoice.valor_pago || (invoice.status === 'pago' ? (invoice.total || 0) - (invoice.deposit || 0) : 0)
        const semDetalhe = Math.round((pago - registrado) * 100) / 100
        if (semDetalhe > 0.01) {
          lista.push({
            data: parseDataFlex(invoice.data_pagamento),
            valor: semDetalhe,
            forma: invoice.forma_pagamento_recebido || '',
            tipo: 'Pagamento sem detalhe registrado',
          })
        }

        lista.sort((a, b) => (a.data?.getTime() || 0) - (b.data?.getTime() || 0))
        if (!cancel) setLinhas(lista)
      } catch (e) {
        console.error('Histórico de pagamentos:', e)
        if (!cancel) setErro(true)
      }
    })()
    return () => { cancel = true }
  }, [invoiceId, invoice, user, isAdmin])

  if (erro) return <p className="text-xs text-gray-400 mt-3">Não foi possível carregar o histórico de pagamentos.</p>
  if (linhas === null) return <p className="text-xs text-gray-400 mt-3">Carregando pagamentos…</p>
  if (linhas.length === 0) return null

  const totalRecebido = linhas.reduce((s, l) => s + l.valor, 0)

  return (
    <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Histórico de pagamentos</span>
        <span className="text-xs text-gray-500">{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {linhas.map((l, i) => (
          <li key={i} className="px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-700 font-medium">{l.data ? l.data.toLocaleDateString('pt-BR') : 'Sem data'}</span>
              <span className={`font-semibold ${l.valor < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatCurrency(l.valor)}</span>
            </div>
            <div className="flex justify-between gap-3 text-xs text-gray-500 mt-0.5">
              <span>{l.tipo}</span>
              <span>{l.forma || 'Forma não informada'}</span>
            </div>
            {l.obs && <p className="text-xs text-gray-400 mt-0.5">{l.obs}</p>}
          </li>
        ))}
      </ul>
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex justify-between text-sm">
        <span className="text-gray-600">Total recebido</span>
        <span className="font-bold text-green-700">{formatCurrency(totalRecebido)}</span>
      </div>
    </div>
  )
}
