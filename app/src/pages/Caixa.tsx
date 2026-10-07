import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, getDocs, addDoc, Timestamp, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { Plus, TrendingUp, TrendingDown, DollarSign, ArrowLeftRight, Wallet, Building2, CreditCard, X } from "lucide-react"

interface Conta {
  id?: string; nome: string; tipo: "caixa" | "banco" | "square" | "stripe" | "outro"; saldo: number; cor: string
}
interface Movimento {
  id?: string; conta_id: string; conta_nome: string; tipo: "entrada" | "saida" | "transferencia"
  valor: number; descricao: string; categoria: string; data: any
  conta_destino_id?: string; conta_destino_nome?: string; created_by?: string
}

const CONTAS_DEFAULT: Omit<Conta, "id">[] = [
  { nome: "Caixa", tipo: "caixa", saldo: 0, cor: "#6F2738" },
  { nome: "Conta Bancária", tipo: "banco", saldo: 0, cor: "#3b82f6" },
  { nome: "Square", tipo: "square", saldo: 0, cor: "#10b981" },
]
const CATS_ENTRADA = ["Vendas", "Serviço", "Depósito", "Reembolso", "Outras Entradas"]
const CATS_SAIDA   = ["Materiais", "Aluguel", "Utilidades", "Marketing", "Transporte", "Comissão", "Impostos", "Outros"]

const tipoIcon = (tipo: string) => tipo === "caixa" ? Wallet : tipo === "banco" ? Building2 : CreditCard

