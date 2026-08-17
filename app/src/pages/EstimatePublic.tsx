import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, increment, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CheckCircle, Clock, XCircle, Loader2, Phone, Mail, MapPin, FileDown } from 'lucide-react'
import { gerarPDFOrcamento } from '@/lib/pdfUtils'
import { v4 as uuidv4 } from 'uuid'

function currency(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function openWhatsApp(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 100)
}

export default function EstimatePublic() {
  const { token } = useParams()
  const [estimate, setEstimate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (token) loadEstimate()
  }, [token])

  const loadEstimate = async () => {
    try {
      // Busca direta pelo ID do documento (mais confiável para usuários não autenticados)
      const directSnap = await getDoc(doc(db, 'estimates', token!))

      let docId = ''
      let data: any = null

      if (directSnap.exists()) {
        docId = directSnap.id
        data = directSnap.data()
      } else {
        // Fallback: busca pelo campo public_token (links antigos)
        const q = query(collection(db, 'estimates'), where('public_token', '==', token))
        const snap = await getDocs(q)
        if (!snap.empty) {
          const d = snap.docs[0]
          docId = d.id
          data = d.data()
        } else {
          setErrorMsg('Orçamento não encontrado')
          return
        }
      }

      setEstimate({ id: docId, ...data })
      if (data.status === 'aprovado') setApproved(true)
      if (data.status === 'recusado') setRejected(true)

      const updates: any = {
        visualizado: true,
        visualizado_count: increment(1),
        visualizado_em: Timestamp.now(),
      }
      if (data.status === 'enviado') {
        updates.status = 'visualizado'
      }

      await updateDoc(doc(db, 'estimates', docId), updates).catch(() => {})

      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'estimate_visualizado',
        titulo: '👁️ Orçamento visualizado',
        mensagem: `${data.cliente_nome} visualizou o orçamento ${data.numero}`,
        estimate_id: docId,
        cliente_nome: data.cliente_nome,
        usuario_id: data.vendedor_id || '',
        lida: false,
        created_at: Timestamp.now(),
      }).catch(() => {})
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!estimate) return
    setApproving(true)
    setErrorMsg('')
    try {
      // Criar invoice PRIMEIRO — se falhar, orçamento não some
      const invoiceNumero = `INV-${Date.now()}`
      const newToken = uuidv4()

      const invoiceRef = await addDoc(collection(db, 'invoices'), {
        numero: invoiceNumero,
        cliente_id: estimate.cliente_id || '',
        cliente_nome: estimate.cliente_nome,
        cliente_email: estimate.cliente_email || '',
        cliente_telefone: estimate.cliente_telefone || '',
        cliente_endereco: (estimate as any).cliente_endereco || '',
        cliente_cidade: (estimate as any).cliente_cidade || '',
        cliente_zip: (estimate as any).cliente_zip || '',
        items: estimate.items || [],
        subtotal: estimate.subtotal || 0,
        desconto: estimate.desconto || 0,
        desconto_pct: (estimate as any).desconto_pct || 0,
        taxa: estimate.taxa || 0,
        taxa_pct: (estimate as any).taxa_pct || 0,
        total: estimate.total || 0,
        taxa_envio: (estimate as any).taxa_envio || 0,
        deposit: 0,
        payment_terms: 'Net 30',
        status: 'enviado',
        observacoes: estimate.observacoes || '',
        data_emissao: Timestamp.now(),
        data_vencimento: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        vendedor_id: estimate.vendedor_id || '',
        vendedor_nome: estimate.vendedor_nome || '',
        public_token: newToken,
        visualizado: false,
        visualizado_count: 0,
        estimate_origem: estimate.id,
        created_at: Timestamp.now(),
      })

      // Só marca como aprovado APÓS fatura criada com sucesso
      await updateDoc(doc(db, 'estimates', estimate.id), {
        status: 'aprovado',
        aprovado_em: Timestamp.now(),
        invoice_gerada_id: invoiceRef.id,
      })

      await addDoc(collection(db, 'contas_receber'), {
        descricao: `Fatura ${invoiceNumero} (via orçamento ${estimate.numero})`,
        cliente_id: estimate.cliente_id || '',
        cliente_nome: estimate.cliente_nome,
        invoice_id: invoiceRef.id,
        invoice_numero: invoiceNumero,
        valor: estimate.total || 0,
        data_emissao: Timestamp.now(),
        data_vencimento: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        status: 'pendente',
        origem: 'venda',
        created_at: Timestamp.now(),
      }).catch(() => {})

      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'estimate_aprovado',
        titulo: '✅ Orçamento APROVADO!',
        mensagem: `${estimate.cliente_nome} aprovou o orçamento ${estimate.numero}. Fatura ${invoiceNumero} criada automaticamente!`,
        estimate_id: estimate.id,
        invoice_id: invoiceRef.id,
        invoice_token: newToken,
        cliente_nome: estimate.cliente_nome,
        usuario_id: estimate.vendedor_id || '',
        lida: false,
        created_at: Timestamp.now(),
      }).catch(() => {})

      if (estimate.cliente_telefone) {
        const invoiceUrl = `${window.location.origin}/invoice/${newToken}`
        const msg = `Olá ${estimate.cliente_nome}!\n\nSeu orçamento foi aprovado! Segue sua fatura:\n${invoiceUrl}\n\nTotal: ${currency(estimate.total || 0)}`
        const phone = estimate.cliente_telefone.replace(/\D/g, '')
        openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`)
      }

      setApproved(true)
    } catch (e: any) {
      console.error('Erro ao aprovar:', e)
      setErrorMsg('Erro ao aprovar orçamento. Por favor tente novamente ou entre em contato.')
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!estimate) return
    if (!confirm('Tem certeza que deseja recusar este orçamento?')) return
    try {
      await updateDoc(doc(db, 'estimates', estimate.id), {
        status: 'recusado',
        recusado_em: Timestamp.now(),
      })
      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'estimate_recusado',
        titulo: '❌ Orçamento recusado',
        mensagem: `${estimate.cliente_nome} recusou o orçamento ${estimate.numero}.`,
        estimate_id: estimate.id,
        cliente_nome: estimate.cliente_nome,
        usuario_id: estimate.vendedor_id || '',
        lida: false,
        created_at: Timestamp.now(),
      }).catch(() => {})
      setRejected(true)
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A227]" />
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-2xl p-10 shadow-sm max-w-sm w-full">
          <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Orçamento não encontrado</h1>
          <p className="text-gray-400 text-sm">O link pode ter expirado ou ser inválido.</p>
        </div>
      </div>
    )
  }

  const subtotal = estimate.subtotal || 0
  const desconto = estimate.desconto || 0
  const taxa = estimate.taxa || 0
  const total = estimate.total || 0
  const taxaPct = estimate.taxa_pct || 0
  const descontoPct = estimate.desconto_pct || 0

  const dataValidade = estimate.data_validade?.toDate
    ? estimate.data_validade.toDate().toLocaleDateString('pt-BR')
    : estimate.data_validade

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img src="/logo-bbvic.jpg" alt="BBVIC" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-tight">BBVIC Hair Care</h1>
            <p className="text-xs text-gray-400">Professional Hair Services</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Orçamento</p>
            <p className="text-sm font-bold text-[#C9A227]">{estimate.numero}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-32">

        {/* Status Banner */}
        {approved && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle className="w-7 h-7 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Orçamento Aprovado!</p>
                <p className="text-sm text-green-600">Obrigado! Uma fatura foi gerada e você receberá o link em breve.</p>
              </div>
            </div>
            <button
              onClick={() => gerarPDFOrcamento({
                numero: estimate.numero,
                cliente_nome: estimate.cliente_nome,
                cliente_email: estimate.cliente_email,
                cliente_telefone: estimate.cliente_telefone,
                data_emissao: estimate.data_emissao,
                data_validade: estimate.data_validade,
                items: estimate.items || [],
                subtotal: estimate.subtotal || 0,
                desconto: estimate.desconto > 0 ? estimate.desconto : undefined,
                taxa: estimate.taxa > 0 ? estimate.taxa : undefined,
                total: estimate.total || 0,
                observacoes: estimate.observacoes || undefined,
                termos_condicoes: estimate.termos_condicoes || undefined,
              })}
              className="w-full py-3 rounded-2xl border-2 border-[#C9A227] text-[#C9A227] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#C9A227]/10 transition-colors"
            >
              <FileDown className="w-4 h-4" /> Baixar Orçamento em PDF
            </button>
          </div>
        )}
        {rejected && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="w-7 h-7 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-800">Orçamento Recusado</p>
              <p className="text-sm text-red-600">Entre em contato conosco para ajustes se necessário.</p>
            </div>
          </div>
        )}
        {!approved && !rejected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="w-7 h-7 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800">Aguardando sua aprovação</p>
              {dataValidade && <p className="text-sm text-yellow-600">Válido até {dataValidade}</p>}
            </div>
          </div>
        )}

        {/* Erro */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm text-red-700 font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Cliente */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Para</p>
          <p className="text-lg font-bold text-gray-900">{estimate.cliente_nome}</p>
          <div className="mt-2 space-y-1.5">
            {estimate.cliente_telefone && (
              <a href={`tel:${estimate.cliente_telefone}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" /><span>{estimate.cliente_telefone}</span>
              </a>
            )}
            {estimate.cliente_email && (
              <a href={`mailto:${estimate.cliente_email}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" /><span>{estimate.cliente_email}</span>
              </a>
            )}
            {((estimate as any).cliente_endereco || (estimate as any).cliente_cidade || (estimate as any).cliente_zip) && (
              <p className="flex items-start gap-2 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {(estimate as any).cliente_endereco && <>{(estimate as any).cliente_endereco}<br /></>}
                  {[(estimate as any).cliente_cidade, (estimate as any).cliente_zip].filter(Boolean).join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Serviços / Produtos</p>
          <div className="space-y-3">
            {(estimate.items || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-medium text-gray-900 text-sm">{item.produto_nome}</p>
                  {item.descricao && <p className="text-xs text-gray-400 mt-0.5">{item.descricao}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantidade} × {currency(item.preco_unitario)}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{currency(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Totais */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
            {desconto > 0 && <div className="flex justify-between text-gray-500"><span>Desconto ({descontoPct}%)</span><span className="text-red-500">-{currency(desconto)}</span></div>}
            {taxa > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({taxaPct}%)</span><span>+{currency(taxa)}</span></div>}
            <div className="border-t border-gray-100 pt-3 mt-2">
              <div className="flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#C9A227]">{currency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Observações */}
        {estimate.observacoes && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observações</p>
            <p className="text-sm text-gray-600 leading-relaxed">{estimate.observacoes}</p>
          </div>
        )}
        {estimate.termos_condicoes && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Termos e Condições</p>
            <p className="text-sm text-gray-600 leading-relaxed">{estimate.termos_condicoes}</p>
          </div>
        )}

        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-xs">BBVIC Hair Care · Powered by BBVIC Gestão</span>
          </div>
        </div>
      </div>

      {/* Ações - Fixed na parte inferior */}
      {!approved && !rejected && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-20">
          <div className="max-w-2xl mx-auto space-y-2.5">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full py-4 rounded-2xl bg-[#C9A227] text-white font-bold text-base hover:bg-[#b8911f] active:bg-[#a07e18] transition-colors disabled:opacity-60 flex items-center justify-center gap-3 shadow-md"
            >
              {approving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {approving ? 'Aprovando...' : 'Aprovar Orçamento'}
            </button>
            <button
              onClick={handleReject}
              disabled={approving}
              className="w-full py-3 rounded-2xl border border-gray-200 text-gray-500 font-medium text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60"
            >
              Recusar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
