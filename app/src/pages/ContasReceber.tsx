import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, CheckCircle, Trash2, TrendingUp, Loader2, Calendar, User } from 'lucide-react'

interface ContaReceber {
  id?: string
  descricao: string
  cliente_nome: string
  cliente_id?: string
  invoice_id?: string
  invoice_numero?: string
  valor: number
  data_emissao: any
  data_vencimento: any
  status: 'pendente' | 'recebido' | 'vencido'
  origem: 'venda' | 'manual'
  data_recebimento?: any
  created_at: any
}

export function ContasReceber() {
  const { isAdmin } = useAuth()
  const [contas, setContas] = useState<ContaReceber[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'recebido' | 'vencido'>('todos')

  const [descricao, setDescricao] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [valor, setValor] = useState('')
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split('T')[0])
  const [dataVencimento, setDataVencimento] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchContas() }, [])

  const fetchContas = async () => {
    try {
      setLoading(true)
      const snap = await getDocs(query(collection(db, 'contas_receber'), orderBy('data_vencimento', 'asc')))
      const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as ContaReceber[]
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const atualizadas = data.map(c => {
        if (c.status === 'pendente') {
          const venc = c.data_vencimento?.toDate ? c.data_vencimento.toDate() : new Date(c.data_vencimento)
          if (venc < hoje) return { ...c, status: 'vencido' as const }
        }
        return c
      })
      setContas(atualizadas.filter((c: any) => !['recebido', 'pago'].includes(c.status)))
    } catch {
      toast.error('Erro ao carregar contas a receber')
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descricao || !valor || !dataVencimento) { toast.error('Preencha todos os campos obrigatórios'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'contas_receber'), {
        descricao, cliente_nome: clienteNome,
        valor: parseFloat(valor),
        data_emissao: Timestamp.fromDate(new Date(dataEmissao)),
        data_vencimento: Timestamp.fromDate(new Date(dataVencimento)),
        status: 'pendente', origem: 'manual', created_at: Timestamp.now(),
      })
      toast.success('Conta registrada!')
      setDescricao(''); setClienteNome(''); setValor(''); setDataVencimento('')
      setShowForm(false); fetchContas()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const marcarRecebido = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contas_receber', id), { status: 'recebido', data_recebimento: Timestamp.now() })
      toast.success('Marcado como recebido!'); fetchContas()
    } catch { toast.error('Erro ao atualizar') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Confirmar exclusão?')) return
    try { await deleteDoc(doc(db, 'contas_receber', id)); toast.success('Excluído!'); fetchContas() }
    catch { toast.error('Erro ao excluir') }
  }

  const filtered = contas.filter(c => {
    const matchSearch = c.descricao.toLowerCase().includes(search.toLowerCase()) || c.cliente_nome?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPendente = filtered.filter(c => c.status === 'pendente' || c.status === 'vencido').reduce((a, c) => a + c.valor, 0)
  const totalVencido = filtered.filter(c => c.status === 'vencido').reduce((a, c) => a + c.valor, 0)
  const totalRecebido = filtered.filter(c => c.status === 'recebido').reduce((a, c) => a + c.valor, 0)

  const statusBadge = (s: string) => s === 'recebido' ? 'bg-green-100 text-green-700' : s === 'vencido' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
  const statusLabel = (s: string) => s === 'recebido' ? 'Recebido' : s === 'vencido' ? 'Vencido' : 'Pendente'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Contas a Receber</h1>
          <p className="text-gray-500 text-sm mt-0.5">Acompanhe os valores a receber dos clientes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[#6F2738] text-white rounded-xl text-sm font-medium hover:bg-[#b8911f] transition-colors">
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">A Receber (pendente)</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPendente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Vencido (inadimplente)</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Recebido no período</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Nova Conta a Receber</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input value={descricao} onChange={e => setDescricao(e.target.value)} required placeholder="Ex: Serviço prestado" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome do cliente" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} required placeholder="0.00" className="w-full pl-7 pr-4 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Emissão</label>
              <input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento *</label>
              <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#b8911f] disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conta ou cliente..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['todos', 'pendente', 'vencido', 'recebido'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === s ? 'bg-[#6F2738] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'todos' ? 'Todos' : statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[#6F2738]" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-10 text-gray-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Nenhuma conta encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => (
              <div key={c.id} className="p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{c.descricao}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-0.5">
                    {c.cliente_nome && <span>{c.cliente_nome}</span>}
                    {c.invoice_numero && <span>Fatura: {c.invoice_numero}</span>}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Vence: {c.data_vencimento?.toDate ? formatDate(c.data_vencimento.toDate()) : c.data_vencimento}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span>
                    {c.origem === 'venda' && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Via Fatura</span>}
                  </div>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(c.valor)}</p>
                <div className="flex gap-2">
                  {c.status !== 'recebido' && (
                    <button onClick={() => marcarRecebido(c.id!)} title="Marcar como recebido" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(c.id!)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
