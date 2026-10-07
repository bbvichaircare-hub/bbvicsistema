import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, Timestamp, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  Receipt, Download, BarChart2, AlertCircle, Activity, Truck,
  ShoppingCart, Award, Target, User, Search, Filter, FileText, ChevronDown, ChevronRight, X, CreditCard, ShoppingBag
} from 'lucide-react'

const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
const fmtDate = (v: any) => {
  if (!v) return '-'
  const d = v?.toDate ? v.toDate() : new Date(v)
  return d.toLocaleDateString('pt-BR')
}

const auditTipoLabel: Record<string,string> = {
  login: 'Login', fatura: 'Fatura', orcamento: 'Orçamento', cliente: 'Cliente',
  produto: 'Produto', estoque: 'Estoque', pagamento: 'Pagamento',
  vendedor: 'Vendedor', compra: 'Compra', geral: 'Sistema',
}
const auditTipoCls: Record<string,string> = {
  login: 'bg-blue-100 text-blue-700', fatura: 'bg-green-100 text-green-700',
  orcamento: 'bg-yellow-100 text-yellow-700', cliente: 'bg-purple-100 text-purple-700',
  produto: 'bg-orange-100 text-orange-700', estoque: 'bg-amber-100 text-amber-700',
  pagamento: 'bg-emerald-100 text-emerald-700', vendedor: 'bg-pink-100 text-pink-700',
  compra: 'bg-red-100 text-red-700', geral: 'bg-gray-100 text-gray-600',
}

