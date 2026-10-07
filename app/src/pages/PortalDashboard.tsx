import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { LogOut, Receipt, FileText, DollarSign, Clock, CheckCircle, AlertCircle, ChevronRight, User, Calendar, Download, Loader2, Package } from 'lucide-react'
import { gerarPDFFatura, gerarPDFOrcamento } from '@/lib/pdfUtils'

const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (v: any) => {
  if (!v) return '—'
  const d = v?.toDate ? v.toDate() : new Date(v)
  return d.toLocaleDateString('pt-BR')
}

const isConsignacao = (inv: any) => {
  const obs = (inv.observacoes || '').toLowerCase()
  const itemsTxt = (inv.items || inv.itens || []).map((i: any) => (i.descricao || '').toLowerCase()).join(' ')
  return obs.includes('consigna') || itemsTxt.includes('consigna')
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pago: 'bg-green-100 text-green-700', enviado: 'bg-blue-100 text-blue-700',
    pendente: 'bg-yellow-100 text-yellow-700', atrasado: 'bg-red-100 text-red-700',
    parcial: 'bg-purple-100 text-purple-700', cancelado: 'bg-gray-100 text-gray-500',
    aprovado: 'bg-green-100 text-green-700', recusado: 'bg-red-100 text-red-700',
    visualizado: 'bg-blue-100 text-blue-600',
  }
  const labels: Record<string, string> = {
    pago: 'Pago', enviado: 'Enviado', pendente: 'Pendente', atrasado: 'Atrasado',
    parcial: 'Pago Parcial', cancelado: 'Cancelado', aprovado: 'Aprovado',
    recusado: 'Recusado', visualizado: 'Visualizado',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-500'}`}>{labels[s] || s}</span>
}

