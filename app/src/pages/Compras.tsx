import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy, getDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, Trash2, ShoppingCart, Loader2, ArrowLeft, Package, Building2, CheckCircle, Edit2, AlertCircle, FileText, X, Check, HelpCircle } from 'lucide-react'

interface ProdutoEstoque {
  id: string
  nome: string
  preco_custo: number
  preco_venda: number
  quantidade: number
  categoria?: string
}

interface ItemCompra {
  tempId: string
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_custo: number
  subtotal: number
}

interface Compra {
  id?: string
  numero: string
  fornecedor: string
  numero_nota: string
  data_compra: any
  data_vencimento: any
  items: ItemCompra[]
  total: number
  status: 'pendente' | 'pago'
  created_at: any
  admin_id: string
}

interface ProdutoMatch {
  nomePDF: string
  quantidade: number
  preco: number
  melhorMatch: ProdutoEstoque | null
  similaridade: number
  decisao: 'confirmar' | 'ignorar' | 'manual'
  produtoSelecionado: ProdutoEstoque | null
  buscaManual: string
}

export function Compras() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [view, setView] = useState<'list' | 'form'>('list')
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [markingPago, setMarkingPago] = useState<string | null>(null)

  const [fornecedor, setFornecedor] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().split('T')[0])
  const [dataVencimento, setDataVencimento] = useState('')

  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([])
  const [searchProduto, setSearchProduto] = useState('')
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false)
  const [items, setItems] = useState<ItemCompra[]>([])
  const [saving, setSaving] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [pdfMatches, setPdfMatches] = useState<ProdutoMatch[]>([])

  const total = items.reduce((a, i) => a + i.subtotal, 0)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchCompras()
    fetchProdutos()
  }, [isAdmin])

  const fetchCompras = async () => {
    try {
      setLoading(true)
      const snap = await getDocs(query(collection(db, 'compras'), orderBy('data_compra', 'desc')))
      setCompras(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as Compra[])
    } catch {
      toast.error('Erro ao carregar compras')
    } finally { setLoading(false) }
  }

  const fetchProdutos = async () => {
    try {
      const snap = await getDocs(collection(db, 'produtos'))
      setProdutos(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as ProdutoEstoque[])
    } catch { console.error('Erro ao carregar produtos') }
  }

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(searchProduto.toLowerCase())
  ).slice(0, 8)

  const addProduto = (produto: ProdutoEstoque) => {
    const existente = items.find(i => i.produto_id === produto.id)
    if (existente) {
      setItems(items.map(i => i.produto_id === produto.id
        ? { ...i, quantidade: i.quantidade + 1, subtotal: (i.quantidade + 1) * i.preco_custo }
        : i
      ))
    } else {
      setItems([...items, {
        tempId: crypto.randomUUID(),
        produto_id: produto.id,
        produto_nome: produto.nome,
        quantidade: 1,
        preco_custo: produto.preco_custo,
        subtotal: produto.preco_custo,
      }])
    }
    setSearchProduto(''); setShowProdutoDropdown(false)
  }

  const updateItemQty = (tempId: string, qty: number) => {
    if (qty < 1) return
    setItems(items.map(i => i.tempId === tempId ? { ...i, quantidade: qty, subtotal: qty * i.preco_custo } : i))
  }

  const updateItemCost = (tempId: string, cost: number) => {
    setItems(items.map(i => i.tempId === tempId ? { ...i, preco_custo: cost, subtotal: i.quantidade * cost } : i))
  }

  const removeItem = (tempId: string) => setItems(items.filter(i => i.tempId !== tempId))

  // Calcula similaridade entre dois strings (0-1)
  const calcSimilaridade = (a: string, b: string): number => {
    const na = a.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
    const nb = b.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
    if (na === nb) return 1
    const wordsA = na.split(' ')
    const wordsB = nb.split(' ')
    const matched = wordsA.filter(w => w.length > 2 && wordsB.some(wb => wb.includes(w) || w.includes(wb)))
    const score = (matched.length * 2) / (wordsA.length + wordsB.length)
    // bonus se começa igual
    const prefixLen = [...na].findIndex((c, i) => c !== nb[i])
    const prefixBonus = prefixLen > 4 ? 0.1 : 0
    return Math.min(1, score + prefixBonus)
  }

  // Encontra melhor produto do estoque para um nome do PDF
  const encontrarMelhorMatch = (nomePDF: string): { produto: ProdutoEstoque | null; score: number } => {
    let melhor: ProdutoEstoque | null = null
    let melhorScore = 0
    for (const p of produtos) {
      const score = calcSimilaridade(nomePDF, p.nome)
      if (score > melhorScore) { melhorScore = score; melhor = p }
    }
    return { produto: melhor, score: melhorScore }
  }

  // Extrai linhas de produtos do texto do PDF
  // Suporta formato: "NOME DO PRODUTO   138.00   3.73   514.74"
  const extrairProdutosDoPDF = (fullText: string): Array<{ nome: string; quantidade: number; preco: number }> => {
    const linhas = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 2)
    const resultado: Array<{ nome: string; quantidade: number; preco: number }> = []
    const vistos = new Set<string>()

    // Padrão principal: "NOME QTY.00 RATE AMOUNT" - qty sempre tem .00, rate e amount têm .XX
    const padraoFatura = /^(.+?)\s+(\d+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/

    // Palavras que indicam linha de rodapé/cabeçalho (não produto)
    const ignorar = /^(item|description|qty|rate|amount|sub.?total|total|tax|shipping|balance|due|payment|invoice|bill|terms|p\.o|enviado|page|\d+\s*$)/i

    for (const linha of linhas) {
      if (ignorar.test(linha)) continue

      const m = linha.match(padraoFatura)
      if (!m) continue

      const nome = m[1].trim()
        .replace(/\s*ENVIADO.*$/i, '')  // remove notas de envio inline
        .replace(/\s+\d+ml.*$/i, '')    // remove tamanho inline
        .trim()

      if (nome.length < 3) continue

      const qty = parseFloat(m[2])
      const preco = parseFloat(m[3].replace(/,/g, ''))

      const key = nome.toUpperCase().substring(0, 25)
      if (vistos.has(key)) continue
      if (qty <= 0 || qty > 10000 || preco <= 0 || preco > 100000) continue

      vistos.add(key)
      resultado.push({ nome, quantidade: Math.round(qty), preco })
    }

    return resultado.slice(0, 60)
  }

  const aplicarMatches = () => {
    const novosItems: ItemCompra[] = []
    for (const match of pdfMatches) {
      if (match.decisao === 'ignorar') continue
      const produto = match.decisao === 'confirmar' ? match.melhorMatch : match.produtoSelecionado
      if (!produto) continue
      const existente = items.find(i => i.produto_id === produto.id)
      if (existente) {
        // já existe, soma quantidade
        setItems(prev => prev.map(i => i.produto_id === produto.id
          ? { ...i, quantidade: i.quantidade + match.quantidade, subtotal: (i.quantidade + match.quantidade) * i.preco_custo }
          : i
        ))
      } else {
        novosItems.push({
          tempId: crypto.randomUUID(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          quantidade: match.quantidade,
          preco_custo: match.preco || produto.preco_custo || 0,
          subtotal: match.quantidade * (match.preco || produto.preco_custo || 0),
        })
      }
    }
    setItems(prev => [...prev, ...novosItems])
    setShowMatchModal(false)
    setPdfMatches([])
    toast.success(`${novosItems.length} produto(s) adicionado(s) da nota fiscal!`)
  }

  const handlePDF = async (file: File) => {
    setPdfLoading(true)
    setPdfFile(file)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        // Agrupar itens por posição Y com tolerância de ±3 para reconstruir linhas reais
        type LineGroup = { centerY: number; items: Array<{ x: number; text: string }> }
        const lineGroups: LineGroup[] = []
        for (const item of content.items) {
          if (!('str' in item) || !(item as any).str.trim()) continue
          const y = (item as any).transform[5] as number
          const x = (item as any).transform[4] as number
          const text = (item as any).str as string
          const group = lineGroups.find(g => Math.abs(y - g.centerY) <= 3)
          if (group) {
            group.centerY = (group.centerY + y) / 2
            group.items.push({ x, text })
          } else {
            lineGroups.push({ centerY: y, items: [{ x, text }] })
          }
        }
        lineGroups.sort((a, b) => b.centerY - a.centerY)
        for (const group of lineGroups) {
          group.items.sort((a, b) => a.x - b.x)
          fullText += group.items.map(i => i.text).join(' ') + '\n'
        }
      }

      // Supplier
      const supplierExplicit = fullText.match(/(?:sold\s*by|billed?\s*(?:by|from)|vendor|supplier|fornecedor|distribuidor)\s*[:\-]?\s*\n?\s*([A-Z][A-Za-z0-9\s&,\.\-']{2,70})/i)
      if (supplierExplicit && supplierExplicit[1].trim().length > 2) {
        setFornecedor(supplierExplicit[1].trim().substring(0, 60))
      } else {
        const lines = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 2)
        if (lines.length > 0) setFornecedor(lines[0].substring(0, 60))
      }

      // Invoice number
      const invoiceNumMatch = fullText.match(/(?:invoice\s*#?\s*[:nº°#]?\s*[:\s]*|nota\s*fiscal\s*(?:n[º°]?)?\s*[::\s]*)([A-Z]{0,5}[\-]?[0-9][A-Z0-9\-\/]{1,25})/i)
      if (invoiceNumMatch) setNumeroNota(invoiceNumMatch[1])

      // Issue date
      const issueDateMatch = fullText.match(/(?:invoice\s*date|data)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i) || fullText.match(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b/)
      if (issueDateMatch) {
        const parts = issueDateMatch[1].split(/[-\/]/)
        if (parts.length === 3) {
          const [a, b, c] = parts
          const year = c.length === 2 ? '20' + c : c
          setDataCompra(`${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`)
        }
      }

      // Due date
      const dueDateMatch = fullText.match(/(?:due\s*date|vencimento)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)
      if (dueDateMatch) {
        const parts = dueDateMatch[1].split(/[-\/]/)
        if (parts.length === 3) {
          const [a, b, c] = parts
          const year = c.length === 2 ? '20' + c : c
          setDataVencimento(`${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`)
        }
      }

      // Total
      const parseUSD = (s: string) => parseFloat(s.replace(/,/g, ''))
      const balanceDueMatch = fullText.match(/balance\s*due\s*\$?\s*([\d,]+\.\d{2})/i)
      const grandTotalMatch = fullText.match(/(?<![A-Za-z])total\s+\$\s*([\d,]+\.\d{2})/i)
      const amountDueMatch = fullText.match(/amount\s*(?:due|payable)\s*\$?\s*([\d,]+\.\d{2})/i)
      const subTotalMatch = fullText.match(/sub\s*total\s*\$?\s*([\d,]+\.\d{2})/i)
      const totalV = balanceDueMatch || grandTotalMatch || amountDueMatch || subTotalMatch
      if (totalV) { const _t = parseUSD(totalV[1]).toFixed(2); void _t }

      toast.success('PDF lido! Dados preenchidos automaticamente.')

      // Extrair produtos do PDF e fazer fuzzy matching
      const produtosPDF = extrairProdutosDoPDF(fullText)
      console.log('=== DEBUG PDF ===')
      console.log('Total linhas no texto:', fullText.split('\n').length)
      console.log('Primeiras 20 linhas:', fullText.split('\n').slice(0, 20))
      console.log('Produtos encontrados:', produtosPDF.length, produtosPDF)
      if (produtosPDF.length > 0) {
        const matches: ProdutoMatch[] = produtosPDF.map(p => {
          const { produto, score } = encontrarMelhorMatch(p.nome)
          return {
            nomePDF: p.nome,
            quantidade: p.quantidade,
            preco: p.preco,
            melhorMatch: produto,
            similaridade: score,
            decisao: score >= 0.6 ? 'confirmar' : 'manual',
            produtoSelecionado: score >= 0.6 ? produto : null,
            buscaManual: '',
          }
        })
        setPdfMatches(matches)
        setShowMatchModal(true)
      }
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível ler o PDF. Preencha manualmente.')
    } finally {
      setPdfLoading(false)
    }
  }

  const handleSave = async () => {
    if (!fornecedor) { toast.error('Informe o fornecedor'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um produto'); return }
    setSaving(true)
    try {
      const now = new Date()
      const numero = `CMP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`

      // PDF upload com timeout de 8s para não travar
      let pdfUrl = ''
      let pdfNome = ''
      if (pdfFile) {
        try {
          const uploadPromise = (async () => {
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
            const { storage } = await import('@/lib/firebase')
            const storageRef = ref(storage, `compras/${Date.now()}_${pdfFile.name.replace(/\s/g,'_')}`)
            await uploadBytes(storageRef, pdfFile)
            return { url: await getDownloadURL(storageRef), nome: pdfFile.name }
          })()
          const timeoutPromise = new Promise<{ url: string; nome: string }>(resolve =>
            setTimeout(() => resolve({ url: '', nome: '' }), 8000)
          )
          const result = await Promise.race([uploadPromise, timeoutPromise])
          pdfUrl = result.url
          pdfNome = result.nome
        } catch { /* non-critical */ }
      }

      const dataCompraTs = Timestamp.fromDate(new Date(dataCompra + 'T12:00:00'))
      const dataVencTs = dataVencimento
        ? Timestamp.fromDate(new Date(dataVencimento + 'T12:00:00'))
        : dataCompraTs

      if (editingId) {
        await updateDoc(doc(db, 'compras', editingId), {
          fornecedor,
          numero_nota: numeroNota,
          data_compra: dataCompraTs,
          data_vencimento: dataVencTs,
          items: items.map(({ tempId, ...i }) => i),
          total,
          updated_at: Timestamp.now(),
        })
        toast.success('Compra atualizada!')
        setView('list'); setFornecedor(''); setNumeroNota(''); setDataVencimento(''); setItems([]); setPdfFile(null); setEditingId(null)
        fetchCompras()
        setSaving(false)
        return
      }

      const compraRef = await addDoc(collection(db, 'compras'), {
        numero,
        fornecedor,
        numero_nota: numeroNota,
        data_compra: dataCompraTs,
        data_vencimento: dataVencTs,
        items: items.map(({ tempId, ...i }) => i),
        total,
        status: 'pendente' as const,
        admin_id: user?.uid || '',
        created_at: Timestamp.now(),
        pdf_url: pdfUrl,
        pdf_nome: pdfNome,
      })

      // Atualizar estoque + custo médio de cada produto
      for (const item of items) {
        try {
          const prodRef = doc(db, 'produtos', item.produto_id)
          const prodSnap = await getDoc(prodRef)
          if (!prodSnap.exists()) continue
          const prodData = prodSnap.data() as any
          const qtdAtual = prodData.estoque ?? prodData.quantidade ?? 0
          const custoAtual = prodData.preco_custo || 0
          const novaQtd = qtdAtual + item.quantidade
          const novoCustoMedio = qtdAtual > 0
            ? ((qtdAtual * custoAtual) + (item.quantidade * item.preco_custo)) / novaQtd
            : item.preco_custo

          await updateDoc(prodRef, {
            estoque: novaQtd,
            quantidade: novaQtd,
            preco_custo: Math.round(novoCustoMedio * 100) / 100,
            updated_at: Timestamp.now(),
          })

          await addDoc(collection(db, 'movimentos_estoque'), {
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            tipo: 'entrada',
            quantidade: item.quantidade,
            estoque_antes: qtdAtual,
            estoque_depois: novaQtd,
            observacao: `Compra ${numero} — ${fornecedor}`,
            created_at: Timestamp.now(),
          })
        } catch (e) {
          console.error('Erro ao atualizar produto', item.produto_id, e)
        }
      }

      // Conta a pagar
      await addDoc(collection(db, 'contas_pagar'), {
        descricao: `Compra ${numero} — ${fornecedor}`,
        fornecedor,
        numero_nota: numeroNota,
        valor: total,
        data_emissao: dataCompraTs,
        data_vencimento: dataVencTs,
        status: 'pendente',
        origem: 'compra',
        compra_id: compraRef.id,
        created_at: Timestamp.now(),
      })

      // Despesa do mês (integração com dashboard)
      await addDoc(collection(db, 'expenses'), {
        descricao: `Compra ${numero} — ${fornecedor}`,
        categoria: 'Produtos',
        valor: total,
        data: dataCompraTs,
        origem: 'compra',
        compra_id: compraRef.id,
        created_at: Timestamp.now(),
      })

      toast.success(`Compra ${numero} registrada! Estoque atualizado.`)
      setView('list')
      setFornecedor(''); setNumeroNota(''); setDataVencimento(''); setItems([])
      setPdfFile(null); setEditingId(null)
      fetchCompras()
    } catch (err) {
      console.error('Erro ao registrar compra:', err)
      toast.error('Erro ao registrar compra. Verifique o console.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (compraId: string) => {
    try {
      const { deleteDoc, doc: d } = await import('firebase/firestore')
      await deleteDoc(d(db, 'compras', compraId))
      const cpSnap = await getDocs(query(collection(db, 'contas_pagar'), where('compra_id', '==', compraId)))
      for (const cpDoc of cpSnap.docs) {
        await deleteDoc(cpDoc.ref)
      }
      const expSnap = await getDocs(query(collection(db, 'expenses'), where('compra_id', '==', compraId)))
      for (const expDoc of expSnap.docs) {
        await deleteDoc(expDoc.ref)
      }
      toast.success('Compra excluída!')
      setDeleteConfirm(null)
      fetchCompras()
    } catch(e) {
      console.error(e)
      toast.error('Erro ao excluir compra')
    }
  }

  const handleEdit = (compra: Compra) => {
    setEditingId(compra.id!)
    setFornecedor(compra.fornecedor)
    setNumeroNota(compra.numero_nota || '')
    setDataCompra(compra.data_compra?.toDate ? compra.data_compra.toDate().toISOString().split('T')[0] : compra.data_compra)
    setDataVencimento(compra.data_vencimento?.toDate ? compra.data_vencimento.toDate().toISOString().split('T')[0] : '')
    setItems((compra.items || []).map((i: any) => ({ ...i, tempId: crypto.randomUUID() })))
    setView('form')
  }

  const marcarPagoCompra = async (compraId: string) => {
    setMarkingPago(compraId)
    try {
      await updateDoc(doc(db, 'compras', compraId), { status: 'pago', data_pagamento: Timestamp.now() })
      const cpSnap = await getDocs(query(collection(db, 'contas_pagar'), where('compra_id', '==', compraId)))
      for (const cpDoc of cpSnap.docs) {
        await updateDoc(cpDoc.ref, { status: 'pago', data_pagamento: Timestamp.now() })
      }
      toast.success('Compra marcada como paga!')
      fetchCompras()
    } catch (e) {
      console.error(e)
      toast.error('Erro ao marcar como pago')
    } finally { setMarkingPago(null) }
  }

  const filtered = compras.filter(c =>
    c.fornecedor.toLowerCase().includes(search.toLowerCase()) ||
    c.numero.toLowerCase().includes(search.toLowerCase()) ||
    c.numero_nota?.toLowerCase().includes(search.toLowerCase())
  )

  if (view === 'form') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('list')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{editingId ? 'Editar Compra' : 'Nova Compra'}</h1>
            <p className="text-gray-500 text-sm">{editingId ? 'Atualize os dados da compra' : 'Registrar nota fiscal / compra de fornecedor'}</p>
          </div>
        </div>

        {/* PDF Upload */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>📎</span> Anexar PDF do Distribuidor
          </h2>
          <div
            onClick={() => document.getElementById('pdf-input-compra')?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${pdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-[#6F2738] hover:bg-amber-50'}`}
          >
            {pdfLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-gray-500">Lendo PDF e extraindo dados...</p>
              </div>
            ) : pdfFile ? (
              <div className="flex items-center justify-center gap-2 text-green-700">
                <span>✓</span>
                <p className="text-sm font-medium">{pdfFile.name} — dados preenchidos automaticamente</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <span className="text-3xl">📄</span>
                <p className="text-sm font-medium text-gray-600">Clique para enviar o PDF da nota fiscal</p>
                <p className="text-xs">O sistema preencherá os dados automaticamente</p>
              </div>
            )}
          </div>
          <input
            id="pdf-input-compra"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePDF(f); e.target.value = '' }}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#6F2738]" /> Dados do Fornecedor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
              <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nº Nota / Referência</label>
              <input value={numeroNota} onChange={e => setNumeroNota(e.target.value)} placeholder="Ex: NF-001" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data da Compra</label>
              <input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento *</label>
              <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#6F2738]" /> Produtos Comprados
            </h2>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchProduto}
              onChange={e => { setSearchProduto(e.target.value); setShowProdutoDropdown(e.target.value.length > 0) }}
              onFocus={() => searchProduto && setShowProdutoDropdown(true)}
              placeholder="Buscar produto para adicionar..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"
            />
            {showProdutoDropdown && produtosFiltrados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                {produtosFiltrados.map(p => (
                  <button key={p.id} onClick={() => addProduto(p)} className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between">
                    <span className="text-gray-900 text-sm">{p.nome}</span>
                    <span className="text-xs text-gray-400">Custo: {formatCurrency(p.preco_custo)} | Estoque: {p.quantidade}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Nenhum produto adicionado</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 text-xs font-medium text-gray-500 px-2 pb-1 border-b border-gray-100">
                <span className="col-span-5">Produto</span>
                <span className="col-span-2 text-center">Qtd</span>
                <span className="col-span-3 text-center">Custo Unit.</span>
                <span className="col-span-1 text-right">Subtotal</span>
                <span className="col-span-1" />
              </div>
              {items.map(item => (
                <div key={item.tempId} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-gray-50">
                  <span className="col-span-5 text-sm text-gray-900 truncate">{item.produto_nome}</span>
                  <div className="col-span-2 flex justify-center">
                    <input
                      type="number" min="1" value={item.quantidade}
                      onChange={e => updateItemQty(item.tempId, parseInt(e.target.value) || 1)}
                      className="w-16 text-center px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"
                    />
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="number" step="0.01" min="0" value={item.preco_custo}
                        onChange={e => updateItemCost(item.tempId, parseFloat(e.target.value) || 0)}
                        className="w-24 pl-5 pr-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"
                      />
                    </div>
                  </div>
                  <span className="col-span-1 text-sm font-medium text-right">{formatCurrency(item.subtotal)}</span>
                  <button onClick={() => removeItem(item.tempId)} className="col-span-1 flex justify-end">
                    <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex justify-between items-center text-lg font-bold text-gray-900">
            <span>Total da Compra</span>
            <span className="text-[#6F2738]">{formatCurrency(total)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ao salvar: estoque será atualizado + custo médio recalculado + conta a pagar gerada automaticamente.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={() => { setView('list'); setEditingId(null); setFornecedor(''); setNumeroNota(''); setDataVencimento(''); setItems([]); setPdfFile(null); }} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#b8911f] disabled:opacity-60 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Registrar Compra'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Compras</h1>
          <p className="text-gray-500 text-sm mt-0.5">Notas fiscais e pedidos de fornecedores</p>
        </div>
        <button onClick={() => setView('form')} className="flex items-center gap-2 px-4 py-2 bg-[#6F2738] text-white rounded-xl text-sm font-medium hover:bg-[#b8911f] transition-colors">
          <Plus className="w-4 h-4" /> Nova Compra
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por fornecedor ou número..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[#6F2738]" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-10 text-gray-400">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Nenhuma compra registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => (
              <div key={c.id}>
                {/* Row */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id!)}
                >
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{c.numero}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>{c.fornecedor}</span>
                      {c.numero_nota && <span>· Nota: {c.numero_nota}</span>}
                      <span>· {c.data_compra?.toDate ? formatDate(c.data_compra.toDate()) : c.data_compra}</span>
                      <span>· {c.items?.length || 0} produto(s)</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${c.status === 'pago' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {c.status === 'pago' ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-semibold text-gray-900">{formatCurrency(c.total)}</p>
                    <span className="text-gray-400 text-xs">{expanded === c.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Details */}
                {expanded === c.id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div><p className="text-xs text-gray-400">Fornecedor</p><p className="font-medium text-gray-800">{c.fornecedor}</p></div>
                      <div><p className="text-xs text-gray-400">Nº Nota</p><p className="font-medium text-gray-800">{c.numero_nota || '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Data Compra</p><p className="text-gray-700">{c.data_compra?.toDate ? formatDate(c.data_compra.toDate()) : '—'}</p></div>
                      <div><p className="text-xs text-gray-400">Vencimento</p><p className="text-gray-700">{c.data_vencimento?.toDate ? formatDate(c.data_vencimento.toDate()) : '—'}</p></div>
                    </div>

                    {/* PDF */}
                    {(c as any).pdf_url && (
                      <div className="flex items-center gap-3 bg-white border border-blue-100 rounded-xl px-4 py-3">
                        <span className="text-2xl">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{(c as any).pdf_nome || 'Nota Fiscal PDF'}</p>
                          <p className="text-xs text-gray-400">Documento anexado</p>
                        </div>
                        <a href={(c as any).pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                          Abrir PDF
                        </a>
                      </div>
                    )}

                    {/* Items table */}
                    {(c.items || []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Produtos Comprados</p>
                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Produto</th>
                                <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Qtd</th>
                                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Custo Unit.</th>
                                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(c.items || []).map((item: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.produto_nome}</td>
                                  <td className="px-4 py-2.5 text-center text-gray-600">{item.quantidade}</td>
                                  <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(item.preco_custo || 0)}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency((item.preco_custo || 0) * (item.quantidade || 1))}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={3} className="px-4 py-2 text-sm font-bold text-gray-700 text-right">Total</td>
                                <td className="px-4 py-2 font-bold text-gray-900 text-right">{formatCurrency(c.total || 0)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Action */}
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); handleEdit(c); }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
                        >
                          <Edit2 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(c.id!); }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" /> Excluir
                        </button>
                      </div>
                      {c.status !== 'pago' && (
                        <button
                          onClick={e => { e.stopPropagation(); marcarPagoCompra(c.id!); }}
                          disabled={markingPago === c.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {markingPago === c.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                          Marcar como Paga
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Compra</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">A compra, conta a pagar e despesa associadas serão removidas. O estoque não será revertido automaticamente.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Produtos do PDF */}
      {showMatchModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#6F2738]" />
                  Produtos encontrados no PDF
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">Confirme o match de cada produto com seu estoque. Produtos em verde foram identificados automaticamente.</p>
              </div>
              <button onClick={() => setShowMatchModal(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {pdfMatches.map((match, idx) => (
                <div key={idx} className={`border rounded-xl p-4 ${
                  match.decisao === 'ignorar' ? 'border-gray-200 bg-gray-50 opacity-60' :
                  match.decisao === 'confirmar' && match.similaridade >= 0.6 ? 'border-green-200 bg-green-50' :
                  'border-amber-200 bg-amber-50'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 font-medium uppercase mb-0.5">No PDF:</p>
                      <p className="font-semibold text-gray-900 text-sm">{match.nomePDF}</p>
                      <p className="text-xs text-gray-500">Qtd: {match.quantidade} · Preço: {formatCurrency(match.preco)}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, decisao: 'confirmar' } : m))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${match.decisao === 'confirmar' ? 'bg-green-600 text-white' : 'border border-green-300 text-green-700 hover:bg-green-50'}`}
                      >
                        <Check className="w-3 h-3" /> Confirmar
                      </button>
                      <button
                        onClick={() => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, decisao: 'manual', produtoSelecionado: null } : m))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${match.decisao === 'manual' ? 'bg-amber-500 text-white' : 'border border-amber-300 text-amber-700 hover:bg-amber-50'}`}
                      >
                        <HelpCircle className="w-3 h-3" /> Trocar
                      </button>
                      <button
                        onClick={() => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, decisao: 'ignorar' } : m))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${match.decisao === 'ignorar' ? 'bg-gray-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                      >
                        <X className="w-3 h-3" /> Ignorar
                      </button>
                    </div>
                  </div>

                  {match.decisao !== 'ignorar' && (
                    <div className="mt-2">
                      {match.decisao === 'confirmar' && match.melhorMatch ? (
                        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-100 rounded-lg px-3 py-2">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span>Match: <strong>{match.melhorMatch.nome}</strong></span>
                          <span className="text-xs text-green-600 ml-auto">{Math.round(match.similaridade * 100)}% similar</span>
                        </div>
                      ) : match.decisao === 'manual' ? (
                        <div className="space-y-2">
                          {match.produtoSelecionado ? (
                            <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-100 rounded-lg px-3 py-2">
                              <Check className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              <span>Selecionado: <strong>{match.produtoSelecionado.nome}</strong></span>
                              <button onClick={() => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, produtoSelecionado: null, buscaManual: '' } : m))} className="ml-auto text-amber-600 hover:text-amber-800">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                value={match.buscaManual}
                                onChange={e => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, buscaManual: e.target.value } : m))}
                                placeholder="Buscar produto no estoque..."
                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"
                              />
                              {match.buscaManual.length > 1 && (
                                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto">
                                  {produtos.filter(p => p.nome.toLowerCase().includes(match.buscaManual.toLowerCase())).slice(0, 6).map(p => (
                                    <button key={p.id} onClick={() => setPdfMatches(prev => prev.map((m, i) => i === idx ? { ...m, produtoSelecionado: p, decisao: 'confirmar', buscaManual: '' } : m))}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-gray-800">
                                      {p.nome}
                                    </button>
                                  ))}
                                  {produtos.filter(p => p.nome.toLowerCase().includes(match.buscaManual.toLowerCase())).length === 0 && (
                                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum produto encontrado</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {pdfMatches.filter(m => m.decisao !== 'ignorar' && (m.melhorMatch || m.produtoSelecionado)).length} de {pdfMatches.length} produtos serão adicionados
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowMatchModal(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={aplicarMatches} className="px-6 py-2.5 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#b8911f] flex items-center gap-2">
                  <Check className="w-4 h-4" /> Adicionar Produtos Confirmados
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
