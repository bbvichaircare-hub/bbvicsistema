import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, updateDoc, doc, addDoc, Timestamp, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isAtrasada } from '@/lib/kpiUtils'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, FileText, Eye, CheckCircle, Loader2, Trash2, MessageCircle } from 'lucide-react'
import type { Invoice } from '@/types'

const statusCls: Record<string, string> = {
  pago: 'bg-green-100 text-green-700',
  enviado: 'bg-blue-100 text-blue-700',
  atrasado: 'bg-red-100 text-red-700',
  parcial: 'bg-yellow-100 text-yellow-700',
  rascunho: 'bg-gray-100 text-gray-600',
  cancelado: 'bg-red-50 text-red-400',
  aguardando_confirmacao: 'bg-purple-100 text-purple-700',
  visualizado: 'bg-cyan-100 text-cyan-700',
}
const statusLabel: Record<string, string> = {
  pago: 'Pago', enviado: 'Enviado', atrasado: 'Atrasado',
  parcial: 'Parcial', rascunho: 'Rascunho', cancelado: 'Cancelado',
  aguardando_confirmacao: 'Ag. Confirmação', visualizado: 'Visualizado',
}

async function criarComissaoAuto(invoiceId: string, invoiceData: any) {
  try {
    if (!invoiceData.vendedor_id) return
    const vendedorDoc = await getDoc(doc(db, 'users', invoiceData.vendedor_id))
    if (!vendedorDoc.exists()) return
    const percentual = vendedorDoc.data().comissao_percentual || 10
    const valorComissao = (invoiceData.total * percentual) / 100
    const comSnap = await getDocs(query(collection(db, 'comissoes'), where('invoice_id', '==', invoiceId)))
    if (!comSnap.empty) return
    await addDoc(collection(db, 'comissoes'), {
      vendedor_id: invoiceData.vendedor_id,
      vendedor_nome: invoiceData.vendedor_nome || '',
      invoice_id: invoiceId,
      invoice_numero: invoiceData.numero,
      cliente_nome: invoiceData.cliente_nome,
      valor_venda: invoiceData.total,
      percentual,
      valor_comissao: valorComissao,
      status: 'pendente',
      data_venda: Timestamp.now(),
      created_at: Timestamp.now(),
    })
  } catch (e) { console.error('Erro comissão:', e) }
}

