import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, CheckCircle, Trash2, TrendingDown, Loader2, Calendar, Building2, ShoppingCart } from 'lucide-react'
import { CompraFornecedorModal } from '@/components/CompraFornecedorModal'

interface ContaPagar {
  id?: string
  descricao: string
  fornecedor: string
  numero_nota: string
  valor: number
  data_emissao: any
  data_vencimento: any
  status: 'pendente' | 'pago' | 'vencido'
  origem: 'compra' | 'manual'
  compra_id?: string
  data_pagamento?: any
  created_at: any
}

export function ContasPagar() {
  const { isAdmin } = useAuth()
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago' | 'vencido'>('todos')

  const [descricao, setDescricao] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [valor, setValor] = useState('')
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split('T')[0])
  const [dataVencimento, setDataVencimento] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCompraModal, setShowCompraModal] = useState(false)

  useEffect(() => { fetchContas() }, [])

  const fetchContas = async () => {
    try {
      setLoading(true)
      const snap = await getDocs(query(collection(db, 'contas_pagar'), orderBy('data_vencimento', 'asc')))
      const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as ContaPagar[]
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const atualizadas = data.map(c => {
        if (c.status === 'pendente') {
          const venc = c.data_vencimento?.toDate ? c.data_vencimento.toDate() : new Date(c.data_vencimento)
          if (venc < hoje) return { ...c, status: 'vencido' as const }
        }
        return c
      })
      setContas(atualizadas)
    } catch {
      toast.error('Erro ao carregar contas a pagar')
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descricao || !valor || !dataVencimento) { toast.error('Preencha todos os campos obrigatórios'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'contas_pagar'), {
        descricao, fornecedor, numero_nota: numeroNota,
        valor: parseFloat(valor),
        data_emissao: Timestamp.fromDate(new Date(dataEmissao)),
        data_vencimento: Timestamp.fromDate(new Date(dataVencimento)),
        status: 'pendente', origem: 'manual', created_at: Timestamp.now(),
      })
      // Auto-create expense so Dashboard despesas stays in sync
      await addDoc(collection(db, 'expenses'), {
        descricao: descricao || fornecedor || 'Compra',
        valor: parseFloat(valor) || 0,
        categoria: 'Produtos',
        data: Timestamp.fromDate(new Date(dataVencimento + 'T12:00:00')),
        origem: 'compra',
        created_at: Timestamp.now(),
      })
      toast.success('Conta registrada!')
      setDescricao(''); setFornecedor(''); setNumeroNota(''); setValor(''); setDataVencimento('')
      setShowForm(false); fetchContas()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const marcarPago = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contas_pagar', id), { status: 'pago', data_pagamento: Timestamp.now() })
      toast.success('Marcado como pago!'); fetchContas()
    } catch { toast.error('Erro ao atualizar') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Confirmar exclusão?')) return
    try { await deleteDoc(doc(db, 'contas_pagar', id)); toast.success('Excluído!'); fetchContas() }
    catch { toast.error('Erro ao excluir') }
  }

  const filtered = contas.filter(c => {
    const matchSearch = c.descricao.toLowerCase().includes(search.toLowerCase()) || c.fornecedor?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPendente = filtered.filter(c => c.status === 'pendente' || c.status === 'vencido').reduce((a, c) => a + c.valor, 0)
  const totalVencido = filtered.filter(c => c.status === 'vencido').reduce((a, c) => a + c.valor, 0)
  const totalPago = filtered.filter(c => c.status === 'pago').reduce((a, c) => a + c.valor, 0)

  const statusBadge = (s: string) => s === 'pago' ? 'bg-green-100 text-green-700' : s === 'vencido' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
  const statusLabel = (s: string) => s === 'pago' ? 'Pago' : s === 'vencido' ? 'Vencido' : 'Pendente'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Compras</h1>
          <p className="text-gray-500 text-sm mt-0.5">Controle de pagamentos e fornecedores</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCompraModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-black transition-colors"
            >
              <ShoppingCart className="w-4 h-4" /> Nova Compra
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[#6F2738] text-white rounded-xl text-sm font-medium hover:bg-[#b8911f] transition-colors">
              <Plus className="w-4 h-4" /> Nova Conta
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">A Pagar (pendente)</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPendente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Vencido</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Pago no período</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPago)}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Nova Conta a Pagar</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input value={descricao} onChange={e => setDescricao(e.target.value)} required placeholder="Ex: Compra de produtos" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nº Nota / Referência</label>
              <input value={numeroNota} onChange={e => setNumeroNota(e.target.value)} placeholder="Ex: NF-001" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} required placeholder="0.00" className="w-full pl-7 pr-4 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data da Compra</label>
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conta ou fornecedor..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['todos', 'pendente', 'vencido', 'pago'] as const).map(s => (
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
            <TrendingDown className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Nenhuma conta encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => (
              <div key={c.id} className="p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{c.descricao}</p>
                      {(c as any).pdf_url && (
                        <a href={(c as any).pdf_url} target="_blank" rel="noopener noreferrer" title={(c as any).pdf_nome || 'Ver PDF'} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/></svg>
                          PDF
                        </a>
                      )}
                    </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-0.5">
                    {c.fornecedor && <span>{c.fornecedor}</span>}
                    {c.numero_nota && <span>Ref: {c.numero_nota}</span>}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Vence: {c.data_vencimento?.toDate ? formatDate(c.data_vencimento.toDate()) : c.data_vencimento}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span>
                    {c.origem === 'compra' && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Via Compra</span>}
                  </div>
                </div>
                <p className="font-semibold text-gray-900">{formatCurrency(c.valor)}</p>
                <div className="flex gap-2">
                  {c.status !== 'pago' && (
                    <button onClick={() => marcarPago(c.id!)} title="Marcar como pago" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
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
      {showCompraModal && (
        <CompraFornecedorModal
          onClose={() => setShowCompraModal(false)}
          onSaved={() => { setShowCompraModal(false); fetchContas() }}
        />
      )}
    </div>
  )
}
