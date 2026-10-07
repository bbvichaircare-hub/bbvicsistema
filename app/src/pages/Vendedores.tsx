import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, getDocs, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import {
  Users, Search, Mail, Phone, Plus, Edit2, Key, Power,
  Trash2, X, Eye, EyeOff, Percent, FileText,
  CheckCircle, XCircle, Loader2, Sliders
} from 'lucide-react'
import type { User, Permissao } from '@/types'
import { TODAS_PERMISSOES, LABEL_PERMISSOES } from '@/types'

interface VendedorStats { totalVendas: number; totalComissoes: number; quantidadeFaturas: number }

interface FormData {
  nome: string; email: string; telefone: string
  password: string; confirmPassword: string
  comissao_percentual: number
  role: 'vendedor' | 'personalizado'
  permissoes: Permissao[]
  ver_todos_clientes: boolean
}
const emptyForm: FormData = {
  nome: '', email: '', telefone: '', password: '', confirmPassword: '',
  comissao_percentual: 10,
  role: 'vendedor', permissoes: [], ver_todos_clientes: false
}

interface EditForm {
  nome: string; telefone: string; email: string; comissao_percentual: number
  role: 'vendedor' | 'personalizado'
  permissoes: Permissao[]
  ver_todos_clientes: boolean
}
const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Permission groups for display
const GRUPOS_PERMISSOES = [
  { label: 'Vendas', permissoes: ['clientes', 'faturas', 'orcamentos'] as Permissao[] },
  { label: 'Operação', permissoes: ['agenda', 'estoque', 'compras', 'projetos'] as Permissao[] },
  { label: 'Financeiro', permissoes: ['despesas', 'contas_pagar', 'contas_receber', 'caixa'] as Permissao[] },
  { label: 'Gestão', permissoes: ['relatorios', 'comissoes', 'vendedores', 'configuracoes'] as Permissao[] },
  { label: 'Outros', permissoes: ['quilometragem'] as Permissao[] },
]

