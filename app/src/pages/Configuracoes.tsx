import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Save, Loader2, DollarSign, CreditCard, Smartphone, Banknote, MessageSquare, ChevronDown, ChevronUp, FileText } from 'lucide-react'

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

interface MensagensConfig {
  fatura: string
  orcamento: string
  cobranca: string
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

const DEFAULT_MENSAGENS: MensagensConfig = {
  fatura: `Olá {NOME}!\n\nSegue sua fatura da BBVIC Hair Care:\n{LINK}\n\n{TOTAL_MSG}\nVencimento: {VENCIMENTO}\nEmitido em: {DATA_ENVIO}`,
  orcamento: `Olá {NOME}!\n\nSegue o orçamento da BBVIC Hair Care:\n{LINK}\n\nTotal: {TOTAL}\nVálido até: {VALIDADE}\nEmitido em: {DATA_ENVIO}`,
  cobranca: `Olá {NOME}!\n\nPassando para lembrar que sua fatura {NUMERO} no valor de {TOTAL} está em atraso desde {VENCIMENTO}. Por favor, entre em contato para regularizar. Obrigada!`,
}

const VARIAVEIS_FATURA = [
  { var: '{NOME}', desc: 'Nome do cliente' },
  { var: '{NUMERO}', desc: 'Número da fatura' },
  { var: '{TOTAL}', desc: 'Valor total' },
  { var: '{TOTAL_MSG}', desc: 'Total ou saldo (se parcial)' },
  { var: '{VENCIMENTO}', desc: 'Data de vencimento selecionada' },
  { var: '{DATA_ENVIO}', desc: 'Data de hoje (envio)' },
  { var: '{LINK}', desc: 'Link da fatura' },
  { var: '{JA_PAGO}', desc: 'Valor já pago (se parcial)' },
  { var: '{SALDO}', desc: 'Saldo restante (se parcial)' },
  { var: '{CONSULTOR}', desc: 'Nome do consultor/vendedor' },
]

const VARIAVEIS_ORCAMENTO = [
  { var: '{NOME}', desc: 'Nome do cliente' },
  { var: '{NUMERO}', desc: 'Número do orçamento' },
  { var: '{TOTAL}', desc: 'Valor total' },
  { var: '{VALIDADE}', desc: 'Data de validade selecionada' },
  { var: '{DATA_ENVIO}', desc: 'Data de hoje (envio)' },
  { var: '{LINK}', desc: 'Link do orçamento' },
  { var: '{CONSULTOR}', desc: 'Nome do consultor/vendedor' },
]

const VARIAVEIS_COBRANCA = [
  { var: '{NOME}', desc: 'Nome do cliente' },
  { var: '{NUMERO}', desc: 'Número da fatura' },
  { var: '{TOTAL}', desc: 'Valor total' },
  { var: '{VENCIMENTO}', desc: 'Data de vencimento' },
  { var: '{LINK}', desc: 'Link da fatura' },
]

interface EmpresaConfig {
  nome: string
  endereco: string
  cidade_estado: string
  telefone: string
  email: string
  website: string
  footer: string
  logo_url: string
}

const DEFAULT_EMPRESA: EmpresaConfig = {
  nome: 'BBVIC Hair Care',
  endereco: '10 Howe St',
  cidade_estado: 'Framingham MA',
  telefone: '617 768 7191',
  email: '',
  website: '',
  footer: 'Thank you for your business!',
  logo_url: '',
}

function VarList({ vars }: { vars: { var: string; desc: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-[#C9A227] hover:underline">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Ver variáveis disponíveis
      </button>
      {open && (
        <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-2 gap-1.5">
          {vars.map(v => (
            <div key={v.var} className="flex items-start gap-1.5">
              <code className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[#C9A227] font-mono flex-shrink-0">{v.var}</code>
              <span className="text-xs text-gray-500 mt-0.5">{v.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Configuracoes() {
  const { isAdmin } = useAuth()
  const [config, setConfig] = useState<PagamentoConfig>(DEFAULT_CONFIG)
  const [mensagens, setMensagens] = useState<MensagensConfig>(DEFAULT_MENSAGENS)
  const [empresa, setEmpresa] = useState<EmpresaConfig>(DEFAULT_EMPRESA)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingMsg, setSavingMsg] = useState(false)
  const [savingEmp, setSavingEmp] = useState(false)

  useEffect(() => { loadConfig() }, [])

  const loadConfig = async () => {
    try {
      const [snapPag, snapMsg, snapEmp] = await Promise.all([
        getDoc(doc(db, 'configuracoes', 'pagamentos')),
        getDoc(doc(db, 'configuracoes', 'mensagens')),
        getDoc(doc(db, 'configuracoes', 'empresa')),
      ])
      if (snapPag.exists()) setConfig({ ...DEFAULT_CONFIG, ...snapPag.data() } as PagamentoConfig)
      if (snapMsg.exists()) setMensagens({ ...DEFAULT_MENSAGENS, ...snapMsg.data() } as MensagensConfig)
      if (snapEmp.exists()) setEmpresa({ ...DEFAULT_EMPRESA, ...snapEmp.data() } as EmpresaConfig)
    } catch { console.error('Erro ao carregar configurações') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!isAdmin) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'configuracoes', 'pagamentos'), { ...config, updated_at: Timestamp.now() })
      toast.success('Configurações de pagamento salvas!')
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const handleSaveMensagens = async () => {
    if (!isAdmin) return
    setSavingMsg(true)
    try {
      await setDoc(doc(db, 'configuracoes', 'mensagens'), { ...mensagens, updated_at: Timestamp.now() })
      toast.success('Mensagens salvas!')
    } catch { toast.error('Erro ao salvar mensagens') }
    finally { setSavingMsg(false) }
  }

  const handleSaveEmpresa = async () => {
    if (!isAdmin) return
    setSavingEmp(true)
    try {
      await setDoc(doc(db, 'configuracoes', 'empresa'), { ...empresa, updated_at: Timestamp.now() })
      toast.success('Dados da empresa salvos! Os PDFs já usarão as novas informações.')
    } catch { toast.error('Erro ao salvar dados da empresa') }
    finally { setSavingEmp(false) }
  }

  const toggle = (field: keyof PagamentoConfig) => setConfig(c => ({ ...c, [field]: !c[field] }))

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[#C9A227]" /></div>
  if (!isAdmin) return <div className="text-center p-10 text-gray-400">Acesso restrito a administradores.</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Configurações</h1>
          <p className="text-gray-500 text-sm mt-0.5">Métodos de pagamento e mensagens WhatsApp</p>
        </div>
      </div>

      {/* ── CABEÇALHO DO PDF ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Cabeçalho do PDF (Invoice / Estimate)</p>
              <p className="text-xs text-gray-400">Dados da empresa que aparecem no topo de cada PDF</p>
            </div>
          </div>
          <button onClick={handleSaveEmpresa} disabled={savingEmp} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-60">
            {savingEmp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
              <input value={empresa.nome} onChange={e => setEmpresa(m => ({ ...m, nome: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input value={empresa.telefone} onChange={e => setEmpresa(m => ({ ...m, telefone: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input value={empresa.endereco} onChange={e => setEmpresa(m => ({ ...m, endereco: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade / Estado</label>
            <input value={empresa.cidade_estado} onChange={e => setEmpresa(m => ({ ...m, cidade_estado: e.target.value }))}
              placeholder="Ex: Framingham MA" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
              <input value={empresa.email} onChange={e => setEmpresa(m => ({ ...m, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website (opcional)</label>
              <input value={empresa.website} onChange={e => setEmpresa(m => ({ ...m, website: e.target.value }))}
                placeholder="https://..." className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de rodapé do PDF</label>
            <input value={empresa.footer} onChange={e => setEmpresa(m => ({ ...m, footer: e.target.value }))}
              placeholder="Thank you for your business!" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL da logo (opcional)</label>
            <input value={empresa.logo_url} onChange={e => setEmpresa(m => ({ ...m, logo_url: e.target.value }))}
              placeholder="https://... (deixe em branco para usar a logo padrão)" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]" />
            <p className="text-xs text-gray-400 mt-1">Cole a URL direta de uma imagem hospedada online. Se deixar em branco, usa a logo /logo-bbvic.jpg do sistema.</p>
          </div>
        </div>
      </div>

      {/* ── MENSAGENS WHATSAPP ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Mensagens WhatsApp</p>
              <p className="text-xs text-gray-400">Personalize as mensagens enviadas aos clientes</p>
            </div>
          </div>
          <button onClick={handleSaveMensagens} disabled={savingMsg} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60">
            {savingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        </div>

        <div className="p-5 space-y-6">

          {/* Fatura */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Mensagem de Fatura</label>
            <p className="text-xs text-gray-400 mb-2">Enviada quando você manda uma fatura para o cliente</p>
            <textarea
              value={mensagens.fatura}
              onChange={e => setMensagens(m => ({ ...m, fatura: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227] resize-y font-mono"
            />
            <VarList vars={VARIAVEIS_FATURA} />
          </div>

          {/* Orçamento */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Mensagem de Orçamento</label>
            <p className="text-xs text-gray-400 mb-2">Enviada quando você manda um orçamento para o cliente</p>
            <textarea
              value={mensagens.orcamento}
              onChange={e => setMensagens(m => ({ ...m, orcamento: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227] resize-y font-mono"
            />
            <VarList vars={VARIAVEIS_ORCAMENTO} />
          </div>

          {/* Cobrança */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Mensagem de Cobrança</label>
            <p className="text-xs text-gray-400 mb-2">Usada nos lembretes de faturas em atraso</p>
            <textarea
              value={mensagens.cobranca}
              onChange={e => setMensagens(m => ({ ...m, cobranca: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227] resize-y font-mono"
            />
            <VarList vars={VARIAVEIS_COBRANCA} />
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700 font-medium">Como funciona:</p>
            <ul className="text-xs text-blue-600 mt-1 space-y-0.5 list-disc list-inside">
              <li><strong>{'{DATA_ENVIO}'}</strong> = data de hoje (momento do envio)</li>
              <li><strong>{'{VENCIMENTO}'}</strong> = data de vencimento que você selecionar na fatura</li>
              <li><strong>{'{VALIDADE}'}</strong> = data de validade que você selecionar no orçamento</li>
            </ul>
          </div>

        </div>
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

      <div className="flex justify-end pb-8">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-[#C9A227] text-white rounded-xl font-medium hover:bg-[#b8911f] disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Pagamentos
        </button>
      </div>
    </div>
  )
}