export function Relatorios() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'visao'|'detalhado'|'vendas'|'despesas'|'estoque'|'vendedores'|'clientes'|'auditoria'|'tax'|'shipping'|'pagamentos'|'porproduto'>('visao')
  const [produtoFiltro, setProdutoFiltro] = useState('')

  const [invoices, setInvoices] = useState<any[]>([])
  const [allInvoicesAberto, setAllInvoicesAberto] = useState<any[]>([])
  const [estimates, setEstimates] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [contasPagar, setContasPagar] = useState<any[]>([])
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditSearch, setAuditSearch] = useState('')
  const [auditTipoFiltro, setAuditTipoFiltro] = useState('todos')
  const [statusFiltroFat, setStatusFiltroFat] = useState<string>('todos')
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [detalhadoCategoria, setDetalhadoCategoria] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [dataInicio, dataFim, user, isAdmin])
  useEffect(() => { if (tab === 'auditoria') fetchAudit() }, [tab])

  const [receitaFiltradaPorPagamento, setReceitaFiltradaPorPagamento] = useState(0)

  const fetchAll = async () => {
    try {
      setLoading(true)
      const inicio = new Date(dataInicio + 'T00:00:00')
      const fim = new Date(dataFim + 'T23:59:59')
      const tsIni = Timestamp.fromDate(inicio)
      const tsFim = Timestamp.fromDate(fim)

      // Compara apenas ano/mês/dia (sem hora) para evitar problemas de timezone
      const iniYMD = dataInicio // 'YYYY-MM-DD'
      const fimYMD = dataFim

      const toYMD = (v: any): string | null => {
        try {
          if (!v) return null
          let d: Date
          if (typeof v?.toDate === 'function') d = v.toDate()
          else if (typeof v === 'object' && typeof v.seconds === 'number') d = new Date(v.seconds * 1000)
          else d = new Date(v)
          if (isNaN(d.getTime())) return null
          // Formata em local (não UTC) para não ter desvio de fuso
          const y = d.getFullYear()
          const m = String(d.getMonth()+1).padStart(2,'0')
          const day = String(d.getDate()).padStart(2,'0')
          return `${y}-${m}-${day}`
        } catch { return null }
      }

      const dateInRange = (v: any) => {
        const ymd = toYMD(v)
        return ymd !== null && ymd >= iniYMD && ymd <= fimYMD
      }

      const adminQ = (col: string, field: string) =>
        query(collection(db, col), where(field, '>=', tsIni), where(field, '<=', tsFim))
      const vendQ = (col: string, field: string) =>
        query(collection(db, col), where('vendedor_id', '==', user?.uid), where(field, '>=', tsIni), where(field, '<=', tsFim))

      const allInvQ = isAdmin
        ? query(collection(db, 'invoices'))
        : query(collection(db, 'invoices'), where('vendedor_id', '==', user?.uid))

      const [invSnap, estSnap, expSnap, prodSnap, cliSnap, vendSnap, cpSnap] = await Promise.all([
        getDocs(allInvQ),
        getDocs(isAdmin ? adminQ('estimates','data_emissao') : vendQ('estimates','data_emissao')),
        getDocs(isAdmin ? adminQ('expenses','data') : vendQ('expenses','data')),
        getDocs(query(collection(db,'produtos'), where('ativo','==',true))),
        getDocs(collection(db,'clientes')),
        isAdmin ? getDocs(query(collection(db,'users'), where('role','==','vendedor'))) : Promise.resolve({ docs: [] } as any),
        isAdmin ? getDocs(adminQ('contas_pagar','data_emissao')) : Promise.resolve({ docs: [] } as any),
      ])

      const allInvoices = invSnap.docs.map(d => ({ id:d.id,...d.data() })) as any[]

      // Faturas do período — lógica IDÊNTICA à página de Faturas (Invoices.tsx linha 490-493):
      // Para pago/parcial: usa data_pagamento primeiro (faturas pagas no período)
      // Para outros status: usa data_emissao ou created_at (faturas criadas no período)
      const invoicesFiltrados = allInvoices.filter((i: any) => {
        const isPaidOrPartial = ['pago', 'parcial'].includes(i.status)
        const dateSource = isPaidOrPartial
          ? (i.data_pagamento || i.data_emissao || i.created_at || i.createdAt || i.data_criacao)
          : (i.data_emissao || i.created_at || i.createdAt || i.data_criacao)
        return dateInRange(dateSource)
      })

      // Lista COMPLETA sem filtro de data — usada para "a receber" e "atrasadas"
      // (dívidas ativas existem independente do período selecionado)
      setAllInvoicesAberto(allInvoices.filter((i: any) => !['pago','cancelado'].includes(i.status)))
      setInvoices(invoicesFiltrados)
      setEstimates(estSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setExpenses(expSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setProdutos(prodSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setClientes(cliSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setVendedores(vendSnap.docs.map((d:any) => ({ ...d.data(), id: d.id, uid: d.id })))
      setContasPagar(cpSnap.docs.map((d:any) => ({ id:d.id,...d.data() })))

      const receitaPagoPorData = allInvoices
        .filter((i: any) => {
          if (!['pago','parcial'].includes(i.status)) return false
          const dataPag = i.data_pagamento || i.updated_at || i.data_emissao
          return dateInRange(dataPag)
        })
        .reduce((s: number, i: any) => {
          if (i.status === 'pago') {
            // se valor_pago estiver salvo usa ele, senão usa total - desconto
            const vp = i.valor_pago && i.valor_pago > 0 ? i.valor_pago : ((i.total || 0) - (i.desconto || 0))
            return s + vp
          }
          return s + (i.valor_pago || 0)
        }, 0)
      setReceitaFiltradaPorPagamento(receitaPagoPorData)
    } catch(err) { console.error(err); toast.error('Erro ao carregar relatórios') }
    finally { setLoading(false) }
  }

  const fetchAudit = async () => {
    setLoadingAudit(true)
    try {
      const snap = await getDocs(query(collection(db,'audit_log'), limit(500)))
      const logs = snap.docs.map(d => ({ id:d.id,...d.data() }))
      logs.sort((a:any, b:any) => {
        const ta = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0
        const tb = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0
        return tb - ta
      })
      setAuditLog(logs)
    } catch(e) { console.error('Audit fetch error:', e) }
    finally { setLoadingAudit(false) }
  }

  // ── helpers de data reutilizáveis fora do fetchAll ──────────────────────
  const toYMDDetalhado = (v: any): string | null => {
    try {
      if (!v) return null
      let d: Date
      if (typeof v?.toDate === 'function') d = v.toDate()
      else if (typeof v === 'object' && typeof v.seconds === 'number') d = new Date(v.seconds * 1000)
      else d = new Date(v)
      if (isNaN(d.getTime())) return null
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    } catch { return null }
  }
  const dateInRangeDetalhado = (v: any) => {
    const ymd = toYMDDetalhado(v)
    return ymd !== null && ymd >= dataInicio && ymd <= dataFim
  }


  const receitaFaturas = receitaFiltradaPorPagamento
  const totalDespesas = expenses.reduce((s,e) => s + (e.valor || 0), 0)
  void contasPagar.reduce((s,c) => s + (c.valor || 0), 0) // total contas pagar — kept for future use
  const lucroLiquido = receitaFaturas - totalDespesas
  // A receber: usa lista completa sem filtro de data (dívidas independem do período)
  const aReceber = allInvoicesAberto.reduce((s,i) => {
    return s + Math.max(0, (i.total||0) - (i.valor_pago||0))
  }, 0)
  const faturasAtrasadas = allInvoicesAberto.filter(i => {
    if (['pago'].includes(i.status)) return false
    const venc = i.data_vencimento?.toDate ? i.data_vencimento.toDate() : null
    return venc && venc < new Date()
  })

  // Ticket Médio
  const faturasValidas = invoices.filter(i => !['cancelado','rascunho'].includes(i.status))
  const ticketMedio = faturasValidas.length > 0
    ? faturasValidas.reduce((s,i) => s + (i.total||0), 0) / faturasValidas.length
    : 0

  // Produtos Mais Vendidos
  const prodMap: Record<string, { nome: string; quantidade: number; receita: number }> = {}
  invoices.forEach(inv => {
    const items: any[] = inv.items || inv.itens || []
    items.forEach((item: any) => {
      const key = item.produto_id || item.produto_nome || item.descricao || 'N/A'
      const nome = item.produto_nome || item.descricao || key
      if (!prodMap[key]) prodMap[key] = { nome, quantidade: 0, receita: 0 }
      prodMap[key].quantidade += item.quantidade || 1
      prodMap[key].receita += (item.preco_unitario || item.preco || item.preco_venda || 0) * (item.quantidade || 1)
    })
  })
  const rankingProdutos = Object.values(prodMap).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10)

  // Estoque
  const valorEstoque = produtos.reduce((s,p) => s + (p.preco||0)*(p.estoque||0), 0)
  const lucroEstoque = produtos.reduce((s,p) => s + ((p.preco||0)-(p.preco_custo||0))*(p.estoque||0), 0)
  const baixoEstoque = produtos.filter(p => (p.estoque||0) <= (p.estoque_minimo||0))

  // Vendedores com métricas avançadas
  const resumoVendedores = vendedores.map(v => {
    const fats = invoices.filter(i => i.vendedor_id === (v.uid || v.id))
    const fatsPagas = fats.filter(i => i.status==='pago')
    const receita = fatsPagas.reduce((s,i) => s+(i.total||0), 0)
    const orcamentos = estimates.filter(e => e.vendedor_id === (v.uid || v.id))
    const ticketV = fatsPagas.length > 0 ? receita / fatsPagas.length : 0
    const conversao = fats.length > 0 ? (fatsPagas.length / fats.length * 100) : 0
    return { ...v, faturas: fats.length, receita, orcamentos: orcamentos.length, ticketMedio: ticketV, conversao }
  }).sort((a,b) => b.receita - a.receita)

  // Audit filtered
  const auditFiltrado = auditLog.filter(a => {
    const matchSearch = !auditSearch ||
      (a.acao||'').toLowerCase().includes(auditSearch.toLowerCase()) ||
      (a.detalhes||'').toLowerCase().includes(auditSearch.toLowerCase()) ||
      (a.usuario_email||'').toLowerCase().includes(auditSearch.toLowerCase())
    const matchTipo = auditTipoFiltro === 'todos' || a.tipo === auditTipoFiltro
    return matchSearch && matchTipo
  })

  // ── FILTRO POR VENDEDOR ──────────────────────────────────────────────────
  const invFiltV = filtroVendedor === 'todos' ? invoices : invoices.filter(i => i.vendedor_id === filtroVendedor)
  const expFiltV = filtroVendedor === 'todos' ? expenses : expenses.filter(e => e.vendedor_id === filtroVendedor)

  // ── MÉTRICAS DETALHADAS ──────────────────────────────────────────────────
  const parseDate = (v: any): Date | null => {
    if (!v) return null
    try {
      if (typeof v?.toDate === 'function') return v.toDate()
      if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000)
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v
      const d = new Date(v); return isNaN(d.getTime()) ? null : d
    } catch { return null }
  }
  const fmtDateD = (v: any) => { const d = parseDate(v); return d ? d.toLocaleDateString('pt-BR') : '-' }

  const fatPagas = invFiltV.filter(i => i.status === 'pago')
  const fatParcial = invFiltV.filter(i => i.status === 'parcial')
  const fatParceladas = invFiltV.filter(i => Array.isArray(i.parcelas) && i.parcelas.length > 0)
  const fatAtrasadas = invFiltV.filter(i => {
    if (['pago','cancelado'].includes(i.status)) return false
    if (Array.isArray(i.parcelas) && i.parcelas.length > 0) {
      const pendentes = i.parcelas.filter((p: any) => p.status !== 'pago')
      if (pendentes.length === 0) return false
      for (const p of pendentes) {
        const d = parseDate(p.data_vencimento ?? p.data ?? p.vencimento)
        if (d && d < new Date()) return true
      }
      return false
    }
    const venc = parseDate(i.data_vencimento)
    return venc ? venc < new Date() : false
  })
  const fatVendidas = invFiltV.filter(i => !['cancelado'].includes(i.status))
  const fatFaltaPagar = invFiltV.filter(i => !['pago','cancelado'].includes(i.status) && (i.total||0) > (i.valor_pago||0))

  const totalVendido = fatVendidas.reduce((s,i) => s+(i.total||0), 0)
  const totalPago = fatPagas.reduce((s,i) => s+(i.valor_pago||i.total||0), 0) + fatParcial.reduce((s,i) => s+(i.valor_pago||0), 0)
  const totalAtrasado = fatAtrasadas.reduce((s,i) => {
    if (Array.isArray(i.parcelas) && i.parcelas.length > 0) {
      return s + i.parcelas.filter((p:any) => p.status !== 'pago' && parseDate(p.data_vencimento ?? p.data) && parseDate(p.data_vencimento ?? p.data)! < new Date())
        .reduce((ps:number, p:any) => ps + Math.max(0,(p.valor||0)-(p.valor_pago||0)), 0)
    }
    return s + Math.max(0,(i.total||0)-(i.valor_pago||0))
  }, 0)
  const totalFaltaPagar = fatFaltaPagar.reduce((s,i) => s + Math.max(0,(i.total||0)-(i.valor_pago||0)), 0)
  const totalParcial = fatParcial.reduce((s,i) => s+(i.valor_pago||0), 0)
  const totalSaidaDespesas = expFiltV.reduce((s,e) => s+(e.valor||0), 0)

  // ── EXPORT FUNCTIONS ───────────────────────────────────────────────────────

  // helper compartilhado de filtro/pago — igual ao usado na tabela
  const getValorPagoExport = (inv: any) => {
    if (inv.status === 'pago') return inv.valor_pago && inv.valor_pago > 0 ? inv.valor_pago : (inv.total||0)-(inv.desconto||0)
    if (inv.status === 'parcial') return inv.valor_pago || 0
    return 0
  }
  void getValorPagoExport // usado dentro de exportGeral
  const isAtrasadoExport = (inv: any) => {
    if (['pago','cancelado'].includes(inv.status)) return false
    const venc = inv.data_vencimento?.toDate ? inv.data_vencimento.toDate() : inv.data_vencimento ? new Date(inv.data_vencimento) : null
    return venc && venc < new Date()
  }
  const getFatFiltradas = () => {
    if (statusFiltroFat === 'todos') return invoices
    if (statusFiltroFat === 'atrasado') return invoices.filter(isAtrasadoExport)
    return invoices.filter(i => i.status === statusFiltroFat)
  }
  void getFatFiltradas // disponível para uso futuro


  const exportDespesas = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Descrição','Categoria','Data','Valor','Fornecedor']
    const r = expenses.map(e => [e.descricao||'', e.categoria||'', fmtDate(e.data), e.valor||0, e.fornecedor||''])
    const totExp = expenses.reduce((s,e)=>s+(e.valor||0),0)
    const ws = XLSX.utils.aoa_to_sheet([
      ['BBVIC GESTÃO - DESPESAS'],
      [`Período: ${dataInicio} a ${dataFim}   |   ${expenses.length} despesa(s)`],
      [], h, ...r, [],
      ['','','TOTAL', totExp, '']
    ])
    ws['!cols'] = [30,18,12,12,20].map(w=>({wch:w}))
    XLSX.utils.book_append_sheet(wb, ws, 'Despesas')

    const hCP = ['Descrição','Fornecedor','Vencimento','Valor','Status']
    const rCP = contasPagar.map(c => [c.descricao||'', c.fornecedor||'', fmtDate(c.data_vencimento), c.valor||0, c.status||''])
    const totCP = contasPagar.reduce((s,c)=>s+(c.valor||0),0)
    const wsCP = XLSX.utils.aoa_to_sheet([
      ['BBVIC GESTÃO - CONTAS A PAGAR'],
      [`Período: ${dataInicio} a ${dataFim}   |   ${contasPagar.length} conta(s)`],
      [], hCP, ...rCP, [],
      ['','','TOTAL', totCP, '']
    ])
    wsCP['!cols'] = [30,20,12,12,12].map(w=>({wch:w}))
    XLSX.utils.book_append_sheet(wb, wsCP, 'Contas a Pagar')
    XLSX.writeFile(wb, `despesas_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório de despesas exportado!')
  }

  const exportEstoque = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Produto','Categoria','Estoque','Mínimo','Status','Preço Venda','Preço Custo','Margem %','Valor Total Venda','Valor Total Custo']
    const r = produtos.map(p => [
      p.nome, p.categoria||'', p.estoque||0, p.estoque_minimo||0,
      (p.estoque||0)<=(p.estoque_minimo||0)?'BAIXO':'Normal',
      p.preco||0, p.preco_custo||0, p.margem_lucro||0,
      (p.preco||0)*(p.estoque||0), (p.preco_custo||0)*(p.estoque||0),
    ])
    const totVenda = produtos.reduce((s,p)=>s+(p.preco||0)*(p.estoque||0),0)
    const totCusto = produtos.reduce((s,p)=>s+(p.preco_custo||0)*(p.estoque||0),0)
    const ws = XLSX.utils.aoa_to_sheet([
      ['BBVIC GESTÃO - ESTOQUE'],
      [`Gerado em: ${dataInicio}   |   ${produtos.length} produto(s)`],
      [], h, ...r, [],
      ['TOTAL','','','','','','','','', totVenda, totCusto]
    ])
    ws['!cols'] = [28,15,9,9,9,12,12,10,16,16].map(w=>({wch:w}))
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque')
    XLSX.writeFile(wb, `estoque_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório de estoque exportado!')
  }

  const exportVendedores = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Vendedor','Email','Faturas','Receita','Orçamentos','Ticket Médio','Conversão %']
    const r = resumoVendedores.map(v => [v.nome||'', v.email||'', v.faturas, v.receita, v.orcamentos, v.ticketMedio.toFixed(2), v.conversao.toFixed(1)])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Vendedores')
    XLSX.writeFile(wb, `relatorio_vendedores_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório de vendedores exportado!')
  }

  const exportClientes = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Nome','Email','Telefone','Cidade','Estado']
    const r = clientes.map(c => [c.nome||'', c.email||'', c.telefone||'', c.cidade||'', c.estado||''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Clientes')
    XLSX.writeFile(wb, `relatorio_clientes_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório de clientes exportado!')
  }

  const exportProdutosMaisVendidos = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Posição','Produto','Qtd Vendida','Receita']
    const r = rankingProdutos.map((p,i) => [i+1, p.nome, p.quantidade, p.receita.toFixed(2)])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Produtos Mais Vendidos')
    XLSX.writeFile(wb, `produtos_mais_vendidos_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Ranking exportado!')
  }

  const exportAudit = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Data/Hora','Usuário','Tipo','Ação','Detalhes']
    const r = auditFiltrado.map(a => [
      a.created_at?.toDate ? a.created_at.toDate().toLocaleString('pt-BR') : '',
      a.usuario_email||'',
      auditTipoLabel[a.tipo]||a.tipo||'',
      a.acao||'',
      a.detalhes||'',
    ])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Auditoria')
    XLSX.writeFile(wb, `auditoria_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('Log de auditoria exportado!')
  }

  const exportGeral = () => {
    const wb = XLSX.utils.book_new()
    const nomeVendFiltro = filtroVendedor === 'todos' ? 'Todos os Vendedores' : (vendedores.find(v => v.uid === filtroVendedor)?.nome || filtroVendedor)

    // ── 1. RESUMO EXECUTIVO ──
    const wsResumo = XLSX.utils.aoa_to_sheet([
      ['BBVIC GESTÃO — RELATÓRIO PREMIUM COMPLETO',''],
      [`Período: ${dataInicio} a ${dataFim}   |   Vendedor: ${nomeVendFiltro}`,''],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`,''],
      ['',''],
      ['── RESUMO FINANCEIRO ──',''],
      ['Total Vendido (faturas)', totalVendido],
      ['Total Recebido (pago + parcial)', totalPago],
      ['Pago Integral', fatPagas.reduce((s,i) => s+(i.valor_pago||i.total||0), 0)],
      ['Pago Parcial', totalParcial],
      ['Falta Receber', totalFaltaPagar],
      ['Em Atraso', totalAtrasado],
      ['Total Despesas (saídas)', totalSaidaDespesas],
      ['Lucro Líquido', totalPago - totalSaidaDespesas],
      ['',''],
      ['── QUANTIDADES ──',''],
      ['Faturas Criadas', fatVendidas.length],
      ['Faturas Pagas', fatPagas.length],
      ['Faturas Pago Parcial', fatParcial.length],
      ['Faturas Parceladas', fatParceladas.length],
      ['Faturas Em Atraso', fatAtrasadas.length],
      ['Faturas Pendentes', fatFaltaPagar.length],
      ['Orçamentos', estimates.length],
      ['Despesas', expFiltV.length],
    ])
    wsResumo['!cols'] = [38,18].map(w=>({wch:w}))
    XLSX.utils.book_append_sheet(wb, wsResumo, '📊 Resumo')

    // ── 2. TODAS AS FATURAS DETALHADAS ──
    const hFatAll = ['Nº Fatura','Cliente','Vendedor','Data Emissão','Vencimento','Status','Total','Desconto','Taxa Envio','Pago','Falta','Forma Pgto','Data Pgto','Parcelas?','Nº Parcelas','Observações']
    const rFatAll = invFiltV.map(i => {
      const vp = i.status === 'pago' ? (i.valor_pago||i.total||0) : (i.valor_pago||0)
      return [
        i.numero||'',
        i.cliente_nome||'',
        i.vendedor_nome||'Admin',
        fmtDateD(i.data_emissao),
        fmtDateD(i.data_vencimento),
        i.status||'',
        i.total||0,
        i.desconto||0,
        i.taxa_envio||0,
        vp,
        Math.max(0,(i.total||0)-vp),
        (i as any).forma_pagamento_recebido||'',
        fmtDateD((i as any).data_pagamento),
        Array.isArray(i.parcelas) && i.parcelas.length > 0 ? 'Sim' : 'Não',
        Array.isArray(i.parcelas) ? i.parcelas.length : 0,
        (i as any).observacoes||'',
      ]
    })
    const totFatAll = ['TOTAL','','','','','',
      invFiltV.reduce((s,i)=>s+(i.total||0),0), invFiltV.reduce((s,i)=>s+(i.desconto||0),0),
      invFiltV.reduce((s,i)=>s+((i as any).taxa_envio||0),0),
      invFiltV.reduce((s,i)=>s+(i.status==='pago'?(i.valor_pago||i.total||0):(i.valor_pago||0)),0),
      invFiltV.reduce((s,i)=>s+Math.max(0,(i.total||0)-(i.status==='pago'?(i.valor_pago||i.total||0):(i.valor_pago||0))),0),
      '','','','','']
    const wsFatAll = XLSX.utils.aoa_to_sheet([
      [`TODAS AS FATURAS — ${nomeVendFiltro} — ${dataInicio} a ${dataFim}`],
      [], hFatAll, ...rFatAll, [], totFatAll
    ])
    wsFatAll['!cols'] = [12,25,18,12,12,12,12,10,10,12,12,14,12,10,10,30].map(w=>({wch:w}))
    XLSX.utils.book_append_sheet(wb, wsFatAll, '📄 Faturas Completo')

    // ── 3. FATURAS PAGAS ──
    if (fatPagas.length > 0) {
      const h = ['Nº','Cliente','Vendedor','Data Emissão','Data Pgto','Forma Pgto','Total','Desconto','Valor Pago']
      const r = fatPagas.map(i => [i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin', fmtDateD(i.data_emissao), fmtDateD((i as any).data_pagamento), (i as any).forma_pagamento_recebido||'', i.total||0, i.desconto||0, i.valor_pago||i.total||0])
      const tot = ['TOTAL','','','','','', fatPagas.reduce((s,i)=>s+(i.total||0),0),'',fatPagas.reduce((s,i)=>s+(i.valor_pago||i.total||0),0)]
      const ws = XLSX.utils.aoa_to_sheet([[`FATURAS PAGAS — ${dataInicio} a ${dataFim}`],[],h,...r,[],tot])
      ws['!cols'] = [12,25,18,12,12,16,12,10,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '✅ Pagas')
    }

    // ── 4. PAGO PARCIAL ──
    if (fatParcial.length > 0) {
      const h = ['Nº','Cliente','Vendedor','Total','Pago','Falta','Forma Pgto','Data Últ. Pgto','Vencimento']
      const r = fatParcial.map(i => [i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin', i.total||0, i.valor_pago||0, Math.max(0,(i.total||0)-(i.valor_pago||0)), (i as any).forma_pagamento_recebido||'', fmtDateD((i as any).data_pagamento), fmtDateD(i.data_vencimento)])
      const tot = ['TOTAL','','',fatParcial.reduce((s,i)=>s+(i.total||0),0),fatParcial.reduce((s,i)=>s+(i.valor_pago||0),0),fatParcial.reduce((s,i)=>s+Math.max(0,(i.total||0)-(i.valor_pago||0)),0),'','','']
      const ws = XLSX.utils.aoa_to_sheet([[`PAGO PARCIAL — ${dataInicio} a ${dataFim}`],[],h,...r,[],tot])
      ws['!cols'] = [12,25,18,12,12,12,16,12,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '💛 Parcial')
    }

    // ── 5. PARCELADAS (detalhe de cada parcela) ──
    if (fatParceladas.length > 0) {
      const h = ['Nº Fatura','Cliente','Vendedor','Nº Parcela','Total Parcela','Pago','Falta','Status','Vencimento','Forma Pgto']
      const r: any[] = []
      fatParceladas.forEach(i => {
        (i.parcelas||[]).forEach((p:any, idx:number) => {
          r.push([i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin', `${idx+1}/${i.parcelas!.length}`, p.valor||0, p.valor_pago||0, Math.max(0,(p.valor||0)-(p.valor_pago||0)), p.status||'pendente', fmtDateD(p.data_vencimento??p.data), p.forma_pagamento||''])
        })
      })
      const ws = XLSX.utils.aoa_to_sheet([[`DETALHE DE PARCELAS — ${dataInicio} a ${dataFim}`],[],h,...r])
      ws['!cols'] = [12,25,18,10,12,12,12,12,12,14].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '📅 Parcelas')
    }

    // ── 6. EM ATRASO ──
    if (fatAtrasadas.length > 0) {
      const h = ['Nº','Cliente','Telefone','Vendedor','Total','Pago','Em Atraso','Vencimento','Status']
      const r = fatAtrasadas.map(i => {
        const atrasadoVal = Array.isArray(i.parcelas) && i.parcelas.length > 0
          ? i.parcelas.filter((p:any)=>p.status!=='pago'&&parseDate(p.data_vencimento??p.data)&&parseDate(p.data_vencimento??p.data)!<new Date()).reduce((s:number,p:any)=>s+Math.max(0,(p.valor||0)-(p.valor_pago||0)),0)
          : Math.max(0,(i.total||0)-(i.valor_pago||0))
        return [i.numero||'', i.cliente_nome||'', i.cliente_telefone||'', i.vendedor_nome||'Admin', i.total||0, i.valor_pago||0, atrasadoVal, fmtDateD(i.data_vencimento), i.status||'']
      })
      const tot = ['TOTAL','','','',fatAtrasadas.reduce((s,i)=>s+(i.total||0),0),fatAtrasadas.reduce((s,i)=>s+(i.valor_pago||0),0),totalAtrasado,'','']
      const ws = XLSX.utils.aoa_to_sheet([[`EM ATRASO — ${new Date().toLocaleDateString('pt-BR')}`],[],h,...r,[],tot])
      ws['!cols'] = [12,25,16,18,12,12,12,12,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '🔴 Em Atraso')
    }

    // ── 7. FALTA RECEBER ──
    if (fatFaltaPagar.length > 0) {
      const h = ['Nº','Cliente','Telefone','Vendedor','Total','Pago','Falta','Vencimento','Status']
      const r = fatFaltaPagar.map(i => [i.numero||'', i.cliente_nome||'', i.cliente_telefone||'', i.vendedor_nome||'Admin', i.total||0, i.valor_pago||0, Math.max(0,(i.total||0)-(i.valor_pago||0)), fmtDateD(i.data_vencimento), i.status||''])
      const tot = ['TOTAL','','','',fatFaltaPagar.reduce((s,i)=>s+(i.total||0),0),fatFaltaPagar.reduce((s,i)=>s+(i.valor_pago||0),0),totalFaltaPagar,'','']
      const ws = XLSX.utils.aoa_to_sheet([[`FALTA RECEBER — ${dataInicio} a ${dataFim}`],[],h,...r,[],tot])
      ws['!cols'] = [12,25,16,18,12,12,12,12,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '⏳ Falta Receber')
    }

    // ── 8. DESPESAS / SAÍDAS ──
    if (expFiltV.length > 0) {
      const h = ['Descrição','Categoria','Data','Valor','Fornecedor','Vendedor']
      const r = expFiltV.map(e => [e.descricao||'', e.categoria||'', fmtDateD(e.data), e.valor||0, e.fornecedor||'', e.vendedor_nome||''])
      const tot = ['TOTAL','','',expFiltV.reduce((s,e)=>s+(e.valor||0),0),'','']
      const ws = XLSX.utils.aoa_to_sheet([[`DESPESAS / SAÍDAS — ${dataInicio} a ${dataFim}`],[],h,...r,[],tot])
      ws['!cols'] = [30,18,12,12,22,18].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '💸 Despesas')
    }

    // ── 9. POR VENDEDOR ──
    if (isAdmin) {
      const hV = ['Vendedor','Email','Faturas Criadas','Pagas','Parcial','Em Atraso','Total Vendido','Total Recebido','Ticket Médio','Conversão %','Comissão %','Comissão $']
      const rV = vendedores.map(v => {
        const uid = v.uid||v.id
        const fats = invoices.filter(i => i.vendedor_id === uid)
        const pagas = fats.filter(i => i.status==='pago')
        const parciais = fats.filter(i => i.status==='parcial')
        const atras = fats.filter(i => !['pago','cancelado'].includes(i.status))
        const recTotal = pagas.reduce((s,i)=>s+(i.valor_pago||i.total||0),0) + parciais.reduce((s,i)=>s+(i.valor_pago||0),0)
        const vendTotal = fats.reduce((s,i)=>s+(i.total||0),0)
        const ticket = pagas.length > 0 ? recTotal/pagas.length : 0
        const conv = fats.length > 0 ? (pagas.length/fats.length*100) : 0
        const pctCom = v.comissao_percentual||10
        const subtotal = pagas.reduce((s,i)=>s+(i.subtotal||(i.total||0)-(i.taxa_envio||0)),0)
        const comissao = subtotal * pctCom / 100
        return [v.nome||'', v.email||'', fats.length, pagas.length, parciais.length, atras.length, vendTotal, recTotal, ticket, conv.toFixed(1)+'%', pctCom+'%', comissao]
      })
      const ws = XLSX.utils.aoa_to_sheet([[`RELATÓRIO POR VENDEDOR — ${dataInicio} a ${dataFim}`],[],hV,...rV])
      ws['!cols'] = [20,25,14,10,10,10,14,14,12,12,10,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '👤 Vendedores')
    }

    // ── 10. ORÇAMENTOS ──
    if (estimates.length > 0) {
      const h = ['Nº','Cliente','Vendedor','Data','Validade','Status','Total','Convertido em Fatura']
      const r = estimates.map(e => [e.numero||'', e.cliente_nome||'', e.vendedor_nome||'Admin', fmtDateD(e.data_emissao), fmtDateD(e.data_validade), e.status||'', e.total||0, e.invoice_gerado||''])
      const ws = XLSX.utils.aoa_to_sheet([[`ORÇAMENTOS — ${dataInicio} a ${dataFim}`],[],h,...r])
      ws['!cols'] = [12,25,18,12,12,12,12,14].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, ws, '📋 Orçamentos')
    }

    // ── 11. ITENS / PRODUTOS DE CADA FATURA ──
    {
      const hIt = ['Nº Fatura','Cliente','Vendedor','Data Emissão','Status Fatura','Produto','Qtd','Preço Unit','Total Item']
      const rIt: any[] = []
      invFiltV.forEach(i => {
        const itens: any[] = i.items || i.itens || []
        if (itens.length === 0) {
          rIt.push([i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin', fmtDateD(i.data_emissao), i.status||'', '—', '', '', ''])
        } else {
          itens.forEach((it: any) => {
            rIt.push([
              i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin',
              fmtDateD(i.data_emissao), i.status||'',
              it.produto_nome || it.descricao || it.nome || '',
              it.quantidade || it.qty || 1,
              it.preco || it.price || it.valor_unitario || 0,
              (it.quantidade || it.qty || 1) * (it.preco || it.price || it.valor_unitario || 0),
            ])
          })
        }
      })
      const wsIt = XLSX.utils.aoa_to_sheet([[`ITENS POR FATURA — ${dataInicio} a ${dataFim}`],[],hIt,...rIt])
      wsIt['!cols'] = [12,25,18,12,12,30,8,12,12].map(w=>({wch:w}))
      XLSX.utils.book_append_sheet(wb, wsIt, '🛍️ Itens por Fatura')
    }

    XLSX.writeFile(wb, `bbvic_relatorio_premium_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório premium exportado com sucesso!')
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const tabs = [
    { id:'visao', label:'Visão Geral', icon:BarChart2 },
    { id:'detalhado', label:'Detalhado', icon:FileText },
    { id:'vendas', label:'Vendas', icon:Receipt },
    { id:'despesas', label:'Despesas', icon:TrendingDown },
    { id:'estoque', label:'Estoque', icon:Package },
    ...(isAdmin ? [
      { id:'vendedores', label:'Vendedores', icon:Users },
      { id:'clientes', label:'Clientes', icon:Users },
      { id:'auditoria', label:'Auditoria', icon:Activity },
      { id:'tax', label:'Tax Report', icon:Receipt },
      { id:'shipping', label:'Shipping Report', icon:Truck },
      { id:'pagamentos', label:'Pagamentos', icon:CreditCard },
      { id:'porproduto', label:'Por Produto', icon:ShoppingBag },
    ] : []),
  ] as const

  const periodoLabel = (() => {
    if (dataInicio === dataFim) return new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')
    return `${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} – ${new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR')}`
  })()

  const cardCls = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-5'
  const thCls = 'text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3'
  const tdCls = 'px-4 py-3 text-sm text-gray-700'

  const statusBadge = (s: string) => {
    const map: Record<string,string> = { pago:'bg-green-100 text-green-700', enviado:'bg-blue-100 text-blue-700', pendente:'bg-yellow-100 text-yellow-700', atrasado:'bg-red-100 text-red-700', parcial:'bg-purple-100 text-purple-700', cancelado:'bg-gray-100 text-gray-500', aprovado:'bg-green-100 text-green-700', recusado:'bg-red-100 text-red-700' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s]||'bg-gray-100 text-gray-500'}`}>{s}</span>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios</h1>
          <p className="text-gray-500 text-sm">Período: {periodoLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportGeral} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">
            <Download className="w-4 h-4"/> Exportar Geral
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">Período</span>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">De:</span>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#6F2738]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Até:</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#6F2738]" />
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { label: 'Hoje', fn: () => { const t = new Date().toISOString().split('T')[0]; setDataInicio(t); setDataFim(t) } },
            { label: '7 dias', fn: () => { const t = new Date(); const s = new Date(t); s.setDate(s.getDate()-6); setDataInicio(s.toISOString().split('T')[0]); setDataFim(t.toISOString().split('T')[0]) } },
            { label: 'Mês atual', fn: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); setDataInicio(s.toISOString().split('T')[0]); setDataFim(t.toISOString().split('T')[0]) } },
            { label: 'Mês ant.', fn: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth()-1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); setDataInicio(s.toISOString().split('T')[0]); setDataFim(e.toISOString().split('T')[0]) } },
            { label: 'Este ano', fn: () => { const t = new Date(); const s = new Date(t.getFullYear(), 0, 1); setDataInicio(s.toISOString().split('T')[0]); setDataFim(t.toISOString().split('T')[0]) } },
          ].map(btn => (
            <button key={btn.label} onClick={btn.fn}
              className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 hover:bg-[#6F2738] hover:text-white hover:border-[#6F2738] transition">
              {btn.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">{periodoLabel}</span>
        {/* Filtro por Vendedor */}
        {isAdmin && vendedores.length > 0 && (
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={filtroVendedor}
              onChange={e => setFiltroVendedor(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:border-[#6F2738]"
            >
              <option value="todos">Todos os Vendedores</option>
              {vendedores.map(v => <option key={v.uid||v.id} value={v.uid||v.id}>{v.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id as any)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab===t.id?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4"/>{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <>
          {/* ── VISÃO GERAL ── */}
          {tab==='visao' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label:'Receita do Período', value:fmt(receitaFaturas), icon:TrendingUp, color:'text-green-600', bg:'bg-green-100' },
                  { label:'Despesas', value:fmt(totalDespesas), icon:TrendingDown, color:'text-red-500', bg:'bg-red-100' },
                  { label:'Lucro Líquido', value:fmt(lucroLiquido), icon:DollarSign, color:lucroLiquido>=0?'text-green-600':'text-red-500', bg:lucroLiquido>=0?'bg-green-100':'bg-red-100' },
                  { label:'A Receber', value:fmt(aReceber), icon:Receipt, color:'text-blue-600', bg:'bg-blue-100' },
                ].map(c => (
                  <div key={c.label} className={cardCls}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{c.label}</span>
                      <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}><c.icon className={`w-4 h-4 ${c.color}`}/></div>
                    </div>
                    <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Linha 2: Faturas, Ticket Médio, Margem, Estoque */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Faturas do Período</span>
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Receipt className="w-4 h-4 text-gray-500"/></div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
                  <p className="text-xs text-gray-400 mt-1">{invoices.filter(i=>i.status==='pago').length} pagas · {faturasAtrasadas.length} atrasadas</p>
                </div>
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ticket Médio</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Target className="w-4 h-4 text-amber-600"/></div>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{fmt(ticketMedio)}</p>
                  <p className="text-xs text-gray-400 mt-1">{faturasValidas.length} faturas no período</p>
                </div>
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Margem Líquida</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lucroLiquido>=0?'bg-green-100':'bg-red-100'}`}><DollarSign className={`w-4 h-4 ${lucroLiquido>=0?'text-green-600':'text-red-500'}`}/></div>
                  </div>
                  <p className={`text-2xl font-bold ${lucroLiquido>=0?'text-green-600':'text-red-500'}`}>
                    {receitaFaturas>0 ? `${((lucroLiquido/receitaFaturas)*100).toFixed(1)}%` : '0%'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Receita: {fmt(receitaFaturas)}</p>
                </div>
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Valor em Estoque</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Package className="w-4 h-4 text-blue-600"/></div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{fmt(valorEstoque)}</p>
                  <p className="text-xs text-gray-400 mt-1">Lucro potencial: {fmt(lucroEstoque)}</p>
                </div>
              </div>

              {/* Produtos Mais Vendidos + Vendas por Vendedor */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Produtos Mais Vendidos */}
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#6F2738]"/>
                      <p className="text-sm font-semibold text-gray-900">Produtos Mais Vendidos</p>
                    </div>
                    <button onClick={exportProdutosMaisVendidos} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                      <Download className="w-3 h-3"/> Excel
                    </button>
                  </div>
                  {rankingProdutos.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                      <p className="text-gray-400 text-sm">Nenhuma venda com produtos neste período</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rankingProdutos.map((p, i) => {
                        const maxQtd = rankingProdutos[0].quantidade
                        const pct = maxQtd > 0 ? (p.quantidade / maxQtd) * 100 : 0
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-sm w-6 flex-shrink-0 text-center">{medals[i] || <span className="text-xs text-gray-400 font-bold">#{i+1}</span>}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-800 truncate">{p.nome}</span>
                                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{p.quantidade} un</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-[#6F2738]" style={{ width: `${pct}%` }}/>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-green-600 flex-shrink-0">{fmt(p.receita)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Vendas por Vendedor */}
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500"/>
                      <p className="text-sm font-semibold text-gray-900">Vendas por Vendedor</p>
                    </div>
                    <button onClick={exportVendedores} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                      <Download className="w-3 h-3"/> Excel
                    </button>
                  </div>
                  {resumoVendedores.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                      <p className="text-gray-400 text-sm">Nenhum vendedor neste período</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {resumoVendedores.slice(0,6).map((v, i) => {
                        const maxRec = resumoVendedores[0].receita
                        const pct = maxRec > 0 ? (v.receita / maxRec) * 100 : 0
                        return (
                          <div key={v.id} className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-bold text-blue-600">{i+1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-800 truncate">{v.nome||'—'}</span>
                                <span className="text-xs font-semibold text-green-600 flex-shrink-0 ml-2">{fmt(v.receita)}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                                <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${pct}%` }}/>
                              </div>
                              <div className="flex gap-3 text-xs text-gray-400">
                                <span>{v.faturas} faturas</span>
                                <span>Ticket: {fmt(v.ticketMedio)}</span>
                                <span>Conv: {v.conversao.toFixed(0)}%</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {faturasAtrasadas.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-700 mb-2"><AlertCircle className="w-4 h-4"/><span className="font-semibold text-sm">{faturasAtrasadas.length} fatura(s) em atraso</span></div>
                  <div className="space-y-1">
                    {faturasAtrasadas.slice(0,5).map(f => (
                      <div key={f.id} className="flex justify-between text-sm text-red-600">
                        <span>{f.cliente_nome||'—'} · {f.numero}</span>
                        <span className="font-semibold">{fmt(f.total||0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── VENDAS ── */}
          {tab==='vendas' && (
            <div className="space-y-4">
              {/* Métricas rápidas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total Faturas</p><p className="text-2xl font-bold text-gray-900">{invoices.length}</p></div>
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Receita Realizada</p><p className="text-2xl font-bold text-green-600">{fmt(receitaFaturas)}</p></div>
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Ticket Médio</p><p className="text-2xl font-bold text-amber-600">{fmt(ticketMedio)}</p></div>
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Orçamentos</p><p className="text-2xl font-bold text-gray-900">{estimates.length}</p></div>
              </div>

              {/* Produtos mais vendidos neste período */}
              {rankingProdutos.length > 0 && (
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#6F2738]"/>
                      <p className="text-sm font-semibold text-gray-900">Produtos Mais Vendidos no Período</p>
                    </div>
                    <button onClick={exportProdutosMaisVendidos} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700"><Download className="w-3 h-3"/> Exportar</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-gray-100">{['#','Produto','Qtd Vendida','Receita Total'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {rankingProdutos.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className={tdCls}>
                              <span className="font-bold text-gray-500">{['🥇','🥈','🥉'][i] || `#${i+1}`}</span>
                            </td>
                            <td className={`${tdCls} font-medium text-gray-900`}>{p.nome}</td>
                            <td className={`${tdCls} text-center font-bold text-[#6F2738]`}>{p.quantidade}</td>
                            <td className={`${tdCls} font-semibold text-green-600`}>{fmt(p.receita)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{invoices.length} faturas · {estimates.length} orçamentos em {periodoLabel}</p>
                <button onClick={exportGeral} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar Completo</button>
              </div>
              <div className={cardCls}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Faturas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key:'todos',    label:'Todas',      cls:'bg-gray-100 text-gray-700' },
                      { key:'pago',     label:'Pagas',      cls:'bg-green-100 text-green-700' },
                      { key:'parcial',  label:'Pago Parcial', cls:'bg-purple-100 text-purple-700' },
                      { key:'atrasado', label:'Em Atraso',  cls:'bg-red-100 text-red-700' },
                      { key:'enviado',  label:'Enviadas',   cls:'bg-blue-100 text-blue-700' },
                      { key:'pendente', label:'Pendentes',  cls:'bg-yellow-100 text-yellow-700' },
                      { key:'rascunho', label:'Rascunho',   cls:'bg-gray-100 text-gray-500' },
                    ].map(f => (
                      <button key={f.key}
                        onClick={()=>setStatusFiltroFat(f.key)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                          statusFiltroFat===f.key
                            ? `${f.cls} border-current shadow`
                            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                        }`}>
                        {f.label}
                        {f.key==='todos' ? ` (${invoices.length})` :
                         f.key==='pago' ? ` (${invoices.filter(x=>x.status==='pago').length})` :
                         f.key==='parcial' ? ` (${invoices.filter(x=>x.status==='parcial').length})` :
                         f.key==='atrasado' ? ` (${invoices.filter(x=>{
                           if(['pago','cancelado'].includes(x.status)) return false
                           const venc = x.data_vencimento?.toDate ? x.data_vencimento.toDate() : x.data_vencimento ? new Date(x.data_vencimento) : null
                           return venc && venc < new Date()
                         }).length})` :
                         ` (${invoices.filter(x=>x.status===f.key).length})`
                        }
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const hoje = new Date()
                  const isAtrasado = (inv: any) => {
                    if (['pago','cancelado'].includes(inv.status)) return false
                    const venc = inv.data_vencimento?.toDate ? inv.data_vencimento.toDate() : inv.data_vencimento ? new Date(inv.data_vencimento) : null
                    return venc && venc < hoje
                  }
                  const getValorPago = (inv: any) => {
                    if (inv.status === 'pago') {
                      return inv.valor_pago && inv.valor_pago > 0
                        ? inv.valor_pago
                        : (inv.total || 0) - (inv.desconto || 0)
                    }
                    if (inv.status === 'parcial') return inv.valor_pago || 0
                    return 0
                  }
                  const fatFiltradas = statusFiltroFat === 'todos' ? invoices
                    : statusFiltroFat === 'atrasado' ? invoices.filter(isAtrasado)
                    : invoices.filter(i => i.status === statusFiltroFat)

                  const totalGeral   = fatFiltradas.reduce((s,i) => s+(i.total||0), 0)
                  const totalPago    = fatFiltradas.reduce((s,i) => s+getValorPago(i), 0)
                  const totalPendente= fatFiltradas.reduce((s,i) => s+Math.max(0,(i.total||0)-getValorPago(i)), 0)

                  return (
                    <>
                      {/* Totais rápidos */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-400 uppercase font-semibold">Total</p>
                          <p className="text-lg font-bold text-gray-800">{fmt(totalGeral)}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-green-600 uppercase font-semibold">Pago</p>
                          <p className="text-lg font-bold text-green-700">{fmt(totalPago)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-amber-600 uppercase font-semibold">Pendente</p>
                          <p className="text-lg font-bold text-amber-700">{fmt(totalPendente)}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {['Nº','Cliente','Vendedor','Data','Vencimento','Status','Total','Desconto','Pago','Pendente'].map(h =>
                                <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {fatFiltradas.length===0
                              ? <tr><td colSpan={10} className="text-center py-8 text-gray-400 text-sm">Nenhuma fatura encontrada</td></tr>
                              : fatFiltradas.map(i => {
                                  const vp = getValorPago(i)
                                  const pendente = Math.max(0, (i.total||0) - vp)
                                  return (
                                    <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>navigate(`/invoices/${i.id}`)}>
                                      <td className={tdCls}>{i.numero||'—'}</td>
                                      <td className={`${tdCls} font-medium text-gray-900`}>{i.cliente_nome||'—'}</td>
                                      <td className={tdCls}>{i.vendedor_nome||'Admin'}</td>
                                      <td className={tdCls}>{fmtDate(i.data_emissao)}</td>
                                      <td className={tdCls}>{fmtDate(i.data_vencimento)}</td>
                                      <td className={tdCls}>{statusBadge(i.status)}</td>
                                      <td className={`${tdCls} font-semibold`}>{fmt(i.total||0)}</td>
                                      <td className={`${tdCls} text-red-500`}>{(i.desconto||0)>0 ? `-${fmt(i.desconto)}` : '—'}</td>
                                      <td className={`${tdCls} font-bold text-green-600`}>{vp>0 ? fmt(vp) : '—'}</td>
                                      <td className={`${tdCls} font-semibold ${pendente>0?'text-amber-600':'text-gray-300'}`}>
                                        {pendente>0 ? fmt(pendente) : '—'}
                                      </td>
                                    </tr>
                                  )
                                })
                            }
                          </tbody>
                          {fatFiltradas.length>0 && (
                            <tfoot>
                              <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold text-sm">
                                <td colSpan={6} className="px-3 py-2 text-gray-600 text-right">TOTAL ({fatFiltradas.length} fatura{fatFiltradas.length!==1?'s':''})</td>
                                <td className="px-3 py-2 text-gray-800">{fmt(totalGeral)}</td>
                                <td className="px-3 py-2 text-red-600">{totalGeral-fatFiltradas.reduce((s,i)=>s+(i.desconto||0),0)<totalGeral ? `-${fmt(fatFiltradas.reduce((s,i)=>s+(i.desconto||0),0))}` : '—'}</td>
                                <td className="px-3 py-2 text-green-700">{fmt(totalPago)}</td>
                                <td className={`px-3 py-2 ${totalPendente>0?'text-amber-700':'text-gray-400'}`}>{totalPendente>0?fmt(totalPendente):'—'}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className={cardCls}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Orçamentos</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Nº','Cliente','Vendedor','Data','Status','Total'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {estimates.length===0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Nenhum orçamento neste período</td></tr> :
                      estimates.map(e => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className={tdCls}>{e.numero||'—'}</td>
                          <td className={tdCls}>{e.cliente_nome||'—'}</td>
                          <td className={tdCls}>{e.vendedor_nome||'Admin'}</td>
                          <td className={tdCls}>{fmtDate(e.data_emissao)}</td>
                          <td className={tdCls}>{statusBadge(e.status)}</td>
                          <td className={`${tdCls} font-semibold`}>{fmt(e.total||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── DETALHADO ── */}
          {tab==='detalhado' && (() => {
            const cats = [
              { id:'vendido',   label:'Vendido',          cor:'blue',   icon:'💰', valor:totalVendido,        qtd:fatVendidas.length,        desc:'Todas as faturas criadas no período' },
              { id:'recebido',  label:'Recebido',         cor:'green',  icon:'✅', valor:totalPago,            qtd:fatPagas.length+fatParcial.length, desc:'Valores efetivamente recebidos' },
              { id:'parcial',   label:'Pago Parcial',     cor:'yellow', icon:'💛', valor:totalParcial,         qtd:fatParcial.length,         desc:'Faturas com pagamento parcial' },
              { id:'parcelado', label:'Parcelado',        cor:'purple', icon:'📅', valor:fatParceladas.reduce((s,i)=>s+(i.total||0),0), qtd:fatParceladas.length, desc:'Faturas com pagamento parcelado' },
              { id:'atrasado',  label:'Em Atraso',        cor:'red',    icon:'🔴', valor:totalAtrasado,        qtd:fatAtrasadas.length,       desc:'Parcelas ou faturas vencidas e não pagas' },
              { id:'falta',     label:'Falta Receber',    cor:'amber',  icon:'⏳', valor:totalFaltaPagar,      qtd:fatFaltaPagar.length,      desc:'Saldo ainda pendente de receber' },
              { id:'despesas',  label:'Saídas/Despesas',  cor:'rose',   icon:'💸', valor:totalSaidaDespesas,   qtd:expFiltV.length,           desc:'Todas as despesas no período' },
              { id:'lucro',     label:'Lucro Estimado',   cor:'teal',   icon:'📈', valor:totalPago-totalSaidaDespesas, qtd:0,               desc:'Recebido menos despesas' },
            ]
            const corMap: Record<string,string> = {
              blue:'border-blue-200 bg-blue-50 text-blue-700', green:'border-green-200 bg-green-50 text-green-700',
              yellow:'border-yellow-200 bg-yellow-50 text-yellow-700', purple:'border-purple-200 bg-purple-50 text-purple-700',
              red:'border-red-200 bg-red-50 text-red-700', amber:'border-amber-200 bg-amber-50 text-amber-700',
              rose:'border-rose-200 bg-rose-50 text-rose-700', teal:'border-teal-200 bg-teal-50 text-teal-700',
            }
            const getFaturasCat = (id: string) => {
              if (id==='vendido') return fatVendidas
              if (id==='recebido') return [...fatPagas, ...fatParcial]
              if (id==='parcial') return fatParcial
              if (id==='parcelado') return fatParceladas
              if (id==='atrasado') return fatAtrasadas
              if (id==='falta') return fatFaltaPagar
              return []
            }
            const catAtiva = cats.find(c => c.id === detalhadoCategoria)
            const fatsCat = detalhadoCategoria && detalhadoCategoria !== 'despesas' && detalhadoCategoria !== 'lucro' ? getFaturasCat(detalhadoCategoria) : []
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Clique em uma categoria para ver as faturas</p>
                  <button onClick={exportGeral} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white text-sm font-semibold hover:bg-[#4A1A26]">
                    <Download className="w-4 h-4"/> Exportar Completo
                  </button>
                </div>
                {/* Cards de categorias */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {cats.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setDetalhadoCategoria(detalhadoCategoria === c.id ? null : c.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all ${detalhadoCategoria === c.id ? corMap[c.cor]+' shadow-md scale-[1.02]' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-lg">{c.icon}</span>
                        {detalhadoCategoria === c.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.label}</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(c.valor)}</p>
                      {c.qtd > 0 && <p className="text-xs text-gray-400">{c.qtd} item{c.qtd!==1?'s':''}</p>}
                      <p className="text-xs text-gray-400 mt-1 leading-tight">{c.desc}</p>
                    </button>
                  ))}
                </div>

                {/* ── FATURAS GERADAS NO PERÍODO ─────────────────────────── */}
                {(() => {
                  // Faturas criadas dentro do período selecionado (usa data_emissao / created_at)
                  const geradas = invoices.filter((i: any) => {
                    const ds = i.data_emissao || i.created_at || i.createdAt || i.data_criacao
                    return ds && dateInRangeDetalhado(ds)
                  }).sort((a: any, b: any) => {
                    const da = toYMDDetalhado(a.data_emissao || a.created_at || a.createdAt) || ''
                    const db = toYMDDetalhado(b.data_emissao || b.created_at || b.createdAt) || ''
                    return da.localeCompare(db)
                  })
                  const totalGeradas = geradas.reduce((s: number, i: any) => s + (i.total || 0), 0)
                  return (
                    <div className="rounded-2xl border-2 border-blue-100 bg-white overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100">
                        <div>
                          <p className="font-bold text-blue-800 text-sm">📋 Faturas Geradas no Período</p>
                          <p className="text-xs text-blue-500">{geradas.length} fatura{geradas.length !== 1 ? 's' : ''} criadas — Total: <span className="font-bold">{fmt(totalGeradas)}</span></p>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        {geradas.length === 0 ? (
                          <p className="text-center text-gray-400 py-6 text-sm">Nenhuma fatura gerada neste período</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 sticky top-0">
                                {['Nº','Cliente','Vendedor','Data Gerada','Vencimento','Status','Total'].map(h => <th key={h} className={thCls}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {geradas.map((i: any) => (
                                <tr key={i.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => navigate(`/invoices/${i.id}`)}>
                                  <td className={`${tdCls} font-mono text-xs`}>{i.numero || '—'}</td>
                                  <td className={`${tdCls} font-medium`}>{i.cliente_nome || '—'}</td>
                                  <td className={tdCls}>{i.vendedor_nome || 'Admin'}</td>
                                  <td className={tdCls}>{fmtDate(i.data_emissao || i.created_at || i.createdAt)}</td>
                                  <td className={tdCls}>{fmtDate(i.data_vencimento)}</td>
                                  <td className={tdCls}>{statusBadge(i.status)}</td>
                                  <td className={`${tdCls} font-bold text-blue-700`}>{fmt(i.total || 0)}</td>
                                </tr>
                              ))}
                              <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                                <td colSpan={6} className="px-3 py-2 text-right text-blue-700">TOTAL ({geradas.length})</td>
                                <td className="px-3 py-2 text-blue-800">{fmt(totalGeradas)}</td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── PAGAMENTOS RECEBIDOS NO PERÍODO ─────────────────────── */}
                {(() => {
                  // Pagamentos: faturas com data_pagamento dentro do período
                  const pgtos = invoices.filter((i: any) => {
                    if (!i.data_pagamento) return false
                    return dateInRangeDetalhado(i.data_pagamento)
                  }).sort((a: any, b: any) => {
                    const da = toYMDDetalhado(a.data_pagamento) || ''
                    const db = toYMDDetalhado(b.data_pagamento) || ''
                    return da.localeCompare(db)
                  })

                  // Formas de pagamento — agrupa e soma
                  const formasMap: Record<string, { total: number; qtd: number }> = {}
                  pgtos.forEach((i: any) => {
                    const forma = i.forma_pagamento || 'Não informado'
                    const vp = i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (i.total || 0)
                    if (!formasMap[forma]) formasMap[forma] = { total: 0, qtd: 0 }
                    formasMap[forma].total += vp
                    formasMap[forma].qtd += 1
                  })
                  const formas = Object.entries(formasMap).sort((a, b) => b[1].total - a[1].total)
                  const totalRecebidoDia = pgtos.reduce((s: number, i: any) => s + (i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (i.total || 0)), 0)

                  return (
                    <div className="rounded-2xl border-2 border-green-100 bg-white overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-green-50 border-b border-green-100">
                        <div>
                          <p className="font-bold text-green-800 text-sm">💳 Pagamentos Recebidos no Período</p>
                          <p className="text-xs text-green-600">{pgtos.length} pagamento{pgtos.length !== 1 ? 's' : ''} — Total Recebido: <span className="font-bold">{fmt(totalRecebidoDia)}</span></p>
                        </div>
                      </div>

                      {/* Formas de pagamento */}
                      {formas.length > 0 && (
                        <div className="px-5 py-3 border-b border-green-100 bg-green-50/40">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formas de Pagamento</p>
                          <div className="flex flex-wrap gap-2">
                            {formas.map(([forma, dados]) => (
                              <div key={forma} className="flex items-center gap-2 bg-white border border-green-200 rounded-xl px-3 py-1.5">
                                <span className="text-xs font-semibold text-green-700">{forma}</span>
                                <span className="text-xs text-gray-500">{dados.qtd}x</span>
                                <span className="text-xs font-bold text-green-800">{fmt(dados.total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        {pgtos.length === 0 ? (
                          <p className="text-center text-gray-400 py-6 text-sm">Nenhum pagamento registrado neste período</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 sticky top-0">
                                {['Nº','Cliente','Vendedor','Data Pgto','Forma','Status','Total Fatura','Valor Pago'].map(h => <th key={h} className={thCls}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {pgtos.map((i: any) => {
                                const vp = i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (i.total || 0)
                                return (
                                  <tr key={i.id} className="hover:bg-green-50 cursor-pointer" onClick={() => navigate(`/invoices/${i.id}`)}>
                                    <td className={`${tdCls} font-mono text-xs`}>{i.numero || '—'}</td>
                                    <td className={`${tdCls} font-medium`}>{i.cliente_nome || '—'}</td>
                                    <td className={tdCls}>{i.vendedor_nome || 'Admin'}</td>
                                    <td className={tdCls}>{fmtDate(i.data_pagamento)}</td>
                                    <td className={tdCls}>
                                      <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        {i.forma_pagamento || '—'}
                                      </span>
                                    </td>
                                    <td className={tdCls}>{statusBadge(i.status)}</td>
                                    <td className={tdCls}>{fmt(i.total || 0)}</td>
                                    <td className={`${tdCls} font-bold text-green-700`}>{fmt(vp)}</td>
                                  </tr>
                                )
                              })}
                              <tr className="bg-green-50 font-bold border-t-2 border-green-200">
                                <td colSpan={7} className="px-3 py-2 text-right text-green-700">TOTAL RECEBIDO ({pgtos.length})</td>
                                <td className="px-3 py-2 text-green-800">{fmt(totalRecebidoDia)}</td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )
                })()}


                {detalhadoCategoria && catAtiva && (
                  <div className={`rounded-2xl border-2 ${corMap[catAtiva.cor]} overflow-hidden`}>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-current/20">
                      <p className="font-bold text-sm">{catAtiva.icon} {catAtiva.label} — {fatsCat.length > 0 ? `${fatsCat.length} fatura${fatsCat.length!==1?'s':''}` : detalhadoCategoria==='despesas' ? `${expFiltV.length} despesa${expFiltV.length!==1?'s':''}` : ''} — Total: {fmt(catAtiva.valor)}</p>
                      <button onClick={() => setDetalhadoCategoria(null)}><X className="w-4 h-4" /></button>
                    </div>
                    <div className="bg-white overflow-x-auto max-h-96 overflow-y-auto">
                      {detalhadoCategoria === 'despesas' ? (
                        <table className="w-full text-sm">
                          <thead><tr className="bg-gray-50 border-b border-gray-100">{['Descrição','Categoria','Data','Valor'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {expFiltV.map(e => (
                              <tr key={e.id} className="hover:bg-gray-50">
                                <td className={tdCls}>{e.descricao||'—'}</td>
                                <td className={tdCls}>{e.categoria||'Outros'}</td>
                                <td className={tdCls}>{fmtDate(e.data)}</td>
                                <td className={`${tdCls} font-bold text-red-600`}>{fmt(e.valor||0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : detalhadoCategoria === 'lucro' ? (
                        <div className="p-6 text-center text-gray-500">
                          <p className="text-2xl font-bold text-teal-600">{fmt(totalPago-totalSaidaDespesas)}</p>
                          <p className="text-sm mt-1">Recebido ({fmt(totalPago)}) − Despesas ({fmt(totalSaidaDespesas)})</p>
                        </div>
                      ) : detalhadoCategoria === 'parcelado' ? (
                        <table className="w-full text-sm">
                          <thead><tr className="bg-gray-50 border-b border-gray-100">{['Nº','Cliente','Vendedor','Total','Parcelas','Pagas','Pendentes','Próx. Vcto'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {fatsCat.map(i => {
                              const parc = i.parcelas||[]
                              const pagas = parc.filter((p:any)=>p.status==='pago').length
                              const proxima = parc.filter((p:any)=>p.status!=='pago').sort((a:any,b:any)=>new Date(parseDate(a.data_vencimento??a.data)||0).getTime()-new Date(parseDate(b.data_vencimento??b.data)||0).getTime())[0]
                              return (
                                <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>navigate(`/invoices/${i.id}`)}>
                                  <td className={tdCls}>{i.numero||'—'}</td>
                                  <td className={`${tdCls} font-medium`}>{i.cliente_nome||'—'}</td>
                                  <td className={tdCls}>{i.vendedor_nome||'Admin'}</td>
                                  <td className={`${tdCls} font-semibold`}>{fmt(i.total||0)}</td>
                                  <td className={tdCls}>{parc.length}</td>
                                  <td className={`${tdCls} text-green-600`}>{pagas}</td>
                                  <td className={`${tdCls} text-amber-600`}>{parc.length-pagas}</td>
                                  <td className={tdCls}>{proxima ? fmtDate(proxima.data_vencimento??proxima.data) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              {['Nº','Cliente','Vendedor','Data Emissão','Vencimento','Status','Total','Pago','Falta'].map(h=><th key={h} className={thCls}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {fatsCat.map(i => {
                              const vp = i.status==='pago' ? (i.valor_pago||i.total||0) : (i.valor_pago||0)
                              const falta = Math.max(0,(i.total||0)-vp)
                              return (
                                <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>navigate(`/invoices/${i.id}`)}>
                                  <td className={tdCls}>{i.numero||'—'}</td>
                                  <td className={`${tdCls} font-medium`}>{i.cliente_nome||'—'}</td>
                                  <td className={tdCls}>{i.vendedor_nome||'Admin'}</td>
                                  <td className={tdCls}>{fmtDate(i.data_emissao)}</td>
                                  <td className={tdCls}>{fmtDate(i.data_vencimento)}</td>
                                  <td className={tdCls}>{statusBadge(i.status)}</td>
                                  <td className={`${tdCls} font-semibold`}>{fmt(i.total||0)}</td>
                                  <td className={`${tdCls} font-bold text-green-600`}>{vp>0?fmt(vp):'—'}</td>
                                  <td className={`${tdCls} font-semibold ${falta>0?'text-amber-600':'text-gray-300'}`}>{falta>0?fmt(falta):'—'}</td>
                                </tr>
                              )
                            })}
                            {fatsCat.length > 0 && (
                              <tr className="bg-gray-50 font-bold text-sm border-t-2 border-gray-200">
                                <td colSpan={6} className="px-3 py-2 text-right text-gray-600">TOTAL ({fatsCat.length})</td>
                                <td className="px-3 py-2">{fmt(fatsCat.reduce((s,i)=>s+(i.total||0),0))}</td>
                                <td className="px-3 py-2 text-green-700">{fmt(fatsCat.reduce((s,i)=>s+(i.status==='pago'?(i.valor_pago||i.total||0):(i.valor_pago||0)),0))}</td>
                                <td className="px-3 py-2 text-amber-700">{fmt(fatsCat.reduce((s,i)=>s+Math.max(0,(i.total||0)-(i.status==='pago'?(i.valor_pago||i.total||0):(i.valor_pago||0))),0))}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* Por vendedor (admin) */}
                {isAdmin && filtroVendedor === 'todos' && vendedores.length > 0 && (
                  <div className={cardCls}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📊 Resumo por Vendedor</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-100">{['Vendedor','Faturas','Pagas','Parcial','Em Atraso','Total Vendido','Recebido','Comissão Est.'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {vendedores.map(v => {
                            const uid = v.uid||v.id
                            const fats = invoices.filter(i => i.vendedor_id === uid)
                            const pagas = fats.filter(i=>i.status==='pago')
                            const parciais = fats.filter(i=>i.status==='parcial')
                            const atras = fats.filter(i=>!['pago','cancelado'].includes(i.status))
                            const recTotal = pagas.reduce((s,i)=>s+(i.valor_pago||i.total||0),0)+parciais.reduce((s,i)=>s+(i.valor_pago||0),0)
                            const vendTotal = fats.reduce((s,i)=>s+(i.total||0),0)
                            const pctCom = v.comissao_percentual||10
                            const subtotal = pagas.reduce((s,i)=>s+(i.subtotal||(i.total||0)-((i as any).taxa_envio||0)),0)
                            return (
                              <tr key={uid} className="hover:bg-gray-50 cursor-pointer" onClick={()=>setFiltroVendedor(uid)}>
                                <td className={`${tdCls} font-medium`}>{v.nome}</td>
                                <td className={tdCls}>{fats.length}</td>
                                <td className={`${tdCls} text-green-600`}>{pagas.length}</td>
                                <td className={`${tdCls} text-yellow-600`}>{parciais.length}</td>
                                <td className={`${tdCls} text-red-600`}>{atras.length}</td>
                                <td className={`${tdCls} font-semibold`}>{fmt(vendTotal)}</td>
                                <td className={`${tdCls} font-bold text-green-700`}>{fmt(recTotal)}</td>
                                <td className={`${tdCls} text-[#6F2738] font-semibold`}>{fmt(subtotal*pctCom/100)} ({pctCom}%)</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── DESPESAS ── */}
          {tab==='despesas' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{expenses.length} despesas · {fmt(totalDespesas)} total</p>
                <button onClick={exportDespesas} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>
              <div className={cardCls}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Despesas do Mês</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Descrição','Categoria','Data','Valor'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {expenses.length===0 ? <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">Nenhuma despesa neste período</td></tr> :
                      expenses.map(e => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className={tdCls}>{e.descricao||'—'}</td>
                          <td className={tdCls}><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{e.categoria||'Outros'}</span></td>
                          <td className={tdCls}>{fmtDate(e.data)}</td>
                          <td className={`${tdCls} font-semibold text-red-600`}>{fmt(e.valor||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {isAdmin && contasPagar.length > 0 && (
                <div className={cardCls}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contas a Pagar</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-gray-100">{['Descrição','Fornecedor','Vencimento','Valor','Status'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {contasPagar.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className={tdCls}>{c.descricao||'—'}</td>
                            <td className={tdCls}>{c.fornecedor||'—'}</td>
                            <td className={tdCls}>{fmtDate(c.data_vencimento)}</td>
                            <td className={`${tdCls} font-semibold`}>{fmt(c.valor||0)}</td>
                            <td className={tdCls}>{statusBadge(c.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ESTOQUE ── */}
          {tab==='estoque' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{produtos.length} produtos · valor: {fmt(valorEstoque)}</p>
                <button onClick={exportEstoque} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Valor em Estoque</p><p className="text-2xl font-bold text-gray-900">{fmt(valorEstoque)}</p></div>
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Lucro Potencial</p><p className="text-2xl font-bold text-green-700">{fmt(lucroEstoque)}</p></div>
                <div className={cardCls}><p className="text-xs text-gray-400 uppercase font-semibold mb-1">Baixo Estoque</p><p className="text-2xl font-bold text-red-500">{baixoEstoque.length}</p></div>
              </div>
              <div className={cardCls}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Produto','Categoria','Estoque','Mínimo','Status','Preço Venda','Margem'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {produtos.map(p => {
                        const baixo = (p.estoque||0)<=(p.estoque_minimo||0)
                        return (
                          <tr key={p.id} className={`hover:bg-gray-50 ${baixo?'bg-red-50/30':''}`}>
                            <td className={`${tdCls} font-medium text-gray-900`}>{p.nome}</td>
                            <td className={tdCls}>{p.categoria||'—'}</td>
                            <td className={`${tdCls} font-bold text-center ${baixo?'text-red-500':'text-gray-900'}`}>{p.estoque||0}</td>
                            <td className={`${tdCls} text-center text-gray-400`}>{p.estoque_minimo||0}</td>
                            <td className={tdCls}>{baixo?<span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">Baixo</span>:<span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Normal</span>}</td>
                            <td className={`${tdCls} font-semibold text-[#6F2738]`}>{fmt(p.preco||0)}</td>
                            <td className={`${tdCls} font-semibold ${(p.margem_lucro||0)>=30?'text-green-600':(p.margem_lucro||0)>=15?'text-amber-600':'text-red-500'}`}>{(p.margem_lucro||0).toFixed(1)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── VENDEDORES ── */}
          {tab==='vendedores' && isAdmin && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{vendedores.length} vendedores ativos</p>
                <button onClick={exportVendedores} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>
              {/* Cards de ranking */}
              {resumoVendedores.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {resumoVendedores.slice(0,3).map((v, i) => (
                    <div key={v.id} className={`${cardCls} ${i===0?'border-amber-300 bg-amber-50/30':''}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${i===0?'bg-amber-100':i===1?'bg-gray-100':'bg-orange-100'}`}>
                          {['🥇','🥈','🥉'][i]}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{v.nome||'—'}</p>
                          <p className="text-xs text-gray-400">{v.email||''}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-gray-400">Receita</p><p className="font-bold text-green-600">{fmt(v.receita)}</p></div>
                        <div><p className="text-gray-400">Ticket Médio</p><p className="font-bold text-amber-600">{fmt(v.ticketMedio)}</p></div>
                        <div><p className="text-gray-400">Faturas</p><p className="font-bold text-gray-700">{v.faturas}</p></div>
                        <div><p className="text-gray-400">Conversão</p><p className="font-bold text-blue-600">{v.conversao.toFixed(0)}%</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={cardCls}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Vendedor','Email','Faturas','Receita','Ticket Médio','Orçamentos','Conversão'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {resumoVendedores.length===0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhum vendedor cadastrado</td></tr> :
                      resumoVendedores.map(v => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className={`${tdCls} font-medium text-gray-900`}>{v.nome||'—'}</td>
                          <td className={tdCls}>{v.email||'—'}</td>
                          <td className={`${tdCls} text-center`}>{v.faturas}</td>
                          <td className={`${tdCls} font-semibold text-green-600`}>{fmt(v.receita)}</td>
                          <td className={`${tdCls} font-semibold text-amber-600`}>{fmt(v.ticketMedio)}</td>
                          <td className={`${tdCls} text-center`}>{v.orcamentos}</td>
                          <td className={`${tdCls} text-center`}>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.conversao>=50?'bg-green-100 text-green-700':v.conversao>=20?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                              {v.conversao.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── CLIENTES ── */}
          {tab==='clientes' && isAdmin && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{clientes.length} clientes cadastrados</p>
                <button onClick={exportClientes} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>
              <div className={cardCls}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Nome','Email','Telefone','Cidade','Estado'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {clientes.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>navigate(`/clientes/${c.id}`)}>
                          <td className={`${tdCls} font-medium text-gray-900`}>{c.nome||'—'}</td>
                          <td className={tdCls}>{c.email||'—'}</td>
                          <td className={tdCls}>{c.telefone||'—'}</td>
                          <td className={tdCls}>{c.cidade||'—'}</td>
                          <td className={tdCls}>{c.estado||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── AUDITORIA ── */}
          {tab==='auditoria' && isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Histórico de Atividades do Sistema</p>
                  <p className="text-xs text-gray-400 mt-0.5">Todas as ações realizadas por usuários são registradas aqui para auditoria</p>
                </div>
                <button onClick={exportAudit} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>

              {/* Filtros */}
              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                  <input
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    placeholder="Buscar por ação, usuário ou detalhe..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-gray-400"/>
                  <div className="flex gap-1 flex-wrap">
                    {(['todos','login','fatura','orcamento','cliente','produto','estoque','pagamento','vendedor','compra'] as const).map(tipo => (
                      <button
                        key={tipo}
                        onClick={() => setAuditTipoFiltro(tipo)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${auditTipoFiltro === tipo ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {tipo === 'todos' ? 'Todos' : auditTipoLabel[tipo]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={cardCls}>
                {loadingAudit ? (
                  <div className="flex justify-center p-10"><div className="w-6 h-6 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>
                ) : auditFiltrado.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                    <p className="text-gray-500 text-sm">Nenhuma atividade encontrada</p>
                    <p className="text-gray-400 text-xs mt-1">As ações realizadas no sistema aparecerão aqui automaticamente</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {['Data/Hora','Usuário','Tipo','Ação','Detalhes'].map(h => <th key={h} className={thCls}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {auditFiltrado.map(a => {
                            const dt = a.created_at?.toDate ? a.created_at.toDate() : new Date()
                            return (
                              <tr key={a.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <p className="text-sm text-gray-700">{dt.toLocaleDateString('pt-BR')}</p>
                                  <p className="text-xs text-gray-400">{dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                                      <User className="w-3 h-3 text-gray-500"/>
                                    </div>
                                    <span className="text-sm text-gray-600">{a.usuario_email||'sistema'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${auditTipoCls[a.tipo]||'bg-gray-100 text-gray-600'}`}>
                                    {auditTipoLabel[a.tipo]||a.tipo||'Geral'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-800">{a.acao||'—'}</td>
                                <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{a.detalhes||'—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-gray-100">
                      {auditFiltrado.map(a => {
                        const dt = a.created_at?.toDate ? a.created_at.toDate() : new Date()
                        return (
                          <div key={a.id} className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${auditTipoCls[a.tipo]||'bg-gray-100 text-gray-600'}`}>
                                  {auditTipoLabel[a.tipo]||a.tipo}
                                </span>
                                <span className="text-sm font-medium text-gray-800">{a.acao||'—'}</span>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0">{dt.toLocaleDateString('pt-BR')}</span>
                            </div>
                            <p className="text-xs text-gray-500">{a.detalhes||''}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{a.usuario_email||'sistema'} · {dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>
                          </div>
                        )
                      })}
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <p className="text-xs text-gray-400">{auditFiltrado.length} registro{auditFiltrado.length!==1?'s':''} encontrado{auditFiltrado.length!==1?'s':''}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {tab==='tax' && (
            <div className="space-y-6">
              {/* Cards resumo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Tax Coletado</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(invoices.reduce((s,f)=>s+(f.taxa||0),0))}</p>
                  <p className="text-xs text-gray-400 mt-1">de {invoices.filter(f=>(f.taxa||0)>0).length} faturas com tax</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Faturas com Tax</p>
                  <p className="text-2xl font-bold text-blue-600">{invoices.filter(f=>(f.taxa||0)>0).length}</p>
                  <p className="text-xs text-gray-400 mt-1">de {invoices.length} faturas no período</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Média Tax por Fatura</p>
                  <p className="text-2xl font-bold text-purple-600">{fmt(invoices.filter(f=>(f.taxa||0)>0).length > 0 ? invoices.reduce((s,f)=>s+(f.taxa||0),0)/invoices.filter(f=>(f.taxa||0)>0).length : 0)}</p>
                  <p className="text-xs text-gray-400 mt-1">por fatura com tax</p>
                </div>
              </div>

              {/* Tabela detalhada */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Detalhamento de Tax por Fatura</h3>
                  <button onClick={() => {
                    const rows = [["Fatura","Cliente","Data","Subtotal","Tax %","Tax $","Total"]]
                    invoices.filter(f=>(f.taxa||0)>0).forEach(f=>{
                      const sub = (f.itens||[]).reduce((s:number,i:any)=>s+(i.quantidade*i.valor_unitario),0)
                      const pct = sub>0 ? ((f.taxa/sub)*100).toFixed(2)+'%' : '—'
                      rows.push([f.numero_fatura||f.id, f.cliente_nome||'—', f.data_criacao?.toDate ? f.data_criacao.toDate().toLocaleDateString('pt-BR') : '—', sub, pct, f.taxa, f.total||0])
                    })
                    rows.push(['','','','','TOTAL TAX:', invoices.reduce((s,f)=>s+(f.taxa||0),0), ''])
                    const ws = XLSX.utils.aoa_to_sheet(rows)
                    ws['!cols'] = [15,25,12,12,8,12,12].map(w=>({wch:w}))
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, 'Tax Report')
                    XLSX.writeFile(wb, `tax_report_${dataInicio}_${dataFim}.xlsx`)
                    toast.success('Tax Report exportado!')
                  }} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                    <Download className="w-4 h-4"/>Exportar Excel
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Fatura</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-right">Tax %</th>
                        <th className="px-4 py-3 text-right font-bold text-green-700">Tax $</th>
                        <th className="px-4 py-3 text-right">Total Fatura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.filter(f=>(f.taxa||0)>0).length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhuma fatura com tax no período</td></tr>
                      ) : invoices.filter(f=>(f.taxa||0)>0).map(f => {
                        const sub = (f.itens||[]).reduce((s:number,i:any)=>s+(i.quantidade*i.valor_unitario),0)
                        const pct = sub>0 ? ((f.taxa/sub)*100).toFixed(2)+'%' : '—'
                        return (
                          <tr key={f.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{f.numero_fatura||f.id?.slice(0,8)}</td>
                            <td className="px-4 py-3 font-medium">{f.cliente_nome||'—'}</td>
                            <td className="px-4 py-3 text-gray-500">{f.data_criacao?.toDate ? f.data_criacao.toDate().toLocaleDateString('pt-BR') : '—'}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmt(sub)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pct}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(f.taxa)}</td>
                            <td className="px-4 py-3 text-right font-medium">{fmt(f.total||0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-green-50 border-t-2 border-green-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 font-bold text-green-800">TOTAL TAX A REPASSAR AO GOVERNO</td>
                        <td className="px-4 py-3 text-right font-bold text-green-800 text-lg">{fmt(invoices.reduce((s,f)=>s+(f.taxa||0),0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==='shipping' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Shipping Coletado</p>
                  <p className="text-2xl font-bold text-blue-600">{fmt(invoices.reduce((s:number,f:any)=>s+(f.taxa_envio||0),0))}</p>
                  <p className="text-xs text-gray-400 mt-1">de {invoices.filter((f:any)=>(f.taxa_envio||0)>0).length} faturas com envio</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Faturas com Envio</p>
                  <p className="text-2xl font-bold text-purple-600">{invoices.filter((f:any)=>(f.taxa_envio||0)>0).length}</p>
                  <p className="text-xs text-gray-400 mt-1">de {invoices.length} faturas no período</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Média Shipping por Fatura</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(invoices.filter((f:any)=>(f.taxa_envio||0)>0).length>0 ? invoices.reduce((s:number,f:any)=>s+(f.taxa_envio||0),0)/invoices.filter((f:any)=>(f.taxa_envio||0)>0).length : 0)}</p>
                  <p className="text-xs text-gray-400 mt-1">por fatura com envio</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Detalhamento de Envio por Fatura</h3>
                  <button onClick={() => {
                    const rows = [["Fatura","Cliente","Data","Subtotal","Shipping $","Total"]]
                    invoices.filter((f:any)=>(f.taxa_envio||0)>0).forEach((f:any)=>{
                      const sub = (f.itens||[]).reduce((s:number,i:any)=>s+(i.quantidade*i.valor_unitario),0)
                      rows.push([f.numero_fatura||f.id, f.cliente_nome||"—", f.data_criacao?.toDate ? f.data_criacao.toDate().toLocaleDateString("pt-BR") : "—", sub, f.taxa_envio||0, f.total||0])
                    })
                    rows.push(["","","","","TOTAL SHIPPING:", invoices.reduce((s:number,f:any)=>s+(f.taxa_envio||0),0)])
                    const ws = XLSX.utils.aoa_to_sheet(rows)
                    ws["!cols"] = [15,25,12,12,12,12].map(w=>({wch:w}))
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, "Shipping Report")
                    XLSX.writeFile(wb, `shipping_report_${dataInicio}_${dataFim}.xlsx`)
                    toast.success("Shipping Report exportado!")
                  }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                    <Download className="w-4 h-4"/>Exportar Excel
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Fatura</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-right font-bold text-blue-700">Shipping $</th>
                        <th className="px-4 py-3 text-right">Total Fatura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.filter((f:any)=>(f.taxa_envio||0)>0).length===0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhuma fatura com envio no período</td></tr>
                      ) : invoices.filter((f:any)=>(f.taxa_envio||0)>0).map((f:any) => {
                        const sub = (f.itens||[]).reduce((s:number,i:any)=>s+(i.quantidade*i.valor_unitario),0)
                        return (
                          <tr key={f.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{f.numero_fatura||f.id?.slice(0,8)}</td>
                            <td className="px-4 py-3 font-medium">{f.cliente_nome||"—"}</td>
                            <td className="px-4 py-3 text-gray-500">{f.data_criacao?.toDate ? f.data_criacao.toDate().toLocaleDateString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmt(sub)}</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(f.taxa_envio||0)}</td>
                            <td className="px-4 py-3 text-right font-medium">{fmt(f.total||0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 font-bold text-blue-800">TOTAL SHIPPING COLETADO</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-800 text-lg">{fmt(invoices.reduce((s:number,f:any)=>s+(f.taxa_envio||0),0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==='pagamentos' && (() => {
            const pgtos = invoices.filter((f:any)=>f.forma_pagamento_recebido||(f.valor_pago||0)>0||(f.status==='pago'))
            // Para cada fatura calcula: valor pago, tax proporcional
            // tax_proporcional = (valor_pago / total) * taxa
            const calcTaxProp = (f:any) => {
              const total = f.total || 0
              const pago = f.valor_pago || (f.status==='pago' ? total : 0)
              const taxa = f.taxa || 0
              if (total <= 0 || taxa <= 0) return 0
              return (pago / total) * taxa
            }
            const totalPago = pgtos.reduce((s:number,f:any)=>s+(f.valor_pago||(f.status==='pago'?f.total:0)||0),0)
            const totalTaxProp = pgtos.reduce((s:number,f:any)=>s+calcTaxProp(f),0)
            const totalSemTax = totalPago - totalTaxProp
            return (
              <div className="space-y-6">
                {/* Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Recebido</p>
                    <p className="text-2xl font-bold text-green-600">{fmt(totalPago)}</p>
                    <p className="text-xs text-gray-400 mt-1">{pgtos.length} pagamento(s)</p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tax a Repassar</p>
                    <p className="text-2xl font-bold text-red-500">{fmt(totalTaxProp)}</p>
                    <p className="text-xs text-gray-400 mt-1">proporcional ao recebido</p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Receita Líquida</p>
                    <p className="text-2xl font-bold text-blue-600">{fmt(totalSemTax)}</p>
                    <p className="text-xs text-gray-400 mt-1">sem imposto</p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Métodos Usados</p>
                    <p className="text-2xl font-bold text-purple-600">{new Set(pgtos.filter((f:any)=>f.forma_pagamento_recebido).map((f:any)=>f.forma_pagamento_recebido)).size}</p>
                    <p className="text-xs text-gray-400 mt-1">formas de pagamento</p>
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">Detalhamento — Pagamentos + Tax Proporcional</h3>
                    <button onClick={() => {
                      const rows = [['Fatura','Cliente','Data Pgto','Forma','Sub-opção/Conta','Valor Total Fatura','Valor Pago','Tax Total Fatura','Tax Proporcional Pago','Receita Líquida','Observação']]
                      pgtos.forEach((f:any)=>{
                        const total = f.total||0
                        const pago = f.valor_pago||(f.status==='pago'?total:0)||0
                        const taxa = f.taxa||0
                        const taxProp = total>0 && taxa>0 ? (pago/total)*taxa : 0
                        const liquido = pago - taxProp
                        rows.push([
                          f.numero_fatura||f.id,
                          f.cliente_nome||'—',
                          f.data_pagamento?.toDate ? f.data_pagamento.toDate().toLocaleDateString('pt-BR') : '—',
                          f.forma_pagamento_recebido||'—',
                          f.forma_pagamento_sub||'—',
                          total, pago, taxa, +taxProp.toFixed(2), +liquido.toFixed(2),
                          f.observacao_pagamento||''
                        ])
                      })
                      rows.push(['','','','','TOTAIS:',
                        pgtos.reduce((s:number,f:any)=>s+(f.total||0),0),
                        totalPago,
                        pgtos.reduce((s:number,f:any)=>s+(f.taxa||0),0),
                        +totalTaxProp.toFixed(2),
                        +totalSemTax.toFixed(2),
                        ''
                      ])
                      const ws = XLSX.utils.aoa_to_sheet(rows)
                      ws['!cols'] = [15,25,12,12,16,14,12,14,18,14,25].map(w=>({wch:w}))
                      // Destacar colunas de tax em amarelo
                      const range = XLSX.utils.decode_range(ws['!ref']||'A1')
                      for (let r = 1; r <= range.e.r; r++) {
                        ['H','I'].forEach(col => {
                          const cell = ws[col+(r+1)]
                          if (cell) cell.s = { fill:{ fgColor:{ rgb:'FFFDE7' } }, font:{ bold: r===range.e.r } }
                        })
                      }
                      const wb = XLSX.utils.book_new()
                      XLSX.utils.book_append_sheet(wb, ws, 'Pagamentos + Tax')
                      XLSX.writeFile(wb, `pagamentos_tax_${dataInicio}_${dataFim}.xlsx`)
                      toast.success('Planilha exportada com tax!')
                    }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                      <Download className="w-4 h-4"/>Exportar Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-3 text-left">Fatura</th>
                          <th className="px-3 py-3 text-left">Cliente</th>
                          <th className="px-3 py-3 text-left">Data Pgto</th>
                          <th className="px-3 py-3 text-left">Forma / Conta</th>
                          <th className="px-3 py-3 text-right">Valor Pago</th>
                          <th className="px-3 py-3 text-right bg-yellow-50">Tax Total</th>
                          <th className="px-3 py-3 text-right bg-yellow-50">Tax Prop. Pago</th>
                          <th className="px-3 py-3 text-right">Rec. Líquida</th>
                          <th className="px-3 py-3 text-left">Obs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pgtos.length===0 ? (
                          <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhum pagamento registrado no período</td></tr>
                        ) : pgtos.map((f:any)=>{
                          const total = f.total||0
                          const pago = f.valor_pago||(f.status==='pago'?total:0)||0
                          const taxa = f.taxa||0
                          const taxProp = total>0 && taxa>0 ? (pago/total)*taxa : 0
                          const isParcial = pago < total && pago > 0
                          return (
                            <tr key={f.id} className="hover:bg-gray-50">
                              <td className="px-3 py-3 font-mono text-xs text-gray-500">{f.numero_fatura||f.id?.slice(0,8)}</td>
                              <td className="px-3 py-3 font-medium">
                                {f.cliente_nome||'—'}
                                {isParcial && <span className="ml-1 text-xs text-orange-500 font-normal">(parcial)</span>}
                              </td>
                              <td className="px-3 py-3 text-gray-500 text-xs">{f.data_pagamento?.toDate ? f.data_pagamento.toDate().toLocaleDateString('pt-BR') : '—'}</td>
                              <td className="px-3 py-3">
                                {f.forma_pagamento_recebido ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{f.forma_pagamento_recebido}</span> : <span className="text-gray-300">—</span>}
                                {f.forma_pagamento_sub && <span className="ml-1 text-xs text-gray-400">↳ {f.forma_pagamento_sub}</span>}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-green-700">{fmt(pago)}</td>
                              <td className="px-3 py-3 text-right text-orange-600 bg-yellow-50 text-xs">{taxa>0 ? fmt(taxa) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-3 text-right font-semibold text-red-600 bg-yellow-50">{taxProp>0 ? fmt(taxProp) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-3 text-right font-medium text-blue-700">{fmt(pago - taxProp)}</td>
                              <td className="px-3 py-3 text-xs text-gray-400">{f.observacao_pagamento||''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-gray-100 border-t-2 border-gray-300 text-sm font-bold">
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-gray-800">TOTAIS</td>
                          <td className="px-3 py-3 text-right text-green-700">{fmt(totalPago)}</td>
                          <td className="px-3 py-3 text-right text-orange-600 bg-yellow-100">{fmt(pgtos.reduce((s:number,f:any)=>s+(f.taxa||0),0))}</td>
                          <td className="px-3 py-3 text-right text-red-600 bg-yellow-100">{fmt(totalTaxProp)}</td>
                          <td className="px-3 py-3 text-right text-blue-700">{fmt(totalSemTax)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Resumo por forma */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800">Resumo por Forma de Pagamento</h3>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {Array.from(new Set(pgtos.filter((f:any)=>f.forma_pagamento_recebido).map((f:any)=>f.forma_pagamento_recebido))).map((forma:any)=>{
                      const grupo = pgtos.filter((f:any)=>f.forma_pagamento_recebido===forma)
                      const totalGrupo = grupo.reduce((s:number,f:any)=>s+(f.valor_pago||(f.status==='pago'?f.total:0)||0),0)
                      const taxGrupo = grupo.reduce((s:number,f:any)=>s+calcTaxProp(f),0)
                      const subGrupos = Array.from(new Set(grupo.filter((f:any)=>f.forma_pagamento_sub).map((f:any)=>f.forma_pagamento_sub)))
                      return (
                        <div key={forma} className="border border-gray-100 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-800">{forma}</span>
                            <span className="font-bold text-green-600">{fmt(totalGrupo)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-red-500 mb-2">
                            <span>Tax proporcional:</span><span>{fmt(taxGrupo)}</span>
                          </div>
                          <p className="text-xs text-gray-400 mb-1">{grupo.length} pagamento(s)</p>
                          {subGrupos.length>0 && (
                            <div className="space-y-0.5">
                              {subGrupos.map((sub:any)=>{
                                const st = grupo.filter((f:any)=>f.forma_pagamento_sub===sub).reduce((s:number,f:any)=>s+(f.valor_pago||(f.status==='pago'?f.total:0)||0),0)
                                return <div key={sub} className="flex justify-between text-xs text-gray-500"><span>↳ {sub}</span><span>{fmt(st)}</span></div>
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
          {tab==='porproduto' && (() => {
            const todosItens: any[] = []
            invoices.forEach((f:any) => {
              const itArr: any[] = f.items || f.itens || []
              itArr.forEach((i:any) => {
                const nome = (i.produto_nome || i.descricao || i.nome || '').trim()
                if (!nome) return
                const valorUnit = i.preco_unitario || i.preco || i.preco_venda || i.valor_unitario || 0
                const qtd = i.quantidade || 1
                todosItens.push({ nome, quantidade: qtd, valorUnit, total: valorUnit*qtd, fatura: f.numero_fatura||f.id?.slice(0,8), faturaId: f.id, cliente: f.cliente_nome||'—', data: f.data_criacao?.toDate ? f.data_criacao.toDate().toLocaleDateString('pt-BR') : f.data_emissao?.toDate ? f.data_emissao.toDate().toLocaleDateString('pt-BR') : '—', status: f.status||'—' })
              })
            })
            const produtosMap: Record<string,{qtd:number,receita:number,clientes:Set<string>,itens:any[]}> = {}
            todosItens.forEach(it => {
              if (!produtosMap[it.nome]) produtosMap[it.nome] = { qtd:0, receita:0, clientes:new Set(), itens:[] }
              produtosMap[it.nome].qtd += it.quantidade
              produtosMap[it.nome].receita += it.total
              produtosMap[it.nome].clientes.add(it.cliente)
              produtosMap[it.nome].itens.push(it)
            })
            const produtosList = Object.entries(produtosMap).sort((a,b)=>b[1].receita-a[1].receita)
            const filtrado = produtoFiltro.length > 1
              ? produtosList.filter(([nome])=>nome.toLowerCase().includes(produtoFiltro.toLowerCase()))
              : produtosList
            const totalGeralReceita = filtrado.reduce((s,[,v])=>s+v.receita,0)
            const totalGeralQtd = filtrado.reduce((s,[,v])=>s+v.qtd,0)
            return (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Filtrar por produto <span className="text-gray-400 font-normal">(deixe em branco para ver todos)</span></label>
                  <input type="text" value={produtoFiltro} onChange={e => setProdutoFiltro(e.target.value)}
                    placeholder="Ex: Shampoo Total Repair..."
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Produtos Diferentes</p>
                    <p className="text-2xl font-bold text-blue-600">{filtrado.length}</p>
                    <p className="text-xs text-gray-400 mt-1">no período selecionado</p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Qtd Total Vendida</p>
                    <p className="text-2xl font-bold text-purple-600">{totalGeralQtd}</p>
                    <p className="text-xs text-gray-400 mt-1">unidades</p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Receita Total</p>
                    <p className="text-2xl font-bold text-green-600">{fmt(totalGeralReceita)}</p>
                    <p className="text-xs text-gray-400 mt-1">dos produtos filtrados</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">
                      {produtoFiltro.length > 1 ? <><span className="text-blue-600">{produtoFiltro}</span></> : 'Todos os Produtos Vendidos no Período'}
                    </h3>
                    <button onClick={()=>{
                      const rows = [['Produto','Cliente','Fatura','Data','Qtd','Preço Unit','Total','Status']]
                      filtrado.forEach(([nome,v])=>{ v.itens.forEach((it:any)=>{ rows.push([nome,it.cliente,it.fatura,it.data,it.quantidade,it.valorUnit,it.total,it.status]) }) })
                      const ws = XLSX.utils.aoa_to_sheet(rows)
                      ws['!cols'] = [30,25,15,12,8,12,12,12].map(w=>({wch:w}))
                      const wb = XLSX.utils.book_new()
                      XLSX.utils.book_append_sheet(wb, ws, 'Por Produto')
                      XLSX.writeFile(wb, `produtos_${dataInicio}_${dataFim}.xlsx`)
                      toast.success('Exportado!')
                    }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                      <Download className="w-4 h-4"/>Exportar Excel
                    </button>
                  </div>
                  {filtrado.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-400">
                      <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-200"/>
                      <p>{invoices.length === 0 ? 'Nenhuma fatura no período selecionado' : 'Nenhum produto encontrado'}</p>
                    </div>
                  ) : filtrado.map(([nome, v]) => (
                    <details key={nome} className="border-b border-gray-100 last:border-0 group">
                      <summary className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 list-none">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <ShoppingBag className="w-4 h-4 text-blue-400 flex-shrink-0"/>
                          <span className="font-medium text-gray-800 truncate">{nome}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{v.clientes.size} cliente(s)</span>
                        </div>
                        <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                          <div className="text-right"><p className="text-xs text-gray-400">Qtd</p><p className="font-bold text-purple-600">{v.qtd}</p></div>
                          <div className="text-right"><p className="text-xs text-gray-400">Receita</p><p className="font-bold text-green-600">{fmt(v.receita)}</p></div>
                          <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform"/>
                        </div>
                      </summary>
                      <div className="overflow-x-auto bg-gray-50 border-t border-gray-100">
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-gray-400 uppercase">
                            <th className="px-6 py-2 text-left">Cliente</th>
                            <th className="px-6 py-2 text-left">Fatura</th>
                            <th className="px-6 py-2 text-left">Data</th>
                            <th className="px-6 py-2 text-center">Qtd</th>
                            <th className="px-6 py-2 text-right">Preço Unit</th>
                            <th className="px-6 py-2 text-right">Total</th>
                            <th className="px-6 py-2 text-left">Status</th>
                          </tr></thead>
                          <tbody className="divide-y divide-gray-100">
                            {v.itens.map((it:any, idx:number) => (
                              <tr key={idx} className="hover:bg-white">
                                <td className="px-6 py-2 font-medium text-gray-800">{it.cliente}</td>
                                <td className="px-6 py-2 font-mono text-xs text-gray-400">{it.fatura}</td>
                                <td className="px-6 py-2 text-gray-500">{it.data}</td>
                                <td className="px-6 py-2 text-center font-semibold text-purple-600">{it.quantidade}</td>
                                <td className="px-6 py-2 text-right text-gray-600">{fmt(it.valorUnit)}</td>
                                <td className="px-6 py-2 text-right font-bold text-green-700">{fmt(it.total)}</td>
                                <td className="px-6 py-2 text-gray-500">{it.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                  {filtrado.length > 0 && (
                    <div className="px-6 py-3 bg-blue-50 border-t-2 border-blue-200 flex justify-between items-center">
                      <span className="font-bold text-blue-800">{filtrado.length} produto(s) · {totalGeralQtd} unid.</span>
                      <span className="font-bold text-green-700 text-lg">{fmt(totalGeralReceita)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

        </>
      )}
    </div>
  )
}
