import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import {
  Users, Search, Mail, Phone, Plus, Edit2, Key, Power,
  Trash2, X, Eye, EyeOff, Percent,
  CheckCircle, XCircle, Loader2
} from 'lucide-react'
import type { User } from '@/types'

interface VendedorStats { totalVendas: number; totalComissoes: number; quantidadeFaturas: number }
interface FormData {
  nome: string; email: string; telefone: string
  password: string; confirmPassword: string
  comissao_percentual: number
}
const emptyForm: FormData = { nome:'', email:'', telefone:'', password:'', confirmPassword:'', comissao_percentual:10 }

const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`

export function Vendedores() {
  const navigate = useNavigate()
  const { isAdmin, criarVendedor, atualizarVendedor, ativarDesativarUsuario, excluirUsuario, resetarSenha } = useAuth()

  const [vendedores, setVendedores] = useState<User[]>([])
  const [stats, setStats] = useState<Record<string, VendedorStats>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showNew, setShowNew] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)

  // Forms
  const [form, setForm] = useState<FormData>(emptyForm)
  const [editForm, setEditForm] = useState({ nome:'', telefone:'', email:'', comissao_percentual:10 })
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchVendedores()
  }, [isAdmin])

  const fetchVendedores = async () => {
    try {
      setLoading(true)
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'vendedor')))
      const lista = snap.docs.map(d => ({ ...d.data(), uid: d.id })) as User[]
      setVendedores(lista)

      const statsMap: Record<string, VendedorStats> = {}
      await Promise.all(lista.map(async v => {
        const [fatSnap, comSnap] = await Promise.all([
          getDocs(query(collection(db,'invoices'), where('vendedor_id','==',v.uid))),
          getDocs(query(collection(db,'comissoes'), where('vendedor_id','==',v.uid))),
        ])
        statsMap[v.uid] = {
          totalVendas: fatSnap.docs.reduce((a,d) => a+(d.data().total||0), 0),
          totalComissoes: comSnap.docs.reduce((a,d) => a+(d.data().valor_comissao||0), 0),
          quantidadeFaturas: fatSnap.size,
        }
      }))
      setStats(statsMap)
    } catch(e) { console.error(e); toast.error('Erro ao carregar vendedores') }
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
      })
      setShowNew(false)
      setForm(emptyForm)
      fetchVendedores()
    } catch(e: any) { toast.error(e.message || 'Erro ao criar vendedor') }
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
      })
      setEditingUser(null)
      fetchVendedores()
    } catch(e: any) { toast.error(e.message || 'Erro ao atualizar') }
    finally { setSaving(false) }
  }

  const handlePasswordReset = async () => {
    if (!passwordUser) return
    if (newPassword.length < 6) { toast.error('Senha mínima de 6 caracteres'); return }
    if (newPassword !== confirmNewPassword) { toast.error('Senhas não conferem'); return }
    setSaving(true)
    try {
      await resetarSenha(passwordUser.uid, newPassword)
      setPasswordUser(null)
      setNewPassword('')
      setConfirmNewPassword('')
    } catch(e: any) { toast.error(e.message || 'Erro ao redefinir senha') }
    finally { setSaving(false) }
  }

  const handleToggle = async (v: User) => {
    try {
      await ativarDesativarUsuario(v.uid, !v.ativo)
      fetchVendedores()
    } catch(e: any) { toast.error(e.message) }
  }

  const handleDelete = async (v: User) => {
    if (!confirm(`Tem certeza que deseja excluir ${v.nome}? Esta ação não pode ser desfeita.`)) return
    try {
      await excluirUsuario(v.uid)
      fetchVendedores()
    } catch(e: any) { toast.error(e.message) }
  }

  const openEdit = (v: User) => {
    setEditForm({ nome:v.nome||'', telefone:v.telefone||'', email:v.email||'', comissao_percentual:v.comissao_percentual||10 })
    setEditingUser(v)
  }

  const filtered = vendedores.filter(v =>
    v.nome?.toLowerCase().includes(search.toLowerCase()) ||
    v.email?.toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#C9A227]'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendedores</h1>
          <p className="text-gray-500 text-sm">{vendedores.length} vendedor(es) cadastrado(s)</p>
        </div>
        <button onClick={()=>{ setForm(emptyForm); setShowNew(true) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-medium hover:bg-[#9A7B1A]">
          <Plus className="w-4 h-4"/> Novo Vendedor
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar vendedor..." className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-[#C9A227]"/>
        {search && (
          <button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4"/>
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 font-medium">Nenhum vendedor cadastrado</p>
          <p className="text-gray-300 text-sm mt-1">Clique em "Novo Vendedor" para adicionar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => {
            const s = stats[v.uid] || { totalVendas:0, totalComissoes:0, quantidadeFaturas:0 }
            return (
              <div key={v.uid} className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${v.ativo?'border-gray-200 hover:border-[#C9A227]/40':'border-gray-100 opacity-60'}`}>
                {/* Top */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#C9A227]/10 flex items-center justify-center">
                      <span className="text-[#C9A227] font-bold text-lg">{(v.nome||'?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{v.nome}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.ativo?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400'}`}>
                        {v.ativo?'Ativo':'Inativo'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={()=>openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="Editar"><Edit2 className="w-4 h-4"/></button>
                    <button onClick={()=>{ setPasswordUser(v); setNewPassword(''); setConfirmNewPassword('') }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Alterar Senha"><Key className="w-4 h-4"/></button>
                    <button onClick={()=>handleToggle(v)} className={`p-1.5 rounded-lg ${v.ativo?'hover:bg-red-50 text-gray-400 hover:text-red-500':'hover:bg-green-50 text-gray-400 hover:text-green-600'}`} title={v.ativo?'Desativar':'Ativar'}>
                      <Power className="w-4 h-4"/>
                    </button>
                    <button onClick={()=>handleDelete(v)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Excluir"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs"><Mail className="w-3.5 h-3.5 flex-shrink-0"/><span className="truncate">{v.email}</span></div>
                  {v.telefone && <div className="flex items-center gap-2 text-gray-500 text-xs"><Phone className="w-3.5 h-3.5"/><span>{v.telefone}</span></div>}
                  <div className="flex items-center gap-2 text-xs">
                    <Percent className="w-3.5 h-3.5 text-[#C9A227]"/>
                    <span className="text-[#C9A227] font-semibold">{v.comissao_percentual||10}% de comissão</span>
                  </div>
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
                    <p className="text-sm font-bold text-[#C9A227]">{fmt(s.totalComissoes)}</p>
                    <p className="text-xs text-gray-400">Comissão</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL: NOVO VENDEDOR ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={()=>setShowNew(false)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><h2 className="text-lg font-bold text-gray-900">Novo Vendedor</h2><p className="text-xs text-gray-400 mt-0.5">Cria login de acesso ao sistema</p></div>
              <button onClick={()=>setShowNew(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={labelCls}>Nome completo *</label>
                <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: João Silva" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="vendedor@email.com" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} placeholder="(555) 000-0000" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Comissão (%)</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.5" value={form.comissao_percentual} onChange={e=>setForm(f=>({...f,comissao_percentual:parseFloat(e.target.value)||0}))} className={`${inputCls} pr-8`}/>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Percentual sobre o valor das faturas pagas</p>
              </div>
              <div>
                <label className={labelCls}>Senha *</label>
                <div className="relative">
                  <input type={showPwd?'text':'password'} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Mínimo 6 caracteres" className={`${inputCls} pr-10`}/>
                  <button type="button" onClick={()=>setShowPwd(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirmar Senha *</label>
                <div className="relative">
                  <input type={showPwd?'text':'password'} value={form.confirmPassword} onChange={e=>setForm(f=>({...f,confirmPassword:e.target.value}))} placeholder="Repita a senha" className={`${inputCls} pr-10`}/>
                  {form.confirmPassword && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {form.password===form.confirmPassword?<CheckCircle className="w-4 h-4 text-green-500"/>:<XCircle className="w-4 h-4 text-red-400"/>}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={handleCreate} disabled={saving} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:null}
                {saving?'Criando...':'Criar Vendedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR VENDEDOR ── */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={()=>setEditingUser(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><h2 className="text-lg font-bold text-gray-900">Editar Vendedor</h2><p className="text-xs text-gray-400 mt-0.5">{editingUser.email}</p></div>
              <button onClick={()=>setEditingUser(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={labelCls}>Nome completo *</label>
                <input value={editForm.nome} onChange={e=>setEditForm(f=>({...f,nome:e.target.value}))} className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={editForm.email} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))} className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={editForm.telefone} onChange={e=>setEditForm(f=>({...f,telefone:e.target.value}))} placeholder="(555) 000-0000" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Comissão (%)</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.5" value={editForm.comissao_percentual} onChange={e=>setEditForm(f=>({...f,comissao_percentual:parseFloat(e.target.value)||0}))} className={`${inputCls} pr-8`}/>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={()=>setEditingUser(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={handleEdit} disabled={saving} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:null}
                {saving?'Salvando...':'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ALTERAR SENHA ── */}
      {passwordUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={()=>setPasswordUser(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2"><Key className="w-5 h-5 text-[#C9A227]"/><h2 className="text-lg font-bold text-gray-900">Alterar Senha</h2></div>
                <p className="text-xs text-gray-400 mt-0.5">{passwordUser.nome} · {passwordUser.email}</p>
              </div>
              <button onClick={()=>setPasswordUser(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                A nova senha será enviada ao vendedor. Ele poderá fazer login com ela imediatamente.
              </div>
              <div>
                <label className={labelCls}>Nova Senha *</label>
                <div className="relative">
                  <input type={showNewPwd?'text':'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className={`${inputCls} pr-10`}/>
                  <button type="button" onClick={()=>setShowNewPwd(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showNewPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirmar Nova Senha *</label>
                <div className="relative">
                  <input type={showNewPwd?'text':'password'} value={confirmNewPassword} onChange={e=>setConfirmNewPassword(e.target.value)} placeholder="Repita a nova senha" className={`${inputCls} pr-10`}/>
                  {confirmNewPassword && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {newPassword===confirmNewPassword?<CheckCircle className="w-4 h-4 text-green-500"/>:<XCircle className="w-4 h-4 text-red-400"/>}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={()=>setPasswordUser(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={handlePasswordReset} disabled={saving} className="flex-[2] py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Key className="w-4 h-4"/>}
                {saving?'Enviando...':'Redefinir Senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
