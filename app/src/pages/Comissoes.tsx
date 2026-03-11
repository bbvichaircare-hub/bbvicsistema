import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, getDocs, updateDoc, doc, addDoc, Timestamp, where, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { toast } from 'sonner'
import {
  DollarSign, Search, CheckCircle, Calendar, Upload,
  Banknote, Smartphone, ChevronDown, ChevronUp, X, Loader2,
  TrendingUp, Clock, CreditCard, FileText, Edit2, Briefcase, Trash2
} from 'lucide-react'

interface ComissaoDoc {
  id: string
  vendedor_id: string
  vendedor_nome: string
  invoice_id: string
  invoice_numero: string
  cliente_nome: string
  valor_venda: number
  percentual: number
  valor_comissao: number
  status: 'pendente' | 'pago'
  data_venda: any
  data_pagamento?: any
  semana_paga?: string
}

interface VendedorSalario {
  uid: string
  nome: string
  salario_semanal: number
  semana_iso: string
  ja_pago: boolean
  data_pagamento?: any
  metodo_pagamento?: string
}

interface SemanaVendedor {
  key: string           // "vendedor_id|YYYY-Www"
  vendedor_id: string
  vendedor_nome: string
  percentual: number
  semana_label: string  // "03/03 - 09/03/2026"
  semana_iso: string    // "2026-W10"
  comissoes: ComissaoDoc[]
  total_vendas: number
  total_comissao: number
  status: 'pendente' | 'pago'
  data_pagamento?: any
  metodo_pagamento?: string
  comprovante_url?: string
}

