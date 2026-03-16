import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, Timestamp, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  Receipt, Download, BarChart2, AlertCircle, Activity,
  ShoppingCart, Award, Target, User, Search, Filter
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
  const [tab, setTab] = useState<'visao'|'vendas'|'despesas'|'estoque'|'vendedores'|'clientes'|'auditoria'>('visao')

  const [invoices, setInvoices] = useState<any[]>([])
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

  useEffect(() => { fetchAll() }, [dataInicio, dataFim, user, isAdmin])
  useEffect(() => { if (tab === 'auditoria') fetchAudit() }, [tab])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const inicio = new Date(dataInicio + 'T00:00:00')
      const fim = new Date(dataFim + 'T23:59:59')
      const tsIni = Timestamp.fromDate(inicio)
      const tsFim = Timestamp.fromDate(fim)

      const adminQ = (col: string, field: string) =>
        query(collection(db, col), where(field, '>=', tsIni), where(field, '<=', tsFim))
      const vendQ = (col: string, field: string) =>
        query(collection(db, col), where('vendedor_id', '==', user?.uid), where(field, '>=', tsIni), where(field, '<=', tsFim))

      const [invSnap, estSnap, expSnap, prodSnap, cliSnap, vendSnap, cpSnap] = await Promise.all([
        getDocs(isAdmin ? adminQ('invoices','data_emissao') : vendQ('invoices','data_emissao')),
        getDocs(isAdmin ? adminQ('estimates','data_emissao') : vendQ('estimates','data_emissao')),
        getDocs(isAdmin ? adminQ('expenses','data') : vendQ('expenses','data')),
        getDocs(query(collection(db,'produtos'), where('ativo','==',true))),
        getDocs(collection(db,'clientes')),
        isAdmin ? getDocs(query(collection(db,'users'), where('role','==','vendedor'))) : Promise.resolve({ docs: [] } as any),
        isAdmin ? getDocs(adminQ('contas_pagar','data_emissao')) : Promise.resolve({ docs: [] } as any),
      ])

      setInvoices(invSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setEstimates(estSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setExpenses(expSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setProdutos(prodSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setClientes(cliSnap.docs.map(d => ({ id:d.id,...d.data() })))
      setVendedores(vendSnap.docs.map((d:any) => ({ ...d.data(), id: d.id, uid: d.id })))
      setContasPagar(cpSnap.docs.map((d:any) => ({ id:d.id,...d.data() })))
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

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  const receitaFaturas = invoices.filter(i => ['pago','parcial'].includes(i.status)).reduce((s,i) => {
    if (i.status === 'pago') {
      return s + (i.total - (i.desconto || 0))
    }
    return s + (i.valor_pago || 0)
  }, 0)
  const totalDespesas = expenses.reduce((s,e) => s + (e.valor || 0), 0)
  const totalContasPagar = contasPagar.reduce((s,c) => s + (c.valor || 0), 0)
  const lucroLiquido = receitaFaturas - totalDespesas
  const aReceber = invoices.filter(i => ['enviado','pendente'].includes(i.status)).reduce((s,i) => s + (i.total||0), 0)
  const faturasAtrasadas = invoices.filter(i => {
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

  // ── EXPORT FUNCTIONS ───────────────────────────────────────────────────────
  const exportVendas = () => {
    const wb = XLSX.utils.book_new()
    const hFat = ['Nº','Cliente','Vendedor','Data Emissão','Vencimento','Status','Total','Pago']
    const rFat = invoices.map(i => [i.numero||'', i.cliente_nome||'', i.vendedor_nome||'Admin', fmtDate(i.data_emissao), fmtDate(i.data_vencimento), i.status, i.total||0, i.valor_pago||0])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hFat,...rFat]), 'Faturas')
    const hOrc = ['Nº','Cliente','Vendedor','Data','Status','Total']
    const rOrc = estimates.map(e => [e.numero||'', e.cliente_nome||'', e.vendedor_nome||'Admin', fmtDate(e.data_emissao), e.status, e.total||0])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hOrc,...rOrc]), 'Orçamentos')
    XLSX.writeFile(wb, `relatorio_vendas_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório de vendas exportado!')
  }

  const exportDespesas = () => {
    const wb = XLSX.utils.book_new()
    const h = ['Descrição','Categoria','Data','Valor','Fornecedor']
    const r = expenses.map(e => [e.descricao||'', e.categoria||'', fmtDate(e.data), e.valor||0, e.fornecedor||''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Despesas')
    const hCP = ['Descrição','Fornecedor','Vencimento','Valor','Status']
    const rCP = contasPagar.map(c => [c.descricao||'', c.fornecedor||'', fmtDate(c.data_vencimento), c.valor||0, c.status||''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hCP,...rCP]), 'Contas a Pagar')
    XLSX.writeFile(wb, `relatorio_despesas_${dataInicio}_${dataFim}.xlsx`)
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h,...r]), 'Estoque')
    XLSX.writeFile(wb, `relatorio_estoque_${dataInicio}_${dataFim}.xlsx`)
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
    const pl = [
      ['BBVIC GESTÃO - RELATÓRIO GERAL',''],
      ['Período', periodoLabel],['',''],
      ['RECEITAS',''],
      ['Faturas Pagas / Parciais', receitaFaturas],
      ['A Receber', aReceber],
      ['Ticket Médio', ticketMedio.toFixed(2)],
      ['TOTAL RECEITAS', receitaFaturas],['',''],
      ['DESPESAS',''],
      ['Total Despesas', totalDespesas],
      ['Total Contas a Pagar', totalContasPagar],['',''],
      ['LUCRO LÍQUIDO', lucroLiquido],
      ['Margem Líquida', receitaFaturas>0 ? `${((lucroLiquido/receitaFaturas)*100).toFixed(1)}%` : '0%'],['',''],
      ['ESTOQUE',''],
      ['Valor Total (Venda)', valorEstoque],
      ['Lucro Potencial', lucroEstoque],
      ['Produtos Baixo Estoque', baixoEstoque.length],['',''],
      ['PRODUTOS MAIS VENDIDOS',''],
      ['Posição','Produto','Qtd','Receita'],
      ...rankingProdutos.map((p,i) => [i+1, p.nome, p.quantidade, p.receita.toFixed(2)]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pl), 'Visão Geral')
    XLSX.writeFile(wb, `relatorio_geral_${dataInicio}_${dataFim}.xlsx`)
    toast.success('Relatório geral exportado!')
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const tabs = [
    { id:'visao', label:'Visão Geral', icon:BarChart2 },
    { id:'vendas', label:'Vendas', icon:Receipt },
    { id:'despesas', label:'Despesas', icon:TrendingDown },
    { id:'estoque', label:'Estoque', icon:Package },
    ...(isAdmin ? [
      { id:'vendedores', label:'Vendedores', icon:Users },
      { id:'clientes', label:'Clientes', icon:Users },
      { id:'auditoria', label:'Auditoria', icon:Activity },
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
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#C9A227]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Até:</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#C9A227]" />
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
              className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 hover:bg-[#C9A227] hover:text-white hover:border-[#C9A227] transition">
              {btn.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">{periodoLabel}</span>
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
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>
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
                      <Award className="w-4 h-4 text-[#C9A227]"/>
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
                                <div className="h-1.5 rounded-full bg-[#C9A227]" style={{ width: `${pct}%` }}/>
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
                      <Award className="w-4 h-4 text-[#C9A227]"/>
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
                            <td className={`${tdCls} text-center font-bold text-[#C9A227]`}>{p.quantidade}</td>
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
                <button onClick={exportVendas} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"><Download className="w-4 h-4"/> Exportar</button>
              </div>
              <div className={cardCls}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Faturas</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Nº','Cliente','Vendedor','Data','Vencimento','Status','Total','Pago'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoices.length===0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">Nenhuma fatura neste período</td></tr> :
                      invoices.map(i => (
                        <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>navigate(`/invoices/${i.id}`)}>
                          <td className={tdCls}>{i.numero||'—'}</td>
                          <td className={tdCls}>{i.cliente_nome||'—'}</td>
                          <td className={tdCls}>{i.vendedor_nome||'Admin'}</td>
                          <td className={tdCls}>{fmtDate(i.data_emissao)}</td>
                          <td className={tdCls}>{fmtDate(i.data_vencimento)}</td>
                          <td className={tdCls}>{statusBadge(i.status)}</td>
                          <td className={`${tdCls} font-semibold`}>{fmt(i.total||0)}</td>
                          <td className={`${tdCls} text-green-600`}>{fmt(i.valor_pago||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                            <td className={`${tdCls} font-semibold text-[#C9A227]`}>{fmt(p.preco||0)}</td>
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
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"
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
                  <div className="flex justify-center p-10"><div className="w-6 h-6 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>
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
        </>
      )}
    </div>
  )
}
