// ============================================
// BBVIC GESTÃO - LISTA DE ORÇAMENTOS (PREMIUM)
// ============================================

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import {
  collection,
  query,
  getDocs,
  getDoc,
  orderBy,
  deleteDoc,
  doc,
  where
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

import {
  Plus,
  Search,
  ClipboardList,
  Trash2,
  MessageCircle,
  AlertTriangle,
  FileText
} from "lucide-react"

import type { Estimate } from "@/types"

export function Estimates() {

  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [modalAlteracoes, setModalAlteracoes] = useState<any>(null)

  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; numero: string; cliente: string} | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [prodMap, setProdMap] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchEstimates()
  }, [user, isAdmin])

  const fetchEstimates = async () => {
    if (!user) return
    try {
      setLoading(true)

      // Carrega catálogo de produtos para comparação de preços
      const prodSnap = await getDocs(collection(db, 'produtos'))
      const map: Record<string, number> = {}
      prodSnap.docs.forEach(d => { map[d.id] = (d.data() as any).preco_venda || 0 })
      setProdMap(map)

      const verTodos = isAdmin || user?.ver_todos_clientes === true
      let q = verTodos
        ? query(collection(db, 'estimates'), orderBy('created_at', 'desc'))
        : query(collection(db, 'estimates'), where('vendedor_id', '==', user.uid), orderBy('created_at', 'desc'))
      const snapshot = await getDocs(q)
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Estimate[]
      setEstimates(list)
    } catch (error: any) {
      console.error('Erro ao buscar orçamentos:', error)
      // Fallback sem orderBy se faltar índice
      try {
        const verTodos = isAdmin || user?.ver_todos_clientes === true
        const q2 = verTodos
          ? collection(db, 'estimates')
          : query(collection(db, 'estimates'), where('vendedor_id', '==', user.uid))
        const snapshot2 = await getDocs(q2)
        let list2 = snapshot2.docs.map(d => ({ id: d.id, ...d.data() })) as Estimate[]
        list2.sort((a, b) => {
          const ta = (a as any).created_at?.toDate?.() ?? new Date(0)
          const tb = (b as any).created_at?.toDate?.() ?? new Date(0)
          return tb.getTime() - ta.getTime()
        })
        setEstimates(list2)
        toast.warning('Orçamentos carregados sem ordenação (índice pendente)')
      } catch (error2: any) {
        toast.error('Erro ao carregar orçamentos: ' + (error2.message || 'verifique permissões'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, "estimates", deleteConfirm.id))
      setEstimates(prev => prev.filter(e => e.id !== deleteConfirm.id))
      setDeleteConfirm(null)
    } catch (e) {
      console.error("Erro ao excluir:", e)
      alert("Erro ao excluir orçamento")
    } finally {
      setDeleting(false)
    }
  }

  // Calcula alterações comparando itens com o catálogo atual — funciona em todos os orçamentos
  const getAlteracoes = (estimate: any) => {
    if (!isAdmin || Object.keys(prodMap).length === 0) return []
    const items: any[] = estimate.items || []
    return items
      .filter(i => {
        const precoOriginal = prodMap[i.produto_id]
        return precoOriginal !== undefined && precoOriginal > 0 && Math.abs(i.preco_unitario - precoOriginal) > 0.01
      })
      .map(i => ({
        produto: i.produto_nome,
        preco_original: prodMap[i.produto_id],
        preco_cobrado: i.preco_unitario,
        diferenca: Math.round((i.preco_unitario - prodMap[i.produto_id]) * 100) / 100,
      }))
  }

  const filteredEstimates = estimates.filter(est =>
    est.status !== "aprovado" &&
    est.status !== "convertido" &&
    (
      est.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      est.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const getStatusColor = (status: string) => {

    const colors: Record<string, string> = {

      aprovado: "bg-green-100 text-green-700",
      enviado: "bg-blue-100 text-blue-700",
      visualizado: "bg-purple-100 text-purple-700",
      rascunho: "bg-gray-100 text-gray-700",
      recusado: "bg-red-100 text-red-700",
      expirado: "bg-orange-100 text-orange-700"

    }

    return colors[status] || "bg-gray-100 text-gray-700"

  }

  if (loading) {

    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/>
      </div>
    )

  }

  const sendWAEstimate = async (est: Estimate) => {
    const phone = ((est as any).cliente_telefone || '').replace(/\D/g, '')
    if (!phone) { alert('Cliente sem telefone cadastrado'); return }
    const token = (est as any).public_token || ''
    const estimateUrl = token ? `${window.location.origin}/estimate/${token}` : ''
    const dataEnvio = new Date().toLocaleDateString('pt-BR')
    const dataVal = (() => { try { const d = (est as any).data_validade; return d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('pt-BR') : '' } catch { return '' } })()
    let msgTemplate = `Olá {NOME}!\n\nSegue o orçamento da BBVIC Hair Care:\n{LINK}\n\nTotal: {TOTAL}\nVálido até: {VALIDADE}\nEmitido em: {DATA_ENVIO}`
    try {
      const snapMsg = await getDoc(doc(db, 'configuracoes', 'mensagens'))
      if (snapMsg.exists() && snapMsg.data().orcamento) msgTemplate = snapMsg.data().orcamento
    } catch { }
    const msg = msgTemplate
      .replace(/{NOME}/g, est.cliente_nome)
      .replace(/{NUMERO}/g, est.numero)
      .replace(/{TOTAL}/g, formatCurrency(est.total))
      .replace(/{VALIDADE}/g, dataVal)
      .replace(/{DATA_ENVIO}/g, dataEnvio)
      .replace(/{LINK}/g, estimateUrl)
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

    <div className="space-y-8">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Orçamentos
          </h1>

          <p className="text-gray-500">
            Gerencie os orçamentos dos clientes
          </p>

        </div>

        <button
          onClick={() => navigate("/estimates/novo")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26]"
        >
          <Plus className="w-5 h-5"/>
          Novo Orçamento
        </button>

      </div>


      {/* SEARCH */}

      <div className="relative">

        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar orçamento ou cliente..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#6F2738]"
        />

      </div>


      {/* LISTA */}

      {filteredEstimates.length === 0 ? (

        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">

          <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4"/>

          <p className="text-gray-500">
            Nenhum orçamento encontrado
          </p>

        </div>

      ) : (

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {filteredEstimates.map((estimate) => (

            <div
              key={estimate.id}
              className="flex items-center justify-between px-6 py-4 border-b hover:bg-gray-50 transition"
            >

              <div className="flex items-center gap-4 flex-1 min-w-0">

                <div className="w-10 h-10 rounded-lg bg-[#6F2738]/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-[#6F2738]"/>
                </div>

                <div>

                  <p className="font-medium text-gray-900">
                    {estimate.numero}
                  </p>

                  <button onClick={() => navigate(`/estimates/${estimate.id}/editar`)} className="text-sm font-medium text-[#6F2738] hover:underline text-left">
                    {estimate.cliente_nome}
                  </button>
                  {isAdmin && getAlteracoes(estimate).length > 0 && (
                    <button onClick={() => setModalAlteracoes({ ...estimate, detalhes_alteracoes: getAlteracoes(estimate) })}
                      className="flex items-center gap-1 mt-1 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5 hover:bg-amber-200">
                      <AlertTriangle className="w-3 h-3" /> Preço Alterado
                    </button>
                  )}

                </div>

              </div>


                  <div className="flex items-center gap-2 sm:gap-6">

                <span className="font-semibold text-gray-900">
                  {formatCurrency(estimate.total)}
                </span>

                <span
                  className={`text-xs px-2 py-1 rounded-full ${getStatusColor(estimate.status)}`}
                >
                  {estimate.status === 'aprovado' ? '✅ Aprovado' : estimate.status}
                </span>

                {estimate.status === 'aprovado' && (
                  <button
                    onClick={async e => {
                      e.stopPropagation()
                      try {
                        const invSnap = await getDocs(query(collection(db, 'invoices'), where('estimate_origem', '==', estimate.id)))
                        if (!invSnap.empty) {
                          navigate(`/invoices/${invSnap.docs[0].id}/editar`)
                        } else {
                          navigate('/invoices')
                        }
                      } catch { navigate('/invoices') }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium"
                    title="Ver fatura gerada"
                  >
                    <FileText className="w-3.5 h-3.5" /> Ver Fatura
                  </button>
                )}

                <button
                  onClick={e => { e.stopPropagation(); sendWAEstimate(estimate) }}
                  className="p-2 rounded-lg hover:bg-green-50 text-green-600"
                  title="Enviar WhatsApp"
                >
                  <MessageCircle className="w-5 h-5"/>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: estimate.id!, numero: estimate.numero, cliente: estimate.cliente_nome }) }}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-400"
                  title="Excluir orçamento"
                >
                  <Trash2 className="w-5 h-5"/>
                </button>

              </div>

            </div>

          ))}

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
                <h3 className="font-bold text-gray-900">Excluir Orçamento</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir o orçamento <span className="font-semibold text-gray-900">{deleteConfirm.numero}</span> de <span className="font-semibold">{deleteConfirm.cliente}</span>?
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

      {/* Modal: Detalhes de Preços Alterados */}
      {modalAlteracoes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setModalAlteracoes(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Preços Alterados pelo Vendedor</h3>
                <p className="text-xs text-gray-400">Orçamento {modalAlteracoes.numero} · {modalAlteracoes.cliente_nome}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Produto</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Preço Padrão</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Cobrado</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {((modalAlteracoes as any).detalhes_alteracoes || []).map((a: any, i: number) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-800">{a.produto}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(a.preco_original)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(a.preco_cobrado)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${a.diferenca < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {a.diferenca > 0 ? '+' : ''}{formatCurrency(a.diferenca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">Vendedor: {(modalAlteracoes as any).vendedor_nome || '—'}</p>
            <button onClick={() => setModalAlteracoes(null)}
              className="mt-4 w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}