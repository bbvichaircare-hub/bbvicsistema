import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Save, Loader2, DollarSign, CreditCard, Smartphone, Banknote } from 'lucide-react'

interface PagamentoConfig {
  venmo_username: string
  zelle_info: string
  zelle_tipo: 'telefone' | 'email'
  cash_instrucoes: string
  square_link_padrao: string
  square_ativo: boolean
  venmo_ativo: boolean
  zelle_ativo: boolean
  cash_ativo: boolean
  updated_at?: any
}

const DEFAULT_CONFIG: PagamentoConfig = {
  venmo_username: '',
  zelle_info: '',
  zelle_tipo: 'telefone',
  cash_instrucoes: 'Entre em contato para combinar o pagamento em dinheiro.',
  square_link_padrao: '',
  square_ativo: true,
  venmo_ativo: true,
  zelle_ativo: true,
  cash_ativo: true,
}

export function Configuracoes() {
  const { isAdmin } = useAuth()
  const [config, setConfig] = useState<PagamentoConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadConfig() }, [])

  const loadConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'configuracoes', 'pagamentos'))
      if (snap.exists()) setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as PagamentoConfig)
    } catch { console.error('Erro ao carregar configurações') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!isAdmin) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'configuracoes', 'pagamentos'), { ...config, updated_at: Timestamp.now() })
      toast.success('Configurações salvas!')
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const toggle = (field: keyof PagamentoConfig) => setConfig(c => ({ ...c, [field]: !c[field] }))

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[#C9A227]" /></div>
  if (!isAdmin) return <div className="text-center p-10 text-gray-400">Acesso restrito a administradores.</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Configurações</h1>
          <p className="text-gray-500 text-sm mt-0.5">Métodos de pagamento para seus clientes</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#C9A227] text-white rounded-xl text-sm font-medium hover:bg-[#b8911f] disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
      </div>

      {/* Square */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Square</p>
              <p className="text-xs text-gray-400">Link de pagamento por cartão</p>
            </div>
          </div>
          <button onClick={() => toggle('square_ativo')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.square_ativo ? 'bg-[#C9A227]' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.square_ativo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {config.square_ativo && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link Square padrão (opcional)</label>
            <input value={config.square_link_padrao} onChange={e => setConfig(c => ({ ...c, square_link_padrao: e.target.value }))}
              placeholder="https://square.link/..." className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" />
            <p className="text-xs text-gray-400 mt-1">Se não tiver link específico na fatura, este será usado. O sistema gera automaticamente quando as Functions estiverem ativas.</p>
          </div>
        )}
      </div>

      {/* Venmo */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Venmo</p>
              <p className="text-xs text-gray-400">Pagamento via app Venmo</p>
            </div>
          </div>
          <button onClick={() => toggle('venmo_ativo')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.venmo_ativo ? 'bg-[#C9A227]' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.venmo_ativo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {config.venmo_ativo && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seu usuário Venmo</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">@</span>
              <input value={config.venmo_username} onChange={e => setConfig(c => ({ ...c, venmo_username: e.target.value.replace('@', '') }))}
                placeholder="seu_usuario" className="w-full pl-7 pr-4 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
          </div>
        )}
      </div>

      {/* Zelle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Zelle</p>
              <p className="text-xs text-gray-400">Transferência bancária via Zelle</p>
            </div>
          </div>
          <button onClick={() => toggle('zelle_ativo')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.zelle_ativo ? 'bg-[#C9A227]' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.zelle_ativo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {config.zelle_ativo && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de chave Zelle</label>
              <div className="flex gap-3">
                {(['telefone', 'email'] as const).map(t => (
                  <button key={t} onClick={() => setConfig(c => ({ ...c, zelle_tipo: t }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${config.zelle_tipo === t ? 'bg-[#C9A227] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {t === 'telefone' ? '📱 Telefone' : '📧 Email'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{config.zelle_tipo === 'telefone' ? 'Número de Telefone' : 'Email'}</label>
              <input value={config.zelle_info} onChange={e => setConfig(c => ({ ...c, zelle_info: e.target.value }))}
                placeholder={config.zelle_tipo === 'telefone' ? '(555) 123-4567' : 'seu@email.com'}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
          </div>
        )}
      </div>

      {/* Cash */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Cash</p>
              <p className="text-xs text-gray-400">Pagamento em dinheiro</p>
            </div>
          </div>
          <button onClick={() => toggle('cash_ativo')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.cash_ativo ? 'bg-[#C9A227]' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.cash_ativo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {config.cash_ativo && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instruções para o cliente</label>
            <textarea value={config.cash_instrucoes} onChange={e => setConfig(c => ({ ...c, cash_instrucoes: e.target.value }))}
              rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227] resize-none"
              placeholder="Ex: Pague no salão no dia do serviço." />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-[#C9A227] text-white rounded-xl font-medium hover:bg-[#b8911f] disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Configurações
        </button>
      </div>
    </div>
  )
}
