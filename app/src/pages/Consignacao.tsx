import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  PackageCheck, Plus, RotateCcw, ShoppingBag, Undo2, Search,
  Loader2, X, ChevronDown, ChevronUp, Receipt, FileText, History, Trash2,
} from 'lucide-react'
import type { ConsignacaoItem, ConsignacaoMovimento, Cliente, Produto } from '@/types'
import {
  buscarConsignacoes, buscarMovimentosConsignacao, entregarOuReporConsignacao,
  registrarVendaConsignacao, devolverConsignacao, excluirConsignacao,
} from '@/services/consignmentService'
import { gerarPDFReciboConsignacao } from '@/lib/pdfUtils'

const TIPO_LABEL: Record<ConsignacaoMovimento['tipo'], string> = {
  entrega: 'Entrega',
  reposicao: 'Reposição',
  venda: 'Venda',
  devolucao: 'Devolução',
}
const TIPO_STYLE: Record<ConsignacaoMovimento['tipo'], string> = {
  entrega: 'bg-blue-100 text-blue-700',
  reposicao: 'bg-purple-100 text-purple-700',
  venda: 'bg-green-100 text-green-700',
  devolucao: 'bg-gray-100 text-gray-600',
}

type ModalTipo = 'entrega' | 'reposicao' | 'venda' | 'devolucao' | 'excluir' | null

