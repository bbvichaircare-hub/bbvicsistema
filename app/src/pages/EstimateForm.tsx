import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { doc, getDoc, addDoc, updateDoc, collection, getDocs, Timestamp, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { ArrowLeft, Search, Trash2, Send, Save, FileText, Loader2, Percent, TrendingUp, Plus, Minus, FileDown, UserPlus, X } from 'lucide-react'
import { gerarPDFOrcamento } from '@/lib/pdfUtils'
import { v4 as uuidv4 } from 'uuid'

interface Cliente { id?: string; nome: string; telefone?: string; email?: string; endereco?: string }
interface Produto { id?: string; nome: string; preco_venda: number; preco_custo: number; descricao?: string }
interface ItemEstimate { tempId: string; produto_id: string; produto_nome: string; descricao: string; quantidade: number; preco_unitario: number; subtotal: number }
interface VendedorOpt { uid: string; nome: string; comissao_percentual?: number }

const VALIDADE_OPCOES = [
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
  { label: '60 dias', days: 60 },
  { label: 'Personalizado', days: -1 },
]

function addDays(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]
}

function openWhatsApp(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 100)
}

export function EstimateForm() {
  const { id } = useParams()
  const location = useLocation()
  const urlParams = new URLSearchParams(location.search)
  const navigate = useNavigate()
  const { user, isAdmin, getVendedores } = useAuth()
  const isEditing = !!id

  const [numero, setNumero] = useState('')
  const [dataEmissao, setDataEmissao] = useState<any>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [items, setItems] = useState<ItemEstimate[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [termosCondicoes, setTermosCondicoes] = useState('')
  const [validadeDias, setValidadeDias] = useState('30')
  const [dataValidade, setDataValidade] = useState(addDays(30))
  const [descontoInput, setDescontoInput] = useState('0')
  const [descontoTipo, setDescontoTipo] = useState<'pct' | 'valor'>('pct')
  const [taxaInput, setTaxaInput] = useState('6.25')
  const [originalToken, setOriginalToken] = useState('')
  const [_statusOriginal, setStatusOriginal] = useState('rascunho')
  const [markupInput, setMarkupInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [taxaEnvioInput, setTaxaEnvioInput] = useState('15.00')
  const [observacaoInterna, setObservacaoInterna] = useState('')

  // Vendedor
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([])
  const [vendedorId, setVendedorId] = useState('')
  const [vendedorNome, setVendedorNome] = useState('')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [searchCliente, setSearchCliente] = useState('')
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [showNovoClienteModal, setShowNovoClienteModal] = useState(false)
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: '', telefone: '', email: '' })
  const [savingNovoCliente, setSavingNovoCliente] = useState(false)

  const handleCriarClienteRapido = async () => {
    if (!novoClienteForm.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingNovoCliente(true)
    try {
      const ref = await addDoc(collection(db, 'clientes'), {
        nome: novoClienteForm.nome.trim(), telefone: novoClienteForm.telefone.trim(), email: novoClienteForm.email.trim(),
        vendedor_id: user?.uid, ativo: true, created_at: Timestamp.now(), updated_at: Timestamp.now(),
      })
      const nc = { id: ref.id, nome: novoClienteForm.nome.trim(), telefone: novoClienteForm.telefone.trim(), email: novoClienteForm.email.trim() }
      setClientes(prev => [...prev, nc])
      setCliente(nc); setSearchCliente(nc.nome)
      setShowNovoClienteModal(false); setNovoClienteForm({ nome: '', telefone: '', email: '' })
      toast.success('Cliente criado e selecionado!')
    } catch { toast.error('Erro ao criar cliente') }
    finally { setSavingNovoCliente(false) }
  }
  const clienteRef = useRef<HTMLDivElement>(null)

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [searchProduto, setSearchProduto] = useState('')
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false)
  const [produtoModal, setProdutoModal] = useState<any | null>(null);
  const [produtoModalQty, setProdutoModalQty] = useState(1);
  const [produtoModalObs, setProdutoModalObs] = useState('');
  const [produtoModalPreco, setProdutoModalPreco] = useState(0);

  const subtotal = items.reduce((a, i) => a + i.subtotal, 0)
  const desconto = descontoTipo === 'valor'
    ? Math.min(parseFloat(descontoInput) || 0, subtotal)
    : subtotal * (parseFloat(descontoInput) || 0) / 100
  const taxa = (subtotal - desconto) * (parseFloat(taxaInput) || 0) / 100
  const taxaEnvio = parseFloat(taxaEnvioInput) || 0
  const total = subtotal - desconto + taxa + taxaEnvio

  const handleDownloadPDF = () => {
    gerarPDFOrcamento({
      numero,
      cliente_nome: cliente?.nome || 'Cliente',
      cliente_email: (cliente as any)?.email,
      cliente_telefone: (cliente as any)?.telefone,
      cliente_endereco: (cliente as any)?.endereco,
      cliente_cidade: (cliente as any)?.cidade,
      cliente_estado: (cliente as any)?.estado,
      cliente_cep: (cliente as any)?.cep,
      data_emissao: dataEmissao || new Date(),
      data_validade: dataValidade ? new Date(dataValidade + 'T12:00:00') : undefined,
      items: items.map(i => ({
        produto_nome: i.produto_nome,
        descricao: i.descricao,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
      })),
      subtotal,
      desconto: desconto > 0 ? desconto : undefined,
      taxa: taxa > 0 ? taxa : undefined,
      taxa_envio: (parseFloat(taxaEnvioInput) || 0) > 0 ? parseFloat(taxaEnvioInput) : undefined,
      total,
      observacoes: observacoes || undefined,
      termos_condicoes: termosCondicoes || undefined,
      vendedor_nome: vendedorNome || undefined,
    });
  };

  useEffect(() => {
    loadClientes()
    loadProdutos()
    if (isAdmin) {
      getVendedores().then(vs => setVendedores(vs as VendedorOpt[]))
    }
    if (!isEditing) {
      const now = new Date()
      setNumero(`ORC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`)
      setLoading(false)
    } else {
      loadEstimate()
    }
  }, [id])

  useEffect(() => {
    if (!isAdmin && user?.uid) {
      setVendedorId(user.uid)
      setVendedorNome((user as any)?.nome || '')
    }
  }, [user, isAdmin])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) setShowClienteDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const loadClientes = async () => {
    try {
      const clientesRef = collection(db, 'clientes')
      const verTodos = isAdmin || user?.ver_todos_clientes === true
      const clientesQuery = !verTodos
        ? query(clientesRef, where('vendedor_id', '==', user?.uid))
        : clientesRef
      const snap = await getDocs(clientesQuery)
      const lista = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as Cliente[]
      setClientes(lista)
      if (!id) {
        const cliId = urlParams.get('cliente_id')
        const cliNome = urlParams.get('cliente_nome')
        if (cliId) {
          const found = lista.find(c => c.id === cliId)
          if (found) { setCliente(found); setSearchCliente(found.nome) }
          else if (cliNome) { setCliente({ id: cliId, nome: decodeURIComponent(cliNome) } as any); setSearchCliente(decodeURIComponent(cliNome)) }
        }
      }
    } catch { console.error('Erro ao carregar clientes') }
  }

  const loadProdutos = async () => {
    try {
      const snap = await getDocs(collection(db, 'produtos'))
      setProdutos(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as Produto[])
    } catch { console.error('Erro ao carregar produtos') }
  }

  const loadEstimate = async () => {
    try {
      const snap = await getDoc(doc(db, 'estimates', id!))
      if (snap.exists()) {
        const data: any = snap.data()
        setNumero(data.numero || '')
        setDataEmissao((data as any).data_emissao || (data as any).created_at || null)
        if (data.cliente_id) {
          const cliSnap = await getDoc(doc(db, 'clientes', data.cliente_id))
          if (cliSnap.exists()) {
            const cliData = cliSnap.data() as any
            setCliente({
              id: cliSnap.id,
              ...cliData,
              endereco: cliData.endereco || (data as any).cliente_endereco || '',
              cidade: cliData.cidade || (data as any).cliente_cidade || '',
              estado: cliData.estado || (data as any).cliente_estado || '',
              cep: cliData.cep || (data as any).cliente_cep || '',
              email: cliData.email || (data as any).cliente_email || '',
              telefone: cliData.telefone || (data as any).cliente_telefone || '',
            } as Cliente)
          } else {
            setCliente({
              id: data.cliente_id,
              nome: (data as any).cliente_nome || '',
              email: (data as any).cliente_email || '',
              telefone: (data as any).cliente_telefone || '',
              endereco: (data as any).cliente_endereco || '',
              cidade: (data as any).cliente_cidade || '',
              estado: (data as any).cliente_estado || '',
              cep: (data as any).cliente_cep || '',
            } as Cliente)
          }
        }
        setSearchCliente(data.cliente_nome || '')
        setItems((data.items || []).map((i: any) => ({ ...i, tempId: uuidv4() })))
        setObservacoes(data.observacoes || '')
        setTermosCondicoes(data.termos_condicoes || '')
        const dTipo: 'pct' | 'valor' = data.desconto_tipo || 'pct';
        setDescontoTipo(dTipo);
        setDescontoInput(dTipo === 'valor'
          ? String(data.desconto || 0)
          : String(data.desconto_pct || 0));
        setTaxaInput(data.taxa_pct ? String(data.taxa_pct) : '6.25')
        if (data.data_validade) {
          const d = data.data_validade.toDate ? data.data_validade.toDate() : new Date(data.data_validade)
          setDataValidade(d.toISOString().split('T')[0])
        }
        if (data.vendedor_id) { setVendedorId(data.vendedor_id); setVendedorNome(data.vendedor_nome || '') }
        if (data.taxa_envio !== undefined && data.taxa_envio !== null) setTaxaEnvioInput(String(data.taxa_envio))
        if (data.observacao_interna) setObservacaoInterna(data.observacao_interna)
        setOriginalToken(data.public_token || '')
        setStatusOriginal(data.status || 'rascunho')
      }
    } catch { toast.error('Erro ao carregar orçamento') }
    finally { setLoading(false) }
  }

  const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(searchCliente.toLowerCase())).slice(0, 8)
  const filteredProdutos = produtos.filter(p => {
    const terms = searchProduto.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = `${p.nome} ${p.descricao || ''}`.toLowerCase();
    return terms.every(t => haystack.includes(t));
  });

  const addItem = (produto: Produto, qty = 1, obs = '', precoCustom?: number) => {
    const preco = precoCustom !== undefined ? precoCustom : produto.preco_venda;
    setItems([{
      tempId: uuidv4(),
      produto_id: produto.id!,
      produto_nome: produto.nome,
      descricao: obs || produto.descricao || '',
      quantidade: qty,
      preco_unitario: preco,
      subtotal: qty * preco,
    }, ...items])
    setSearchProduto(''); setShowProdutoDropdown(false)
  }

  const openProdutoModal = (produto: any) => {
    setProdutoModal(produto);
    setProdutoModalQty(1);
    setProdutoModalObs('');
    setProdutoModalPreco(produto.preco_venda);
    setShowProdutoDropdown(false);
    setSearchProduto('');
  };

  const confirmProdutoModal = () => {
    if (!produtoModal) return;
    addItem(produtoModal, produtoModalQty, produtoModalObs, produtoModalPreco);
    setProdutoModal(null);
  };

  const updateQty = (tempId: string, qty: number) => {
    if (qty < 1) return
    setItems(items.map(i => i.tempId === tempId ? { ...i, quantidade: qty, subtotal: qty * i.preco_unitario } : i))
  }

  const updatePrice = (tempId: string, price: number) => {
    setItems(items.map(i => i.tempId === tempId ? { ...i, preco_unitario: price, subtotal: i.quantidade * price } : i))
  }

  const removeItem = (tempId: string) => setItems(items.filter(i => i.tempId !== tempId))

  const applyValidade = (days: number) => {
    if (days === -1) return
    setValidadeDias(String(days))
    setDataValidade(addDays(days))
  }

  const applyMarkup = () => {
    const pct = parseFloat(markupInput)
    if (!pct || pct <= 0) { toast.error('Informe um percentual válido'); return }
    const fator = 1 + pct / 100
    setItems(items.map(i => ({
      ...i,
      preco_unitario: Math.round(i.preco_unitario * fator * 100) / 100,
      subtotal: Math.round(i.quantidade * i.preco_unitario * fator * 100) / 100,
    })))
    toast.success(`Markup de ${pct}% aplicado em todos os itens`)
    setMarkupInput('')
  }

  const buildData = (status: string, token?: string) => ({
    numero,
    cliente_id: cliente?.id || '',
    cliente_nome: cliente?.nome || '',
    cliente_telefone: cliente?.telefone || '',
    cliente_email: cliente?.email || '',
    cliente_endereco: (cliente as any)?.endereco || '',
    cliente_cidade: (cliente as any)?.cidade || '',
    cliente_estado: (cliente as any)?.estado || '',
    cliente_cep: (cliente as any)?.cep || '',
    items: items.map(({ tempId, ...i }) => i),
    subtotal, desconto, desconto_tipo: descontoTipo, desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
    taxa, taxa_pct: parseFloat(taxaInput) || 6.25,
    total,
    observacoes, termos_condicoes: termosCondicoes,
    observacao_interna: observacaoInterna,
    taxa_envio: parseFloat(taxaEnvioInput) || 0,
    validade_dias: parseInt(validadeDias) || 30,
    data_validade: Timestamp.fromDate(new Date(dataValidade + 'T12:00:00')),
    status,
    public_token: token || uuidv4(),
    vendedor_id: vendedorId || user?.uid || '',
    vendedor_nome: vendedorNome || (user as any)?.nome || '',
    data_emissao: Timestamp.now(),
    created_at: Timestamp.now(),
  })

  const handleSave = async () => {
    if (!cliente) { toast.error('Selecione um cliente'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return }
    setSaving(true)
    try {
      if (isEditing) {
        const updateData: any = {
          numero,
          cliente_id: cliente?.id || '',
          cliente_nome: cliente?.nome || '',
          cliente_telefone: cliente?.telefone || '',
          cliente_email: (cliente as any)?.email || '',
          cliente_endereco: (cliente as any)?.endereco || '',
          cliente_cidade: (cliente as any)?.cidade || '',
          cliente_estado: (cliente as any)?.estado || '',
          cliente_cep: (cliente as any)?.cep || '',
          items: items.map(({ tempId, ...i }) => i),
          subtotal, desconto,
          desconto_tipo: descontoTipo,
          desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
          taxa, taxa_pct: parseFloat(taxaInput) || 6.25,
          total,
          observacoes, termos_condicoes: termosCondicoes,
          observacao_interna: observacaoInterna,
          taxa_envio: parseFloat(taxaEnvioInput) || 0,
          validade_dias: parseInt(validadeDias) || 30,
          data_validade: Timestamp.fromDate(new Date(dataValidade + 'T12:00:00')),
          vendedor_id: vendedorId || user?.uid || '',
          vendedor_nome: vendedorNome || (user as any)?.nome || '',
          updated_at: Timestamp.now(),
        }
        await updateDoc(doc(db, 'estimates', id!), updateData)
      } else {
        await addDoc(collection(db, 'estimates'), buildData('rascunho'))
      }
      toast.success('Orçamento salvo!')
      navigate('/estimates')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const handleSend = async () => {
    if (!cliente) { toast.error('Selecione um cliente'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return }
    if (!cliente.telefone) {
      toast.error('Cliente não tem telefone cadastrado. Cadastre o telefone primeiro.')
      return
    }
    setSaving(true)
    try {
      const token = originalToken || uuidv4()
      let estimateDocId = id || ''
      if (isEditing) {
        const updateData: any = {
          numero,
          cliente_id: cliente?.id || '',
          cliente_nome: cliente?.nome || '',
          cliente_telefone: cliente?.telefone || '',
          cliente_email: (cliente as any)?.email || '',
          cliente_endereco: (cliente as any)?.endereco || '',
          cliente_cidade: (cliente as any)?.cidade || '',
          cliente_estado: (cliente as any)?.estado || '',
          cliente_cep: (cliente as any)?.cep || '',
          items: items.map(({ tempId, ...i }) => i),
          subtotal, desconto,
          desconto_tipo: descontoTipo,
          desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
          taxa, taxa_pct: parseFloat(taxaInput) || 6.25,
          total,
          observacoes, termos_condicoes: termosCondicoes,
          observacao_interna: observacaoInterna,
          taxa_envio: parseFloat(taxaEnvioInput) || 0,
          validade_dias: parseInt(validadeDias) || 30,
          data_validade: Timestamp.fromDate(new Date(dataValidade + 'T12:00:00')),
          status: 'enviado',
          public_token: token,
          vendedor_id: vendedorId || user?.uid || '',
          vendedor_nome: vendedorNome || (user as any)?.nome || '',
          updated_at: Timestamp.now(),
        }
        await updateDoc(doc(db, 'estimates', id!), updateData)
        estimateDocId = id!
      } else {
        const data = buildData('enviado', token)
        const ref = await addDoc(collection(db, 'estimates'), data)
        estimateDocId = ref.id
      }
      const estimateUrl = `${window.location.origin}/estimate/${estimateDocId}`
      const dataEnvio = new Date().toLocaleDateString('pt-BR')
      const dataVal = dataValidade ? new Date(dataValidade + 'T12:00:00').toLocaleDateString('pt-BR') : ''

      let msgTemplate = `Olá {NOME}!\n\nSegue o orçamento da BBVIC Hair Care:\n{LINK}\n\nTotal: {TOTAL}\nVálido até: {VALIDADE}\nEmitido em: {DATA_ENVIO}`
      try {
        const snapMsg = await getDoc(doc(db, 'configuracoes', 'mensagens'))
        if (snapMsg.exists() && snapMsg.data().orcamento) msgTemplate = snapMsg.data().orcamento
      } catch { /* usa padrão */ }

      const msg = msgTemplate
        .replace(/{NOME}/g, cliente?.nome || '')
        .replace(/{NUMERO}/g, numero)
        .replace(/{TOTAL}/g, formatCurrency(total))
        .replace(/{VALIDADE}/g, dataVal)
        .replace(/{DATA_ENVIO}/g, dataEnvio)
        .replace(/{LINK}/g, estimateUrl)
        .replace(/{CONSULTOR}/g, vendedorNome || '')
      const phone = cliente.telefone.replace(/\D/g, '')
      openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`)
      toast.success(`Orçamento enviado para ${cliente.nome}!`)
      navigate('/estimates')
    } catch { toast.error('Erro ao enviar') } finally { setSaving(false) }
  }

  const handleConvertToInvoice = async () => {
    if (!cliente) { toast.error('Salve o orçamento primeiro'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return }
    if (!confirm(`Converter orçamento ${numero} em fatura?`)) return
    setSaving(true)
    try {
      const invoiceNumero = `INV-${Date.now()}`
      await addDoc(collection(db, 'invoices'), {
        numero: invoiceNumero,
        cliente_id: cliente.id || '',
        cliente_nome: cliente.nome,
        cliente_email: cliente.email || '',
        cliente_telefone: cliente.telefone || '',
        items: items.map(({ tempId, ...i }) => i),
        subtotal, desconto, taxa, total,
        taxa_envio: parseFloat(taxaEnvioInput) || 0,
        deposit: 0, payment_terms: 'Net 30', status: 'rascunho',
        observacoes,
        data_emissao: Timestamp.now(),
        data_vencimento: Timestamp.fromDate(new Date(addDays(30))),
        vendedor_id: user?.uid,
        vendedor_nome: (user as any)?.nome || '',
        public_token: uuidv4(),
        visualizado: false, visualizado_count: 0,
        estimate_origem: id || '',
        created_at: Timestamp.now(),
      })
      if (id) await updateDoc(doc(db, 'estimates', id), { status: 'aprovado', invoice_gerado: invoiceNumero })
      // Stock deduction on conversion
      try {
        const { collection: col, addDoc: add, doc: d, updateDoc: up, Timestamp: T, getDoc: gdc } = await import('firebase/firestore')
        const { db: database } = await import('@/lib/firebase')
        for (const item of items) {
          if (!item.produto_id) continue
          try {
            const prodSnap = await gdc(d(database, 'produtos', item.produto_id))
            if (!prodSnap.exists()) continue
            const prod = prodSnap.data()
            const qtd = item.quantidade || 1
            const estoque_antes = prod.estoque || 0
            const estoque_depois = Math.max(0, estoque_antes - qtd)
            await up(d(database, 'produtos', item.produto_id), { estoque: estoque_depois })
            await add(col(database, 'movimentos_estoque'), {
              produto_id: item.produto_id,
              produto_nome: item.produto_nome || prod.nome,
              tipo: 'venda',
              quantidade: qtd,
              estoque_antes,
              estoque_depois,
              observacao: `Conversão orçamento → fatura ${invoiceNumero}`,
              created_at: T.now(),
            })
          } catch(e) { console.error('Erro mov venda:', e) }
        }
      } catch(e) { console.error('Erro deducao estoque:', e) }
      toast.success(`Fatura ${invoiceNumero} criada!`)
      navigate('/invoices')
    } catch { toast.error('Erro ao converter') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[#6F2738]" /></div>

  return (
    <>
    <div className="max-w-4xl mx-auto pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/estimates')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{isEditing ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>
          <p className="text-gray-400 text-xs font-mono">Nº {numero}</p>
        </div>
      </div>

      <div className="space-y-5">

        {/* Cliente */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">Cliente</h2>
          <div ref={clienteRef} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchCliente}
              onChange={e => { setSearchCliente(e.target.value); setCliente(null); setShowClienteDropdown(true) }}
              onFocus={() => setShowClienteDropdown(true)}
              placeholder="Buscar cliente..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738] text-sm"
            />
            {showClienteDropdown && clientesFiltrados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                {clientesFiltrados.map(c => (
                  <button key={c.id} onClick={() => { setCliente(c); setSearchCliente(c.nome); setShowClienteDropdown(false) }} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <p className="text-gray-900 text-sm font-medium">{c.nome}</p>
                    {c.telefone && <p className="text-gray-400 text-xs">{c.telefone}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowNovoClienteModal(true)} className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-[#6F2738] text-[#6F2738] text-sm font-medium hover:bg-[#6F2738]/5 transition-colors">
            <UserPlus className="w-4 h-4" /> Cadastrar novo cliente
          </button>
          {cliente && (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm text-gray-600 flex flex-wrap gap-2">
              <span className="font-medium text-gray-900">{cliente.nome}</span>
              {cliente.telefone && <span className="text-gray-500">{cliente.telefone}</span>}
              {!cliente.telefone && <span className="text-orange-500 text-xs">⚠️ Sem telefone - não será possível enviar via WhatsApp</span>}
            </div>
          )}
          {/* Vendedor (admin only) */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor responsável</label>
              <select
                value={vendedorId}
                onChange={e => {
                  const v = vendedores.find(x => x.uid === e.target.value)
                  setVendedorId(e.target.value)
                  setVendedorNome(v?.nome || '')
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738] text-sm"
              >
                <option value="">— Sem vendedor —</option>
                {vendedores.map(v => (
                  <option key={v.uid} value={v.uid}>{v.nome} {v.comissao_percentual ? `(${v.comissao_percentual}% comissão)` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {!isAdmin && vendedorNome && (
            <p className="mt-2 text-xs text-gray-400">Vendedor: <span className="font-medium text-gray-600">{vendedorNome}</span></p>
          )}
        </div>

        {/* Produtos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">Produtos / Serviços</h2>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchProduto}
              onChange={e => { setSearchProduto(e.target.value); setShowProdutoDropdown(e.target.value.length > 0) }}
              onFocus={() => searchProduto && setShowProdutoDropdown(true)}
              placeholder="Buscar produto ou serviço para adicionar..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738] text-sm"
            />
            {showProdutoDropdown && filteredProdutos.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                {filteredProdutos.map(p => (
                  <button key={p.id} onClick={() => openProdutoModal(p)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-2">
                    <span className="text-gray-900 text-sm font-medium">{p.nome}</span>
                    <span className="text-[#6F2738] font-semibold text-sm flex-shrink-0">{formatCurrency(p.preco_venda)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Nenhum item adicionado. Busque um produto acima.</p>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.tempId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-gray-900 text-sm flex-1 pr-2">{item.produto_nome}</p>
                    <button onClick={() => removeItem(item.tempId)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">Preço:</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                        <input
                          type="number" step="0.01" min="0" value={item.preco_unitario}
                          onChange={e => updatePrice(item.tempId, parseFloat(e.target.value) || 0)}
                          className="w-24 pl-5 pr-1 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738] text-right bg-white"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">Qtd:</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(item.tempId, item.quantidade - 1)} className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">{item.quantidade}</span>
                        <button onClick={() => updateQty(item.tempId, item.quantidade + 1)} className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="ml-auto">
                      <span className="font-semibold text-[#6F2738] text-sm">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={item.descricao || ''}
                      onChange={e => setItems(items.map(i => i.tempId === item.tempId ? { ...i, descricao: e.target.value } : i))}
                      placeholder="Observação deste item (visível na nota)..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#6F2738] text-gray-700 placeholder-gray-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Markup Interno */}
          {items.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Markup Interno</span>
                <span className="text-xs text-gray-400">(invisível para o cliente)</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <input
                    type="number" min="0" max="200" value={markupInput}
                    onChange={e => setMarkupInput(e.target.value)}
                    placeholder="Ex: 20"
                    className="w-28 px-3 py-2.5 rounded-xl border border-orange-200 text-gray-900 text-sm focus:outline-none focus:border-orange-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><Percent className="w-3.5 h-3.5" /></span>
                </div>
                <button
                  onClick={applyMarkup}
                  className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  Aplicar Markup
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Configurações + Resumo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900">Configurações</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
              <select value={validadeDias} onChange={e => { setValidadeDias(e.target.value); applyValidade(parseInt(e.target.value)) }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                {VALIDADE_OPCOES.map(o => <option key={o.label} value={o.days}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Validade</label>
              <input type="date" value={dataValidade} onChange={e => { setDataValidade(e.target.value); setValidadeDias('-1') }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desconto</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => { setDescontoTipo('pct'); setDescontoInput('0'); }}
                    className={`px-2 py-1 text-xs rounded-lg border font-medium transition ${descontoTipo === 'pct' ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200'}`}
                  >%</button>
                  <button
                    type="button"
                    onClick={() => { setDescontoTipo('valor'); setDescontoInput('0'); }}
                    className={`px-2 py-1 text-xs rounded-lg border font-medium transition ${descontoTipo === 'valor' ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200'}`}
                  >$</button>
                </div>
                <input type="number" min="0" value={descontoInput} onChange={e => setDescontoInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax (%)</label>
                <input type="number" min="0" max="30" step="0.01" value={taxaInput} onChange={e => setTaxaInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
                <p className="text-xs text-gray-400 mt-1">Padrão: 6.25%</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Envio ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={taxaEnvioInput} onChange={e => setTaxaEnvioInput(e.target.value)} placeholder="15.00" className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Padrão: $15.00 — edite conforme necessário</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                placeholder="Informações adicionais..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#6F2738] resize-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-orange-600 mb-1 flex items-center gap-1">🔒 Observação Interna <span className="text-xs font-normal text-gray-400">(cliente não vê)</span></label>
              <textarea value={observacaoInterna} onChange={e => setObservacaoInterna(e.target.value)} rows={2} placeholder="Anotações internas..." className="w-full px-3 py-2.5 rounded-xl border border-orange-200 bg-orange-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 resize-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Termos e Condições</label>
              <textarea value={termosCondicoes} onChange={e => setTermosCondicoes(e.target.value)} rows={2}
                placeholder="Condições de pagamento, políticas..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#6F2738] resize-none text-sm" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Resumo</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {desconto > 0 && <div className="flex justify-between text-gray-600"><span>Desconto ({descontoInput}%)</span><span className="text-red-500">-{formatCurrency(desconto)}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Tax ({taxaInput}%)</span><span>+{formatCurrency(taxa)}</span></div>
              {taxaEnvio > 0 && <div className="flex justify-between text-gray-600"><span>Taxa de Envio</span><span>+{formatCurrency(taxaEnvio)}</span></div>}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between text-gray-900 font-bold text-lg"><span>Total</span><span className="text-[#6F2738]">{formatCurrency(total)}</span></div>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">Válido até: <span className="font-medium text-gray-600">{new Date(dataValidade + 'T12:00:00').toLocaleDateString('pt-BR')}</span></p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {produtoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setProdutoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{produtoModal.nome}</h3>
                <p className="text-xs text-gray-400">Preço padrão: ${(produtoModal.preco_venda || 0).toFixed(2)}</p>
              </div>
              <button onClick={() => setProdutoModal(null)} className="p-2 hover:bg-gray-100 rounded-xl">✕</button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço unitário</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={produtoModalPreco}
                  onChange={e => setProdutoModalPreco(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-lg font-semibold focus:outline-none focus:border-[#6F2738]"
                />
              </div>
              {produtoModalPreco !== produtoModal.preco_venda && (
                <button
                  type="button"
                  onClick={() => setProdutoModalPreco(produtoModal.preco_venda)}
                  className="text-xs text-[#6F2738] mt-1 hover:underline"
                >
                  Restaurar preço padrão (${(produtoModal.preco_venda || 0).toFixed(2)})
                </button>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setProdutoModalQty(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-100">−</button>
                <input type="number" min="1" value={produtoModalQty} onChange={e => setProdutoModalQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-center text-lg font-bold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-[#6F2738]" />
                <button onClick={() => setProdutoModalQty(q => q + 1)} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-100">+</button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Subtotal: <span className="font-semibold text-[#6F2738]">${(produtoModalPreco * produtoModalQty).toFixed(2)}</span></p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação do item <span className="text-gray-400 font-normal">(aparece na nota)</span></label>
              <input type="text" value={produtoModalObs} onChange={e => setProdutoModalObs(e.target.value)} placeholder="Ex: Tamanho G, cor preta..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#6F2738]" autoFocus />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setProdutoModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmProdutoModal} className="flex-[2] py-3 rounded-xl bg-[#6F2738] text-white font-bold hover:bg-[#b8911f]">Adicionar à Nota</button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de ações fixa na parte inferior */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-30">
        <div className="max-w-4xl mx-auto flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 bg-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Salvar</span>
          </button>
          <button onClick={handleDownloadPDF}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#6F2738] text-[#6F2738] text-sm font-medium hover:bg-[#6F2738]/10 bg-white">
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={handleSend} disabled={saving}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold hover:bg-[#b8911f] disabled:opacity-60 shadow">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar WhatsApp
          </button>
          <button onClick={handleConvertToInvoice} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span className="hidden sm:inline">Fatura</span>
          </button>
        </div>
      </div>

    </div>

    {/* Modal Novo Cliente Rápido */}
    {showNovoClienteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Novo Cliente Rápido</h3>
            <button onClick={() => setShowNovoClienteModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({...p, nome: e.target.value}))} placeholder="Nome completo" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input type="text" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({...p, telefone: e.target.value}))} placeholder="+1 (555) 000-0000" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({...p, email: e.target.value}))} placeholder="email@exemplo.com" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"/>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowNovoClienteModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button onClick={handleCriarClienteRapido} disabled={savingNovoCliente} className="flex-[2] py-2.5 rounded-xl bg-[#6F2738] text-white text-sm font-bold hover:bg-[#4A1A26] disabled:opacity-50 flex items-center justify-center gap-2">
              {savingNovoCliente ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <UserPlus className="w-4 h-4"/>}
              Criar e Selecionar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}


