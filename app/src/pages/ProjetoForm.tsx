import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { ArrowLeft, Save } from "lucide-react"
import type { Cliente } from "@/types"

export function ProjetoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const isEditing = !!id

  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState({
    nome:"", cliente_id:"", cliente_nome:"", descricao:"",
    status:"ativo" as "ativo"|"concluido"|"pausado"|"cancelado",
    orcamento_estimado:"", data_inicio: new Date().toISOString().split("T")[0], data_fim:"",
  })

  useEffect(() => {
    fetchClientes()
    if (isEditing && id) fetchProjeto(id)
  }, [])

  const fetchClientes = async () => {
    const q = isAdmin
      ? query(collection(db,"clientes"), where("status","==","ativo"))
      : query(collection(db,"clientes"), where("vendedor_id","==",user?.uid), where("status","==","ativo"))
    const snap = await getDocs(q)
    setClientes(snap.docs.map(d => ({ id:d.id,...d.data() })) as Cliente[])
  }

  const fetchProjeto = async (projetoId: string) => {
    const snap = await getDoc(doc(db,"projetos",projetoId))
    if (snap.exists()) {
      const d = snap.data()
      setForm({
        nome:d.nome, cliente_id:d.cliente_id, cliente_nome:d.cliente_nome,
        descricao:d.descricao||"", status:d.status,
        orcamento_estimado:d.orcamento_estimado?.toString()||"",
        data_inicio:d.data_inicio?.toDate ? d.data_inicio.toDate().toISOString().split("T")[0] : d.data_inicio,
        data_fim:d.data_fim?.toDate ? d.data_fim.toDate().toISOString().split("T")[0] : d.data_fim||"",
      })
    }
  }

  const handleSave = async () => {
    if (!form.nome || !form.cliente_id) { toast.error("Nome do projeto e cliente são obrigatórios"); return }
    setSaving(true)
    try {
      const cliente = clientes.find(c => c.id === form.cliente_id)
      const data: any = {
        nome:form.nome, cliente_id:form.cliente_id, cliente_nome:cliente?.nome||form.cliente_nome,
        descricao:form.descricao, status:form.status,
        orcamento_estimado:parseFloat(form.orcamento_estimado)||0,
        data_inicio:Timestamp.fromDate(new Date(form.data_inicio)),
        data_fim:form.data_fim ? Timestamp.fromDate(new Date(form.data_fim)) : null,
        vendedor_id:user?.uid, vendedor_nome:(user as any)?.nome,
      }
      if (isEditing && id) {
        await updateDoc(doc(db,"projetos",id), { ...data, updated_at:Timestamp.now() })
        toast.success("Projeto atualizado!")
      } else {
        await addDoc(collection(db,"projetos"), { ...data, total_receitas:0, total_despesas:0, lucro:0, created_at:Timestamp.now() })
        toast.success("Projeto criado!")
      }
      navigate("/projetos")
    } catch{ toast.error("Erro ao salvar projeto") } finally { setSaving(false) }
  }

  const f = (field: string, val: string) => setForm(prev => ({ ...prev, [field]:val }))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/projetos")} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ArrowLeft className="w-5 h-5"/></button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{isEditing ? "Editar Projeto" : "Novo Projeto"}</h1>
          <p className="text-gray-500 text-sm">Controle de custos e receitas</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Projeto *</label>
          <input type="text" value={form.nome} onChange={e => f("nome",e.target.value)} placeholder="Ex: Casamento Maria, Reforma do Salão..." className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
          <select value={form.cliente_id} onChange={e => f("cliente_id",e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]">
            <option value="">Selecione o cliente...</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea value={form.descricao} onChange={e => f("descricao",e.target.value)} rows={3} placeholder="Detalhes do projeto..." className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227] resize-none"/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => f("status",e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]">
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento Estimado ($)</label>
            <input type="number" step="0.01" min="0" value={form.orcamento_estimado} onChange={e => f("orcamento_estimado",e.target.value)} placeholder="0.00" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início</label>
            <input type="date" value={form.data_inicio} onChange={e => f("data_inicio",e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Conclusão</label>
            <input type="date" value={form.data_fim} onChange={e => f("data_fim",e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate("/projetos")} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-[#C9A227] text-white hover:bg-[#9A7B1A] font-medium flex items-center justify-center gap-2">
          <Save className="w-4 h-4"/>{saving ? "Salvando..." : (isEditing ? "Atualizar" : "Criar Projeto")}
        </button>
      </div>
    </div>
  )
}
