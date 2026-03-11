import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, where, getDocs, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Search, Briefcase, TrendingUp, Clock } from "lucide-react"

interface Projeto {
  id?: string; nome: string; cliente_id: string; cliente_nome: string
  descricao?: string; status: "ativo"|"concluido"|"pausado"|"cancelado"
  orcamento_estimado: number; total_receitas: number; total_despesas: number
  lucro: number; data_inicio: any; data_fim?: any; vendedor_id: string; created_at?: any
}

const statusCls: Record<string,string> = {
  ativo:"bg-green-100 text-green-700", concluido:"bg-blue-100 text-blue-700",
  pausado:"bg-yellow-100 text-yellow-700", cancelado:"bg-red-100 text-red-700",
}
const statusLabel: Record<string,string> = {
  ativo:"Ativo", concluido:"Concluído", pausado:"Pausado", cancelado:"Cancelado",
}

export function Projetos() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => { fetchProjetos() }, [user, isAdmin])

  const fetchProjetos = async () => {
    try {
      setLoading(true)
      const q = isAdmin
        ? query(collection(db,"projetos"), orderBy("created_at","desc"))
        : query(collection(db,"projetos"), where("vendedor_id","==",user?.uid), orderBy("created_at","desc"))
      const snap = await getDocs(q)
      setProjetos(snap.docs.map(d => ({ id:d.id,...d.data() })) as Projeto[])
    } catch(err){ console.error(err) } finally { setLoading(false) }
  }

  const filtered = projetos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.cliente_nome.toLowerCase().includes(search.toLowerCase())
  )

  const totalReceitas  = projetos.reduce((s,p) => s+(p.total_receitas||0), 0)
  const totalDespesas  = projetos.reduce((s,p) => s+(p.total_despesas||0), 0)
  const totalLucro     = totalReceitas - totalDespesas

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projetos</h1>
          <p className="text-gray-500 text-sm">Controle de receitas e despesas por projeto</p>
        </div>
        <button onClick={() => navigate("/projetos/novo")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-sm">
          <Plus className="w-4 h-4"/> Novo Projeto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"><p className="text-sm text-gray-500">Total Receitas</p><p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalReceitas)}</p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"><p className="text-sm text-gray-500">Total Despesas</p><p className="text-xl font-bold text-red-500 mt-1">{formatCurrency(totalDespesas)}</p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"><p className="text-sm text-gray-500">Lucro Total</p><p className={`text-xl font-bold mt-1 ${totalLucro>=0?"text-[#C9A227]":"text-red-600"}`}>{formatCurrency(totalLucro)}</p></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar projeto ou cliente..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]"/>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-500">Nenhum projeto encontrado</p>
          <button onClick={() => navigate("/projetos/novo")} className="mt-4 text-sm text-[#C9A227] hover:underline">Criar primeiro projeto</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const margem = p.total_receitas > 0 ? ((p.lucro/p.total_receitas)*100).toFixed(1) : "0"
            const progresso = p.orcamento_estimado > 0 ? Math.min((p.total_receitas/p.orcamento_estimado)*100,100) : 0
            return (
              <div key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-[#C9A227]/40 transition cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-[#C9A227]/15 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-[#C9A227]"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{p.nome}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls[p.status]??"bg-gray-100 text-gray-600"}`}>{statusLabel[p.status]??p.status}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{p.cliente_nome}</p>
                      {p.descricao && <p className="text-xs text-gray-400 mt-1 truncate">{p.descricao}</p>}
                      {p.orcamento_estimado > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>Progresso do orçamento</span>
                            <span>{formatCurrency(p.total_receitas)} / {formatCurrency(p.orcamento_estimado)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full">
                            <div className="h-1.5 bg-[#C9A227] rounded-full transition-all" style={{ width:`${progresso}%` }}/>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 justify-end mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-gray-400"/>
                      <span className="text-xs text-gray-500">Margem {margem}%</span>
                    </div>
                    <p className={`text-lg font-bold ${p.lucro>=0?"text-gray-900":"text-red-600"}`}>{formatCurrency(p.lucro)}</p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 justify-end">
                      <Clock className="w-3 h-3"/>{formatDate(p.data_inicio)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
