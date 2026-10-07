import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { ArrowLeft, Edit, TrendingUp, TrendingDown, DollarSign, Plus, FileText, Receipt, X } from "lucide-react"
import type { Invoice, Expense } from "@/types"

interface Projeto {
  id?: string; nome: string; cliente_nome: string; descricao?: string
  status: string; orcamento_estimado: number; total_receitas: number
  total_despesas: number; lucro: number; data_inicio: any; data_fim?: any
}

const statusCls: Record<string,string> = {
  ativo:"bg-green-100 text-green-700", concluido:"bg-blue-100 text-blue-700",
  pausado:"bg-yellow-100 text-yellow-700", cancelado:"bg-red-100 text-red-700",
}
const statusLabel: Record<string,string> = {
  ativo:"Ativo", concluido:"Concluído", pausado:"Pausado", cancelado:"Cancelado",
}

export function ProjetoDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [faturas, setFaturas] = useState<Invoice[]>([])
  const [despesas, setDespesas] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showExpForm, setShowExpForm] = useState(false)
  const [expForm, setExpForm] = useState({ descricao:"", valor:"", categoria:"Materiais", data:new Date().toISOString().split("T")[0] })

  useEffect(() => { if (id) fetchDados(id) }, [id])

  const fetchDados = async (projetoId: string) => {
    try {
      setLoading(true)
      const snap = await getDoc(doc(db,"projetos",projetoId))
      if (!snap.exists()) { navigate("/projetos"); return }
      setProjeto({ id:snap.id,...snap.data() } as Projeto)
      const [fatSnap, , despSnap] = await Promise.all([
        getDocs(query(collection(db,"invoices"), where("projeto_id","==",projetoId))),
        getDocs(query(collection(db,"estimates"), where("projeto_id","==",projetoId))),
        getDocs(query(collection(db,"expenses"), where("projeto_id","==",projetoId))),
      ])
      setFaturas(fatSnap.docs.map(d => ({ id:d.id,...d.data() })) as Invoice[])
      setDespesas(despSnap.docs.map(d => ({ id:d.id,...d.data() })) as Expense[])
    } catch(err){ console.error(err) } finally { setLoading(false) }
  }

  const handleAddDespesa = async () => {
    if (!expForm.descricao || !expForm.valor) { toast.error("Preencha todos os campos"); return }
    const valor = parseFloat(expForm.valor)
    if (isNaN(valor)) { toast.error("Valor inválido"); return }
    try {
      await addDoc(collection(db,"expenses"), { descricao:expForm.descricao, valor, categoria:expForm.categoria, data:Timestamp.fromDate(new Date(expForm.data)), projeto_id:id, reembolsavel:false, created_at:Timestamp.now() })
      if (projeto && id) {
        const novaDespesa = (projeto.total_despesas||0) + valor
        await updateDoc(doc(db,"projetos",id), { total_despesas:novaDespesa, lucro:(projeto.total_receitas||0)-novaDespesa })
      }
      toast.success("Despesa adicionada!")
      setShowExpForm(false)
      setExpForm({ descricao:"", valor:"", categoria:"Materiais", data:new Date().toISOString().split("T")[0] })
      fetchDados(id!)
    } catch{ toast.error("Erro ao adicionar despesa") }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>
  if (!projeto) return null

  const margem = projeto.total_receitas > 0 ? ((projeto.lucro/projeto.total_receitas)*100).toFixed(1) : "0"
  const progresso = projeto.orcamento_estimado > 0 ? Math.min((projeto.total_receitas/projeto.orcamento_estimado)*100,100).toFixed(0) : 0
  const CATS = ["Materiais","Aluguel","Utilidades","Marketing","Transporte","Comissão","Impostos","Outros"]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/projetos")} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ArrowLeft className="w-5 h-5"/></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{projeto.nome}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls[projeto.status]??"bg-gray-100 text-gray-600"}`}>{statusLabel[projeto.status]??projeto.status}</span>
            </div>
            <p className="text-gray-500 text-sm">{projeto.cliente_nome} · Início: {formatDate(projeto.data_inicio)}</p>
          </div>
        </div>
        <button onClick={() => navigate(`/projetos/${id}/editar`)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
          <Edit className="w-4 h-4"/> Editar
        </button>
      </div>

      {/* Cards P&L */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-green-500"/><p className="text-sm text-gray-500">Receitas</p></div>
          <p className="text-xl font-bold text-green-600">{formatCurrency(projeto.total_receitas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-500"/><p className="text-sm text-gray-500">Despesas</p></div>
          <p className="text-xl font-bold text-red-500">{formatCurrency(projeto.total_despesas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-[#6F2738]"/><p className="text-sm text-gray-500">Lucro Líquido</p></div>
          <p className={`text-xl font-bold ${projeto.lucro>=0?"text-[#6F2738]":"text-red-600"}`}>{formatCurrency(projeto.lucro)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-2">Orçamento Usado</p>
          <p className="text-xl font-bold text-gray-900">{progresso}%</p>
          {projeto.orcamento_estimado > 0 && <div className="mt-2 h-1.5 bg-gray-100 rounded-full"><div className="h-1.5 bg-[#6F2738] rounded-full" style={{ width:`${progresso}%` }}/></div>}
          <p className="text-xs text-gray-400 mt-1">de {formatCurrency(projeto.orcamento_estimado)} · Margem {margem}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Faturas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#6F2738]"/>
            <h3 className="font-semibold text-gray-900">Faturas Vinculadas</h3>
          </div>
          {faturas.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">Nenhuma fatura vinculada</p> : (
            <div className="divide-y divide-gray-100">
              {faturas.map(f => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3">
                  <div><p className="font-medium text-gray-900 text-sm">{f.numero}</p><p className="text-xs text-gray-500">{formatDate(f.data_emissao)}</p></div>
                  <div className="text-right">
                    <p className="font-semibold text-[#6F2738] text-sm">{formatCurrency(f.total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.status==="pago"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700"}`}>{f.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Despesas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2"><Receipt className="w-4 h-4 text-red-500"/><h3 className="font-semibold text-gray-900">Despesas do Projeto</h3></div>
            <button onClick={() => setShowExpForm(!showExpForm)} className="flex items-center gap-1 text-xs text-[#6F2738] hover:underline"><Plus className="w-3 h-3"/> Adicionar</button>
          </div>

          {showExpForm && (
            <div className="p-4 bg-gray-50 border-b border-gray-100 space-y-3">
              <input type="text" value={expForm.descricao} onChange={e => setExpForm({...expForm,descricao:e.target.value})} placeholder="Descrição *" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
              <div className="flex gap-2">
                <input type="number" step="0.01" min="0" value={expForm.valor} onChange={e => setExpForm({...expForm,valor:e.target.value})} placeholder="Valor *" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
                <select value={expForm.categoria} onChange={e => setExpForm({...expForm,categoria:e.target.value})} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]">
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input type="date" value={expForm.data} onChange={e => setExpForm({...expForm,data:e.target.value})} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
                <button onClick={handleAddDespesa} className="px-4 py-2 rounded-lg bg-[#6F2738] text-white text-sm hover:bg-[#4A1A26]">Salvar</button>
                <button onClick={() => setShowExpForm(false)} className="p-2 rounded-lg border border-gray-200 text-gray-400"><X className="w-4 h-4"/></button>
              </div>
            </div>
          )}

          {despesas.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">Nenhuma despesa registrada</p> : (
            <div className="divide-y divide-gray-100">
              {despesas.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div><p className="font-medium text-gray-900 text-sm">{d.descricao}</p><p className="text-xs text-gray-500">{d.categoria} · {formatDate(d.data)}</p></div>
                  <p className="font-semibold text-red-500 text-sm">-{formatCurrency(d.valor)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