export function PortalDashboard() {
  const navigate = useNavigate()
  const [cliente, setCliente] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [tab, setTab] = useState<'faturas' | 'orcamentos' | 'pagamentos' | 'consignacao'>('faturas')
  const [invoices, setInvoices] = useState<any[]>([])
  const [estimates, setEstimates] = useState<any[]>([])
  const [consignacoes, setConsignacoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('portal_cliente')
    if (!stored) { navigate('/portal'); return }
    const c = JSON.parse(stored)
    setCliente(c)
    loadData(c.email, c.id)
  }, [])

  const loadData = async (email: string, clienteId: string) => {
    setLoading(true)
    try {
      const [invSnap, estSnap, consSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('cliente_email', '==', email))),
        getDocs(query(collection(db, 'estimates'), where('cliente_email', '==', email))),
        getDocs(query(collection(db, 'consignacoes'), where('cliente_id', '==', clienteId))),
      ])
      const invs = invSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        const da = a.data_emissao?.toDate ? a.data_emissao.toDate() : new Date(0)
        const db2 = b.data_emissao?.toDate ? b.data_emissao.toDate() : new Date(0)
        return db2.getTime() - da.getTime()
      })
      const ests = estSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        const da = a.data_emissao?.toDate ? a.data_emissao.toDate() : new Date(0)
        const db2 = b.data_emissao?.toDate ? b.data_emissao.toDate() : new Date(0)
        return db2.getTime() - da.getTime()
      })
      const cons = consSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => (c.quantidade_em_consignacao || 0) > 0)
      setInvoices(invs)
      setEstimates(ests)
      setConsignacoes(cons)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('portal_cliente')
    navigate('/portal')
  }

  const downloadInvoicePDF = async (inv: any) => {
    setGeneratingPdf(inv.id)
    try {
      await gerarPDFFatura({
        numero: inv.numero || inv.id.slice(-6).toUpperCase(),
        cliente_nome: inv.cliente_nome || '',
        cliente_email: inv.cliente_email || '',
        cliente_telefone: inv.cliente_telefone || '',
        cliente_endereco: inv.cliente_endereco || '',
        data_emissao: inv.data_emissao,
        data_vencimento: inv.data_vencimento,
        items: (inv.items || inv.itens || []).map((it: any) => ({
          produto_nome: it.produto_nome || it.descricao || 'Item',
          descricao: it.descricao,
          quantidade: it.quantidade || 1,
          preco_unitario: it.preco_unitario || it.preco || 0,
          subtotal: (it.preco_unitario || it.preco || 0) * (it.quantidade || 1),
        })),
        subtotal: inv.subtotal || inv.total || 0,
        desconto: inv.desconto > 0 ? inv.desconto : undefined,
        taxa: inv.taxa > 0 ? inv.taxa : undefined,
        total: inv.total || 0,
        observacoes: inv.observacoes || undefined,
        termos_condicoes: inv.termos_condicoes || undefined,
        vendedor_nome: inv.vendedor_nome || undefined,
      })
    } catch (e) {
      console.error(e)
      toast.error('Erro ao gerar PDF')
    } finally {
      setGeneratingPdf(null)
    }
  }

  const downloadEstimatePDF = async (est: any) => {
    setGeneratingPdf(est.id)
    try {
      await gerarPDFOrcamento({
        numero: est.numero || est.id.slice(-6).toUpperCase(),
        cliente_nome: est.cliente_nome || '',
        cliente_email: est.cliente_email || '',
        cliente_telefone: est.cliente_telefone || '',
        cliente_endereco: est.cliente_endereco || '',
        data_emissao: est.data_emissao,
        data_validade: est.data_validade,
        items: (est.items || est.itens || []).map((it: any) => ({
          produto_nome: it.produto_nome || it.descricao || 'Item',
          descricao: it.descricao,
          quantidade: it.quantidade || 1,
          preco_unitario: it.preco_unitario || it.preco || 0,
          subtotal: (it.preco_unitario || it.preco || 0) * (it.quantidade || 1),
        })),
        subtotal: est.subtotal || est.total || 0,
        desconto: est.desconto > 0 ? est.desconto : undefined,
        taxa: est.taxa > 0 ? est.taxa : undefined,
        total: est.total || 0,
        observacoes: est.observacoes || undefined,
        termos_condicoes: est.termos_condicoes || undefined,
        vendedor_nome: est.vendedor_nome || undefined,
      })
    } catch (e) {
      console.error(e)
      toast.error('Erro ao gerar PDF')
    } finally {
      setGeneratingPdf(null)
    }
  }

  if (!cliente) return null

  const totalPago = invoices.filter(i => i.status === 'pago').reduce((s: number, i: any) => s + (i.total || 0), 0)
  const totalAberto = invoices.filter(i => ['enviado', 'pendente', 'parcial'].includes(i.status)).reduce((s: number, i: any) => s + (i.total || 0), 0)
  const totalAtrasado = invoices.filter(i => {
    if (i.status === 'pago') return false
    const venc = i.data_vencimento?.toDate ? i.data_vencimento.toDate() : null
    return venc && venc < new Date()
  }).reduce((s: number, i: any) => s + (i.total || 0), 0)

  const pagamentos = invoices
    .filter(i => i.valor_pago && i.valor_pago > 0)
    .flatMap((i: any) => {
      const pagtos = i.pagamentos || []
      if (pagtos.length > 0) return pagtos.map((p: any) => ({ ...p, fatura_numero: i.numero, cliente_nome: i.cliente_nome }))
      if (i.status === 'pago') return [{ data: i.data_pagamento || i.data_emissao, valor: i.total, metodo: i.metodo_pagamento || '—', fatura_numero: i.numero }]
      if (i.valor_pago > 0) return [{ data: i.updated_at, valor: i.valor_pago, metodo: i.metodo_pagamento || '—', fatura_numero: i.numero }]
      return []
    })
    .sort((a: any, b: any) => {
      const da = a.data?.toDate ? a.data.toDate() : new Date(0)
      const db2 = b.data?.toDate ? b.data.toDate() : new Date(0)
      return db2.getTime() - da.getTime()
    })

  const cardCls = 'bg-white rounded-2xl border border-[#f0e6e0] shadow-sm p-5'

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #F7F3EE 0%, #FAF8F5 220px, #FAF8F5 100%)' }}>
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-[#eee1da] shadow-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/bbvic-logo-new.png" alt="BBVIC" className="h-11 w-auto object-contain"/>
            <div className="border-l border-gray-200 pl-3">
              <p className="font-bold text-gray-900 text-sm leading-none">BBVIC Hair Care</p>
              <p className="text-[#6F2738] text-xs font-medium tracking-wide">Portal do Cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6F2738 0%,#4A1A26 100%)' }}>
                <User className="w-4 h-4 text-white"/>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-none">{cliente.nome}</p>
                <p className="text-xs text-gray-400">{cliente.email}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#6F2738] transition-colors px-3 py-2 rounded-lg hover:bg-[#6F2738]/5">
              <LogOut className="w-4 h-4"/> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-7 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Olá, {cliente.nome.split(' ')[0]}! <span className="inline-block">👋</span></h1>
          <p className="text-gray-500 text-sm mt-1">Aqui você pode acompanhar seus orçamentos, faturas e pagamentos.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`${cardCls} relative overflow-hidden`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-green-500"/>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600"/></div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Pago</span>
            </div>
            <p className="text-2xl font-black text-green-600">{fmt(totalPago)}</p>
          </div>
          <div className={`${cardCls} relative overflow-hidden`}>
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: '#193654' }}/>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:'rgba(25,54,84,0.08)' }}><Clock className="w-4 h-4" style={{ color:'#193654' }}/></div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Em Aberto</span>
            </div>
            <p className="text-2xl font-black" style={{ color:'#193654' }}>{fmt(totalAberto)}</p>
          </div>
          <div className={`${cardCls} relative overflow-hidden`}>
            <div className="absolute top-0 left-0 w-full h-1" style={{ background:'#6F2738' }}/>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-[#6F2738]/10 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-[#6F2738]"/></div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Em Atraso</span>
            </div>
            <p className="text-2xl font-black text-[#6F2738]">{fmt(totalAtrasado)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-[#f0e6e0] p-1 rounded-2xl w-fit shadow-sm">
          {([
            { id: 'faturas', label: 'Faturas', icon: Receipt, count: invoices.length },
            { id: 'orcamentos', label: 'Orçamentos', icon: FileText, count: estimates.length },
            { id: 'pagamentos', label: 'Pagamentos', icon: DollarSign, count: pagamentos.length },
            ...(consignacoes.length > 0 ? [{ id: 'consignacao' as const, label: 'Consignação', icon: Package, count: consignacoes.length }] : []),
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={tab === t.id
                ? { background: 'linear-gradient(135deg,#6F2738 0%,#8B3348 45%,#4A1A26 100%)', color: '#fff', boxShadow: '0 4px 14px rgba(111,39,56,0.3)' }
                : { color: '#9ca3af' }}
            >
              <t.icon className="w-4 h-4"/>
              {t.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <>
            {/* FATURAS */}
            {tab === 'faturas' && (
              <div className="space-y-3">
                {invoices.length === 0 ? (
                  <div className={`${cardCls} text-center py-12`}>
                    <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                    <p className="text-gray-500 text-sm">Nenhuma fatura encontrada</p>
                  </div>
                ) : invoices.map((inv: any) => (
                  <div key={inv.id} className={`${cardCls} cursor-pointer hover:shadow-md transition-shadow`} onClick={() => setSelectedInvoice(selectedInvoice?.id === inv.id ? null : inv)}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Receipt className="w-5 h-5 text-gray-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">Fatura #{inv.numero || inv.id.slice(-6).toUpperCase()}</p>
                              {statusBadge(inv.status)}
                              {isConsignacao(inv) && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Consignação</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Emissão: {fmtDate(inv.data_emissao)}</span>
                              {inv.data_vencimento && <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Vence: {fmtDate(inv.data_vencimento)}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-gray-900">{fmt(inv.total || 0)}</p>
                            {inv.valor_pago > 0 && inv.status !== 'pago' && (
                              <p className="text-xs text-green-600">Pago: {fmt(inv.valor_pago)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${selectedInvoice?.id === inv.id ? 'rotate-90' : ''}`}/>
                    </div>

                    {/* Expanded Details */}
                    {selectedInvoice?.id === inv.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100 space-y-3" onClick={e => e.stopPropagation()}>
                        {/* Items */}
                        {(inv.items || inv.itens || []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Itens</p>
                            <div className="space-y-1.5">
                              {(inv.items || inv.itens || []).map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                                  <span>{item.produto_nome || item.descricao || 'Item'} × {item.quantidade || 1}</span>
                                  <span className="font-medium">{fmt((item.preco_unitario || item.preco || 0) * (item.quantidade || 1))}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Totals */}
                        <div className="flex justify-between text-sm font-semibold text-gray-900 bg-[#6F2738]/8 rounded-lg px-3 py-2">
                          <span>Total</span>
                          <span>{fmt(inv.total || 0)}</span>
                        </div>
                        {/* Payment options if not paid */}
                        {['enviado','pendente'].includes(inv.status) && inv.payment_options && (
                          <div className="flex flex-wrap gap-2">
                            <p className="w-full text-xs font-semibold text-gray-400 uppercase">Pagar via:</p>
                            {inv.payment_options?.venmo && (
                              <a href={`https://venmo.com/?txn=pay&recipients=${inv.payment_options.venmo}&amount=${inv.total}&note=Fatura%20${inv.numero}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">💙 Venmo</a>
                            )}
                            {inv.payment_options?.zelle && (
                              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium">💜 Zelle: {inv.payment_options.zelle}</div>
                            )}
                            {inv.square_payment_link && (
                              <a href={inv.square_payment_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-black">■ Square</a>
                            )}
                          </div>
                        )}
                        {/* PDF download */}
                        <button
                          onClick={e => { e.stopPropagation(); downloadInvoicePDF(inv); }}
                          disabled={generatingPdf === inv.id}
                          className="flex items-center gap-2 text-xs text-[#6F2738] hover:text-[#4A1A26] font-medium disabled:opacity-50"
                        >
                          {generatingPdf === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5"/>}
                          {generatingPdf === inv.id ? 'Gerando PDF...' : 'Baixar PDF da fatura'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ORÇAMENTOS */}
            {tab === 'orcamentos' && (
              <div className="space-y-3">
                {estimates.length === 0 ? (
                  <div className={`${cardCls} text-center py-12`}>
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                    <p className="text-gray-500 text-sm">Nenhum orçamento encontrado</p>
                  </div>
                ) : estimates.map((est: any) => (
                  <div key={est.id} className={cardCls}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#6F2738]/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-[#6F2738]"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">Orçamento #{est.numero || est.id.slice(-6).toUpperCase()}</p>
                              {statusBadge(est.status)}
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {fmtDate(est.data_emissao)}</span>
                            </div>
                          </div>
                          <p className="text-lg font-bold text-gray-900 flex-shrink-0">{fmt(est.total || 0)}</p>
                        </div>
                        {/* Items preview */}
                        {(est.items || est.itens || []).length > 0 && (
                          <div className="mt-3 space-y-1">
                            {(est.items || est.itens || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                                <span>{item.produto_nome || item.descricao || 'Item'} × {item.quantidade || 1}</span>
                                <span>{fmt((item.preco_unitario || item.preco || 0) * (item.quantidade || 1))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => downloadEstimatePDF(est)}
                          disabled={generatingPdf === est.id}
                          className="inline-flex items-center gap-1.5 text-xs text-[#6F2738] hover:text-[#4A1A26] font-medium mt-2 disabled:opacity-50"
                        >
                          {generatingPdf === est.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3"/>}
                          {generatingPdf === est.id ? 'Gerando PDF...' : 'Baixar orçamento em PDF'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PAGAMENTOS */}
            {tab === 'pagamentos' && (
              <div className="space-y-3">
                {pagamentos.length === 0 ? (
                  <div className={`${cardCls} text-center py-12`}>
                    <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                    <p className="text-gray-500 text-sm">Nenhum pagamento registrado</p>
                  </div>
                ) : pagamentos.map((p: any, idx: number) => (
                  <div key={idx} className={cardCls}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5 text-green-600"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">Pagamento recebido</p>
                            <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-gray-400">
                              <span>{fmtDate(p.data)}</span>
                              {p.fatura_numero && <span>· Fatura #{p.fatura_numero}</span>}
                              {p.metodo && <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{p.metodo}</span>}
                            </div>
                          </div>
                          <p className="text-lg font-bold text-green-600 flex-shrink-0">{fmt(p.valor || 0)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {pagamentos.length > 0 && (
                  <div className="bg-[#6F2738]/8 border border-[#6F2738]/20 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Total pago</span>
                    <span className="text-lg font-bold text-green-600">{fmt(pagamentos.reduce((s: number, p: any) => s + (p.valor || 0), 0))}</span>
                  </div>
                )}
              </div>
            )}

            {tab === 'consignacao' && (
              <div className="space-y-3">
                {consignacoes.length === 0 ? (
                  <div className={`${cardCls} text-center py-12`}>
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                    <p className="text-gray-500 text-sm">Nenhum produto em consignação</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3.5 text-xs text-purple-700">
                      Produtos entregues para venda no seu salão. Você só é cobrado quando o produto é vendido.
                    </div>
                    {consignacoes.map((c: any) => (
                      <div key={c.id} className={cardCls}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-purple-600"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{c.produto_nome}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {c.quantidade_em_consignacao} unidade{c.quantidade_em_consignacao === 1 ? '' : 's'} em seu poder · {fmt(c.preco_unitario || 0)}/un.
                            </p>
                          </div>
                          <p className="text-base font-bold text-purple-700 flex-shrink-0">{fmt((c.preco_unitario || 0) * (c.quantidade_em_consignacao || 0))}</p>
                        </div>
                      </div>
                    ))}
                    <div className="bg-[#6F2738]/8 border border-[#6F2738]/20 rounded-xl p-4 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Valor potencial em consignação</span>
                      <span className="text-lg font-bold text-purple-700">
                        {fmt(consignacoes.reduce((s: number, c: any) => s + (c.preco_unitario || 0) * (c.quantidade_em_consignacao || 0), 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 mt-8 border-t border-[#eee1da]">
        <img src="/bbvic-logo-new.png" alt="BBVIC" className="h-8 w-auto object-contain mx-auto mb-2 opacity-70"/>
        <p className="text-xs text-gray-400">BBVIC Hair Care · Portal do Cliente</p>
      </footer>
    </div>
  )
}