export function Caixa() {
  const { user, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [contas, setContas] = useState<Conta[]>([])
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showContaModal, setShowContaModal] = useState(false)
  const [form, setForm] = useState({ conta_id:"", tipo:"entrada" as "entrada"|"saida"|"transferencia", valor:"", descricao:"", categoria:"", data: new Date().toISOString().split("T")[0], conta_destino_id:"" })
  const [novaConta, setNovaConta] = useState({ nome:"", tipo:"banco" as Conta["tipo"], cor:"#3b82f6" })

  useEffect(() => { fetchDados() }, [])

  const fetchDados = async () => {
    try {
      setLoading(true)
      const contasSnap = await getDocs(collection(db, "contas_caixa"))
      let lista = contasSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Conta[]
      if (lista.length === 0 && isAdmin) {
        for (const c of CONTAS_DEFAULT) { const r = await addDoc(collection(db,"contas_caixa"),c); lista.push({ id:r.id,...c }) }
      }
      setContas(lista)
      const movSnap = await getDocs(query(collection(db,"movimentos_caixa"), orderBy("data","desc")))
      setMovimentos(movSnap.docs.map(d => ({ id:d.id,...(d.data() as object) })) as Movimento[])
    } catch(err){ console.error(err) } finally { setLoading(false) }
  }

  const handleSalvar = async () => {
    if (!form.conta_id || !form.valor || !form.descricao) { toast.error("Preencha todos os campos obrigatórios"); return }
    const valor = parseFloat(form.valor)
    if (isNaN(valor) || valor <= 0) { toast.error("Valor inválido"); return }
    if (form.tipo === "transferencia" && !form.conta_destino_id) { toast.error("Selecione a conta de destino"); return }
    try {
      const conta = contas.find(c => c.id === form.conta_id)
      const contaDest = contas.find(c => c.id === form.conta_destino_id)
      await addDoc(collection(db,"movimentos_caixa"), { conta_id:form.conta_id, conta_nome:conta?.nome||"", tipo:form.tipo, valor, descricao:form.descricao, categoria:form.categoria||(form.tipo==="entrada"?"Outras Entradas":"Outros"), data:Timestamp.fromDate(new Date(form.data)), conta_destino_id:form.conta_destino_id||null, conta_destino_nome:contaDest?.nome||null, created_by:user?.uid })
      toast.success("Lançamento salvo!")
      setShowModal(false)
      setForm({ conta_id:"", tipo:"entrada", valor:"", descricao:"", categoria:"", data:new Date().toISOString().split("T")[0], conta_destino_id:"" })
      fetchDados()
    } catch{ toast.error("Erro ao salvar lançamento") }
  }

  const handleAddConta = async () => {
    if (!novaConta.nome) { toast.error("Nome da conta obrigatório"); return }
    try {
      await addDoc(collection(db,"contas_caixa"), { ...novaConta, saldo:0 })
      toast.success("Conta criada!")
      setShowContaModal(false)
      setNovaConta({ nome:"", tipo:"banco", cor:"#3b82f6" })
      fetchDados()
    } catch{ toast.error("Erro ao criar conta") }
  }

  const totalSaldo  = contas.reduce((s,c) => s+(c.saldo||0), 0)
  const totalEntradas = movimentos.filter(m => m.tipo==="entrada").reduce((s,m) => s+m.valor, 0)
  const totalSaidas   = movimentos.filter(m => m.tipo==="saida").reduce((s,m) => s+m.valor, 0)

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>

  const tipoLabel: Record<string,string> = { entrada:"Entrada", saida:"Saída", transferencia:"Transferência" }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Caixa & Banco</h1>
          <p className="text-gray-500 text-sm">Gerencie suas contas e lançamentos</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => setShowContaModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"><Plus className="w-4 h-4"/> Nova Conta</button>}
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26]"><Plus className="w-4 h-4"/> Novo Lançamento</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label:"Saldo Total", valor:totalSaldo, icon:DollarSign, cor:"text-[#6F2738]" },
          { label:"Total Entradas", valor:totalEntradas, icon:TrendingUp, cor:"text-green-500" },
          { label:"Total Saídas", valor:totalSaidas, icon:TrendingDown, cor:"text-red-500" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2"><p className="text-sm text-gray-500">{c.label}</p><c.icon className={`w-5 h-5 ${c.cor}`}/></div>
            <p className={`text-2xl font-bold ${c.label==="Saldo Total" && totalSaldo<0?"text-red-600":"text-gray-900"}`}>{formatCurrency(c.valor)}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Contas</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {contas.map(conta => {
            const Icon = tipoIcon(conta.tipo)
            return (
              <div key={conta.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: conta.cor+"20" }}>
                    <Icon className="w-5 h-5" style={{ color:conta.cor }}/>
                  </div>
                  <div><p className="font-medium text-gray-900 text-sm">{conta.nome}</p><p className="text-xs text-gray-400 capitalize">{conta.tipo}</p></div>
                </div>
                <p className={`text-xl font-bold ${(conta.saldo||0)>=0?"text-gray-900":"text-red-600"}`}>{formatCurrency(conta.saldo||0)}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100"><h2 className="text-base font-semibold text-gray-900">Histórico de Lançamentos</h2></div>
        {movimentos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhum lançamento registrado</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Descrição</th>
                <th className="px-5 py-3 font-medium">Conta</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movimentos.slice(0,50).map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500">{formatDate(m.data)}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {m.tipo==="transferencia" && <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500"/>}
                      {m.descricao}
                      {m.tipo==="transferencia" && <span className="text-xs text-gray-400">→ {m.conta_destino_nome}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{m.conta_nome}</td>
                  <td className="px-5 py-3 text-gray-500">{m.categoria}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${m.tipo==="entrada"?"text-green-600":m.tipo==="saida"?"text-red-500":"text-blue-500"}`}>
                    {m.tipo==="entrada"?"+":m.tipo==="saida"?"-":""}{formatCurrency(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Lançamento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Novo Lançamento</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <div className="flex gap-2">
                  {(["entrada","saida","transferencia"] as const).map(t => (
                    <button key={t} onClick={() => setForm({...form,tipo:t,categoria:""})} className={`flex-1 py-2 text-sm rounded-lg border transition ${form.tipo===t?"bg-[#6F2738] text-white border-[#6F2738]":"border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{tipoLabel[t]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Conta *</label>
                <select value={form.conta_id} onChange={e => setForm({...form,conta_id:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                  <option value="">Selecione a conta...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              {form.tipo==="transferencia" && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Conta Destino *</label>
                  <select value={form.conta_destino_id} onChange={e => setForm({...form,conta_destino_id:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                    <option value="">Selecione a conta...</option>
                    {contas.filter(c => c.id!==form.conta_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Valor *</label>
                <input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm({...form,valor:e.target.value})} placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Descrição *</label>
                <input type="text" value={form.descricao} onChange={e => setForm({...form,descricao:e.target.value})} placeholder="Descrição..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
              </div>
              {form.tipo!=="transferencia" && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Categoria</label>
                  <select value={form.categoria} onChange={e => setForm({...form,categoria:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                    <option value="">Selecione...</option>
                    {(form.tipo==="entrada"?CATS_ENTRADA:CATS_SAIDA).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Data</label>
                <input type="date" value={form.data} onChange={e => setForm({...form,data:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSalvar} className="flex-1 py-2.5 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] font-medium">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Conta */}
      {showContaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Nova Conta</h3>
              <button onClick={() => setShowContaModal(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome *</label>
                <input type="text" value={novaConta.nome} onChange={e => setNovaConta({...novaConta,nome:e.target.value})} placeholder="Ex: Conta Corrente" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <select value={novaConta.tipo} onChange={e => setNovaConta({...novaConta,tipo:e.target.value as Conta["tipo"]})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                  <option value="caixa">Caixa</option>
                  <option value="banco">Banco</option>
                  <option value="square">Square</option>
                  <option value="stripe">Stripe</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowContaModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddConta} className="flex-1 py-2.5 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] font-medium">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