const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (v: any) => {
  if (!v) return '—'
  const d = v?.toDate ? v.toDate() : new Date(v)
  return d.toLocaleDateString('pt-BR')
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getWeekRange(isoWeek: string): { start: Date; end: Date; label: string } {
  const [year, wStr] = isoWeek.split('-W')
  const w = parseInt(wStr)
  const jan4 = new Date(parseInt(year), 0, 4)
  const dayOfWeek = (jan4.getDay() + 6) % 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - dayOfWeek + (w - 1) * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const label = `${monday.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} – ${sunday.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })}`
  return { start: monday, end: sunday, label }
}

export function Comissoes() {
  const navigate = useNavigate()
  const { isAdmin, user } = useAuth()
  const [comissoes, setComissoes] = useState<ComissaoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'pago'>('todos')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [payModal, setPayModal] = useState<SemanaVendedor | null>(null)
  const [metodo, setMetodo] = useState<'venmo' | 'zelle' | 'cash'>('cash')
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [vendedoresSalario, setVendedoresSalario] = useState<VendedorSalario[]>([])
  const [salarioPayModal, setSalarioPayModal] = useState<VendedorSalario | null>(null)
  const [salarioMetodo, setSalarioMetodo] = useState<'venmo' | 'zelle' | 'cash'>('cash')
  const [salarioComprovante, setSalarioComprovante] = useState<File | null>(null)
  const [savingSalario, setSavingSalario] = useState(false)
  const [editSalarioModal, setEditSalarioModal] = useState<{uid: string; nome: string; valor: string} | null>(null)
  const [savingEditSalario, setSavingEditSalario] = useState(false)
  const salarioFileRef = useRef<HTMLInputElement>(null)
  const [deleteWeekConfirm, setDeleteWeekConfirm] = useState<SemanaVendedor | null>(null)
  const [deletingWeek, setDeletingWeek] = useState(false)
  const [editWeekModal, setEditWeekModal] = useState<SemanaVendedor | null>(null)
  const [editMetodo, setEditMetodo] = useState<'venmo' | 'zelle' | 'cash'>('cash')
  const [editComprovante, setEditComprovante] = useState<File | null>(null)
  const [savingEditWeek, setSavingEditWeek] = useState(false)
  const editComprovanteRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchComissoes()
    fetchVendedoresSalarios()
  }, [isAdmin])

  const fetchComissoes = async () => {
    try {
      setLoading(true)
      // Fetch all commissions
      const snap = await getDocs(query(collection(db, 'comissoes')))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ComissaoDoc[]

      // Fetch list of admin UIDs so we can exclude them
      const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')))
      const adminUids = new Set(usersSnap.docs.map(d => d.id))

      // Only keep commissions belonging to non-admin (vendedor) users
      const vendedorOnly = all.filter(c => !adminUids.has(c.vendedor_id))
      setComissoes(vendedorOnly)
    } catch (e) { console.error(e); toast.error('Erro ao carregar comissões') }
    finally { setLoading(false) }
  }

  // ── GROUP BY SELLER + WEEK ──────────────────────────────────────────────
  const semanas: SemanaVendedor[] = (() => {
    const map = new Map<string, SemanaVendedor>()

    for (const c of comissoes) {
      const date = c.data_venda?.toDate ? c.data_venda.toDate() : new Date(c.data_venda || Date.now())
      const iso = c.semana_paga || getISOWeek(date)
      const key = `${c.vendedor_id}|${iso}`
      const range = getWeekRange(iso)

      if (!map.has(key)) {
        map.set(key, {
          key,
          vendedor_id: c.vendedor_id,
          vendedor_nome: c.vendedor_nome,
          percentual: c.percentual,
          semana_label: range.label,
          semana_iso: iso,
          comissoes: [],
          total_vendas: 0,
          total_comissao: 0,
          status: 'pendente',
        })
      }
      const entry = map.get(key)!
      entry.comissoes.push(c)
      entry.total_vendas += (c.valor_venda || 0)
      entry.total_comissao += (c.valor_comissao || 0)
      if (c.status === 'pago') {
        entry.status = 'pago'
        entry.data_pagamento = c.data_pagamento
        entry.metodo_pagamento = (c as any).metodo_pagamento
        entry.comprovante_url = (c as any).comprovante_url
      }
    }

    // Sort: pending first, then by week descending
    return [...map.values()].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pendente' ? -1 : 1
      return b.semana_iso.localeCompare(a.semana_iso)
    })
  })()

  // Filters
  const filtered = semanas.filter(s => {
    const matchSearch = s.vendedor_nome.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || s.status === filtroStatus
    return matchSearch && matchStatus
  })

  const totalPendente = semanas.filter(s => s.status === 'pendente').reduce((a, s) => a + s.total_comissao, 0)
  const totalPago = semanas.filter(s => s.status === 'pago').reduce((a, s) => a + s.total_comissao, 0)
  const semanasPendentes = semanas.filter(s => s.status === 'pendente').length

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const openPayModal = (s: SemanaVendedor) => {
    setPayModal(s)
    setMetodo('cash')
    setComprovante(null)
  }

  const handlePagar = async () => {
    if (!payModal) return
    if ((metodo === 'venmo' || metodo === 'zelle') && !comprovante) {
      toast.error('Anexe o comprovante de pagamento')
      return
    }
    setSaving(true)
    try {
      let comprovanteUrl = ''
      let comprovanteNome = ''
      if (comprovante) {
        const storageRef = ref(storage, `comissoes/${Date.now()}_${comprovante.name.replace(/\s/g,'_')}`)
        await uploadBytes(storageRef, comprovante)
        comprovanteUrl = await getDownloadURL(storageRef)
        comprovanteNome = comprovante.name
      }

      const now = Timestamp.now()
      const metodoLabel = metodo === 'venmo' ? 'Venmo' : metodo === 'zelle' ? 'Zelle' : 'Cash'

      // Update all commission records for this week/seller
      for (const c of payModal.comissoes) {
        await updateDoc(doc(db, 'comissoes', c.id), {
          status: 'pago',
          data_pagamento: now,
          semana_paga: payModal.semana_iso,
          metodo_pagamento: metodo,
          comprovante_url: comprovanteUrl,
          comprovante_nome: comprovanteNome,
        })
      }

      // Create notification for the seller
      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'comissao_paga',
        titulo: 'Comissão Paga! 💰',
        mensagem: `Sua comissão da semana ${payModal.semana_label} foi paga via ${metodoLabel}. Valor: ${fmt(payModal.total_comissao)}`,
        usuario_id: payModal.vendedor_id,
        valor: payModal.total_comissao,
        metodo_pagamento: metodo,
        semana: payModal.semana_iso,
        lida: false,
        created_at: now,
      })

      // Log payment record
      await addDoc(collection(db, 'pagamentos_comissao'), {
        vendedor_id: payModal.vendedor_id,
        vendedor_nome: payModal.vendedor_nome,
        semana_iso: payModal.semana_iso,
        semana_label: payModal.semana_label,
        total_vendas: payModal.total_vendas,
        total_comissao: payModal.total_comissao,
        percentual: payModal.percentual,
        metodo_pagamento: metodo,
        comprovante_url: comprovanteUrl,
        comprovante_nome: comprovanteNome,
        invoices_ids: payModal.comissoes.map(c => c.invoice_id),
        data_pagamento: now,
        pago_por: user?.uid,
        pago_por_nome: (user as any)?.nome || 'Admin',
        created_at: now,
      })

      // Auto-create expense record so Dashboard despesas stays in sync
      await addDoc(collection(db, 'expenses'), {
        descricao: `Comissão - ${payModal.vendedor_nome} (${payModal.semana_label})`,
        valor: payModal.total_comissao,
        categoria: 'Comissão',
        data: now,
        vendedor_id: payModal.vendedor_id,
        vendedor_nome: payModal.vendedor_nome,
        origem: 'comissao',
        semana_iso: payModal.semana_iso,
        metodo_pagamento: metodo,
        comprovante_url: comprovanteUrl,
        created_at: now,
      })

      toast.success(`Comissão de ${payModal.vendedor_nome} marcada como paga via ${metodoLabel}!`)
      setPayModal(null)
      setComprovante(null)
      fetchComissoes()
    } catch (e) {
      console.error(e)
      toast.error('Erro ao registrar pagamento')
    } finally {
      setSaving(false)
    }
  }

  const fetchVendedoresSalarios = async () => {
    try {
      const currentWeekIso = getISOWeek(new Date())
      const vendedoresSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'vendedor')))
      const pagosSnap = await getDocs(query(collection(db, 'pagamentos_salario'), where('semana_iso', '==', currentWeekIso)))
      const pagosMap = new Map(pagosSnap.docs.map(d => [d.data().vendedor_id, d.data()]))
      const list: VendedorSalario[] = vendedoresSnap.docs
        .filter(d => d.data().role === 'vendedor')
        .map(d => {
          const data = d.data()
          const pago = pagosMap.get(d.id)
          return {
            uid: d.id,
            nome: data.nome || data.displayName || 'Vendedor',
            salario_semanal: data.salario_semanal || 0,
            semana_iso: currentWeekIso,
            ja_pago: !!pago,
            data_pagamento: pago?.data_pagamento,
            metodo_pagamento: pago?.metodo_pagamento,
          }
        })
      setVendedoresSalario(list)
    } catch(e) { console.error('Erro salarios:', e) }
  }

  const handlePagarSalario = async () => {
    if (!salarioPayModal) return
    if ((salarioMetodo === 'venmo' || salarioMetodo === 'zelle') && !salarioComprovante) {
      toast.error('Anexe o comprovante de pagamento'); return
    }
    setSavingSalario(true)
    try {
      let comprovanteUrl = ''
      if (salarioComprovante) {
        try {
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
          const { storage } = await import('@/lib/firebase')
          const storageRef = ref(storage, `salarios/${Date.now()}_${salarioComprovante.name.replace(/\s/g,'_')}`)
          await uploadBytes(storageRef, salarioComprovante)
          comprovanteUrl = await getDownloadURL(storageRef)
        } catch { /* non-critical */ }
      }
      const now = Timestamp.now()
      const metodoLabel = salarioMetodo === 'venmo' ? 'Venmo' : salarioMetodo === 'zelle' ? 'Zelle' : 'Cash'
      const weekRange = getWeekRange(salarioPayModal.semana_iso)
      await addDoc(collection(db, 'pagamentos_salario'), {
        vendedor_id: salarioPayModal.uid,
        vendedor_nome: salarioPayModal.nome,
        semana_iso: salarioPayModal.semana_iso,
        semana_label: weekRange.label,
        valor: salarioPayModal.salario_semanal,
        metodo_pagamento: salarioMetodo,
        comprovante_url: comprovanteUrl,
        data_pagamento: now,
        pago_por: user?.uid,
        created_at: now,
      })
      await addDoc(collection(db, 'expenses'), {
        descricao: `Salário Semanal - ${salarioPayModal.nome} (${weekRange.label})`,
        valor: salarioPayModal.salario_semanal,
        categoria: 'Salário',
        data: now,
        vendedor_id: salarioPayModal.uid,
        vendedor_nome: salarioPayModal.nome,
        origem: 'salario',
        semana_iso: salarioPayModal.semana_iso,
        metodo_pagamento: salarioMetodo,
        comprovante_url: comprovanteUrl,
        created_at: now,
      })
      await addDoc(collection(db, 'notificacoes'), {
        tipo: 'salario_pago',
        titulo: 'Salário Pago! 💰',
        mensagem: `Seu salário semanal de ${fmt(salarioPayModal.salario_semanal)} referente à semana ${weekRange.label} foi pago via ${metodoLabel}.`,
        usuario_id: salarioPayModal.uid,
        valor: salarioPayModal.salario_semanal,
        metodo_pagamento: salarioMetodo,
        semana: salarioPayModal.semana_iso,
        lida: false,
        created_at: now,
      })
      toast.success(`Salário de ${salarioPayModal.nome} pago via ${metodoLabel}!`)
      setSalarioPayModal(null); setSalarioComprovante(null)
      fetchVendedoresSalarios()
    } catch(e) { console.error(e); toast.error('Erro ao registrar pagamento de salário') }
    finally { setSavingSalario(false) }
  }

  const handleSalvarSalario = async () => {
    if (!editSalarioModal) return
    const valor = parseFloat(editSalarioModal.valor)
    if (isNaN(valor) || valor < 0) { toast.error('Valor inválido'); return }
    setSavingEditSalario(true)
    try {
      await updateDoc(doc(db, 'users', editSalarioModal.uid), { salario_semanal: valor })
      toast.success(`Salário de ${editSalarioModal.nome} atualizado para ${fmt(valor)}/semana`)
      setEditSalarioModal(null)
      fetchVendedoresSalarios()
    } catch(e) { console.error(e); toast.error('Erro ao salvar') }
    finally { setSavingEditSalario(false) }
  }

  const handleDeleteWeek = async () => {
    if (!deleteWeekConfirm) return
    setDeletingWeek(true)
    try {
      for (const c of deleteWeekConfirm.comissoes) {
        await deleteDoc(doc(db, 'comissoes', c.id))
      }
      // Remove pagamento_comissao record
      const pagSnap = await getDocs(query(collection(db, 'pagamentos_comissao'),
        where('vendedor_id', '==', deleteWeekConfirm.vendedor_id),
        where('semana_iso', '==', deleteWeekConfirm.semana_iso)
      ))
      for (const d2 of pagSnap.docs) await deleteDoc(d2.ref)
      // Remove expense record
      const expSnap = await getDocs(query(collection(db, 'expenses'),
        where('vendedor_id', '==', deleteWeekConfirm.vendedor_id),
        where('semana_iso', '==', deleteWeekConfirm.semana_iso),
        where('origem', '==', 'comissao')
      ))
      for (const d2 of expSnap.docs) await deleteDoc(d2.ref)
      toast.success(`Comissões de ${deleteWeekConfirm.vendedor_nome} excluídas!`)
      setDeleteWeekConfirm(null)
      fetchComissoes()
    } catch (e) { console.error(e); toast.error('Erro ao excluir') }
    finally { setDeletingWeek(false) }
  }

  const handleSaveEditWeek = async () => {
    if (!editWeekModal) return
    setSavingEditWeek(true)
    try {
      let comprovanteUrl = editWeekModal.comprovante_url || ''
      if (editComprovante) {
        try {
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
          const { storage } = await import('@/lib/firebase')
          const storageRef = ref(storage, `comissoes/${Date.now()}_${editComprovante.name.replace(/\s/g,'_')}`)
          await uploadBytes(storageRef, editComprovante)
          comprovanteUrl = await getDownloadURL(storageRef)
        } catch { /* non-critical */ }
      }
      for (const c of editWeekModal.comissoes) {
        await updateDoc(doc(db, 'comissoes', c.id), {
          metodo_pagamento: editMetodo,
          comprovante_url: comprovanteUrl,
        })
      }
      // Update pagamento_comissao
      const pagSnap = await getDocs(query(collection(db, 'pagamentos_comissao'),
        where('vendedor_id', '==', editWeekModal.vendedor_id),
        where('semana_iso', '==', editWeekModal.semana_iso)
      ))
      for (const d2 of pagSnap.docs) {
        await updateDoc(d2.ref, { metodo_pagamento: editMetodo, comprovante_url: comprovanteUrl })
      }
      // Update expense
      const expSnap = await getDocs(query(collection(db, 'expenses'),
        where('vendedor_id', '==', editWeekModal.vendedor_id),
        where('semana_iso', '==', editWeekModal.semana_iso),
        where('origem', '==', 'comissao')
      ))
      for (const d2 of expSnap.docs) {
        await updateDoc(d2.ref, { metodo_pagamento: editMetodo, comprovante_url: comprovanteUrl })
      }
      toast.success(`Comissão de ${editWeekModal.vendedor_nome} atualizada!`)
      setEditWeekModal(null); setEditComprovante(null)
      fetchComissoes()
    } catch (e) { console.error(e); toast.error('Erro ao salvar') }
    finally { setSavingEditWeek(false) }
  }

  const metodoConfig = {
    cash:  { label: 'Cash',  icon: Banknote,    color: 'bg-green-100 text-green-700 border-green-200',  active: 'bg-green-600 text-white border-green-600' },
    venmo: { label: 'Venmo', icon: Smartphone,   color: 'bg-blue-100 text-blue-700 border-blue-200',    active: 'bg-blue-600 text-white border-blue-600' },
    zelle: { label: 'Zelle', icon: CreditCard,   color: 'bg-purple-100 text-purple-700 border-purple-200', active: 'bg-purple-600 text-white border-purple-600' },
  }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Comissões</h1>
          <p className="text-gray-500 text-sm">Pagamentos semanais por vendedor</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">A Pagar</span>
            <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center"><Clock className="w-4 h-4 text-yellow-600"/></div>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{fmt(totalPendente)}</p>
          <p className="text-xs text-gray-400 mt-1">{semanasPendentes} semana(s) pendente(s)</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Já Pago</span>
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600"/></div>
          </div>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPago)}</p>
          <p className="text-xs text-gray-400 mt-1">total acumulado</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Geral</span>
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/15 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[#C9A227]"/></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalPendente + totalPago)}</p>
          <p className="text-xs text-gray-400 mt-1">{comissoes.length} registros</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar vendedor..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
        </div>
        <div className="flex gap-2">
          {(['todos','pendente','pago'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${filtroStatus===s?'bg-[#C9A227] text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'todos' ? 'Todos' : s === 'pago' ? 'Pagos' : 'Pendentes'}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <DollarSign className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 font-medium">Nenhuma comissão encontrada</p>
          <p className="text-gray-300 text-sm mt-1">Comissões são geradas automaticamente quando faturas são criadas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const isExp = expanded.has(s.key)
            return (
              <div key={s.key} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${s.status==='pago'?'border-gray-200 opacity-90':'border-[#C9A227]/30 shadow-amber-50'}`}>
                {/* Row header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.status==='pago'?'bg-green-100':'bg-[#C9A227]/15'}`}>
                      <span className={`font-bold text-base ${s.status==='pago'?'text-green-600':'text-[#C9A227]'}`}>{s.vendedor_nome.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{s.vendedor_nome}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status==='pago'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>
                          {s.status === 'pago' ? '✓ Pago' : 'Pendente'}
                        </span>
                        {s.metodo_pagamento && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{s.metodo_pagamento === 'cash' ? 'Cash' : s.metodo_pagamento === 'venmo' ? 'Venmo' : 'Zelle'}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                        <Calendar className="w-3 h-3 flex-shrink-0"/>
                        <span>{s.semana_label}</span>
                        <span>·</span>
                        <span>{s.comissoes.length} fatura(s)</span>
                        <span>·</span>
                        <span>{s.percentual > 0 ? `${s.percentual}%` : ''} comissão</span>
                        {s.status === 'pago' && s.data_pagamento && <><span>·</span><span>Pago em {fmtDate(s.data_pagamento)}</span></>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Vendas: {fmt(s.total_vendas || 0)}</p>
                      <p className={`font-bold text-lg ${s.status==='pago'?'text-green-600':'text-[#C9A227]'}`}>{fmt(s.total_comissao)}</p>
                    </div>
                    {s.status === 'pendente' && (
                      <button onClick={() => openPayModal(s)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-semibold hover:bg-[#9A7B1A] transition-colors">
                        <DollarSign className="w-4 h-4"/> Pagar
                      </button>
                    )}
                    {s.status === 'pago' && (
                      <>
                        <button
                          onClick={() => { setEditWeekModal(s); setEditMetodo((s.metodo_pagamento as any) || 'cash'); setEditComprovante(null) }}
                          className="p-2 rounded-xl hover:bg-gray-100 text-[#C9A227]"
                          title="Editar pagamento"
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>
                        <button
                          onClick={() => setDeleteWeekConfirm(s)}
                          className="p-2 rounded-xl hover:bg-red-50 text-red-400"
                          title="Excluir comissão"
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </>
                    )}
                    {s.comprovante_url && (
                      <a href={s.comprovante_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-gray-100 text-gray-400" title="Ver comprovante">
                        <FileText className="w-4 h-4"/>
                      </a>
                    )}
                    <button onClick={() => toggleExpand(s.key)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                      {isExp ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>

                {/* Expanded: individual invoices */}
                {isExp && (
                  <div className="border-t border-gray-100">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr className="text-xs text-gray-400 uppercase tracking-wide">
                          <th className="text-left px-5 py-2.5 font-medium">Fatura</th>
                          <th className="text-left px-5 py-2.5 font-medium">Cliente</th>
                          <th className="text-left px-5 py-2.5 font-medium">Data</th>
                          <th className="text-right px-5 py-2.5 font-medium">Venda</th>
                          <th className="text-right px-5 py-2.5 font-medium">Comissão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {s.comissoes.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-sm font-medium text-gray-900">{c.invoice_numero}</td>
                            <td className="px-5 py-3 text-sm text-gray-500">{c.cliente_nome}</td>
                            <td className="px-5 py-3 text-sm text-gray-400">{fmtDate(c.data_venda)}</td>
                            <td className="px-5 py-3 text-sm text-right font-medium text-gray-700">{fmt(c.valor_venda)}</td>
                            <td className="px-5 py-3 text-sm text-right font-bold text-[#C9A227]">{fmt(c.valor_comissao)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-gray-600">Total da Semana</td>
                          <td className="px-5 py-3 text-sm text-right font-bold text-gray-800">{fmt(s.total_vendas)}</td>
                          <td className="px-5 py-3 text-sm text-right font-bold text-[#C9A227]">{fmt(s.total_comissao)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* EDIT WEEK MODAL */}
      {editWeekModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditWeekModal(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Editar Pagamento</h3>
                <p className="text-sm text-gray-500">{editWeekModal.vendedor_nome} — {editWeekModal.semana_label}</p>
              </div>
              <button onClick={() => setEditWeekModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4"/></button>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Método de pagamento</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'venmo', 'zelle'] as const).map(m => (
                  <button key={m} onClick={() => setEditMetodo(m)} className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${editMetodo === m ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A227]'}`}>
                    {m === 'cash' ? 'Cash' : m === 'venmo' ? 'Venmo' : 'Zelle'}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Comprovante {editWeekModal.comprovante_url ? '(substituir)' : '(opcional)'}</p>
              <div onClick={() => editComprovanteRef.current?.click()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer ${editComprovante ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-[#C9A227]'}`}>
                {editComprovante ? <p className="text-sm text-green-700 font-medium">✓ {editComprovante.name}</p> : <p className="text-sm text-gray-400">{editWeekModal.comprovante_url ? 'Clique para trocar comprovante' : 'Clique para anexar comprovante'}</p>}
              </div>
              <input ref={editComprovanteRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={e => setEditComprovante(e.target.files?.[0] || null)}/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditWeekModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSaveEditWeek} disabled={savingEditWeek} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white font-bold hover:bg-[#9A7B1A] disabled:opacity-60 flex items-center justify-center gap-2">
                {savingEditWeek ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                {savingEditWeek ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE WEEK CONFIRM */}
      {deleteWeekConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteWeekConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500"/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Comissão</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir todas as comissões de <span className="font-semibold text-gray-900">{deleteWeekConfirm.vendedor_nome}</span> referente à semana <span className="font-semibold">{deleteWeekConfirm.semana_label}</span>? O registro de despesa vinculado também será removido.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteWeekConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDeleteWeek} disabled={deletingWeek} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deletingWeek && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALARY SECTION */}
      {vendedoresSalario.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#C9A227]" />
              <h2 className="font-semibold text-gray-900">Salários Semanais</h2>
            </div>
            <span className="text-xs text-gray-400">Semana atual</span>
          </div>
          <div className="divide-y divide-gray-50">
            {vendedoresSalario.map(v => (
              <div key={v.uid} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${v.ja_pago ? 'bg-green-100' : 'bg-[#C9A227]/15'}`}>
                    <span className={`font-bold text-base ${v.ja_pago ? 'text-green-600' : 'text-[#C9A227]'}`}>{v.nome.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{v.nome}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.ja_pago ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {v.ja_pago ? '✓ Pago' : 'Pendente'}
                      </span>
                    </div>
                    {v.ja_pago && v.metodo_pagamento && (
                      <p className="text-xs text-gray-400">Pago via {v.metodo_pagamento === 'cash' ? 'Cash' : v.metodo_pagamento === 'venmo' ? 'Venmo' : 'Zelle'}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`font-bold text-lg ${v.ja_pago ? 'text-green-600' : 'text-[#C9A227]'}`}>{fmt(v.salario_semanal)}<span className="text-xs font-normal text-gray-400">/sem</span></p>
                  <button
                    onClick={() => setEditSalarioModal({ uid: v.uid, nome: v.nome, valor: String(v.salario_semanal) })}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
                    title="Editar salário"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!v.ja_pago && (
                    <button
                      onClick={() => { setSalarioPayModal(v); setSalarioMetodo('cash'); setSalarioComprovante(null) }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-semibold hover:bg-[#9A7B1A] transition-colors"
                    >
                      <DollarSign className="w-4 h-4" /> Pagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EDIT SALARY MODAL */}
      {editSalarioModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditSalarioModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Editar Salário Semanal</h3>
              <button onClick={() => setEditSalarioModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Vendedor: <span className="font-semibold">{editSalarioModal.nome}</span></p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salário Semanal ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number" step="0.01" min="0"
                  value={editSalarioModal.valor}
                  onChange={e => setEditSalarioModal({ ...editSalarioModal, valor: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227] text-lg font-semibold"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditSalarioModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSalvarSalario} disabled={savingEditSalario} className="flex-1 py-3 rounded-xl bg-[#C9A227] text-white font-semibold hover:bg-[#9A7B1A] disabled:opacity-60 flex items-center justify-center gap-2">
                {savingEditSalario ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALARY PAYMENT MODAL */}
      {salarioPayModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSalarioPayModal(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Pagar Salário</h3>
                <p className="text-sm text-gray-500">{salarioPayModal.nome} — {fmt(salarioPayModal.salario_semanal)}</p>
              </div>
              <button onClick={() => setSalarioPayModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['cash', 'venmo', 'zelle'] as const).map(m => (
                <button key={m} onClick={() => setSalarioMetodo(m)} className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${salarioMetodo === m ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A227]'}`}>
                  {m === 'cash' ? 'Cash' : m === 'venmo' ? 'Venmo' : 'Zelle'}
                </button>
              ))}
            </div>
            {(salarioMetodo === 'venmo' || salarioMetodo === 'zelle') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Comprovante de pagamento</label>
                <div onClick={() => salarioFileRef.current?.click()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer ${salarioComprovante ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-[#C9A227]'}`}>
                  {salarioComprovante ? <p className="text-sm text-green-700 font-medium">✓ {salarioComprovante.name}</p> : <p className="text-sm text-gray-400">Clique para anexar comprovante</p>}
                </div>
                <input ref={salarioFileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={e => setSalarioComprovante(e.target.files?.[0] || null)} />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSalarioPayModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handlePagarSalario} disabled={savingSalario} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white font-bold hover:bg-[#9A7B1A] disabled:opacity-60 flex items-center justify-center gap-2">
                {savingSalario ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                {savingSalario ? 'Registrando...' : `Confirmar Pagamento ${fmt(salarioPayModal.salario_semanal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Confirmar Pagamento</h2>
                <p className="text-xs text-gray-400 mt-0.5">{payModal.vendedor_nome} · {payModal.semana_label}</p>
              </div>
              <button onClick={() => setPayModal(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5"/></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Vendedor</span><span className="font-semibold">{payModal.vendedor_nome}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Período</span><span>{payModal.semana_label}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Faturas</span><span>{payModal.comissoes.length} fatura(s)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total Vendas</span><span>{fmt(payModal.total_vendas || 0)}</span></div>
                <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                  <span>Comissão ({payModal.percentual}%)</span>
                  <span className="text-[#C9A227]">{fmt(payModal.total_comissao)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Método de Pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(metodoConfig) as [keyof typeof metodoConfig, typeof metodoConfig.cash][]).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setMetodo(k)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${metodo === k ? v.active : v.color}`}
                    >
                      <v.icon className="w-5 h-5"/>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comprovante upload for Venmo/Zelle */}
              {(metodo === 'venmo' || metodo === 'zelle') && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Comprovante {metodo === 'venmo' ? 'Venmo' : 'Zelle'} <span className="text-red-400">*</span>
                  </p>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${comprovante ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-[#C9A227] hover:bg-amber-50'}`}
                  >
                    {comprovante ? (
                      <div className="flex items-center justify-center gap-2 text-green-700 text-sm">
                        <CheckCircle className="w-4 h-4"/>
                        <span className="font-medium truncate max-w-xs">{comprovante.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-400">
                        <Upload className="w-5 h-5"/>
                        <p className="text-sm">Clique para anexar comprovante</p>
                        <p className="text-xs">PNG, JPG ou PDF</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setComprovante(e.target.files?.[0] || null)}/>
                </div>
              )}

              {metodo === 'cash' && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2">
                  <Banknote className="w-4 h-4 flex-shrink-0"/>
                  Pagamento em dinheiro. O vendedor será notificado automaticamente.
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setPayModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button
                onClick={handlePagar}
                disabled={saving}
                className="flex-[2] py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                {saving ? 'Processando...' : `Confirmar Pagamento ${fmt(payModal.total_comissao)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