function PermissoesGrid({
  selected,
  onChange,
}: {
  selected: Permissao[]
  onChange: (p: Permissao[]) => void
}) {
  const toggle = (p: Permissao) => {
    if (selected.includes(p)) {
      onChange(selected.filter(x => x !== p))
    } else {
      onChange([...selected, p])
    }
  }
  const toggleAll = () => {
    if (selected.length === TODAS_PERMISSOES.length) {
      onChange([])
    } else {
      onChange([...TODAS_PERMISSOES])
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{selected.length} de {TODAS_PERMISSOES.length} selecionadas</span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-[#6F2738] hover:underline font-medium"
        >
          {selected.length === TODAS_PERMISSOES.length ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </div>
      {GRUPOS_PERMISSOES.map(grupo => (
        <div key={grupo.label}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{grupo.label}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {grupo.permissoes.map(p => (
              <label
                key={p}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer text-sm transition-all ${
                  selected.includes(p)
                    ? 'border-[#6F2738] bg-[#6F2738]/8 text-[#4A1A26] font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selected.includes(p)}
                  onChange={() => toggle(p)}
                />
                <div className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${
                  selected.includes(p) ? 'bg-[#6F2738] border-[#6F2738]' : 'border-gray-300'
                }`}>
                  {selected.includes(p) && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="truncate">{LABEL_PERMISSOES[p]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">Admin</span>
  }
  if (role === 'personalizado') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 inline-flex items-center gap-1">
        <Sliders className="w-3 h-3" />
        Personalizado
      </span>
    )
  }
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Vendedor</span>
}

export function Vendedores() {
  const navigate = useNavigate()
  const { isAdmin, criarVendedor, atualizarVendedor, ativarDesativarUsuario, excluirUsuario } = useAuth()

  const [vendedores, setVendedores] = useState<User[]>([])
  const [stats, setStats] = useState<Record<string, VendedorStats>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showNew, setShowNew] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)

  // Modal Faturas do Vendedor
  const [faturasModalVendedor, setFaturasModalVendedor] = useState<User | null>(null)
  const [faturasVendedor, setFaturasVendedor] = useState<any[]>([])
  const [loadingFaturas, setLoadingFaturas] = useState(false)
  const [filterFaturasStatus, setFilterFaturasStatus] = useState('all')

  // Modal Clientes do Vendedor
  const [clientesModalVendedor, setClientesModalVendedor] = useState<User | null>(null)
  const [clientesVendedor, setClientesVendedor] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [searchClientes, setSearchClientes] = useState('')

  const getSubtotal = (inv: any) => {
    if (inv.subtotal != null) return inv.subtotal
    const frete = inv.shipping || inv.taxa_envio || inv.frete || inv.shipping_cost || 0
    return Math.max(0, (inv.total || 0) - frete)
  }

  const abrirFaturasVendedor = async (v: User) => {
    setFaturasModalVendedor(v)
    setLoadingFaturas(true)
    setFaturasVendedor([])
    setFilterFaturasStatus('all')
    try {
      const snap = await getDocs(query(collection(db, 'invoices'), where('vendedor_id', '==', (v as any).uid || (v as any).id || '')))
      setFaturasVendedor(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { toast.error('Erro ao carregar faturas') }
    finally { setLoadingFaturas(false) }
  }

  const abrirClientesVendedor = async (v: User) => {
    setClientesModalVendedor(v)
    setLoadingClientes(true)
    setClientesVendedor([])
    setSearchClientes('')
    try {
      const snap = await getDocs(query(collection(db, 'clientes'), where('vendedor_id', '==', (v as any).uid || (v as any).id || '')))
      setClientesVendedor(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { toast.error('Erro ao carregar clientes') }
    finally { setLoadingClientes(false) }
  }

  const formatCurrencyV = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)

  // Forms
  const [form, setForm] = useState<FormData>(emptyForm)
  const [editForm, setEditForm] = useState<EditForm>({
    nome: '', telefone: '', email: '', comissao_percentual: 10,
    role: 'vendedor', permissoes: [], ver_todos_clientes: false
  })
  const [showPwd, setShowPwd] = useState(false)
  const [showPwdCard, setShowPwdCard] = useState<Record<string, boolean>>({})
  const [newPassword, setNewPassword] = useState('')
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchVendedores()
  }, [isAdmin])

  const fetchVendedores = async () => {
    try {
      setLoading(true)
      // Fetch all non-admin users
      const snap = await getDocs(query(collection(db, 'users')))
      const lista = snap.docs
        .map(d => ({ ...d.data(), uid: d.id } as User))
        .filter(u => u.role !== 'admin')
      setVendedores(lista)

      const statsMap: Record<string, VendedorStats> = {}
      await Promise.all(lista.map(async v => {
        const [fatSnap, comSnap] = await Promise.all([
          getDocs(query(collection(db, 'invoices'))),
          getDocs(query(collection(db, 'comissoes'))),
        ])
        // filter in memory to avoid index issues
        const fatDocs = fatSnap.docs.filter(d => d.data().vendedor_id === v.uid)
        const comDocs = comSnap.docs.filter(d => d.data().vendedor_id === v.uid)
        // Comissão calculada sobre o subtotal (sem frete/taxa de envio)
        const totalSubtotal = fatDocs.reduce((a, d) => {
          const inv = d.data()
          const sub = inv.subtotal != null ? inv.subtotal : Math.max(0, (inv.total || 0) - (inv.shipping || inv.taxa_envio || inv.frete || inv.shipping_cost || 0))
          return a + sub
        }, 0)
        const pct = lista.find(u => u.uid === v.uid)?.comissao_percentual ?? 20
        statsMap[v.uid] = {
          totalVendas: fatDocs.reduce((a, d) => a + (d.data().total || 0), 0),
          totalComissoes: comDocs.length > 0
            ? comDocs.reduce((a, d) => a + (d.data().valor_comissao || 0), 0)
            : totalSubtotal * (pct / 100),
          quantidadeFaturas: fatDocs.length,
        }
      }))
      setStats(statsMap)
    } catch (e) { console.error(e); toast.error('Erro ao carregar vendedores') }
    finally { setLoading(false) }
  }

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return }
    if (!form.email.trim()) { toast.error('Email obrigatório'); return }
    if (form.password.length < 6) { toast.error('Senha mínima de 6 caracteres'); return }
    if (form.password !== form.confirmPassword) { toast.error('Senhas não conferem'); return }
    if (form.comissao_percentual < 0 || form.comissao_percentual > 100) { toast.error('Comissão entre 0% e 100%'); return }
    setSaving(true)
    try {
      await criarVendedor({
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        telefone: form.telefone.trim(),
        password: form.password,
        comissao_percentual: form.comissao_percentual,
        role: form.role,
        permissoes: form.role === 'personalizado' ? form.permissoes : undefined,
      })
      setShowNew(false)
      setForm(emptyForm)
      fetchVendedores()
    } catch (e: any) { toast.error(e.message || 'Erro ao criar vendedor') }
    finally { setSaving(false) }
  }

  const handleEdit = async () => {
    if (!editingUser) return
    if (!editForm.nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      await atualizarVendedor(editingUser.uid, {
        nome: editForm.nome.trim(),
        telefone: editForm.telefone.trim(),
        email: editForm.email.trim().toLowerCase(),
        comissao_percentual: editForm.comissao_percentual,
        role: editForm.role,
        permissoes: editForm.role === 'personalizado' ? editForm.permissoes : undefined,
        ver_todos_clientes: editForm.ver_todos_clientes,
      })
      setEditingUser(null)
      fetchVendedores()
    } catch (e: any) { toast.error(e.message || 'Erro ao atualizar') }
    finally { setSaving(false) }
  }

  const handleResetPassword = async () => {
    if (!passwordUser) return
    setSaving(true)
    try {
      const apiKey = 'AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0'
      const resetRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: passwordUser.email })
        }
      )
      const resetData = await resetRes.json()
      if (resetData.email) {
        toast.success(`Email de redefinição enviado para ${passwordUser.email}`)
        setPasswordUser(null)
      } else {
        const errMsg = resetData.error?.message || 'Erro desconhecido'
        if (errMsg === 'EMAIL_NOT_FOUND' || errMsg.includes('not found')) {
          toast.error(`Vendedor não encontrado no sistema de autenticação. Execute o script fix-vendor-logins.mjs para corrigir.`)
        } else {
          toast.error(`Erro: ${errMsg}`)
        }
      }
    } catch (e: any) {
      toast.error('Erro ao enviar email: ' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (v: User) => {
    try {
      await ativarDesativarUsuario(v.uid, !v.ativo)
      fetchVendedores()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (v: User) => {
    if (!confirm(`Tem certeza que deseja excluir ${v.nome}? Esta ação não pode ser desfeita.`)) return
    try {
      await excluirUsuario(v.uid)
      fetchVendedores()
    } catch (e: any) { toast.error(e.message) }
  }

  const openEdit = (v: User) => {
    setEditForm({
      nome: v.nome || '',
      telefone: v.telefone || '',
      email: v.email || '',
      comissao_percentual: v.comissao_percentual || 10,
      role: (v.role === 'personalizado' ? 'personalizado' : 'vendedor') as 'vendedor' | 'personalizado',
      permissoes: v.permissoes || [],
      ver_todos_clientes: v.ver_todos_clientes === true,
    })
    setEditingUser(v)
  }

  const filtered = vendedores.filter(v =>
    v.nome?.toLowerCase().includes(search.toLowerCase()) ||
    v.email?.toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6F2738]'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendedores</h1>
          <p className="text-gray-500 text-sm">{vendedores.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setShowNew(true) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#4A1A26]">
          <Plus className="w-4 h-4" /> Novo Vendedor
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar vendedor..." className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-[#6F2738]" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhum vendedor cadastrado</p>
          <p className="text-gray-300 text-sm mt-1">Clique em "Novo Vendedor" para adicionar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => {
            const s = stats[v.uid] || { totalVendas: 0, totalComissoes: 0, quantidadeFaturas: 0 }
            return (
              <div key={v.uid} className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${v.ativo ? 'border-gray-200 hover:border-[#6F2738]/40' : 'border-gray-100 opacity-60'}`}>
                {/* Top */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#6F2738]/10 flex items-center justify-center">
                      <span className="text-[#6F2738] font-bold text-lg">{(v.nome || '?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-gray-900">{v.nome}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {v.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                        <RoleBadge role={v.role} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="Editar"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { setPasswordUser(v) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Alterar Senha"><Key className="w-4 h-4" /></button>
                    <button onClick={() => handleToggle(v)} className={`p-1.5 rounded-lg ${v.ativo ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`} title={v.ativo ? 'Desativar' : 'Ativar'}>
                      <Power className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(v)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-2 text-gray-500 text-xs"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{v.email}</span></div>
                  {v.telefone && <div className="flex items-center gap-2 text-gray-500 text-xs"><Phone className="w-3.5 h-3.5" /><span>{v.telefone}</span></div>}
                  <div className="flex items-center gap-2 text-xs">
                    <Percent className="w-3.5 h-3.5 text-[#6F2738]" />
                    <span className="text-[#6F2738] font-semibold">{v.comissao_percentual || 10}% de comissão</span>
                  </div>
                  {v.role === 'personalizado' && v.permissoes && v.permissoes.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-600">
                      <Sliders className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{v.permissoes.length} permissão(ões) ativas</span>
                    </div>
                  )}
                </div>

                {/* Senha configurada */}
                <div className="mb-3 bg-gray-50 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Key className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 flex-shrink-0">Senha:</span>
                    <span className="text-xs font-mono font-semibold text-gray-800 truncate">
                      {showPwdCard[v.uid]
                        ? ((v as any).senha_configurada || '(não definida)')
                        : ((v as any).senha_configurada ? '••••••••' : '(não definida)')}
                    </span>
                  </div>
                  {(v as any).senha_configurada && (
                    <button
                      onClick={() => setShowPwdCard(prev => ({ ...prev, [v.uid]: !prev[v.uid] }))}
                      className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 flex-shrink-0"
                      title={showPwdCard[v.uid] ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPwdCard[v.uid] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {/* Stats */}
                <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{s.quantidadeFaturas}</p>
                    <p className="text-xs text-gray-400">Faturas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-green-600">{fmt(s.totalVendas)}</p>
                    <p className="text-xs text-gray-400">Vendas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-[#6F2738]">{fmt(s.totalComissoes)}</p>
                    <p className="text-xs text-gray-400">Comissão (sobre subtotal)</p>
                  </div>
                </div>
                <button
                  onClick={() => abrirFaturasVendedor(v)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#6F2738] text-[#6F2738] hover:bg-[#6F2738] hover:text-white text-sm font-semibold transition-all"
                >
                  <FileText className="w-4 h-4" /> Ver Faturas
                </button>
                <button
                  onClick={() => abrirClientesVendedor(v)}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white text-sm font-semibold transition-all"
                >
                  <Users className="w-4 h-4" /> Ver Clientes
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL: FATURAS DO VENDEDOR ── */}
      {faturasModalVendedor && (() => {
        const pct = (faturasModalVendedor as any).comissao_percentual ?? 20
        const STATUS_LABEL: Record<string, string> = { pago: 'Pago', parcial: 'Parcial', enviado: 'Enviado', atrasado: 'Atrasado', rascunho: 'Rascunho', cancelado: 'Cancelado', visualizado: 'Visualizado', aguardando_confirmacao: 'Aguardando' }
        const STATUS_COLOR: Record<string, string> = { pago: 'bg-green-100 text-green-700', parcial: 'bg-yellow-100 text-yellow-700', atrasado: 'bg-red-100 text-red-700', enviado: 'bg-blue-100 text-blue-700', rascunho: 'bg-gray-100 text-gray-500', cancelado: 'bg-gray-200 text-gray-500', visualizado: 'bg-purple-100 text-purple-700', aguardando_confirmacao: 'bg-orange-100 text-orange-700' }
        const toDateF = (v: any): Date | null => { try { if (!v) return null; if (typeof v?.toDate === 'function') return v.toDate(); if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000); const s = String(v).trim(); const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (dm) return new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00`); const ym = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (ym) return new Date(`${ym[1]}-${ym[2]}-${ym[3]}T12:00:00`); return new Date(s) } catch { return null } }
        const fmtDate = (v: any) => { const d = toDateF(v); return d ? d.toLocaleDateString('pt-BR') : '—' }
        const filtradas = filterFaturasStatus === 'all' ? faturasVendedor : faturasVendedor.filter(i => i.status === filterFaturasStatus)
        const totalFaturas = filtradas.reduce((s, i) => s + (i.total || 0), 0)
        const totalPago = filtradas.reduce((s, i) => s + (i.valor_pago || 0), 0)
        const totalComissaoModal = filtradas.reduce((s, i) => s + getSubtotal(i) * (pct / 100), 0)
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Faturas de {(faturasModalVendedor as any).nome || (faturasModalVendedor as any).name}</h2>
                  <p className="text-sm text-gray-500">Comissão: {pct}% sobre subtotal (sem frete)</p>
                </div>
                <button onClick={() => setFaturasModalVendedor(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
              </div>
              {/* Filtro */}
              <div className="px-5 py-3 border-b flex items-center gap-3">
                <select value={filterFaturasStatus} onChange={e => setFilterFaturasStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  <option value="all">Todos</option>
                  <option value="enviado">Enviado</option>
                  <option value="pago">Pago</option>
                  <option value="parcial">Parcial</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="aguardando_confirmacao">Aguardando</option>
                  <option value="visualizado">Visualizado</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <span className="text-sm text-gray-400">{filtradas.length} fatura(s)</span>
              </div>
              {/* Lista */}
              <div className="flex-1 overflow-y-auto">
                {loadingFaturas ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : filtradas.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">Nenhuma fatura encontrada</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fatura</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Comissão ({pct}%)</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Vencimento</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtradas.map(inv => {
                        const sub = getSubtotal(inv)
                        const comissao = sub * (pct / 100)
                        const venc = inv.data_vencimento || inv.vencimento || inv.data || inv.due_date
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{inv.numero || inv.id?.slice(0, 8)}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{inv.cliente_nome || '—'}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{formatCurrencyV(inv.total)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrencyV(sub)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-[#6F2738]">{formatCurrencyV(comissao)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[inv.status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABEL[inv.status] || inv.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-500">{fmtDate(venc)}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => window.open(`/invoices/${inv.id}/editar`, '_blank')} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Abrir fatura">
                                <FileText className="w-4 h-4 text-gray-400" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Totais */}
              <div className="border-t p-4 grid grid-cols-3 gap-4 bg-gray-50 rounded-b-2xl">
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Total das Faturas</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrencyV(totalFaturas)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Total Pago</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrencyV(totalPago)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Comissão Total ({pct}% subtotal)</p>
                  <p className="text-lg font-bold text-[#6F2738]">{formatCurrencyV(totalComissaoModal)}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MODAL: CLIENTES DO VENDEDOR ── */}
      {clientesModalVendedor && (() => {
        const nomeVendedor = (clientesModalVendedor as any).nome || (clientesModalVendedor as any).name || ''
        const clientesFiltrados = searchClientes.trim()
          ? clientesVendedor.filter(c =>
              (c.nome || '').toLowerCase().includes(searchClientes.toLowerCase()) ||
              (c.email || '').toLowerCase().includes(searchClientes.toLowerCase()) ||
              (c.telefone || '').includes(searchClientes)
            )
          : clientesVendedor
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Clientes de {nomeVendedor}</h2>
                  <p className="text-sm text-gray-500">{clientesVendedor.length} cliente{clientesVendedor.length !== 1 ? 's' : ''} cadastrado{clientesVendedor.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setClientesModalVendedor(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
              </div>
              {/* Search */}
              <div className="px-5 py-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={searchClientes}
                    onChange={e => setSearchClientes(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                  />
                </div>
              </div>
              {/* Lista */}
              <div className="flex-1 overflow-y-auto p-5">
                {loadingClientes ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                  </div>
                ) : clientesFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    {searchClientes ? 'Nenhum cliente encontrado' : 'Este vendedor não possui clientes cadastrados'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clientesFiltrados.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 font-bold text-sm">{(c.nome || '?')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{c.nome || '—'}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {c.email && <span className="text-xs text-gray-500 truncate">{c.email}</span>}
                            {c.telefone && <span className="text-xs text-gray-500">{c.telefone}</span>}
                          </div>
                        </div>
                        {c.cidade && <span className="text-xs text-gray-400 flex-shrink-0">{c.cidade}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MODAL: NOVO VENDEDOR ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><h2 className="text-lg font-bold text-gray-900">Novo Vendedor</h2><p className="text-xs text-gray-400 mt-0.5">Cria login de acesso ao sistema</p></div>
              <button onClick={() => setShowNew(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={labelCls}>Nome completo *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: João Silva" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="vendedor@email.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(555) 000-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Comissão (%)</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.5" value={form.comissao_percentual} onChange={e => setForm(f => ({ ...f, comissao_percentual: parseFloat(e.target.value) || 0 }))} className={`${inputCls} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Percentual sobre o valor das faturas pagas</p>
              </div>

              {/* Tipo de Acesso */}
              <div>
                <label className={labelCls}>Tipo de Acesso</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as 'vendedor' | 'personalizado', permissoes: [] }))}
                  className={inputCls}
                >
                  <option value="vendedor">Vendedor (acesso padrão)</option>
                  <option value="personalizado">Personalizado (escolha as permissões)</option>
                </select>
                {form.role === 'vendedor' && (
                  <p className="text-xs text-gray-400 mt-1">Acesso padrão: Dashboard, Clientes, Faturas, Orçamentos, Agenda</p>
                )}
              </div>

              {/* Permissões customizadas */}
              {form.role === 'personalizado' && (
                <div>
                  <label className={labelCls}>Permissões</label>
                  <div className="border border-gray-200 rounded-xl p-3">
                    <PermissoesGrid
                      selected={form.permissoes}
                      onChange={permissoes => setForm(f => ({ ...f, permissoes }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Senha *</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirmar Senha *</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repita a senha" className={`${inputCls} pr-10`} />
                  {form.confirmPassword && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {form.password === form.confirmPassword ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowNew(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={handleCreate} disabled={saving} className="flex-[2] py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Criando...' : 'Criar Vendedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR VENDEDOR ── */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><h2 className="text-lg font-bold text-gray-900">Editar Vendedor</h2><p className="text-xs text-gray-400 mt-0.5">{editingUser.email}</p></div>
              <button onClick={() => setEditingUser(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={labelCls}>Nome completo *</label>
                <input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={editForm.telefone} onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(555) 000-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Comissão (%)</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.5" value={editForm.comissao_percentual} onChange={e => setEditForm(f => ({ ...f, comissao_percentual: parseFloat(e.target.value) || 0 }))} className={`${inputCls} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </div>


              {/* Acesso Total a Clientes */}
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-blue-800">Ver todos os clientes</p>
                  <p className="text-xs text-blue-600">Permite gerar fatura/orçamento para qualquer cliente</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, ver_todos_clientes: !f.ver_todos_clientes }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.ver_todos_clientes ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.ver_todos_clientes ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {/* Tipo de Acesso */}
              <div>
                <label className={labelCls}>Tipo de Acesso</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'vendedor' | 'personalizado', permissoes: [] }))}
                  className={inputCls}
                >
                  <option value="vendedor">Vendedor (acesso padrão)</option>
                  <option value="personalizado">Personalizado (escolha as permissões)</option>
                </select>
                {editForm.role === 'vendedor' && (
                  <p className="text-xs text-gray-400 mt-1">Acesso padrão: Dashboard, Clientes, Faturas, Orçamentos, Agenda</p>
                )}
              </div>

              {/* Permissões customizadas */}
              {editForm.role === 'personalizado' && (
                <div>
                  <label className={labelCls}>Permissões</label>
                  <div className="border border-gray-200 rounded-xl p-3">
                    <PermissoesGrid
                      selected={editForm.permissoes}
                      onChange={permissoes => setEditForm(f => ({ ...f, permissoes }))}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditingUser(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={handleEdit} disabled={saving} className="flex-[2] py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ALTERAR SENHA ── */}
      {passwordUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setPasswordUser(null); setNewPassword(''); setShowNewPwd(false) }}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2"><Key className="w-5 h-5 text-[#6F2738]" /><h2 className="text-lg font-bold text-gray-900">Gerenciar Senha</h2></div>
                <p className="text-xs text-gray-400 mt-0.5">{passwordUser.nome} · {passwordUser.email}</p>
              </div>
              <button onClick={() => { setPasswordUser(null); setNewPassword(''); setShowNewPwd(false) }} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Senha atual salva */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Senha atual registrada</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <Key className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 text-sm font-mono font-medium text-gray-800">
                    {showPwdCard[passwordUser.uid]
                      ? ((passwordUser as any).senha_configurada || '(não definida)')
                      : ((passwordUser as any).senha_configurada ? '••••••••' : '(não definida)')}
                  </span>
                  {(passwordUser as any).senha_configurada && (
                    <button onClick={() => setShowPwdCard(p => ({ ...p, [passwordUser.uid]: !p[passwordUser.uid] }))} className="p-1 text-gray-400 hover:text-gray-700">
                      {showPwdCard[passwordUser.uid] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Nova senha */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Definir nova senha</label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Digite a nova senha..."
                    className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"
                  />
                  <button type="button" onClick={() => setShowNewPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Mínimo 6 caracteres. Salva no sistema para sua consulta.</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p>Após salvar, envie a senha para o vendedor via WhatsApp. Para ele trocar a senha, clique em <strong>"Enviar Email de Redefinição"</strong>.</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-2">
              {newPassword.length >= 6 && (
                <button
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await atualizarVendedor(passwordUser.uid, { senha_configurada: newPassword } as any)
                      setPasswordUser(prev => prev ? { ...prev, senha_configurada: newPassword } as any : prev)
                      setShowPwdCard(p => ({ ...p, [passwordUser.uid]: false }))
                      toast.success('Senha salva no sistema!')
                      setNewPassword('')
                    } catch { toast.error('Erro ao salvar senha') }
                    finally { setSaving(false) }
                  }}
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  {saving ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setPasswordUser(null); setNewPassword(''); setShowNewPwd(false) }} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Fechar</button>
                <button onClick={handleResetPassword} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {saving ? 'Enviando...' : 'Email Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
