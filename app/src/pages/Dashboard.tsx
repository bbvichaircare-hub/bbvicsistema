import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { calcularReceitaMes, calcularAReceber, calcularAReceberQtd, calcularAtrasadas, toDateSafe } from '@/lib/kpiUtils'
import { formatCurrency } from "@/lib/utils"
import {
  TrendingUp, TrendingDown, DollarSign, Users, Clock,
  Plus, FileText, AlertCircle, ArrowUpRight, ArrowDownRight,
  Package, ChevronRight, AlertTriangle, Hourglass
} from "lucide-react"

interface KPI {
  receitas: number; despesas: number; lucro: number
  clientesAtivos: number; faturasPendentesValor: number
  faturasPendentesQtd: number; receitasAnterior: number; despesasAnterior: number
  faturasAtrasadasQtd: number; faturasAtrasadasValor: number
  orcamentosAbertosQtd: number
}
interface FaturaReceber { id: string; cliente_nome: string; total: number; data_vencimento: any; status: string; numero: string }
interface OrcamentoAberto { id: string; cliente_nome: string; total: number; data_emissao: any; status: string; numero: string }

export function Dashboard() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<KPI>({
    receitas: 0, despesas: 0, lucro: 0, clientesAtivos: 0,
    faturasPendentesValor: 0, faturasPendentesQtd: 0,
    receitasAnterior: 0, despesasAnterior: 0,
    faturasAtrasadasQtd: 0, faturasAtrasadasValor: 0,
    orcamentosAbertosQtd: 0
  })
  const [faturasReceber, setFaturasReceber] = useState<FaturaReceber[]>([])
  const [faturasAtrasadas, setFaturasAtrasadas] = useState<FaturaReceber[]>([])
  const [orcamentosAbertos, setOrcamentosAbertos] = useState<OrcamentoAberto[]>([])
  const [estoqueBaixo, setEstoqueBaixo] = useState<{ id: string; nome: string; estoque: number; estoque_minimo: number }[]>([])

  const [lembretesModal, setLembretesModal] = useState(false)
  const [atrasadosParaLembrete, setAtrasadosParaLembrete] = useState<any[]>([])
  const [lembreteIdx, setLembreteIdx] = useState(0)

  useEffect(() => { fetchDados() }, [user, isAdmin])

  const toDate = (v: any) => { try { return v?.toDate ? v.toDate() : new Date(v) } catch { return new Date(0) } }

  const fetchDados = async () => {
    try {
      setLoading(true)
      const hoje = new Date(); hoje.setHours(23, 59, 59, 999)
      const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0)
      const mesAtual = hojeInicio.getMonth() + 1
      const anoAtual = hojeInicio.getFullYear()
      const iniMes = new Date(anoAtual, mesAtual - 1, 1)
      const fimMes = new Date(anoAtual, mesAtual, 0, 23, 59, 59)
      const iniAnt = new Date(anoAtual, mesAtual - 2, 1)
      const fimAnt = new Date(anoAtual, mesAtual - 1, 0, 23, 59, 59)

      const invQ = isAdmin ? query(collection(db, "invoices")) : query(collection(db, "invoices"), where("vendedor_id", "==", user?.uid))
      const expQ = isAdmin ? query(collection(db, "expenses")) : query(collection(db, "expenses"), where("vendedor_id", "==", user?.uid))
      const estQ = isAdmin ? query(collection(db, "estimates")) : query(collection(db, "estimates"), where("vendedor_id", "==", user?.uid))
      const cliQ = isAdmin ? query(collection(db, "clientes")) : query(collection(db, "clientes"), where("vendedor_id", "==", user?.uid))

      const [invSnap, expSnap, estSnap, cliSnap] = await Promise.all([
        getDocs(invQ), getDocs(expQ), getDocs(estQ), getDocs(cliQ),
      ])

      const allInvoices  = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      const allExpenses   = expSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      const allEstimates  = estSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

      const inRange = (v: any, s: Date, e: Date) => { try { const d = toDate(v); return d >= s && d <= e } catch { return false } }

      // RECEITAS DO MÊS: calculado sempre diretamente das faturas (única fonte de verdade)
      const rec = calcularReceitaMes(allInvoices, mesAtual, anoAtual)
      const recAnt = calcularReceitaMes(allInvoices, mesAtual === 1 ? 12 : mesAtual - 1, mesAtual === 1 ? anoAtual - 1 : anoAtual)

      // DESPESAS: soma de expenses do mês
      const desp    = allExpenses.filter((e: any) => inRange(e.data || e.created_at, iniMes, fimMes)).reduce((s: number, e: any) => s + (e.valor || 0), 0)
      const despAnt = allExpenses.filter((e: any) => inRange(e.data || e.created_at, iniAnt, fimAnt)).reduce((s: number, e: any) => s + (e.valor || 0), 0)

      // A RECEBER e EM ATRASO: usa kpiUtils (mesma lógica do Faturas)
      const { qtd: qtdAtrasados, valor: valorAtrasados } = calcularAtrasadas(allInvoices)
      const atrasados = allInvoices.filter((i: any) => {
        if (['pago', 'cancelado'].includes(i.status)) return false
        if (!i.data_vencimento) return false
        try {
          const venc = toDateSafe(i.data_vencimento)
          venc.setHours(23, 59, 59, 999)
          return venc < hojeInicio
        } catch { return false }
      })

      setKpi({
        receitas: rec,
        despesas: desp,
        lucro: rec - desp,
        clientesAtivos: cliSnap.size,
        faturasPendentesValor: calcularAReceber(allInvoices),
        faturasPendentesQtd: calcularAReceberQtd(allInvoices),
        receitasAnterior: recAnt,
        despesasAnterior: despAnt,
        faturasAtrasadasQtd: qtdAtrasados,
        faturasAtrasadasValor: valorAtrasados,
        orcamentosAbertosQtd: allEstimates.filter((e: any) => !['aprovado', 'recusado', 'convertido'].includes(e.status)).length,
      })

      const atrasadosOrdenados = [...atrasados].sort((a: any, b: any) => toDate(a.data_vencimento).getTime() - toDate(b.data_vencimento).getTime())
      setFaturasAtrasadas(atrasadosOrdenados.slice(0, 5) as FaturaReceber[])

      setFaturasReceber(
        [...allInvoices].sort((a: any, b: any) => toDate(b.data_emissao ?? b.created_at).getTime() - toDate(a.data_emissao ?? a.created_at).getTime()).slice(0, 8) as FaturaReceber[]
      )
      setOrcamentosAbertos(
        [...allEstimates].filter((e: any) => !['aprovado', 'recusado', 'convertido'].includes(e.status))
          .sort((a: any, b: any) => toDate(b.data_emissao ?? b.created_at).getTime() - toDate(a.data_emissao ?? a.created_at).getTime()).slice(0, 8) as OrcamentoAberto[]
      )

      if (isAdmin) {
        const prodSnap = await getDocs(query(collection(db, "produtos"), where("ativo", "==", true)))
        const baixo = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
          .filter((p: any) => (p.estoque || 0) <= (p.estoque_minimo || 0) && (p.estoque_minimo || 0) > 0).slice(0, 5)
        setEstoqueBaixo(baixo)
      }

      // Auto-lembretes: verificar faturas em atraso sem lembrete hoje
      if (atrasados.length > 0) {
        const hoje_str = new Date().toISOString().split('T')[0]
        const semLembrete = atrasados.filter((i: any) => i.lembrete_enviado !== hoje_str && (i as any).cliente_telefone)
        if (semLembrete.length > 0) {
          setAtrasadosParaLembrete(semLembrete)
          setLembretesModal(true)
        }
      }

    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sendLembreteWA = (inv: any) => {
    const phone = (inv.cliente_telefone || '').replace(/\D/g, '')
    if (!phone) return
    const venc = inv.data_vencimento ? (() => { try { return toDate(inv.data_vencimento).toLocaleDateString('pt-BR') } catch { return '' } })() : ''
    const msg = `Olá ${inv.cliente_nome}! Passando para lembrar que sua fatura ${inv.numero} da BBVIC Hair Care no valor de ${formatCurrency(inv.total)} está em atraso desde ${venc}. Por favor, entre em contato para regularizar. Obrigada!`
    const url = `https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
    document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
  }

  const handleEnviarProximoLembrete = async () => {
    if (lembreteIdx >= atrasadosParaLembrete.length) { setLembretesModal(false); return }
    const inv = atrasadosParaLembrete[lembreteIdx]
    sendLembreteWA(inv)
    // Marcar lembrete enviado hoje no Firestore
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { lembrete_enviado: new Date().toISOString().split('T')[0] })
    } catch { /* silently fail */ }
    setLembreteIdx(prev => prev + 1)
  }

  const trendPct = (atual: number, anterior: number) => anterior === 0 ? null : ((atual - anterior) / anterior) * 100

  const TrendBadge = ({ val, invert = false }: { val: number | null; invert?: boolean }) => {
    if (val === null) return null
    const good = invert ? val <= 0 : val >= 0
    return (
      <span className={`flex items-center gap-0.5 text-xs font-medium ${good ? "text-green-600" : "text-red-500"}`}>
        {good ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(val).toFixed(1)}% vs mês ant.
      </span>
    )
  }

  const statusCls: Record<string, string> = {
    enviado: "bg-blue-100 text-blue-700",
    atrasado: "bg-red-100 text-red-700",
    parcial: "bg-yellow-100 text-yellow-700"
  }

  const vencLabel = (data: any) => {
    if (!data) return "—"
    const d = data?.toDate ? data.toDate() : new Date(data)
    const diff = Math.ceil((d.getTime() - new Date().getTime()) / 86400000)
    if (diff < 0) return <span className="text-red-600 font-medium">{Math.abs(diff)}d atrasado</span>
    if (diff === 0) return <span className="text-orange-500 font-medium">Vence hoje</span>
    return <span className="text-gray-500">Vence em {diff}d</span>
  }

  const margemLucro = kpi.receitas > 0 ? ((kpi.lucro / kpi.receitas) * 100).toFixed(1) : "0"

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5 capitalize">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end sm:justify-start">
          <button onClick={() => navigate("/invoices/novo")} className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl text-white font-medium transition shadow-sm hover:shadow-md" style={{ background: 'linear-gradient(135deg, #C9A227, #9A7B1A)' }}>
            <Plus className="w-4 h-4" /> Nova Fatura
          </button>
          <button onClick={() => navigate("/estimates/novo")} className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition shadow-sm font-medium">
            <FileText className="w-4 h-4" /> Novo Orçamento
          </button>
          <button onClick={() => navigate("/clientes/novo")} className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition shadow-sm font-medium">
            <Users className="w-4 h-4" /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Alerta Estoque Baixo */}
      {estoqueBaixo.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Package className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-800 font-semibold text-sm">Alerta de Estoque Baixo</p>
            <p className="text-amber-700 text-xs mt-0.5">{estoqueBaixo.map(p => `${p.nome} (${p.estoque} unid.)`).join(" · ")}</p>
          </div>
          <button onClick={() => navigate("/estoque")} className="text-xs text-amber-700 hover:underline flex items-center gap-1 flex-shrink-0">
            Ver <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Modal Auto-Lembretes Atraso */}
      {lembretesModal && atrasadosParaLembrete.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Faturas em Atraso</h3>
              <p className="text-sm text-gray-500 mt-1">{atrasadosParaLembrete.length} cliente(s) precisam ser notificados</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
              {atrasadosParaLembrete.map((inv: any, i: number) => (
                <div key={inv.id} className={`flex justify-between text-sm p-1.5 rounded-lg ${i === lembreteIdx ? 'bg-[#C9A227]/10 font-medium' : ''}`}>
                  <span className={i < lembreteIdx ? 'line-through text-gray-400' : 'text-gray-700'}>{inv.cliente_nome}</span>
                  <span className="text-gray-500">{formatCurrency(inv.total)}</span>
                </div>
              ))}
            </div>
            {lembreteIdx < atrasadosParaLembrete.length ? (
              <div className="space-y-2">
                <p className="text-xs text-center text-gray-500">Enviando lembrete {lembreteIdx + 1} de {atrasadosParaLembrete.length}</p>
                <button onClick={handleEnviarProximoLembrete} className="w-full py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 text-sm">
                  Enviar WhatsApp para {atrasadosParaLembrete[lembreteIdx]?.cliente_nome}
                </button>
                <button onClick={() => setLembretesModal(false)} className="w-full py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                  Agora não
                </button>
              </div>
            ) : (
              <button onClick={() => setLembretesModal(false)} className="w-full py-3 rounded-xl bg-[#C9A227] text-white font-bold text-sm">
                ✅ Todos os lembretes enviados!
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receitas */}
        <div
          onClick={() => navigate("/invoices?status=pago")}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:border-green-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Receitas</p>
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpi.receitas)}</p>
          <div className="mt-1.5"><TrendBadge val={trendPct(kpi.receitas, kpi.receitasAnterior)} /></div>
        </div>

        {/* Despesas */}
        <div
          onClick={() => navigate("/expenses")}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:border-red-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Despesas</p>
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpi.despesas)}</p>
          <div className="mt-1.5"><TrendBadge val={trendPct(kpi.despesas, kpi.despesasAnterior)} invert /></div>
        </div>

        {/* Lucro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg cursor-default transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lucro Líquido</p>
            <div className="w-9 h-9 rounded-xl bg-[#C9A227]/15 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[#C9A227]" />
            </div>
          </div>
          <p className={`text-2xl font-bold ${kpi.lucro < 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(kpi.lucro)}</p>
          <p className="mt-1.5 text-xs text-gray-400">Margem: <span className="font-semibold text-gray-600">{margemLucro}%</span></p>
        </div>

        {/* Clientes */}
        <div
          onClick={() => navigate("/clientes")}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:border-blue-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Clientes Ativos</p>
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpi.clientesAtivos}</p>
          <p className="mt-1.5 text-xs text-gray-400">clientes cadastrados</p>
        </div>
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 gap-4">
        {/* A Receber */}
        <div
          onClick={() => navigate("/invoices?status=pendente")}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:border-orange-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">A Receber</p>
              <p className="text-xl font-bold text-gray-900 truncate">{formatCurrency(kpi.faturasPendentesValor)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">{kpi.faturasPendentesQtd} fatura(s) em aberto</p>
        </div>

        {/* Faturas em Atraso */}
        <div
          onClick={() => navigate("/invoices?status=atrasado")}
          className={`rounded-2xl border p-5 shadow-sm hover:shadow-lg cursor-pointer transition-all group ${kpi.faturasAtrasadasQtd > 0 ? "bg-red-50 border-red-200 hover:border-red-400" : "bg-white border-gray-100"}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0 ${kpi.faturasAtrasadasQtd > 0 ? "bg-red-100" : "bg-gray-100"}`}>
              <AlertTriangle className={`w-5 h-5 ${kpi.faturasAtrasadasQtd > 0 ? "text-red-600" : "text-gray-400"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Em Atraso</p>
              <p className={`text-xl font-bold truncate ${kpi.faturasAtrasadasQtd > 0 ? "text-red-700" : "text-gray-900"}`}>{formatCurrency(kpi.faturasAtrasadasValor)}</p>
            </div>
          </div>
          <p className={`text-xs mt-2 ${kpi.faturasAtrasadasQtd > 0 ? "text-red-500 font-medium" : "text-gray-400"}`}>
            {kpi.faturasAtrasadasQtd > 0 ? `${kpi.faturasAtrasadasQtd} fatura(s) vencida(s)` : "Nenhuma fatura em atraso"}
          </p>
        </div>
      </div>

      {/* Faturas em Atraso (lista) */}
      {faturasAtrasadas.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-base font-bold text-gray-900">Faturas em Atraso</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{faturasAtrasadas.length}</span>
            </div>
            <button onClick={() => navigate("/invoices?status=atrasado")} className="text-xs text-red-500 hover:underline flex items-center gap-1 font-medium">
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-2 font-semibold">Cliente</th>
                  <th className="pb-2 font-semibold hidden sm:table-cell">Nº</th>
                  <th className="pb-2 font-semibold">Vencimento</th>
                  <th className="pb-2 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {faturasAtrasadas.map(f => (
                  <tr key={f.id} className="hover:bg-red-50 cursor-pointer transition-colors" onClick={() => navigate(`/invoices/${f.id}/editar`)}>
                    <td className="py-3 font-semibold text-gray-900">{f.cliente_nome}</td>
                    <td className="py-3 text-gray-400 hidden sm:table-cell">{f.numero}</td>
                    <td className="py-3 text-sm">{vencLabel(f.data_vencimento)}</td>
                    <td className="py-3 text-right font-bold text-red-600">{formatCurrency(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orçamentos em Aberto + Faturas em Aberto lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orçamentos em Aberto */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Hourglass className="w-5 h-5 text-purple-500" />
              <h2 className="text-base font-bold text-gray-900">Últimos Orçamentos</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{kpi.orcamentosAbertosQtd}</span>
            </div>
            <button onClick={() => navigate("/estimates")} className="text-xs text-purple-500 hover:underline flex items-center gap-1 font-medium">
              Ver todos <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {orcamentosAbertos.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <Hourglass className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhum orçamento em aberto</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {orcamentosAbertos.map(o => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/estimates/${o.id}/editar`)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{o.cliente_nome}</p>
                    <p className="text-xs text-gray-400">{o.numero}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === "visualizado" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{o.status}</span>
                    <span className="font-bold text-gray-900 text-sm">{formatCurrency(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Faturas em Aberto */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <h2 className="text-base font-bold text-gray-900">Últimas Faturas</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">{kpi.faturasPendentesQtd}</span>
            </div>
            <button onClick={() => navigate("/invoices")} className="text-xs text-[#C9A227] hover:underline flex items-center gap-1 font-medium">
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {faturasReceber.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhuma fatura em aberto</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {faturasReceber.map(f => (
                <div key={f.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/invoices/${f.id}/editar`)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{f.cliente_nome}</p>
                    <p className="text-xs text-gray-400">{f.numero} · {vencLabel(f.data_vencimento)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls[f.status] ?? "bg-gray-100 text-gray-600"}`}>{f.status}</span>
                    <span className="font-bold text-[#C9A227] text-sm">{formatCurrency(f.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
