import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, updateDoc, doc, addDoc, Timestamp, getDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase'
// kpiUtils usado via faturaAtrasada local (mais abrangente)
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, FileText, Eye, CheckCircle, Loader2, Trash2, MessageCircle } from 'lucide-react'
import type { Invoice } from '@/types'
import { faturaEstaAtrasada, valorEmAtraso, ehParcelada, aplicarPagamentoEmParcela, saldoFatura, recebidoNoPeriodo, totalDevido } from '@/lib/faturas'

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
    // Comissão calculada sobre o subtotal (valor dos produtos, sem frete/taxas)
    const baseComissao = invoiceData.subtotal || invoiceData.total
    const valorComissao = (baseComissao * percentual) / 100
    const comSnap = await getDocs(query(collection(db, 'comissoes'), where('invoice_id', '==', invoiceId)))
    if (!comSnap.empty) return
    await addDoc(collection(db, 'comissoes'), {
      vendedor_id: invoiceData.vendedor_id,
      vendedor_nome: invoiceData.vendedor_nome || '',
      invoice_id: invoiceId,
      invoice_numero: invoiceData.numero,
      cliente_nome: invoiceData.cliente_nome,
      valor_venda: baseComissao,
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
  const [baixaSubOpcao, setBaixaSubOpcao] = useState('')
  const [baixaObservacao, setBaixaObservacao] = useState('')
  const [baixaData, setBaixaData] = useState(() => new Date().toISOString().split('T')[0])
  const [salvandoBaixa, setSalvandoBaixa] = useState(false)
  const [parcialFormaPgto, setParcialFormaPgto] = useState('')
  const [parcialData, setParcialData] = useState(() => new Date().toISOString().split('T')[0])
  const [parcelarSaldoAtivo, setParcelarSaldoAtivo] = useState(false)
  const [numParcelasSaldo, setNumParcelasSaldo] = useState(2)
  const [primeiraDataSaldo, setPrimeiraDataSaldo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]
  })

  // Modal Corrigir Pagamento
  const [modalCorrigir, setModalCorrigir] = useState<Invoice | null>(null)
  const [corrigirValor, setCorrigirValor] = useState('')
  const [corrigirForma, setCorrigirForma] = useState('')
  const [corrigirData, setCorrigirData] = useState(() => new Date().toISOString().split('T')[0])
  const [salvandoCorrigir, setSalvandoCorrigir] = useState(false)

  useEffect(() => { fetchInvoices() }, [user, isAdmin])

  const fetchInvoices = async () => {
    if (!user) return
    try {
      setLoading(true)
      const verTodos = isAdmin || user?.ver_todos_clientes === true
      let q = verTodos
        ? query(collection(db, 'invoices'), orderBy('created_at', 'desc'))
        : query(collection(db, 'invoices'), where('vendedor_id', '==', user.uid), orderBy('created_at', 'desc'))
      let snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Invoice[]
      setInvoices(list)
    } catch (error: any) {
      console.error('Erro ao buscar faturas:', error)
      // Fallback sem orderBy se faltar índice
      try {
        const verTodos = isAdmin || user?.ver_todos_clientes === true
        const q2 = verTodos
          ? collection(db, 'invoices')
          : query(collection(db, 'invoices'), where('vendedor_id', '==', user.uid))
        const snap2 = await getDocs(q2)
        let list2 = snap2.docs.map(d => ({ id: d.id, ...d.data() })) as Invoice[]
        list2.sort((a, b) => {
          const ta = (a as any).created_at?.toDate?.() ?? new Date(0)
          const tb = (b as any).created_at?.toDate?.() ?? new Date(0)
          return tb.getTime() - ta.getTime()
        })
        setInvoices(list2)
        toast.warning('Faturas carregadas sem ordenação (índice pendente)')
      } catch (error2: any) {
        toast.error('Erro ao carregar faturas: ' + (error2.message || 'verifique permissões'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMarcarPago = (inv: Invoice) => {
    setBaixaData(new Date().toISOString().split('T')[0])
    setBaixaFormaPgto('')
    setBaixaSubOpcao('')
    setBaixaObservacao('')
    setModalBaixa(inv)
  }

  const handleConfirmarBaixa = async () => {
    const inv = modalBaixa
    if (!inv?.id) return
    setSalvandoBaixa(true)
    const dataPgto = baixaData ? Timestamp.fromDate(new Date(baixaData + 'T12:00:00')) : Timestamp.now()
    try {
      // Parcelas em aberto passam a pagas nesta data (o restante entra nesta baixa)
      const parcelasBaixa = Array.isArray((inv as any).parcelas)
        ? (inv as any).parcelas.map((p: any) => p.status === 'pago' ? p : {
            ...p, status: 'pago', valor_pago: p.valor || 0, data_pagamento: baixaData, forma_pagamento: baixaFormaPgto,
          })
        : (inv as any).parcelas
      await updateDoc(doc(db, 'invoices', inv.id), {
        status: 'pago', data_pagamento: dataPgto, valor_pago: totalDevido(inv), forma_pagamento_recebido: baixaFormaPgto, forma_pagamento_sub: baixaSubOpcao || null, observacao_pagamento: baixaObservacao || null, updated_at: Timestamp.now(),
        ...(parcelasBaixa ? { parcelas: parcelasBaixa } : {}),
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
        const agora = baixaData ? new Date(baixaData + 'T12:00:00') : new Date()
        const jaRegistrado = (inv as any).valor_pago || 0
        const valorRestante = totalDevido(inv) - jaRegistrado
        if (valorRestante > 0.01) {
          await addDoc(collection(db, 'receitas'), {
            descricao: `Fatura ${inv.numero} paga`,
            invoice_id: inv.id,
            invoice_numero: inv.numero,
            cliente_nome: inv.cliente_nome,
            valor: valorRestante,
            mes: agora.getMonth() + 1,
            ano: agora.getFullYear(),
            data: dataPgto,
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
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'pago', data_pagamento: dataPgto, valor_pago: totalDevido(inv), ...(parcelasBaixa ? { parcelas: parcelasBaixa } : {}) } as any : i))
      setModalBaixa(null)
    } catch (e) { console.error(e); alert('Erro ao marcar como pago') }
    finally { setSalvandoBaixa(false) }
  }

  const abrirCorrigirPagamento = (inv: Invoice) => {
    setModalCorrigir(inv)
    setCorrigirValor(String((inv as any).valor_pago || inv.total || ''))
    setCorrigirForma((inv as any).forma_pagamento_recebido || '')
    setCorrigirData(new Date().toISOString().split('T')[0])
  }

  const handleCorrigirPagamento = async () => {
    const inv = modalCorrigir
    if (!inv?.id) return
    const novoValor = parseFloat(corrigirValor)
    if (isNaN(novoValor) || novoValor < 0) { alert('Informe um valor válido'); return }
    setSalvandoCorrigir(true)
    try {
      const valorAntigo = (inv as any).valor_pago || 0
      const diferenca = novoValor - valorAntigo
      const dataPgtoTs = corrigirData ? Timestamp.fromDate(new Date(corrigirData + 'T12:00:00')) : Timestamp.now()
      const agora = corrigirData ? new Date(corrigirData + 'T12:00:00') : new Date()

      // Calcular novo status
      let novoStatus: string
      if (novoValor <= 0) {
        novoStatus = (inv as any).statusOriginal || 'enviado'
      } else if (novoValor >= totalDevido(inv) - 0.01) {
        novoStatus = 'pago'
      } else {
        novoStatus = 'parcial'
      }

      // Atualizar receitas: se diferença positiva → nova receita; se negativa → ajustar/deletar
      if (diferenca > 0.01) {
        await addDoc(collection(db, 'receitas'), {
          descricao: `Correção de pagamento - Fatura ${inv.numero}`,
          invoice_id: inv.id,
          invoice_numero: inv.numero,
          cliente_nome: inv.cliente_nome,
          valor: diferenca,
          mes: agora.getMonth() + 1,
          ano: agora.getFullYear(),
          data: dataPgtoTs,
          origem: 'correcao_pagamento',
          vendedor_id: (inv as any).vendedor_id || '',
          created_at: Timestamp.now(),
        })
      } else if (diferenca < -0.01) {
        // Buscar receitas existentes e ajustar a mais recente
        const recSnap = await getDocs(query(collection(db, 'receitas'), where('invoice_id', '==', inv.id)))
        const recDocs = recSnap.docs.sort((a, b) => (b.data().created_at?.seconds || 0) - (a.data().created_at?.seconds || 0))
        let restanteAjuste = Math.abs(diferenca)
        for (const rd of recDocs) {
          if (restanteAjuste <= 0) break
          const valRec = rd.data().valor || 0
          if (valRec <= restanteAjuste) {
            await deleteDoc(doc(db, 'receitas', rd.id))
            restanteAjuste -= valRec
          } else {
            await updateDoc(doc(db, 'receitas', rd.id), { valor: valRec - restanteAjuste })
            restanteAjuste = 0
          }
        }
      }

      // Atualizar parcelas se existirem
      let novasParcelas = (inv as any).parcelas || []
      if ((inv as any).parcelas_ativo && novasParcelas.length > 0) {
        // Zera e redistribui conforme novo valor pago
        let saldoPago = novoValor
        novasParcelas = novasParcelas.map((p: any) => {
          const valParcela = p.valor || 0
          if (saldoPago >= valParcela - 0.01) {
            saldoPago -= valParcela
            return { ...p, status: 'pago', valor_pago: valParcela }
          } else if (saldoPago > 0.01) {
            const vp = saldoPago
            saldoPago = 0
            return { ...p, status: 'parcialmente_pago', valor_pago: vp }
          } else {
            return { ...p, status: 'pendente', valor_pago: 0 }
          }
        })
      }

      await updateDoc(doc(db, 'invoices', inv.id), {
        valor_pago: novoValor,
        status: novoStatus,
        forma_pagamento_recebido: corrigirForma || '',
        data_pagamento: novoStatus === 'pago' ? dataPgtoTs : null,
        parcelas: novasParcelas,
        ultima_correcao_pagamento: { data: Timestamp.now(), valor_anterior: valorAntigo, novo_valor: novoValor },
        updated_at: Timestamp.now(),
      })

      setInvoices(prev => prev.map(i => i.id === inv.id
        ? { ...i, status: novoStatus, valor_pago: novoValor, forma_pagamento_recebido: corrigirForma } as any
        : i
      ))
      toast.success('Pagamento corrigido com sucesso!')
      setModalCorrigir(null)
    } catch (e) { console.error(e); alert('Erro ao corrigir pagamento') }
    finally { setSalvandoCorrigir(false) }
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
    const restante = totalDevido(modalParcial) - novoTotalPago
    const novoStatus = restante <= 0.01 ? 'pago' : (parcelarSaldoAtivo ? 'parcial' : 'parcial')
    setSalvandoParcial(true)
    try {
      const dataParcial = parcialData ? Timestamp.fromDate(new Date(parcialData + 'T12:00:00')) : Timestamp.now()

      let novasParcelas: any[] = (modalParcial as any).parcelas || []
      let parcelasAtivaNova = (modalParcial as any).parcelas_ativo || false

      if (parcelarSaldoAtivo && restante > 0.01 && numParcelasSaldo >= 1) {
        parcelasAtivaNova = true
        const valorParcela = Math.round((restante / numParcelasSaldo) * 100) / 100
        const baseDate = new Date(primeiraDataSaldo + 'T12:00:00')
        novasParcelas = Array.from({ length: numParcelasSaldo }, (_, i) => {
          const d = new Date(baseDate)
          d.setMonth(d.getMonth() + i)
          const vp = i === numParcelasSaldo - 1
            ? Math.round((restante - valorParcela * (numParcelasSaldo - 1)) * 100) / 100
            : valorParcela
          return { numero: i + 1, valor: vp, data: d.toISOString().split('T')[0], status: 'pendente' }
        })
      } else if (ehParcelada(modalParcial) && restante > -0.01) {
        // Fatura já parcelada: o pagamento entra na próxima parcela em aberto
        // e as demais são reajustadas para o saldo real
        const idxProxima = novasParcelas.findIndex((p: any) => p.status !== 'pago')
        if (idxProxima >= 0) {
          novasParcelas = aplicarPagamentoEmParcela(novasParcelas, idxProxima, valor, totalDevido(modalParcial), novoTotalPago, {
            data_pagamento: parcialData,
            forma_pagamento: parcialFormaPgto,
          })
        }
      }

      await updateDoc(doc(db, 'invoices', modalParcial.id), {
        valor_pago: novoTotalPago,
        status: novoStatus,
        data_pagamento: dataParcial, // data do último pagamento recebido
        forma_pagamento_recebido: parcialFormaPgto || '',
        parcelas_ativo: parcelasAtivaNova,
        parcelas: novasParcelas,
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
      setInvoices(prev => prev.map(i => i.id === modalParcial.id ? { ...i, status: novoStatus, valor_pago: novoTotalPago, data_pagamento: dataParcial, parcelas: novasParcelas, parcelas_ativo: parcelasAtivaNova } as any : i))
      setModalParcial(null)
      setValorParcial('')
      setParcialFormaPgto('')
      setParcialData(new Date().toISOString().split('T')[0])
      setParcelarSaldoAtivo(false)
      setNumParcelasSaldo(2)
      const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1)
      setPrimeiraDataSaldo(nextMonth.toISOString().split('T')[0])
    } catch (e) { console.error(e); alert('Erro ao registrar pagamento') }
    finally { setSalvandoParcial(false) }
  }

  const sendLembrete = (inv: Invoice, via: 'whatsapp' | 'sms') => {
    const phone = (inv as any).cliente_telefone?.replace(/\D/g, '') || ''
    if (!phone) { alert('Cliente não tem telefone cadastrado'); return }
    const venc = (inv.data_vencimento as any)?.toDate
      ? (inv.data_vencimento as any).toDate().toLocaleDateString('pt-BR')
      : inv.data_vencimento ? new Date(inv.data_vencimento as any).toLocaleDateString('pt-BR') : ''
    const emAtraso = valorEmAtraso(inv)
    const msg = `Olá ${inv.cliente_nome}! 😊\n\nPassando para lembrar que sua fatura ${inv.numero} da BBVIC Hair Care tem ${formatCurrency(emAtraso > 0 ? emAtraso : inv.total)} em atraso${ehParcelada(inv) ? '' : ` desde ${venc}`}.\n\nPor favor, entre em contato para regularizar. Obrigada! 🙏`
    if (via === 'whatsapp') {
      const url = `https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
    } else {
      const url = `sms:+1${phone}?body=${encodeURIComponent(msg)}`
      window.location.href = url
    }
  }

  // Fatura atrasada = tem parcela ou vencimento que JÁ PASSOU e ainda tem saldo (regra única em lib/faturas)
  const faturaAtrasada = (inv: any): boolean => faturaEstaAtrasada(inv)

  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  // Período do card Receita: o filtro de datas, ou o mês atual quando não há filtro
  const periodoInicioCard = filtroDataInicio ? new Date(filtroDataInicio + 'T00:00:00') : new Date(anoFiltro, mesFiltro - 1, 1, 0, 0, 0)
  const periodoFimCard = filtroDataFim ? new Date(filtroDataFim + 'T23:59:59') : new Date(anoFiltro, mesFiltro, 0, 23, 59, 59)
  const recebidoPeriodo = (i: any) => recebidoNoPeriodo(i, periodoInicioCard, periodoFimCard)

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.numero.toLowerCase().includes(searchTerm.toLowerCase()) || inv.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())

    // Quando filtro "atrasado" está ativo: ignora filtro de data e status
    // Mostra TODAS as faturas atrasadas independente do mês
    if (activeCard === 'atrasado') {
      return (faturaAtrasada(inv)) && matchSearch
    }

    const matchStatus = filterStatus === 'all'
      ? true
      : filterStatus === 'atrasado'
        ? (faturaAtrasada(inv))
        : inv.status === filterStatus
    let matchCard = true
    if (activeCard === 'pago') matchCard = recebidoPeriodo(inv) > 0
    else if (activeCard === 'pendente') matchCard = !['pago','cancelado','rascunho'].includes(inv.status) && saldoFatura(inv) - valorEmAtraso(inv) > 0.01
    else if (activeCard === 'parcial') matchCard = inv.status === 'parcial'
    let matchDate = true
    if (filtroDataInicio || filtroDataFim) {
      try {
        const isPaidOrPartial = ['pago','parcial'].includes(inv.status)
        const dateSource = isPaidOrPartial
          ? ((inv as any).data_pagamento || (inv as any).data_emissao || (inv as any).created_at)
          : ((inv as any).data_emissao || (inv as any).created_at)
        const invDate = dateSource?.toDate ? dateSource.toDate() : new Date(dateSource)
        if (filtroDataInicio) matchDate = matchDate && invDate >= new Date(filtroDataInicio + 'T00:00:00')
        if (filtroDataFim) matchDate = matchDate && invDate <= new Date(filtroDataFim + 'T23:59:59')
      } catch { matchDate = true }
    }
    return matchSearch && matchStatus && matchCard && (activeCard === 'pago' || matchDate)
  })

  // Contagem/valor de TODAS as atrasadas (ignora filtro de data/status)
  const todasAtrasadas = invoices.filter(i => faturaAtrasada(i))

  const naoRascunho = (i: any) => i.status !== 'rascunho'

  const totais = {
    // Dinheiro que entrou no período (não o total histórico)
    pago: invoices.reduce((s, i) => s + recebidoPeriodo(i), 0),
    // Faturas quitadas no período (valor total delas)
    pagoGeral: invoices.filter(i => i.status === 'pago' && recebidoPeriodo(i) > 0).reduce((s, i) => s + (i.total || 0), 0),
    // A vencer: saldo em aberto que ainda NÃO venceu (todas as datas)
    pendente: invoices.filter(i => !['pago', 'cancelado'].includes(i.status) && naoRascunho(i))
      .reduce((s, i) => s + Math.max(0, saldoFatura(i) - valorEmAtraso(i)), 0),
    atrasado: todasAtrasadas.reduce((s, i) => s + valorEmAtraso(i), 0),
    // Quanto ainda falta nas faturas com pagamento parcial
    parcial: invoices.filter(i => i.status === 'parcial').reduce((s, i) => s + saldoFatura(i), 0),
    countAtrasado: todasAtrasadas.length,
    countParcial: invoices.filter(i => i.status === 'parcial').length,
    mesLabel: (filtroDataInicio || filtroDataFim) ? `${filtroDataInicio || ''}${filtroDataInicio && filtroDataFim ? ' – ' : ''}${filtroDataFim || ''}` : `${MESES_PT[mesFiltro - 1]} ${anoFiltro}`,
  }

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin" /></div>

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

      const totalPagoAntes = (inv as any).valor_pago || 0
      const novoTotalPago = Math.round((totalPagoAntes + valor) * 100) / 100
      const restante = totalDevido(inv) - novoTotalPago

      // Registra o pagamento nesta parcela e reajusta as que faltam para somarem
      // exatamente o saldo real (pagou a menos: soma nas próximas; a mais: desconta)
      const novasParcelas = aplicarPagamentoEmParcela(parcelas, pagandoParcelaIdx, valor, totalDevido(inv), novoTotalPago, {
        data_pagamento: parcelaDataPgto,
        forma_pagamento: parcelaForma,
      })
      const novoStatus = restante <= 0.01 ? 'pago' : 'parcial'
      await updateDoc(doc(db, 'invoices', inv.id!), {
        parcelas: novasParcelas,
        valor_pago: novoTotalPago,
        status: novoStatus,
        data_pagamento: dataPgto, // data do último pagamento recebido
        ...(novoStatus === 'pago' ? { forma_pagamento_recebido: parcelaForma } : { forma_pagamento_recebido: deleteField() }),
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
      const updatedInv = { ...inv, parcelas: novasParcelas, valor_pago: novoTotalPago, status: novoStatus, data_pagamento: dataPgto } as any
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
      const saldo = saldoFatura(inv)
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
      .replace(/{SALDO}/g, formatCurrency(saldoFatura(inv)))
      .replace(/{VENCIMENTO}/g, dataVenc)
      .replace(/{DATA_ENVIO}/g, dataEnvio)
      .replace(/{LINK}/g, invoiceUrl)
      + (squareLink ? `\n\n💳 Pague agora: ${squareLink}` : '')
    const url = `https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => document.body.removeChild(a), 200)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Faturas</h1>
          <p className="text-gray-500 text-sm">Gerencie as faturas dos seus clientes</p>
        </div>
        <button onClick={() => navigate('/invoices/novo')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Fatura
        </button>
        {isAdmin && (
          <button
            onClick={async () => {
              if (!confirm('Corrigir status de todas as faturas em RASCUNHO?')) return
              const { getDocs: gd, query: q2, where: w2, collection: col2, doc: docRef2, updateDoc: ud2 } = await import('firebase/firestore')
              const snap = await gd(q2(col2(db, 'invoices'), w2('status', '==', 'rascunho')))
              if (snap.empty) { alert('Nenhuma fatura em rascunho encontrada.'); return }
              const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
              const parseD = (v: any): Date | null => {
                if (!v) return null
                try {
                  if (typeof v?.toDate === 'function') return v.toDate()
                  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000)
                  const s = String(v).trim()
                  const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (dm) return new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00`)
                  const ym = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (ym) return new Date(`${ym[1]}-${ym[2]}-${ym[3]}T12:00:00`)
                  return new Date(s)
                } catch { return null }
              }
              const definirStatus = (d: any) => {
                const total = d.total || 0; const vp = d.valor_pago || 0
                if (vp >= total && total > 0) return 'pago'
                if (vp > 0) return 'parcial'
                if (Array.isArray(d.parcelas) && d.parcelas.length > 0) {
                  const pagas = d.parcelas.filter((p: any) => p.status === 'pago').reduce((s: number, p: any) => s + (p.valor || 0), 0)
                  if (pagas >= total && total > 0) return 'pago'
                  if (pagas > 0) return 'parcial'
                  for (const p of d.parcelas.filter((p: any) => p.status !== 'pago')) {
                    const dt = parseD(p.data_vencimento ?? p.data ?? p.vencimento)
                    if (dt) { const v = new Date(dt); v.setHours(23,59,59,999); if (v < hoje) return 'atrasado' }
                  }
                }
                for (const c of ['data','data_vencimento','vencimento','due_date']) {
                  if (d[c]) { const dt = parseD(d[c]); if (dt) { const v = new Date(dt); v.setHours(23,59,59,999); if (v < hoje) return 'atrasado'; break } }
                }
                return 'enviado'
              }
              let ok = 0
              for (const docSnap of snap.docs) {
                try {
                  const novoStatus = definirStatus(docSnap.data())
                  await ud2(docRef2(db, 'invoices', docSnap.id), { status: novoStatus })
                  ok++
                } catch { /* continua */ }
              }
              alert(`✅ ${ok} fatura(s) corrigida(s)! Recarregando...`)
              window.location.reload()
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium"
            title="Corrigir faturas em rascunho"
          >
            Corrigir Rascunhos
          </button>
        )}
      </div>

      {/* Cards Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveCard(activeCard === 'pago' ? null : 'pago')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'pago' ? 'bg-green-100 border-green-400 ring-2 ring-green-300' : 'bg-green-50 border-green-100 hover:border-green-300'}`}
        >
          <p className="text-xs text-green-700 font-medium mb-1">Receita — {totais.mesLabel}</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totais.pago)}</p>
          <p className="text-xs text-green-500 mt-0.5">Faturas quitadas no período: {formatCurrency(totais.pagoGeral)}</p>
          {activeCard === 'pago' && <p className="text-xs text-green-600 mt-1">Clique para limpar filtro</p>}
        </button>
        <button
          onClick={() => setActiveCard(activeCard === 'pendente' ? null : 'pendente')}
          className={`text-left rounded-xl p-4 border transition-all ${activeCard === 'pendente' ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-300' : 'bg-orange-50 border-orange-100 hover:border-orange-300'}`}
        >
          <p className="text-xs text-orange-700 font-medium mb-1">A Receber (a vencer)</p>
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
          <p className="text-xs text-yellow-700 font-medium mb-1">Pago Parcial — falta</p>
          <p className="text-xl font-bold text-yellow-700">{formatCurrency(totais.parcial)}</p>
          <p className="text-xs text-yellow-500 mt-0.5">{totais.countParcial} fatura{totais.countParcial !== 1 ? 's' : ''}</p>
          {activeCard === 'parcial' && <p className="text-xs text-yellow-600 mt-1">Clique para limpar filtro</p>}
        </button>
      </div>

      {/* Banner faturas em atraso */}
      {invoices.filter(i => faturaAtrasada(i)).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">
              ⚠️ {invoices.filter(i => faturaAtrasada(i)).length} fatura(s) em atraso
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
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar fatura ou cliente..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#6F2738] text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#6F2738]" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#6F2738]" />
          {(filtroDataInicio || filtroDataFim) && (
            <button onClick={() => { setFiltroDataInicio(''); setFiltroDataFim('') }}
              className="px-2 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">
              Limpar datas
            </button>
          )}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-[#6F2738] appearance-none text-sm">
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
                      <button onClick={() => navigate(`/invoices/${inv.id}/editar`)} className="text-sm font-medium text-[#6F2738] hover:underline text-left">
                        {inv.cliente_nome}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{(inv as any).vendedor_nome || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusCls[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>{statusLabel[inv.status] ?? inv.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-semibold text-[#6F2738]">{formatCurrency(inv.total)}</p>
                      {inv.status === 'parcial' && (inv as any).valor_pago > 0 && (
                        <div className="text-xs mt-0.5 text-right">
                          <span className="text-green-600">Pago: {formatCurrency((inv as any).valor_pago)}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-red-500">Falta: {formatCurrency(saldoFatura(inv))}</span>
                        </div>
                      )}
                      {faturaAtrasada(inv) && (
                        <p className="text-xs mt-0.5 font-semibold text-red-600">Em atraso: {formatCurrency(valorEmAtraso(inv))}</p>
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
                        {(faturaAtrasada(inv)) && (
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
                        {((inv as any).valor_pago > 0 || inv.status === 'pago') && (
                          <button
                            onClick={() => abrirCorrigirPagamento(inv)}
                            title="Corrigir valor pago"
                            className="px-2 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 text-xs font-medium"
                          >
                            Corrigir
                          </button>
                        )}
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
                    <button onClick={() => navigate(`/invoices/${inv.id}/editar`)} className="text-sm font-medium text-[#6F2738] hover:underline text-left">
                      {inv.cliente_nome}
                    </button>
                    {(inv as any).vendedor_nome && <p className="text-gray-400 text-xs mt-0.5">Vendedor: {(inv as any).vendedor_nome}</p>}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ml-2 ${statusCls[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>{statusLabel[inv.status] ?? inv.status}</span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#6F2738]">{formatCurrency(inv.total)}</span>
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
                      {(faturaAtrasada(inv)) && (
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
                      <span className="text-red-500">Falta: {formatCurrency(saldoFatura(inv))}</span>
                    </div>
                  )}
                  {faturaAtrasada(inv) && (
                    <p className="text-xs mt-1 font-semibold text-red-600">Em atraso: {formatCurrency(valorEmAtraso(inv))}</p>
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
                <div key={idx} className={`rounded-xl border p-3 ${p.status === 'pago' ? 'bg-green-50 border-green-200' : p.status === 'parcialmente_pago' ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {p.status === 'pago' ? '✅' : p.status === 'parcialmente_pago' ? '⚠️' : '⏳'} {p.numero}ª parcela — {formatCurrency(p.valor)}
                        {p.valor_original != null && Math.abs(p.valor_original - p.valor) > 0.009 && (
                          <span className="ml-1 text-xs font-normal text-gray-400">(era {formatCurrency(p.valor_original)})</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Vencimento: {p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        {p.status === 'pago' && p.data_pagamento ? ` · Pago em: ${new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                        {p.status === 'pago' && p.forma_pagamento ? ` via ${p.forma_pagamento}` : ''}
                        {p.status === 'parcialmente_pago' && p.valor_pago ? ` · Pago parcial: ${formatCurrency(p.valor_pago)} · Falta: ${formatCurrency(Math.max(0, p.valor - p.valor_pago))}` : ''}
                        {p.status === 'parcialmente_pago' && p.forma_pagamento ? ` via ${p.forma_pagamento}` : ''}
                      </p>
                    </div>
                    {p.status !== 'pago' && pagandoParcelaIdx !== idx && (
                      <button
                        onClick={() => {
                          setPagandoParcelaIdx(idx)
                          // Se já pagou parcial, pré-preenche com o valor RESTANTE da parcela
                          const valorRestante = p.status === 'parcialmente_pago' && p.valor_pago
                            ? Math.max(0, p.valor - p.valor_pago)
                            : p.valor
                          setParcelaValorInput(String(Math.round(valorRestante * 100) / 100))
                          setParcelaForma('')
                          setParcelaDataPgto(new Date().toISOString().split('T')[0])
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#6F2738] text-white text-xs font-bold hover:bg-[#4A1A26]"
                      >
                        {p.status === 'parcialmente_pago' ? 'Completar' : 'Pagar'}
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
                            className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pagamento</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {['Zelle','Venmo','Cash','Square','Cartão','Outro'].map(f => (
                            <button key={f} onClick={() => setParcelaForma(f)}
                              className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition ${parcelaForma === f ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Data do Pagamento</label>
                        <input type="date" value={parcelaDataPgto} onChange={e => setParcelaDataPgto(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setPagandoParcelaIdx(null)}
                          className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
                          Cancelar
                        </button>
                        <button onClick={handlePagarParcelaItem} disabled={salvandoParcelaItem || !parcelaForma}
                          className="flex-[2] py-2 rounded-xl bg-[#6F2738] text-white text-xs font-bold hover:bg-[#4A1A26] disabled:opacity-50 flex items-center justify-center gap-1">
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
              const parcialPagas = prcls.filter((p:any) => p.status === 'parcialmente_pago').length
              const totalPago = (modalParcelas as any).valor_pago || 0
              const restante = totalDevido(modalParcelas) - totalPago
              return (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Parcelas pagas</span><span className="font-semibold">{pagas}/{prcls.length}</span></div>
                  {parcialPagas > 0 && <div className="flex justify-between"><span className="text-yellow-600">Parciais (pago parcial)</span><span className="font-semibold text-yellow-600">{parcialPagas}</span></div>}
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
                {['Zelle', 'Venmo', 'Cash', 'Link', 'Cartão', 'Outro'].map(f => (
                  <button key={f} onClick={() => { setBaixaFormaPgto(f); setBaixaSubOpcao('') }}
                    className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaFormaPgto === f ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {baixaFormaPgto === 'Cartão' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Recebido em qual conta?</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Brazilian Touch', 'Julieth'].map(op => (
                    <button key={op} onClick={() => setBaixaSubOpcao(op)}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaSubOpcao === op ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {baixaFormaPgto === 'Zelle' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Recebido em qual conta?</label>
                <div className="flex flex-col gap-2">
                  {['Hair Body', 'BBVIC Hair Care', 'Julieth'].map(op => (
                    <button key={op} onClick={() => setBaixaSubOpcao(op)}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaSubOpcao === op ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {baixaFormaPgto === 'Venmo' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Recebido em qual conta?</label>
                <div className="grid grid-cols-1 gap-2">
                  {['Julieth'].map(op => (
                    <button key={op} onClick={() => setBaixaSubOpcao(op)}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaSubOpcao === op ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {baixaFormaPgto === 'Link' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Plataforma do link?</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Afterpay', 'Klarna'].map(op => (
                    <button key={op} onClick={() => setBaixaSubOpcao(op)}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium transition ${baixaSubOpcao === op ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
              <input type="text" value={baixaObservacao} onChange={e => setBaixaObservacao(e.target.value)}
                placeholder="Ex: transferido dia 5, ref: pedido 123..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Pagamento</label>
              <input type="date" value={baixaData} onChange={e => setBaixaData(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalBaixa(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm">
                Cancelar
              </button>
              <button onClick={handleConfirmarBaixa} disabled={salvandoBaixa || !baixaFormaPgto}
                className="flex-[2] py-3 rounded-xl bg-[#6F2738] text-white font-bold hover:bg-[#4A1A26] disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {salvandoBaixa ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salvandoBaixa ? 'Salvando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Corrigir Pagamento */}
      {modalCorrigir && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalCorrigir(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Corrigir Pagamento</h3>
              <p className="text-sm text-gray-500">{modalCorrigir.cliente_nome} — {modalCorrigir.numero}</p>
              <p className="text-xs text-orange-600 mt-1 bg-orange-50 rounded-lg px-3 py-2">
                Valor pago atual: <strong>{formatCurrency((modalCorrigir as any).valor_pago || 0)}</strong>
                {' '}· Total: <strong>{formatCurrency(modalCorrigir.total)}</strong>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Novo valor correto pago ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={corrigirValor}
                onChange={e => setCorrigirValor(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
              <select value={corrigirForma} onChange={e => setCorrigirForma(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {['Zelle', 'Dinheiro', 'Cartão de Crédito', 'Débito', 'Venmo', 'CashApp', 'Cheque', 'Outro'].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data do Pagamento</label>
              <input type="date" value={corrigirData} onChange={e => setCorrigirData(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModalCorrigir(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={handleCorrigirPagamento} disabled={salvandoCorrigir}
                className="flex-[2] py-3 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {salvandoCorrigir ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salvandoCorrigir ? 'Salvando...' : 'Salvar Correção'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Registrar Pagamento Parcial */}
      {modalParcial && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setModalParcial(null); setParcelarSaldoAtivo(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                    <span className="font-bold text-red-600">{formatCurrency(saldoFatura(modalParcial))}</span>
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
                  max={saldoFatura(modalParcial)}
                  value={valorParcial}
                  onChange={e => setValorParcial(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full pl-7 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-lg font-semibold focus:outline-none focus:border-[#6F2738]"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">O valor será registrado na receita do mês automaticamente</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Forma de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {['Zelle', 'Venmo', 'Cash', 'Square', 'Cartão', 'Outro'].map(f => (
                  <button key={f} onClick={() => setParcialFormaPgto(f)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition ${parcialFormaPgto === f ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Pagamento</label>
              <input type="date" value={parcialData} onChange={e => setParcialData(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#6F2738]" />
            </div>

            {/* Opção de parcelar saldo restante */}
            {(() => {
              const valorAtual = parseFloat(valorParcial) || 0
              const jaRecebido = (modalParcial as any).valor_pago || 0
              const saldoAposEste = totalDevido(modalParcial) - jaRecebido - valorAtual
              return saldoAposEste > 0.01 ? (
                <div className="border border-dashed border-[#6F2738] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setParcelarSaldoAtivo(v => !v)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition ${parcelarSaldoAtivo ? 'bg-[#6F2738] text-white' : 'bg-[#6F2738]/5 text-[#6F2738] hover:bg-[#6F2738]/10'}`}
                  >
                    <span>📋 Parcelar saldo restante ({formatCurrency(saldoAposEste)})</span>
                    <span>{parcelarSaldoAtivo ? '▲' : '▼'}</span>
                  </button>
                  {parcelarSaldoAtivo && (
                    <div className="p-4 space-y-3 bg-amber-50">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número de parcelas</label>
                        <div className="flex gap-2">
                          {[2, 3, 4, 6].map(n => (
                            <button key={n} type="button" onClick={() => setNumParcelasSaldo(n)}
                              className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition ${numParcelasSaldo === n ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}>
                              {n}x
                            </button>
                          ))}
                          <input type="number" min={2} max={24} value={numParcelasSaldo} onChange={e => setNumParcelasSaldo(Math.max(2, parseInt(e.target.value) || 2))}
                            className="w-14 px-2 py-2 rounded-lg border border-gray-200 text-xs text-center focus:outline-none focus:border-[#6F2738]" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Data da 1ª parcela</label>
                        <input type="date" value={primeiraDataSaldo} onChange={e => setPrimeiraDataSaldo(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#6F2738]" />
                      </div>
                      <div className="text-xs text-gray-500 bg-white rounded-lg p-2">
                        {Array.from({ length: Math.min(numParcelasSaldo, 6) }, (_, i) => {
                          const valorP = Math.round((saldoAposEste / numParcelasSaldo) * 100) / 100
                          const d = new Date(primeiraDataSaldo + 'T12:00:00')
                          d.setMonth(d.getMonth() + i)
                          return <div key={i}>Parcela {i+1}: {formatCurrency(i === numParcelasSaldo - 1 ? Math.round((saldoAposEste - valorP * (numParcelasSaldo - 1)) * 100) / 100 : valorP)} — {d.toLocaleDateString('pt-BR')}</div>
                        })}
                        {numParcelasSaldo > 6 && <div className="text-gray-400">...e mais {numParcelasSaldo - 6} parcelas</div>}
                      </div>
                    </div>
                  )}
                </div>
              ) : null
            })()}

            <div className="flex gap-3">
              <button
                onClick={() => { setModalParcial(null); setParcelarSaldoAtivo(false) }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarParcial}
                disabled={salvandoParcial || !valorParcial || parseFloat(valorParcial) <= 0}
                className="flex-[2] py-3 rounded-xl bg-[#6F2738] text-white font-bold hover:bg-[#4A1A26] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
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
