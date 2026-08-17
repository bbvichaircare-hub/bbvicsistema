import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { collection, query, where, getDocs, updateDoc, doc, increment, Timestamp, addDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, Phone, Mail, MapPin, CreditCard, Smartphone, DollarSign, Banknote, Copy, Loader2, Check } from 'lucide-react'
import type { Invoice } from '@/types'

interface PagConfig {
  venmo_username?: string; zelle_info?: string; zelle_tipo?: string
  cash_instrucoes?: string; square_link_padrao?: string; whatsapp?: string
  square_ativo?: boolean; venmo_ativo?: boolean; zelle_ativo?: boolean; cash_ativo?: boolean
}
type Metodo = 'square' | 'venmo' | 'zelle' | 'cash'
const METODO_LABEL: Record<Metodo, string> = { square: 'Square (Cartão)', venmo: 'Venmo', zelle: 'Zelle', cash: 'Cash' }

export function InvoicePublic() {
  const { token } = useParams()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [invoiceId, setInvoiceId] = useState('')
  const [pagConfig, setPagConfig] = useState<PagConfig>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metodoSelecionado, setMetodoSelecionado] = useState<Metodo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [instrucoesPagamento, setInstrucoesPagamento] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (token) fetchAll(token) }, [token])

  const fetchAll = async (publicToken: string) => {
    try {
      setLoading(true)
      // Busca direta pelo ID do documento (mais confiável para usuários não autenticados)
      const [configSnap, directSnap] = await Promise.all([
        getDoc(doc(db, 'configuracoes', 'pagamentos')),
        getDoc(doc(db, 'invoices', publicToken))
      ])
      if (configSnap.exists()) setPagConfig(configSnap.data() as PagConfig)

      let invoiceDoc: any = null
      if (directSnap.exists()) {
        invoiceDoc = directSnap
      } else {
        // Fallback: busca pelo campo public_token (links antigos)
        const invoicesSnap = await getDocs(query(collection(db, 'invoices'), where('public_token', '==', publicToken)))
        if (!invoicesSnap.empty) {
          invoiceDoc = invoicesSnap.docs[0]
        } else {
          setError('Fatura não encontrada')
          return
        }
      }

      const d = invoiceDoc
      const invoiceData = { id: d.id, ...d.data() } as Invoice
      setInvoice(invoiceData)
      setInvoiceId(d.id)
      if (invoiceData.status === 'pago') { setConfirmado(true) }
      if ((invoiceData as any).metodo_pagamento_escolhido === 'square' && invoiceData.status !== 'pago') {
        setMetodoSelecionado('square')
        setInstrucoesPagamento(true)
      }
      // Tracking separado — não bloqueia exibição da fatura se falhar
      updateDoc(doc(db, 'invoices', d.id), {
        visualizado: true, visualizado_count: increment(1), visualizado_em: Timestamp.now()
      }).then(() => {
        addDoc(collection(db, 'notificacoes'), {
          tipo: 'invoice_visualizado', titulo: '👁️ Fatura visualizada',
          mensagem: `${invoiceData.cliente_nome} visualizou a fatura ${invoiceData.numero}`,
          invoice_id: d.id, cliente_nome: invoiceData.cliente_nome,
          usuario_id: (invoiceData as any).vendedor_id || '', lida: false, created_at: Timestamp.now(),
        }).catch(() => {})
      }).catch(() => {})
    } catch { setError('Erro ao carregar fatura') }
    finally { setLoading(false) }
  }

  const confirmarMetodo = async (metodo: Metodo) => {
    if (!invoice) return
    setConfirmando(true)
    try {
      // Atualiza Firestore — não-bloqueante para não travar a UI se falhar permissão
      updateDoc(doc(db, 'invoices', invoiceId), {
        metodo_pagamento_escolhido: metodo,
        metodo_pagamento_em: Timestamp.now(),
        status: metodo === 'square' ? invoice.status : 'aguardando_confirmacao',
      }).catch(() => {})

      // Notificação — sempre não-bloqueante
      addDoc(collection(db, 'notificacoes'), {
        tipo: 'pagamento_escolhido',
        titulo: metodo === 'cash' ? '💵 Pagamento em Cash' : metodo === 'square' ? '💳 Pagando via Square' : `📲 Pagando via ${METODO_LABEL[metodo]}`,
        mensagem: `${invoice.cliente_nome} escolheu pagar a fatura ${invoice.numero} via ${METODO_LABEL[metodo]}. Valor: ${formatCurrency(invoice.total)}`,
        invoice_id: invoiceId, cliente_nome: invoice.cliente_nome,
        metodo_pagamento: metodo, valor: invoice.total,
        usuario_id: (invoice as any).vendedor_id || '', lida: false, created_at: Timestamp.now(),
      }).catch(() => {})

      if (metodo === 'square') {
        const squareUrl = (invoice as any).square_link || pagConfig.square_link_padrao
        if (squareUrl) {
          const a = document.createElement('a')
          a.href = squareUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'
          document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
        }
        setMetodoSelecionado('square')
        setInstrucoesPagamento(true)
      } else {
        setMetodoSelecionado(metodo)
        setInstrucoesPagamento(true)

        if (metodo === 'venmo' && pagConfig.venmo_username) {
          const amount = (balanceDue > 0 ? balanceDue : invoice.total).toFixed(2)
          const note = encodeURIComponent(`Fatura ${invoice.numero} - BBVIC`)
          const username = pagConfig.venmo_username.replace('@', '')
          const deepLink = `venmo://paycharge?txn=pay&recipients=${username}&amount=${amount}&note=${note}`
          const webLink = `https://venmo.com/${username}?txn=pay&amount=${amount}&note=${note}`
          const a = document.createElement('a')
          a.href = deepLink; document.body.appendChild(a); a.click()
          setTimeout(() => { document.body.removeChild(a) }, 100)
          setTimeout(() => {
            const b = document.createElement('a'); b.href = webLink; b.target = '_blank'; b.rel = 'noopener noreferrer'
            document.body.appendChild(b); b.click(); setTimeout(() => document.body.removeChild(b), 100)
          }, 1500)
        }

        if (metodo === 'zelle' && pagConfig.zelle_info) {
          const a = document.createElement('a')
          a.href = 'https://www.zellepay.com'; a.target = '_blank'; a.rel = 'noopener noreferrer'
          document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
        }
      }
    } catch (e) { console.error(e) }
    finally { setConfirmando(false) }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#C9A227]" /></div>
  if (error || !invoice) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center bg-white rounded-2xl p-10 shadow-sm max-w-sm w-full">
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <p className="text-xl font-bold text-gray-900 mb-2">Fatura não encontrada</p>
        <p className="text-gray-400 text-sm">{error || 'O link pode ter expirado.'}</p>
      </div>
    </div>
  )

  const isPaid = invoice.status === 'pago' || confirmado
  const depositAmt = (invoice as any).deposit || 0
  const balanceDue = invoice.total - depositAmt
  const dataVenc = (invoice.data_vencimento as any)?.toDate ? (invoice.data_vencimento as any).toDate().toLocaleDateString('pt-BR') : invoice.data_vencimento

  const metodosAtivos: Metodo[] = [
    ...((pagConfig.square_ativo !== false && ((invoice as any).square_link || pagConfig.square_link_padrao)) ? (['square'] as Metodo[]) : []),
    ...(pagConfig.venmo_ativo !== false && pagConfig.venmo_username ? (['venmo'] as Metodo[]) : []),
    ...(pagConfig.zelle_ativo !== false && pagConfig.zelle_info ? (['zelle'] as Metodo[]) : []),
    ...(pagConfig.cash_ativo !== false ? (['cash'] as Metodo[]) : []),
  ]

  const METODO_ICON: Record<Metodo, any> = { square: CreditCard, venmo: Smartphone, zelle: DollarSign, cash: Banknote }
  const METODO_COLOR: Record<Metodo, string> = {
    square: 'bg-blue-600 hover:bg-blue-700', venmo: 'bg-[#008CFF] hover:bg-blue-700',
    zelle: 'bg-purple-600 hover:bg-purple-700', cash: 'bg-green-600 hover:bg-green-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img src="/logo-bbvic.jpg" alt="BBVIC" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900">BBVIC Hair Care</h1>
            <p className="text-xs text-gray-400">Professional Hair Services</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Fatura</p>
            <p className="text-sm font-bold text-[#C9A227]">{invoice.numero}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 pb-10 space-y-4">

        {/* Status */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle className="w-7 h-7 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-800">Pagamento Confirmado!</p>
              <p className="text-sm text-green-600">Obrigado! Seu pagamento foi recebido com sucesso.</p>
            </div>
          </div>
        ) : false ? (
          <div/>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="w-7 h-7 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800">Pagamento Pendente</p>
              {dataVenc && <p className="text-sm text-yellow-600">Vencimento: {dataVenc}</p>}
            </div>
          </div>
        )}

        {/* Instruções pós-seleção (Venmo/Zelle/Cash) */}
        {instrucoesPagamento && metodoSelecionado && (
          <div className="bg-white rounded-2xl border border-[#C9A227]/30 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 flex items-center justify-center flex-shrink-0">
                {metodoSelecionado === 'venmo' && <span className="text-lg">💙</span>}
                {metodoSelecionado === 'zelle' && <span className="text-lg">💜</span>}
                {metodoSelecionado === 'cash' && <span className="text-lg">💵</span>}
              </div>
              <div>
                <p className="font-bold text-gray-900">Instruções — {METODO_LABEL[metodoSelecionado]}</p>
                <p className="text-sm text-gray-500">Siga os passos abaixo para concluir</p>
              </div>
            </div>

            {metodoSelecionado === 'venmo' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Envie <span className="font-bold text-gray-900">{formatCurrency(balanceDue > 0 ? balanceDue : invoice.total)}</span> via Venmo para:</p>
                {pagConfig.venmo_username && (
                  <>
                    <div className="flex items-center justify-between bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <span className="font-bold text-blue-800 text-lg">@{pagConfig.venmo_username}</span>
                      <button onClick={() => copyToClipboard(pagConfig.venmo_username!)} className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-100">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <a
                      href={`venmo://paycharge?txn=pay&recipients=${pagConfig.venmo_username.replace('@','')}&amount=${(balanceDue > 0 ? balanceDue : invoice.total).toFixed(2)}&note=${encodeURIComponent('Fatura ' + invoice.numero)}`}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#008CFF] text-white font-bold text-sm hover:bg-[#0077DD] transition-colors"
                    >
                      <span>📲</span> Abrir Venmo e Pagar
                    </a>
                  </>
                )}
              </div>
            )}

            {metodoSelecionado === 'zelle' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Envie <span className="font-bold text-gray-900">{formatCurrency(balanceDue > 0 ? balanceDue : invoice.total)}</span> via Zelle para:</p>
                {pagConfig.zelle_info && (
                  <>
                    <div className="flex items-center justify-between bg-purple-50 rounded-xl p-3 border border-purple-100">
                      <span className="font-bold text-purple-800 text-base">{pagConfig.zelle_info}</span>
                      <button onClick={() => copyToClipboard(pagConfig.zelle_info!)} className="flex items-center gap-1 text-purple-600 text-xs font-medium px-2 py-1 rounded-lg hover:bg-purple-100">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <a
                      href="https://www.zellepay.com"
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#6D1ED4] text-white font-bold text-sm hover:bg-[#5a19b0] transition-colors"
                    >
                      <span>📲</span> Abrir Zelle e Pagar
                    </a>
                  </>
                )}
              </div>
            )}

            {metodoSelecionado === 'cash' && (
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <p className="text-sm text-green-800">{pagConfig.cash_instrucoes || 'Entregue o pagamento em dinheiro diretamente ao nosso atendimento.'}</p>
              </div>
            )}

            {metodoSelecionado === 'square' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Clique no botão abaixo para pagar <span className="font-bold text-gray-900">{formatCurrency(balanceDue > 0 ? balanceDue : invoice.total)}</span> via Square:</p>
                {((invoice as any).square_link || pagConfig.square_link_padrao) && (
                  <a
                    href={(invoice as any).square_link || pagConfig.square_link_padrao}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors"
                  >
                    <CreditCard className="w-4 h-4" /> 💳 Pagar via Square
                  </a>
                )}
              </div>
            )}

            {/* Mensagem fixa de comprovante */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">📎</span>
              <div>
                <p className="font-semibold text-amber-900 text-sm">Envie o comprovante após o pagamento</p>
                <p className="text-amber-700 text-sm mt-0.5">
                  Assim que efetuar o pagamento, envie o comprovante por <strong>WhatsApp</strong> ou <strong>Email</strong> para confirmarmos o recebimento e darmos baixa no sistema.
                </p>
                {pagConfig.whatsapp && (
                  <a
                    href={`https://wa.me/${pagConfig.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent('Olá! Segue o comprovante de pagamento da fatura ' + invoice.numero)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors"
                  >
                    <span>💬</span> Enviar comprovante via WhatsApp
                  </a>
                )}
              </div>
            </div>

            <button
              onClick={() => { setInstrucoesPagamento(false); setMetodoSelecionado(null) }}
              className="text-sm text-gray-400 hover:text-gray-600 underline w-full text-center"
            >
              Escolher outro método de pagamento
            </button>
          </div>
        )}

        {/* Cliente */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Para</p>
          <p className="text-lg font-bold text-gray-900">{invoice.cliente_nome}</p>
          <div className="mt-2 space-y-1.5">
            {invoice.cliente_telefone && (
              <a href={`tel:${invoice.cliente_telefone}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                <Phone className="w-3.5 h-3.5" /><span>{invoice.cliente_telefone}</span>
              </a>
            )}
            {invoice.cliente_email && (
              <a href={`mailto:${invoice.cliente_email}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                <Mail className="w-3.5 h-3.5" /><span>{invoice.cliente_email}</span>
              </a>
            )}
            {((invoice as any).cliente_endereco || (invoice as any).cliente_cidade || (invoice as any).cliente_zip) && (
              <p className="flex items-start gap-2 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {(invoice as any).cliente_endereco && <>{(invoice as any).cliente_endereco}<br /></>}
                  {[(invoice as any).cliente_cidade, (invoice as any).cliente_zip].filter(Boolean).join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Serviços / Produtos</p>
          <div className="space-y-3">
            {(invoice.items || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-medium text-gray-900 text-sm">{item.produto_nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantidade} × {formatCurrency(item.preco_unitario)}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Totais */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.desconto > 0 && <div className="flex justify-between text-gray-500"><span>Desconto</span><span className="text-red-500">-{formatCurrency(invoice.desconto)}</span></div>}
            {invoice.taxa > 0 && <div className="flex justify-between text-gray-500"><span>Tax</span><span>+{formatCurrency(invoice.taxa)}</span></div>}
            {(invoice as any).taxa_envio > 0 && <div className="flex justify-between text-gray-500"><span>Shipping</span><span>+{formatCurrency((invoice as any).taxa_envio)}</span></div>}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#C9A227]">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
            {depositAmt > 0 && (
              <>
                <div className="flex justify-between text-green-600 text-sm"><span>Adiantamento</span><span>-{formatCurrency(depositAmt)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2"><span>Saldo Restante</span><span className="text-[#C9A227]">{formatCurrency(balanceDue)}</span></div>
              </>
            )}
          </div>
        </div>

        {/* Parcelamento */}
        {(invoice as any).parcelas_ativo && (invoice as any).parcelas?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Parcelamento — {(invoice as any).parcelas.length}x</p>
            <div className="space-y-2">
              {(invoice as any).parcelas.map((p: any, i: number) => {
                const dataFormatada = (() => {
                  try { return new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') } catch { return p.data }
                })()
                const isPago = p.status === 'pago'
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${isPago ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPago ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{p.numero}x</span>
                      <span className="text-sm text-gray-600">{dataFormatada}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">${Number(p.valor).toFixed(2)}</span>
                      {isPago && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Métodos de Pagamento */}
        {!isPaid && !instrucoesPagamento && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="font-semibold text-gray-900 mb-4">Como você deseja pagar?</p>
            <div className="space-y-3">
              {metodosAtivos.map(metodo => {
                const Icon = METODO_ICON[metodo]
                return (
                  <button
                    key={metodo}
                    onClick={() => confirmarMetodo(metodo)}
                    disabled={confirmando}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-white font-semibold text-base transition-colors disabled:opacity-60 ${METODO_COLOR[metodo]}`}
                  >
                    {confirmando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                    <div className="text-left">
                      <p className="font-bold">{METODO_LABEL[metodo]}</p>
                      <p className="text-xs opacity-80">{formatCurrency(balanceDue > 0 ? balanceDue : invoice.total)}</p>
                    </div>
                  </button>
                )
              })}
              {metodosAtivos.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">Entre em contato para combinar o pagamento.</p>
              )}
            </div>
          </div>
        )}

        {invoice.observacoes && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observações</p>
            <p className="text-sm text-gray-600 leading-relaxed">{invoice.observacoes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