export function Consignacao() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [itens, setItens] = useState<ConsignacaoItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [movimentos, setMovimentos] = useState<Record<string, ConsignacaoMovimento[]>>({})

  const [modalTipo, setModalTipo] = useState<ModalTipo>(null)
  const [modalConsignacao, setModalConsignacao] = useState<ConsignacaoItem | null>(null)
  const [saving, setSaving] = useState(false)

  // form: nova entrega (mesmo padrão de busca/itens usado na criação de fatura)
  const [entregaCliente, setEntregaCliente] = useState<Cliente | null>(null)
  const [searchClienteEntrega, setSearchClienteEntrega] = useState('')
  const [showClienteDropdownEntrega, setShowClienteDropdownEntrega] = useState(false)
  const [searchProdutoEntrega, setSearchProdutoEntrega] = useState('')
  const [showProdutoDropdownEntrega, setShowProdutoDropdownEntrega] = useState(false)
  const [entregaItens, setEntregaItens] = useState<{ tempId: string; produto_id: string; produto_nome: string; estoque: number; quantidade: number; preco_unitario: number }[]>([])
  const [entregaObservacao, setEntregaObservacao] = useState('')

  // form: reposição
  const [novaQuantidade, setNovaQuantidade] = useState('')
  const [novaObservacao, setNovaObservacao] = useState('')

  // form: venda
  const [modoVenda, setModoVenda] = useState<'vendido' | 'restante'>('vendido')
  const [vendaValor, setVendaValor] = useState('')

  // form: devolução
  const [devolucaoQtd, setDevolucaoQtd] = useState('')

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchAll()
  }, [isAdmin])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [lista, clientesSnap, produtosSnap] = await Promise.all([
        buscarConsignacoes({ vendedorId: user?.uid, isAdmin }),
        getDocs(collection(db, 'clientes')),
        getDocs(collection(db, 'produtos')),
      ])
      setItens(lista)
      setClientes(clientesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Cliente[])
      setProdutos(produtosSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Produto[])
    } catch {
      toast.error('Erro ao carregar consignações')
    } finally { setLoading(false) }
  }

  const filtrados = useMemo(() => {
    if (!search.trim()) return itens
    const s = search.toLowerCase()
    return itens.filter(i => i.cliente_nome.toLowerCase().includes(s) || i.produto_nome.toLowerCase().includes(s))
  }, [itens, search])

  const agrupadoPorCliente = useMemo(() => {
    const map = new Map<string, ConsignacaoItem[]>()
    filtrados.forEach(i => {
      if (!map.has(i.cliente_id)) map.set(i.cliente_id, [])
      map.get(i.cliente_id)!.push(i)
    })
    return Array.from(map.entries()).map(([clienteId, lista]) => ({
      clienteId,
      clienteNome: lista[0]?.cliente_nome || '',
      itens: lista,
      totalPotencial: lista.reduce((a, i) => a + i.quantidade_em_consignacao * i.preco_unitario, 0),
    }))
  }, [filtrados])

  const stats = useMemo(() => ({
    totalItens: itens.length,
    totalUnidades: itens.reduce((a, i) => a + i.quantidade_em_consignacao, 0),
    valorPotencial: itens.reduce((a, i) => a + i.quantidade_em_consignacao * i.preco_unitario, 0),
    clientes: new Set(itens.map(i => i.cliente_id)).size,
  }), [itens])

  const toggleExpandir = async (item: ConsignacaoItem) => {
    if (!item.id) return
    if (expandido === item.id) { setExpandido(null); return }
    setExpandido(item.id)
    if (!movimentos[item.id]) {
      const lista = await buscarMovimentosConsignacao(item.id)
      setMovimentos(prev => ({ ...prev, [item.id!]: lista }))
    }
  }

  const clientesFiltradosEntrega = useMemo(() => {
    if (!searchClienteEntrega.trim()) return []
    const s = searchClienteEntrega.toLowerCase()
    return clientes.filter(c => c.nome.toLowerCase().includes(s)).slice(0, 8)
  }, [clientes, searchClienteEntrega])

  const produtosFiltradosEntrega = useMemo(() => {
    if (!searchProdutoEntrega.trim()) return []
    const s = searchProdutoEntrega.toLowerCase()
    return produtos.filter(p => p.nome.toLowerCase().includes(s) && !entregaItens.some(i => i.produto_id === p.id)).slice(0, 8)
  }, [produtos, searchProdutoEntrega, entregaItens])

  const abrirModalEntrega = (clientePreSelecionado?: Cliente) => {
    if (clientePreSelecionado) {
      setEntregaCliente(clientePreSelecionado); setSearchClienteEntrega(clientePreSelecionado.nome)
    } else {
      setEntregaCliente(null); setSearchClienteEntrega('')
    }
    setShowClienteDropdownEntrega(false)
    setSearchProdutoEntrega(''); setShowProdutoDropdownEntrega(false)
    setEntregaItens([]); setEntregaObservacao('')
    setModalTipo('entrega')
  }

  const selecionarClienteEntrega = (c: Cliente) => {
    setEntregaCliente(c); setSearchClienteEntrega(c.nome); setShowClienteDropdownEntrega(false)
  }

  const adicionarProdutoEntrega = (p: Produto) => {
    setEntregaItens(prev => [...prev, { tempId: uuidv4(), produto_id: p.id!, produto_nome: p.nome, estoque: p.estoque ?? 0, quantidade: 1, preco_unitario: p.preco_venda ?? 0 }])
    setSearchProdutoEntrega(''); setShowProdutoDropdownEntrega(false)
  }

  const atualizarQtdEntrega = (tempId: string, qtd: number) => {
    if (qtd < 1) return
    setEntregaItens(prev => prev.map(i => i.tempId === tempId ? { ...i, quantidade: qtd } : i))
  }

  const removerItemEntrega = (tempId: string) => setEntregaItens(prev => prev.filter(i => i.tempId !== tempId))

  const totalEntrega = useMemo(() => entregaItens.reduce((a, i) => a + i.quantidade * i.preco_unitario, 0), [entregaItens])

  const abrirModalReposicao = (item: ConsignacaoItem) => {
    setModalConsignacao(item); setNovaQuantidade(''); setNovaObservacao('')
    setModalTipo('reposicao')
  }

  const abrirModalVenda = (item: ConsignacaoItem) => {
    setModalConsignacao(item); setModoVenda('vendido'); setVendaValor('')
    setModalTipo('venda')
  }

  const abrirModalDevolucao = (item: ConsignacaoItem) => {
    setModalConsignacao(item); setDevolucaoQtd('')
    setModalTipo('devolucao')
  }

  const abrirModalExcluir = (item: ConsignacaoItem) => {
    setModalConsignacao(item)
    setModalTipo('excluir')
  }

  const fecharModal = () => { setModalTipo(null); setModalConsignacao(null) }

  const handleEntrega = async () => {
    if (!entregaCliente) { toast.error('Selecione o cliente'); return }
    if (entregaItens.length === 0) { toast.error('Adicione pelo menos um produto'); return }
    if (entregaItens.some(i => !i.quantidade || i.quantidade <= 0)) { toast.error('Quantidade inválida em algum item'); return }

    setSaving(true)
    try {
      for (const item of entregaItens) {
        const produto = produtos.find(p => p.id === item.produto_id)
        if (!produto) continue
        await entregarOuReporConsignacao({
          cliente_id: entregaCliente.id!, cliente_nome: entregaCliente.nome,
          produto, quantidade: item.quantidade, tipo: 'entrega',
          vendedor_id: user?.uid || '', vendedor_nome: (user as any)?.nome,
          observacao: entregaObservacao,
        })
      }
      await gerarPDFReciboConsignacao({
        numero: `CONS-${Date.now().toString().slice(-6)}`,
        cliente_nome: entregaCliente.nome,
        cliente_endereco: entregaCliente.endereco,
        cliente_telefone: entregaCliente.telefone,
        vendedor_nome: (user as any)?.nome,
        items: entregaItens.map(i => ({ produto_nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, tipo: 'entrega' as const, data: new Date() })),
        observacao: entregaObservacao,
      })
      toast.success('Entrega registrada! Recibo de consignação gerado.')
      fecharModal(); fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar entrega')
    } finally { setSaving(false) }
  }

  const handleReposicao = async () => {
    if (!modalConsignacao) return
    const qtd = parseInt(novaQuantidade, 10)
    if (!qtd || qtd <= 0) { toast.error('Informe uma quantidade válida'); return }
    const produto = produtos.find(p => p.id === modalConsignacao.produto_id)
    if (!produto) { toast.error('Produto não encontrado'); return }

    setSaving(true)
    try {
      await entregarOuReporConsignacao({
        cliente_id: modalConsignacao.cliente_id, cliente_nome: modalConsignacao.cliente_nome,
        produto, quantidade: qtd, tipo: 'reposicao',
        vendedor_id: user?.uid || '', vendedor_nome: (user as any)?.nome,
        observacao: novaObservacao,
      })
      await gerarPDFReciboConsignacao({
        numero: `CONS-${Date.now().toString().slice(-6)}`,
        cliente_nome: modalConsignacao.cliente_nome,
        vendedor_nome: (user as any)?.nome,
        items: [{ produto_nome: modalConsignacao.produto_nome, quantidade: qtd, preco_unitario: modalConsignacao.preco_unitario, tipo: 'reposicao', data: new Date() }],
        observacao: novaObservacao,
      })
      toast.success('Reposição registrada! Recibo gerado.')
      fecharModal(); fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar reposição')
    } finally { setSaving(false) }
  }

  const handleVenda = async () => {
    if (!modalConsignacao) return
    const valor = parseFloat(vendaValor)
    if (!valor || valor <= 0) { toast.error('Informe um valor válido'); return }
    const quantidadeVendida = modoVenda === 'vendido' ? Math.round(valor) : modalConsignacao.quantidade_em_consignacao - Math.round(valor)
    if (quantidadeVendida <= 0) { toast.error('Quantidade vendida inválida'); return }

    const cliente = clientes.find(c => c.id === modalConsignacao.cliente_id)

    setSaving(true)
    try {
      const { invoiceNumero } = await registrarVendaConsignacao({
        consignacao: modalConsignacao,
        quantidadeVendida,
        vendedor_id: user?.uid || '', vendedor_nome: (user as any)?.nome,
        cliente_email: cliente?.email, cliente_telefone: cliente?.telefone, cliente_endereco: cliente?.endereco,
      })
      toast.success(`Venda registrada! Fatura ${invoiceNumero} gerada.`)
      fecharModal(); fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar venda')
    } finally { setSaving(false) }
  }

  const handleDevolucao = async () => {
    if (!modalConsignacao) return
    const qtd = parseInt(devolucaoQtd, 10)
    if (!qtd || qtd <= 0) { toast.error('Informe uma quantidade válida'); return }

    setSaving(true)
    try {
      await devolverConsignacao({
        consignacao: modalConsignacao, quantidade: qtd,
        vendedor_id: user?.uid || '', vendedor_nome: (user as any)?.nome,
      })
      toast.success('Devolução registrada, estoque geral atualizado.')
      fecharModal(); fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar devolução')
    } finally { setSaving(false) }
  }

  const handleExcluir = async () => {
    if (!modalConsignacao) return
    setSaving(true)
    try {
      await excluirConsignacao({ consignacao: modalConsignacao })
      toast.success('Registro de consignação excluído. Saldo devolvido ao estoque geral.')
      fecharModal(); fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir consignação')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-[#6F2738] animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Consignação</h1>
          <p className="text-gray-500 text-sm">Produtos entregues aos clientes que só são cobrados quando vendidos</p>
        </div>
        <button onClick={() => abrirModalEntrega()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Entrega
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6F2738]/12 flex items-center justify-center"><PackageCheck className="w-5 h-5 text-[#6F2738]" /></div>
            <div><p className="text-sm text-gray-500">Itens em consignação</p><p className="text-2xl font-bold text-gray-900">{stats.totalItens}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-sm text-gray-500">Unidades em saldo</p><p className="text-2xl font-bold text-gray-900">{stats.totalUnidades}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-sm text-gray-500">Valor potencial</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.valorPotencial)}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FileText className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-sm text-gray-500">Clientes com saldo</p><p className="text-2xl font-bold text-gray-900">{stats.clientes}</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou produto..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
        </div>
      </div>

      <div className="space-y-5">
        {agrupadoPorCliente.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            Nenhum produto em consignação ainda. Clique em "Nova Entrega" para começar.
          </div>
        )}
        {agrupadoPorCliente.map(grupo => (
          <div key={grupo.clienteId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 gap-3 flex-wrap">
              <h3 className="font-semibold text-gray-900">{grupo.clienteNome}</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#6F2738]">Potencial: {formatCurrency(grupo.totalPotencial)}</span>
                <button
                  onClick={() => abrirModalEntrega(clientes.find(c => c.id === grupo.clienteId))}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#6F2738]/10 text-[#6F2738] hover:bg-[#6F2738]/20 text-xs font-medium">
                  <Plus className="w-3.5 h-3.5" /> Adicionar Produto
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {grupo.itens.map(item => (
                <div key={item.id}>
                  <div className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-medium text-gray-900 text-sm">{item.produto_nome}</p>
                      <p className="text-xs text-gray-500">
                        Saldo: <span className="font-semibold text-gray-800">{item.quantidade_em_consignacao}</span> un.
                        {' · '}{formatCurrency(item.preco_unitario)}/un.
                        {' · '}Total: {formatCurrency(item.quantidade_em_consignacao * item.preco_unitario)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => abrirModalVenda(item)} disabled={item.quantidade_em_consignacao <= 0}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium disabled:opacity-40">
                        <Receipt className="w-3.5 h-3.5" /> Registrar Venda
                      </button>
                      <button onClick={() => abrirModalReposicao(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-medium">
                        <RotateCcw className="w-3.5 h-3.5" /> Repor
                      </button>
                      <button onClick={() => abrirModalDevolucao(item)} disabled={item.quantidade_em_consignacao <= 0}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium disabled:opacity-40">
                        <Undo2 className="w-3.5 h-3.5" /> Devolver
                      </button>
                      <button onClick={() => abrirModalExcluir(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium">
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                      <button onClick={() => toggleExpandir(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-400 hover:bg-gray-100 text-xs font-medium">
                        <History className="w-3.5 h-3.5" />
                        {expandido === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {expandido === item.id && (
                    <div className="px-5 pb-3 -mt-1">
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        {(!movimentos[item.id!] || movimentos[item.id!].length === 0) && (
                          <p className="text-xs text-gray-400">Nenhum movimento registrado.</p>
                        )}
                        {movimentos[item.id!]?.map(m => (
                          <div key={m.id} className="flex items-center justify-between text-xs">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${TIPO_STYLE[m.tipo]}`}>{TIPO_LABEL[m.tipo]}</span>
                            <span className="text-gray-600">{m.quantidade} un.</span>
                            {m.fatura_gerada_numero && <span className="text-gray-400">Fatura {m.fatura_gerada_numero}</span>}
                            <span className="text-gray-400">{m.created_at ? formatDate(m.created_at) : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Nova Entrega */}
      {modalTipo === 'entrega' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nova Entrega em Consignação</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            {/* Cliente (busca, igual à fatura) */}
            <div className="relative">
              <label className="text-xs font-medium text-gray-600">Cliente *</label>
              <div className="relative mt-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchClienteEntrega}
                  onChange={e => { setSearchClienteEntrega(e.target.value); setEntregaCliente(null); setShowClienteDropdownEntrega(true) }}
                  onFocus={() => setShowClienteDropdownEntrega(true)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              {showClienteDropdownEntrega && clientesFiltradosEntrega.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {clientesFiltradosEntrega.map(c => (
                    <button key={c.id} onClick={() => selecionarClienteEntrega(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
              {entregaCliente && (
                <p className="text-xs text-green-600 mt-1">Selecionado: {entregaCliente.nome}</p>
              )}
            </div>

            {/* Produtos (busca + lista de itens, igual à fatura) */}
            <div className="relative">
              <label className="text-xs font-medium text-gray-600">Adicionar Produto</label>
              <div className="relative mt-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchProdutoEntrega}
                  onChange={e => { setSearchProdutoEntrega(e.target.value); setShowProdutoDropdownEntrega(true) }}
                  onFocus={() => setShowProdutoDropdownEntrega(true)}
                  placeholder="Buscar produto..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              {showProdutoDropdownEntrega && produtosFiltradosEntrega.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {produtosFiltradosEntrega.map(p => (
                    <button key={p.id} onClick={() => adicionarProdutoEntrega(p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <span>{p.nome}</span>
                      <span className="text-xs text-gray-400">estoque: {p.estoque ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de itens adicionados */}
            <div className="space-y-2">
              {entregaItens.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">Nenhum produto adicionado ainda</p>
              ) : (
                entregaItens.map(item => (
                  <div key={item.tempId} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.produto_nome}</p>
                      <p className="text-xs text-gray-400">
                        estoque atual: {item.estoque} · {formatCurrency(item.preco_unitario)}/un.
                      </p>
                    </div>
                    <input type="number" min="1" value={item.quantidade}
                      onChange={e => atualizarQtdEntrega(item.tempId, parseInt(e.target.value, 10) || 1)}
                      className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-sm text-center" />
                    <p className="w-20 text-right text-sm font-semibold text-gray-800">{formatCurrency(item.quantidade * item.preco_unitario)}</p>
                    <button onClick={() => removerItemEntrega(item.tempId)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
              {entregaItens.length > 0 && (
                <div className="flex items-center justify-between px-3 pt-1">
                  <span className="text-sm font-medium text-gray-600">Valor total (referência)</span>
                  <span className="text-lg font-bold text-[#6F2738]">{formatCurrency(totalEntrega)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Observação (opcional)</label>
              <textarea value={entregaObservacao} onChange={e => setEntregaObservacao(e.target.value)} rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <p className="text-xs text-gray-400">A entrega baixa o estoque geral e gera um recibo de consignação em PDF (sem cobrança).</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleEntrega} disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reposição */}
      {modalTipo === 'reposicao' && modalConsignacao && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Reposição</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600">{modalConsignacao.produto_nome} — {modalConsignacao.cliente_nome}</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Quantidade repostas *</label>
              <input type="number" min="1" value={novaQuantidade} onChange={e => setNovaQuantidade(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Observação (opcional)</label>
              <textarea value={novaObservacao} onChange={e => setNovaObservacao(e.target.value)} rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleReposicao} disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : 'Confirmar Reposição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Venda */}
      {modalTipo === 'venda' && modalConsignacao && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Registrar Venda</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600">{modalConsignacao.produto_nome} — {modalConsignacao.cliente_nome}</p>
            <p className="text-xs text-gray-500">Saldo atual em consignação: <span className="font-semibold">{modalConsignacao.quantidade_em_consignacao}</span> un.</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Como você quer informar?</label>
              <select value={modoVenda} onChange={e => setModoVenda(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                <option value="vendido">Quantidade vendida</option>
                <option value="restante">Quantidade restante no salão</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">{modoVenda === 'vendido' ? 'Quantidade vendida *' : 'Quantidade restante *'}</label>
              <input type="number" min="0" value={vendaValor} onChange={e => setVendaValor(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <p className="text-xs text-gray-400">Uma fatura real será gerada cobrando somente a quantidade vendida.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleVenda} disabled={saving}
                className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : 'Confirmar Venda e Gerar Fatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Devolução */}
      {modalTipo === 'devolucao' && modalConsignacao && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Devolução ao Estoque</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600">{modalConsignacao.produto_nome} — {modalConsignacao.cliente_nome}</p>
            <p className="text-xs text-gray-500">Saldo atual em consignação: <span className="font-semibold">{modalConsignacao.quantidade_em_consignacao}</span> un.</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Quantidade devolvida *</label>
              <input type="number" min="1" value={devolucaoQtd} onChange={e => setDevolucaoQtd(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleDevolucao} disabled={saving}
                className="px-4 py-2 rounded-xl bg-gray-700 text-white hover:bg-gray-800 text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : 'Confirmar Devolução'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir */}
      {modalTipo === 'excluir' && modalConsignacao && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Excluir Consignação</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600">{modalConsignacao.produto_nome} — {modalConsignacao.cliente_nome}</p>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-red-700">
                Isso vai remover completamente esse registro de consignação (usado para corrigir cadastros feitos por
                erro ou testes).
              </p>
              {modalConsignacao.quantidade_em_consignacao > 0 && (
                <p className="text-xs text-red-600 mt-1.5">
                  O saldo atual de <span className="font-semibold">{modalConsignacao.quantidade_em_consignacao}</span> un.
                  será devolvido automaticamente ao estoque geral.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleExcluir} disabled={saving}
                className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm font-medium disabled:opacity-60">
                {saving ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