export function Invoices() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [mesFiltro] = useState(() => new Date().getMonth() + 1)
  const [anoFiltro] = useState(() => new Date().getFullYear())
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [modalParcial, setModalParcial] = useState<Invoice | null>(null)
  const [valorParcial, setValorParcial] = useState('')
  const [salvandoParcial, setSalvandoParcial] = useState(false)
  const [modalParcelas, setModalParcelas] = useState<Invoice | null>(null)
  const [pagandoParcelaIdx, setPagandoParcelaIdx] = useState<number | null>(null)
  const [parcelaValorInput, setParcelaValorInput] = useState('')
  const [parcelaForma, setParcelaForma] = useState('')
  const [parcelaDataPgto, setParcelaDataPgto] = useState(() => new Date().toISOString().split('T')[0])
  const [salvandoParcelaItem, setSalvandoParcelaItem] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; numero: string; cliente: string} | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [modalBaixa, setModalBaixa] = useState<Invoice | null>(null)
  const [baixaFormaPgto, setBaixaFormaPgto] = useState('')
  const [baixaData, setBaixaData] = useState(() => new Date().toISOString().split('T')[0])
  const [salvandoBaixa, setSalvandoBaixa] = useState(false)
  const [parcialFormaPgto, setParcialFormaPgto] = useState('')
  const [parcialData, setParcialData] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { fetchInvoices() }, [user, isAdmin])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const q = isAdmin
        ? query(collection(db, 'invoices'), orderBy('created_at', 'desc'))
        : query(collection(db, 'invoices'), where('vendedor_id', '==', user?.uid), orderBy('created_at', 'desc'))
      const snap = await getDocs(q)
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Invoice[])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleMarcarPago = (inv: Invoice) => {
    setBaixaData(new Date().toISOString().split('T')[0])
    setBaixaFormaPgto('')
    setModalBaixa(inv)
  }

  const handleConfirmarBaixa = async () => {
    const inv = modalBaixa
    if (!inv?.id) return
    setSalvandoBaixa(true)
    const dataPgto = baixaData ? Timestamp.fromDate(new Date(baixaData + 'T12:00:00')) : Timestamp.now()
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status: 'pago', data_pagamento: dataPgto, forma_pagamento_recebido: baixaFormaPgto, updated_at: Timestamp.now(),
      })
      // Atualiza contas_receber
      const crSnap = await getDocs(query(collection(db, 'contas_receber'), where('invoice_id', '==', inv.id)))
      for (const crDoc of crSnap.docs) {
        await updateDoc(doc(db, 'contas_receber', crDoc.id), { status: 'recebido', data_pagamento: Timestamp.now() })
      }
      // Cria comissão automática
      await criarComissaoAuto(inv.id, inv)
      // Registrar receita do mês — apenas o valor ainda não registrado (evita duplicidade com parciais)
      try {
        const agora = new Date()
        const jaRegistrado = (inv as any).valor_pago || 0
        const valorRestante = inv.total - jaRegistrado
        if (valorRestante > 0.01) {
          await addDoc(collection(db, 'receitas'), {
            descricao: `Fatura ${inv.numero} paga`,
            invoice_id: inv.id,
            invoice_numero: inv.numero,
            cliente_nome: inv.cliente_nome,
            valor: valorRestante,
            mes: agora.getMonth() + 1,
            ano: agora.getFullYear(),
            data: Timestamp.now(),
            origem: 'fatura',
            vendedor_id: (inv as any).vendedor_id || '',
            created_at: Timestamp.now(),
          })
        }
      } catch (e) { console.error('Erro receita:', e) }
      // Notificação
      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'fatura_paga',
        titulo: '✅ Fatura marcada como PAGA',
        mensagem: `Fatura ${inv.numero} de ${inv.cliente_nome} marcada como paga. Valor: ${formatCurrency(inv.total)}`,
        invoice_id: inv.id, cliente_nome: inv.cliente_nome, valor: inv.total,
        usuario_id: (inv as any).vendedor_id || '', lida: false, created_at: Timestamp.now(),
      }).catch(() => {})
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'pago' } : i))
      setModalBaixa(null)
    } catch (e) { console.error(e); alert('Erro ao marcar como pago') }
    finally { setSalvandoBaixa(false) }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'invoices', deleteConfirm.id))
      // Remove from contas_receber too
      const crSnap = await getDocs(query(collection(db, 'contas_receber'), where('invoice_id', '==', deleteConfirm.id)))
      for (const crDoc of crSnap.docs) {
        await deleteDoc(doc(db, 'contas_receber', crDoc.id))
      }
      setInvoices(prev => prev.filter(i => i.id !== deleteConfirm.id))
      setDeleteConfirm(null)
    } catch (e) {
      console.error('Erro ao excluir:', e)
      alert('Erro ao excluir fatura')
    } finally {
      setDeleting(false)
    }
  }

  const handleRegistrarParcial = async () => {
    if (!modalParcial?.id) return
    const valor = parseFloat(valorParcial)
    if (!valor || valor <= 0) { alert('Informe um valor válido'); return }
    const totalPagoAntes = (modalParcial as any).valor_pago || 0
    const novoTotalPago = totalPagoAntes + valor
    const restante = modalParcial.total - novoTotalPago
    const novoStatus = restante <= 0.01 ? 'pago' : 'parcial'
    setSalvandoParcial(true)
    try {
      const dataParcial = parcialData ? Timestamp.fromDate(new Date(parcialData + 'T12:00:00')) : Timestamp.now()
      await updateDoc(doc(db, 'invoices', modalParcial.id), {
        valor_pago: novoTotalPago,
        status: novoStatus,
        data_pagamento: novoStatus === 'pago' ? dataParcial : null,
        forma_pagamento_recebido: parcialFormaPgto || undefined,
        updated_at: Timestamp.now(),
      })
      // Registrar receita do mês
      const agora = parcialData ? new Date(parcialData + 'T12:00:00') : new Date()
      await addDoc(collection(db, 'receitas'), {
        descricao: `Pagamento parcial - Fatura ${modalParcial.numero}`,
        invoice_id: modalParcial.id,
        invoice_numero: modalParcial.numero,
        cliente_nome: modalParcial.cliente_nome,
        valor,
        mes: agora.getMonth() + 1,
        ano: agora.getFullYear(),
        data: dataParcial,
        origem: 'fatura_parcial',
        forma_pagamento: parcialFormaPgto || '',
        vendedor_id: (modalParcial as any).vendedor_id || '',
        created_at: Timestamp.now(),
      })
      // Atualizar contas_receber se totalmente pago
      if (novoStatus === 'pago') {
        const crSnap = await getDocs(query(collection(db, 'contas_receber'), where('invoice_id', '==', modalParcial.id)))
        for (const crDoc of crSnap.docs) {
          await updateDoc(doc(db, 'contas_receber', crDoc.id), { status: 'recebido', data_pagamento: Timestamp.now() })
        }
        await criarComissaoAuto(modalParcial.id, modalParcial)
      }
      // Notificação
      await addDoc(collection(db, 'notificacoes'), {
        tipo: novoStatus === 'pago' ? 'fatura_paga' : 'pagamento_parcial',
        titulo: novoStatus === 'pago' ? '✅ Fatura PAGA!' : '💰 Pagamento parcial recebido',
        mensagem: `${modalParcial.cliente_nome} pagou $${valor.toFixed(2)} na fatura ${modalParcial.numero}. ${novoStatus === 'pago' ? 'Quitada!' : `Falta: $${restante.toFixed(2)}`}`,
        invoice_id: modalParcial.id, cliente_nome: modalParcial.cliente_nome,
        valor, usuario_id: (modalParcial as any).vendedor_id || '', lida: false, created_at: Timestamp.now(),
      }).catch(() => {})
      setInvoices(prev => prev.map(i => i.id === modalParcial.id ? { ...i, status: novoStatus, valor_pago: novoTotalPago } as any : i))
      setModalParcial(null)
      setValorParcial('')
      setParcialFormaPgto('')
      setParcialData(new Date().toISOString().split('T')[0])
    } catch (e) { console.error(e); alert('Erro ao registrar pagamento') }
    finally { setSalvandoParcial(false) }
  }

  const sendLembrete = (inv: Invoice, via: 'whatsapp' | 'sms') => {
    const phone = (inv as any).cliente_telefone?.replace(/\D/g, '') || ''
    if (!phone) { alert('Cliente não tem telefone cadastrado'); return }
    const venc = (inv.data_vencimento as any)?.toDate
      ? (inv.data_vencimento as any).toDate().toLocaleDateString('pt-BR')
      : inv.data_vencimento ? new Date(inv.data_vencimento as any).toLocaleDateString('pt-BR') : ''
    const msg = `Olá ${inv.cliente_nome}! 😊\n\nPassando para lembrar que sua fatura ${inv.numero} da BBVIC Hair Care no valor de ${formatCurrency(inv.total)} está em atraso desde ${venc}.\n\nPor favor, entre em contato para regularizar. Obrigada! 🙏`
    if (via === 'whatsapp') {
      const url = `https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
    } else {
      const url = `sms:+1${phone}?body=${encodeURIComponent(msg)}`
      window.location.href = url
    }
  }

  const faturaAtrasada = (inv: Invoice) => isAtrasada(inv as any)

  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.numero.toLowerCase().includes(searchTerm.toLowerCase()) || inv.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus
    let matchCard = true
    if (activeCard === 'pago') matchCard = inv.status === 'pago'
    else if (activeCard === 'pendente') matchCard = ['enviado','aguardando_confirmacao','visualizado'].includes(inv.status) && !faturaAtrasada(inv)
    else if (activeCard === 'atrasado') matchCard = faturaAtrasada(inv) || inv.status === 'atrasado'
    else if (activeCard === 'parcial') matchCard = inv.status === 'parcial'
    let matchDate = true
    if (filtroDataInicio || filtroDataFim) {
      try {
        const invDate = (inv as any).data_emissao?.toDate ? (inv as any).data_emissao.toDate() : new Date((inv as any).data_emissao ?? (inv as any).created_at)
        if (filtroDataInicio) matchDate = matchDate && invDate >= new Date(filtroDataInicio + 'T00:00:00')
        if (filtroDataFim) matchDate = matchDate && invDate <= new Date(filtroDataFim + 'T23:59:59')
      } catch { matchDate = true }
    }
    return matchSearch && matchStatus && matchCard && matchDate
  })

  const totais = {
    pago: filtered.filter(i => i.status === 'pago').reduce((s, i) => s + (i.total - (i.desconto || 0)), 0),
    pagoGeral: filtered.filter(i => i.status === 'pago').reduce((s, i) => s + i.total, 0),
    pendente: filtered.filter(i => ['enviado','aguardando_confirmacao','visualizado','rascunho','pendente'].includes(i.status) && !faturaAtrasada(i)).reduce((s, i) => s + i.total, 0),
    atrasado: filtered.filter(i => faturaAtrasada(i) || i.status === 'atrasado').reduce((s, i) => s + i.total, 0),
    parcial: filtered.filter(i => i.status === 'parcial').reduce((s, i) => s + (i.total - ((i as any).valor_pago || 0)), 0),
    countAtrasado: filtered.filter(i => faturaAtrasada(i) || i.status === 'atrasado').length,
    countParcial: filtered.filter(i => i.status === 'parcial').length,
    mesLabel: (filtroDataInicio || filtroDataFim) ? `${filtroDataInicio || ''}${filtroDataInicio && filtroDataFim ? ' – ' : ''}${filtroDataFim || ''}` : `${MESES_PT[mesFiltro - 1]} ${anoFiltro}`,
  }

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" /></div>

  const handlePagarParcelaItem = async () => {
    if (!modalParcelas?.id || pagandoParcelaIdx === null) return
    const inv = modalParcelas
    const parcelas: any[] = (inv as any).parcelas || []
    const parcela = parcelas[pagandoParcelaIdx]
    if (!parcela) return
    const valor = parseFloat(parcelaValorInput) || parcela.valor
    if (valor <= 0) { alert('Informe um valor válido'); return }
    setSalvandoParcelaItem(true)
    try {
      const dataPgto = parcelaDataPgto ? Timestamp.fromDate(new Date(parcelaDataPgto + 'T12:00:00')) : Timestamp.now()
      const novasParcelas = parcelas.map((p: any, idx: number) =>
        idx === pagandoParcelaIdx ? { ...p, status: 'pago', valor_pago: valor, data_pagamento: parcelaDataPgto, forma_pagamento: parcelaForma } : p
      )
      const totalPagoAntes = (inv as any).valor_pago || 0
      const novoTotalPago = totalPagoAntes + valor
      const restante = inv.total - novoTotalPago
      const novoStatus = restante <= 0.01 ? 'pago' : 'parcial'
      await updateDoc(doc(db, 'invoices', inv.id!), {
        parcelas: novasParcelas,
        valor_pago: novoTotalPago,
        status: novoStatus,
        data_pagamento: novoStatus === 'pago' ? dataPgto : null,
        forma_pagamento_recebido: novoStatus === 'pago' ? parcelaForma : undefined,
        updated_at: Timestamp.now(),
      })
      const agora = parcelaDataPgto ? new Date(parcelaDataPgto + 'T12:00:00') : new Date()
      await addDoc(collection(db, 'receitas'), {
        descricao: `Parcela ${parcela.numero}/${parcelas.length} - Fatura ${inv.numero}`,
        invoice_id: inv.id,
        invoice_numero: inv.numero,
        cliente_nome: inv.cliente_nome,
        valor,
        mes: agora.getMonth() + 1,
        ano: agora.getFullYear(),
        data: dataPgto,
        origem: 'parcela',
        forma_pagamento: parcelaForma || '',
        vendedor_id: (inv as any).vendedor_id || '',
        created_at: Timestamp.now(),
      })
      if (novoStatus === 'pago') {
        const crSnap = await getDocs(query(collection(db, 'contas_receber'), where('invoice_id', '==', inv.id)))
        for (const crDoc of crSnap.docs) {
          await updateDoc(doc(db, 'contas_receber', crDoc.id), { status: 'recebido', data_pagamento: dataPgto })
        }
        await criarComissaoAuto(inv.id!, inv)
      }
      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'pagamento_parcela',
        titulo: `💰 Parcela ${parcela.numero} recebida`,
        mensagem: `${inv.cliente_nome} pagou a ${parcela.numero}ª parcela (${formatCurrency(valor)}) da fatura ${inv.numero}.`,
        invoice_id: inv.id, cliente_nome: inv.cliente_nome, valor,
        usuario_id: (inv as any).vendedor_id || '', lida: false, created_at: Timestamp.now(),
      }).catch(() => {})
      const updatedInv = { ...inv, parcelas: novasParcelas, valor_pago: novoTotalPago, status: novoStatus } as any
      setInvoices(prev => prev.map(i => i.id === inv.id ? updatedInv : i))
      setModalParcelas(updatedInv)
      setPagandoParcelaIdx(null)
      setParcelaValorInput('')
      setParcelaForma('')
      setParcelaDataPgto(new Date().toISOString().split('T')[0])
    } catch (e) { console.error(e); alert('Erro ao registrar pagamento da parcela') }
    finally { setSalvandoParcelaItem(false) }
  }

  const sendWAFatura = async (inv: Invoice) => {
    const phone = (inv.cliente_telefone || '').replace(/\D/g, '')
    if (!phone) { alert('Cliente sem telefone cadastrado'); return }
    const token = (inv as any).public_token || ''
    const invoiceUrl = token ? `${window.location.origin}/invoice/${token}` : ''
    const dataEnvio = new Date().toLocaleDateString('pt-BR')
    const dataVenc = (() => { try { const d = (inv as any).data_vencimento; return d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('pt-BR') : '' } catch { return '' } })()
    const valorPago = (inv as any).valor_pago || 0
    const statusAtual = inv.status
    const parcelas: any[] = (inv as any).parcelas || []
    const parcelasAtivo = (inv as any).parcelas_ativo === true
    const dpStr = (() => { try { const dp = (inv as any).data_pagamento; return dp ? (dp.toDate ? dp.toDate() : new Date(dp)).toLocaleDateString('pt-BR') : '' } catch { return '' } })()
    const formaPgto = (inv as any).forma_pagamento_recebido || ''
    let totalMsgVar: string
    if (statusAtual === 'pago') {
      totalMsgVar = `✅ *FATURA PAGA*\nTotal: ${formatCurrency(inv.total)}\nPago em: ${dpStr || dataEnvio}${formaPgto ? ` via ${formaPgto}` : ''}`
    } else if (parcelasAtivo && parcelas.length > 0) {
      const linhas = parcelas.map((p: any) => {
        const dStr = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''
        return `  ${p.status === 'pago' ? '✅' : '⏳'} ${p.numero}ª: ${formatCurrency(p.valor)} — ${dStr}`
      }).join('\n')
      totalMsgVar = `Total: ${formatCurrency(inv.total)}\n\n📋 *Parcelas:*\n${linhas}`
    } else if (valorPago > 0) {
      const saldo = Math.max(0, inv.total - valorPago)
      totalMsgVar = `Total: ${formatCurrency(inv.total)}\n✅ Já pago: ${formatCurrency(valorPago)}${dpStr ? ` em ${dpStr}` : ''}${formaPgto ? ` via ${formaPgto}` : ''}\n💰 Saldo: ${formatCurrency(saldo)}\n📅 Vencimento: ${dataVenc}`
    } else {
      totalMsgVar = `Total: ${formatCurrency(inv.total)}\n📅 Vencimento: ${dataVenc}`
    }
    let msgTemplate = `Olá {NOME}!\n\nSegue sua fatura da BBVIC Hair Care:\n{LINK}\n\n{TOTAL_MSG}\nEmitido em: {DATA_ENVIO}`
    try {
      const snapMsg = await getDoc(doc(db, 'configuracoes', 'mensagens'))
      if (snapMsg.exists() && snapMsg.data().fatura) msgTemplate = snapMsg.data().fatura
    } catch { }
    const squareLink = (inv as any).square_link || ''
    const msg = msgTemplate
      .replace(/{NOME}/g, inv.cliente_nome)
      .replace(/{NUMERO}/g, inv.numero)
      .replace(/{TOTAL}/g, formatCurrency(inv.total))
      .replace(/{TOTAL_MSG}/g, totalMsgVar)
      .replace(/{JA_PAGO}/g, valorPago > 0 ? formatCurrency(valorPago) : '')
      .replace(/{SALDO}/g, valorPago > 0 ? formatCurrency(Math.max(0, inv.total - valorPago)) : formatCurrency(inv.total))
      .replace(/{VENCIMENTO}/g, dataVenc)
      .replace(/{DATA_ENVIO}/g, dataEnvio)
      .replace(/{LINK}/g, invoiceUrl)
      + (squareLink ? `\n\n💳 Pague agora: ${squareLink}` : '')
    window.open(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Faturas</h1>
          <p className="text-gray-500 text-sm">Gerencie as faturas dos seus clientes</p>
        </div>
        <button onClick={() => navigate('/invoices/novo')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Fatura
        </button>
      </div>

      {/* Cards Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveCard(activeCard === 'pago' ? null : 'pago')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'pago' ? 'bg-green-100 border-green-400 ring-2 ring-green-300' : 'bg-green-50 border-green-100 hover:border-green-300'}`}
        >
          <p className="text-xs text-green-700 font-medium mb-1">Pagas — {totais.mesLabel}</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totais.pago)}</p>
          <p className="text-xs text-green-500 mt-0.5">Total geral: {formatCurrency(totais.pagoGeral)}</p>
          {activeCard === 'pago' && <p className="text-xs text-green-600 mt-1">Clique para limpar filtro</p>}
        </button>
        <button
          onClick={() => setActiveCard(activeCard === 'pendente' ? null : 'pendente')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'pendente' ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-300' : 'bg-orange-50 border-orange-100 hover:border-orange-300'}`}
        >
          <p className="text-xs text-orange-700 font-medium mb-1">A Receber</p>
          <p className="text-xl font-bold text-orange-700">{formatCurrency(totais.pendente)}</p>
          {activeCard === 'pendente' && <p className="text-xs text-orange-600 mt-1">Clique para limpar filtro</p>}
        </button>
        <button
          onClick={() => setActiveCard(activeCard === 'atrasado' ? null : 'atrasado')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'atrasado' ? 'bg-red-100 border-red-400 ring-2 ring-red-300' : 'bg-red-50 border-red-100 hover:border-red-300'}`}
        >
          <p className="text-xs text-red-700 font-medium mb-1">Em Atraso</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totais.atrasado)}</p>
          <p className="text-xs text-red-500 mt-0.5">{totais.countAtrasado} fatura{totais.countAtrasado !== 1 ? 's' : ''}</p>
          {activeCard === 'atrasado' && <p className="text-xs text-red-600 mt-1">Clique para limpar filtro</p>}
        </button>
        <button
          onClick={() => setActiveCard(activeCard === 'parcial' ? null : 'parcial')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'parcial' ? 'bg-yellow-100 border-yellow-400 ring-2 ring-yellow-300' : 'bg-yellow-50 border-yellow-100 hover:border-yellow-300'}`}
        >
          <p className="text-xs text-yellow-700 font-medium mb-1">Pago Parcial</p>
          <p className="text-xl font-bold text-yellow-700">{formatCurrency(totais.parcial)}</p>
          <p className="text-xs text-yellow-500 mt-0.5">{totais.countParcial} fatura{totais.countParcial !== 1 ? 's' : ''}</p>
          {activeCard === 'parcial' && <p className="text-xs text-yellow-600 mt-1">Clique para limpar filtro</p>}
        </button>
      </div>

      {/* Banner faturas em atraso */}
      {invoices.filter(i => faturaAtrasada(i) || i.status === 'atrasado').length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">
              ⚠️ {invoices.filter(i => faturaAtrasada(i) || i.status === 'atrasado').length} fatura(s) em atraso
            </p>
            <p className="text-xs text-red-500 mt-0.5">Use os botões WA ou SMS em cada fatura para enviar lembrete ao cliente</p>
          </div>
          <button
            onClick={() => setActiveCard(activeCard === 'atrasado' ? null : 'atrasado')}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 flex-shrink-0"
          >
            Ver faturas em atraso
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar fatura ou cliente..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227] text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#C9A227]" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#C9A227]" />
          {(filtroDataInicio || filtroDataFim) && (
            <button onClick={() => { setFiltroDataInicio(''); setFiltroDataFim('') }}
              className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">
              Limpar datas
            </button>
          )}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-[#C9A227] appearance-none text-sm">
            <option value="all">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="enviado">Enviado</option>
            <option value="visualizado">Visualizado</option>
            <option value="aguardando_confirmacao">Ag. Confirmação</option>
            <option value="pago">Pago</option>
            <option value="parcial">Parcial</option>
            <option value="atrasado">Atrasado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma fatura encontrada</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Fatura</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Vendedor</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Valor</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 text-sm">{inv.numero}</p>
                      <p className="text-xs text-gray-400">{inv.data_emissao ? new Date((inv.data_emissao as any)?.toDate ? (inv.data_emissao as any).toDate() : inv.data_emissao).toLocaleDateString('pt-BR') : ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => navigate(`/invoices/${inv.id}/editar`)} className="text-sm font-medium text-[#C9A227] hover:underline text-left">
                        {inv.cliente_nome}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{(inv as any).vendedor_nome || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusCls[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>{statusLabel[inv.status] ?? inv.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-semibold text-[#C9A227]">{formatCurrency(inv.total)}</p>
                      {inv.status === 'parcial' && (inv as any).valor_pago > 0 && (
                        <div className="text-xs mt-0.5 text-right">
                          <span className="text-green-600">Pago: {formatCurrency((inv as any).valor_pago)}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-red-500">Falta: {formatCurrency(inv.total - (inv as any).valor_pago)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status !== 'pago' && inv.status !== 'cancelado' && (
                          <>
                            <button
                              onClick={() => { setParcialData(new Date().toISOString().split('T')[0]); setParcialFormaPgto(''); setModalParcial(inv); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium"
                            >
                              + Pag.
                            </button>
                            <button
                              onClick={() => handleMarcarPago(inv)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-xs font-medium"
                            >
                              <CheckCircle className="w-3 h-3" />
                              Pago
                            </button>
                          </>
                        )}
                        {(faturaAtrasada(inv) || inv.status === 'atrasado') && (
                          <>
                            <button onClick={() => sendLembrete(inv, 'whatsapp')} title="Lembrete WhatsApp" className="px-2 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700">WA</button>
                            <button onClick={() => sendLembrete(inv, 'sms')} title="Lembrete SMS" className="px-2 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700">SMS</button>
                          </>
                        )}
                        {(inv as any).parcelas_ativo && (
                          <button
                            onClick={() => { setPagandoParcelaIdx(null); setModalParcelas(inv) }}
                            title="Ver Parcelas"
                            className="p-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 text-xs font-bold"
                          >
                            📋
                          </button>
                        )}
                        <button onClick={() => sendWAFatura(inv)} title="Enviar WhatsApp" className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ id: inv.id!, numero: inv.numero, cliente: inv.cliente_nome })} className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100" title="Excluir fatura">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(inv => (
              <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{inv.numero}</p>
                    <button onClick={() => navigate(`/invoices/${inv.id}/editar`)} className="text-sm font-medium text-[#C9A227] hover:underline text-left">
                      {inv.cliente_nome}
                    </button>
                    {(inv as any).vendedor_nome && <p className="text-gray-400 text-xs mt-0.5">Vendedor: {(inv as any).vendedor_nome}</p>}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ml-2 ${statusCls[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>{statusLabel[inv.status] ?? inv.status}</span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#C9A227]">{formatCurrency(inv.total)}</span>
                    <div className="flex gap-2 flex-wrap">
                      {inv.status !== 'pago' && inv.status !== 'cancelado' && (
                        <>
                          <button
                            onClick={() => { setParcialData(new Date().toISOString().split('T')[0]); setParcialFormaPgto(''); setModalParcial(inv); }}
                            className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium"
                          >
                            + Pag.
                          </button>
                          <button
                            onClick={() => handleMarcarPago(inv)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Pago
                          </button>
                        </>
                      )}
                      <button onClick={() => sendWAFatura(inv)} title="Enviar WhatsApp" className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      {(faturaAtrasada(inv) || inv.status === 'atrasado') && (
                        <>
                          <button onClick={() => sendLembrete(inv, 'whatsapp')} className="px-2 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium">WA</button>
                          <button onClick={() => sendLembrete(inv, 'sms')} className="px-2 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium">SMS</button>
                        </>
                      )}
                      <button onClick={() => navigate(`/invoices/${inv.id}/editar`)} className="p-2 rounded-lg bg-gray-100 text-gray-600">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm({ id: inv.id!, numero: inv.numero, cliente: inv.cliente_nome })} className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {inv.status === 'parcial' && (inv as any).valor_pago > 0 && (
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600">Pago: {formatCurrency((inv as any).valor_pago)}</span>
                      <span className="text-red-500">Falta: {formatCurrency(inv.total - (inv as any).valor_pago)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {/* Modal Parcelas */}
      {modalParcelas && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setModalParcelas(null); setPagandoParcelaIdx(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Parcelas — {modalParcelas.numero}</h3>
                <p className="text-sm text-gray-500">{modalParcelas.cliente_nome} · Total: {formatCurrency(modalParcelas.total)}</p>
              </div>
              <button onClick={() => { setModalParcelas(null); setPagandoParcelaIdx(null) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="space-y-2">
              {((modalParcelas as any).parcelas || []).map((p: any, idx: number) => (
                <div key={idx} className={`rounded-xl border p-3 ${p.status === 'pago' ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {p.status === 'pago' ? '✅' : '⏳'} {p.numero}ª parcela — {formatCurrency(p.valor)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Vencimento: {p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        {p.status === 'pago' && p.data_pagamento ? ` · Pago em: ${new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                        {p.status === 'pago' && p.forma_pagamento ? ` via ${p.forma_pagamento}` : ''}
                      </p>
                    </div>
                    {p.status !== 'pago' && pagandoParcelaIdx !== idx && (
                      <button
                        onClick={() => { setPagandoParcelaIdx(idx); setParcelaValorInput(String(p.valor)); setParcelaForma(''); setParcelaDataPgto(new Date().toISOString().split('T')[0]) }}
                        className="px-3 py-1.5 rounded-xl bg-[#C9A227] text-white text-xs font-bold hover:bg-[#9A7B1A]"
                      >
                        Pagar
                      </button>
                    )}
                    {p.status === 'pago' && (
                      <span className="text-xs text-green-600 font-semibold">Pago</span>
                    )}
                  </div>

                  {pagandoParcelaIdx === idx && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Valor recebido</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number" step="0.01" min="0.01"
                            value={parcelaValorInput}
                            onChange={e => setParcelaValorInput(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#C9A227]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pagamento</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {['Zelle','Venmo','Cash','Square','Cartão','Outro'].map(f => (
                            <button key={f} onClick={() => setParcelaForma(f)}
                              className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition ${parcelaForma === f ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A227]'}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Data do Pagamento</label>
                        <input type="date" value={parcelaDataPgto} onChange={e => setParcelaDataPgto(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setPagandoParcelaIdx(null)}
                          className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
                          Cancelar
                        </button>
                        <button onClick={handlePagarParcelaItem} disabled={salvandoParcelaItem || !parcelaForma}
                          className="flex-[2] py-2 rounded-xl bg-[#C9A227] text-white text-xs font-bold hover:bg-[#9A7B1A] disabled:opacity-50 flex items-center justify-center gap-1">
                          {salvandoParcelaItem ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Confirmar Pagamento
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Resumo */}
            {(() => {
              const prcls: any[] = (modalParcelas as any).parcelas || []
              const pagas = prcls.filter((p:any) => p.status === 'pago').length
              const totalPago = (modalParcelas as any).valor_pago || 0
              const restante = modalParcelas.total - totalPago
              return (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Parcelas pagas</span><span className="font-semibold">{pagas}/{prcls.length}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total pago</span><span className="font-semibold text-green-600">{formatCurrency(totalPago)}</span></div>
                  {restante > 0.01 && <div className="flex justify-between"><span className="text-gray-500">Saldo restante</span><span className="font-semibold text-red-500">{formatCurrency(restante)}</span></div>}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal Dar Baixa / Confirmar Pagamento */}
      {modalBaixa && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalBaixa(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Confirmar Pagamento</h3>
              <p className="text-sm text-gray-500">{modalBaixa.cliente_nome} — {modalBaixa.numero}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-sm flex justify-between">
              <span className="text-gray-500">Valor total</span>
              <span className="font-bold text-gray-900">{formatCurrency(modalBaixa.total)}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Forma de Pagamento</label>
              <div className="grid grid-cols-2 gap-2">
                {['Zelle', 'Venmo', 'Cash', 'Square', 'Cartão', 'Outro'].map(f => (
                  <button key={f} onClick={() => setBaixaFormaPgto(f)}
                    className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaFormaPgto === f ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A227]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Pagamento</label>
              <input type="date" value={baixaData} onChange={e => setBaixaData(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalBaixa(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm">
                Cancelar
              </button>
              <button onClick={handleConfirmarBaixa} disabled={salvandoBaixa || !baixaFormaPgto}
                className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white font-bold hover:bg-[#9A7B1A] disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {salvandoBaixa ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salvandoBaixa ? 'Salvando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Registrar Pagamento Parcial */}
      {modalParcial && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalParcial(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Registrar Pagamento</h3>
              <p className="text-sm text-gray-500">{modalParcial.cliente_nome} — {modalParcial.numero}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total da fatura</span>
                <span className="font-semibold text-gray-900">{formatCurrency(modalParcial.total)}</span>
              </div>
              {(modalParcial as any).valor_pago > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Já recebido</span>
                    <span className="font-semibold text-green-600">{formatCurrency((modalParcial as any).valor_pago)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="text-gray-500">Saldo restante</span>
                    <span className="font-bold text-red-600">{formatCurrency(modalParcial.total - (modalParcial as any).valor_pago)}</span>
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor recebido agora</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={modalParcial.total - ((modalParcial as any).valor_pago || 0)}
                  value={valorParcial}
                  onChange={e => setValorParcial(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full pl-7 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-lg font-semibold focus:outline-none focus:border-[#C9A227]"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">O valor será registrado na receita do mês automaticamente</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Forma de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {['Zelle', 'Venmo', 'Cash', 'Square', 'Cartão', 'Outro'].map(f => (
                  <button key={f} onClick={() => setParcialFormaPgto(f)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition ${parcialFormaPgto === f ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A227]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Pagamento</label>
              <input type="date" value={parcialData} onChange={e => setParcialData(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModalParcial(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarParcial}
                disabled={salvandoParcial || !valorParcial || parseFloat(valorParcial) <= 0}
                className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white font-bold hover:bg-[#9A7B1A] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {salvandoParcial ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salvandoParcial ? 'Salvando...' : 'Confirmar Recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Fatura</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir a fatura <span className="font-semibold text-gray-900">{deleteConfirm.numero}</span> de <span className="font-semibold">{deleteConfirm.cliente}</span>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
