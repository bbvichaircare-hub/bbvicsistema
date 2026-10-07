import { useState, useRef } from 'react'
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { toast } from 'sonner'
import { X, Upload, FileText, Plus, Trash2, Loader2, Package, TrendingUp, ChevronRight } from 'lucide-react'

interface ItemCompra {
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_custo: number
  preco_venda: number
  margem: number
  estoque_atual: number
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

function calcMargem(custo: number, venda: number): number {
  if (!venda || venda <= 0) return 0
  return Math.round(((venda - custo) / venda) * 10000) / 100
}

export function CompraFornecedorModal({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<'pdf' | 'info' | 'itens' | 'review'>('pdf')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfFileName, setPdfFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Supplier info
  const [fornecedor, setFornecedor] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().split('T')[0])
  const [dataVencimento, setDataVencimento] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Items
  const [itens, setItens] = useState<ItemCompra[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [produtosLoaded, setProdutosLoaded] = useState(false)
  const [prodSearch, setProdSearch] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [novoItemProdId, setNovoItemProdId] = useState('')
  const [novoItemQtd, setNovoItemQtd] = useState('1')
  const [novoItemCusto, setNovoItemCusto] = useState('')
  const [novoItemVenda, setNovoItemVenda] = useState('')

  const loadProdutos = async () => {
    if (produtosLoaded) return
    const snap = await getDocs(query(collection(db, 'produtos'), where('ativo', '==', true)))
    setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setProdutosLoaded(true)
  }

  const handlePDF = async (file: File) => {
    setPdfLoading(true)
    try {
      // @ts-ignore
      const pdfjsLib = await import('pdfjs-dist')
      // Use local worker (bundled with app) to avoid CDN version mismatch
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        fullText += pageText + '\n'
      }
      console.log('[PDF Debug] Extracted text length:', fullText.length, 'Pages:', pdf.numPages)
      console.log('[PDF Debug] First 500 chars:', fullText.substring(0, 500))

      // Parse common fields with regex — calibrated for Brazilian beauty supply invoices + generic fallbacks

      // ── SUPPLIER ──────────────────────────────────────────────────────────
      // Try explicit label first, then fall back to first non-empty line
      const supplierExplicit = fullText.match(/(?:sold\s*by|billed?\s*(?:by|from)|vendor|supplier|fornecedor|distribuidor)\s*[:\-]?\s*\n?\s*([A-Z][A-Za-z0-9\s&,\.\-']{2,70})/i)
      if (supplierExplicit && supplierExplicit[1].trim().length > 2) {
        setFornecedor(supplierExplicit[1].trim().substring(0, 60))
      } else {
        // Use the very first non-empty line of the document
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 2)
        if (lines.length > 0) {
          setFornecedor(lines[0].substring(0, 60))
        }
      }

      // ── INVOICE NUMBER ────────────────────────────────────────────────────
      // Matches: "Invoice# : INV-009483" | "Invoice No: 123" | "Nota Fiscal nº 456" | "Order #789"
      const invoiceNumMatch = fullText.match(/(?:invoice\s*#?\s*[:nº°#]?\s*[:\s]*|nota\s*fiscal\s*(?:n[º°]?)?\s*[::\s]*|order\s*(?:#|no\.?)?\s*[::\s]*|pedido\s*(?:n[º°]?)?\s*[::\s]*)([A-Z]{0,5}[\-]?[0-9][A-Z0-9\-\/]{1,25})/i)
      if (invoiceNumMatch) setNumeroNota(invoiceNumMatch[1])

      // ── DATES ─────────────────────────────────────────────────────────────
      // Invoice Date / Data Emissão
      const issueDateMatch = fullText.match(/(?:invoice\s*date|data\s*(?:emiss[ãa]o|compra|pedido)?)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)
        || fullText.match(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b/)
      if (issueDateMatch) {
        const parts = issueDateMatch[1].split(/[-\/]/)
        if (parts.length === 3) {
          const [a, b, c] = parts
          const year = c.length === 2 ? '20' + c : c
          // format detected as mm-dd-yy (US) when c is year
          setDataCompra(`${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`)
        }
      }
      // Due Date / Data Vencimento
      const dueDateMatch = fullText.match(/(?:due\s*date|vencimento|data\s*vencimento)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)
      if (dueDateMatch) {
        const parts = dueDateMatch[1].split(/[-\/]/)
        if (parts.length === 3) {
          const [a, b, c] = parts
          const year = c.length === 2 ? '20' + c : c
          setDataVencimento(`${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`)
        }
      }

      // ── TOTAL ─────────────────────────────────────────────────────────────
      // Priority: "Balance Due" > "Total $x" > largest dollar amount
      // US format: 6,240.61 → remove commas → 6240.61
      const parseUSD = (s: string) => parseFloat(s.replace(/,/g, ''))
      const balanceDueMatch = fullText.match(/balance\s*due\s*\$?\s*([\d,]+\.\d{2})/i)
      const grandTotalMatch = fullText.match(/(?<![A-Za-z])total\s+\$\s*([\d,]+\.\d{2})/i)
      const amountDueMatch = fullText.match(/amount\s*(?:due|payable)\s*\$?\s*([\d,]+\.\d{2})/i)
      const subTotalMatch = fullText.match(/sub\s*total\s*\$?\s*([\d,]+\.\d{2})/i)
      const totalV = balanceDueMatch || grandTotalMatch || amountDueMatch || subTotalMatch
      if (totalV) {
        setValorTotal(parseUSD(totalV[1]).toFixed(2))
      } else {
        // Fallback: all dollar amounts, pick largest
        const allAmounts = [...fullText.matchAll(/\$\s*([\d,]+\.\d{2})/g)]
        if (allAmounts.length > 0) {
          const maxVal = Math.max(...allAmounts.map(m => parseUSD(m[1])))
          setValorTotal(maxVal.toFixed(2))
        }
      }

      toast.success('PDF lido! Confira os dados extraídos.')
    } catch (e) {
      toast.error('Não foi possível ler o PDF automaticamente. Preencha manualmente.')
    } finally {
      setPdfLoading(false)
      setStep('info')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Selecione um arquivo PDF'); return }
    setPdfFile(file)
    setPdfFileName(file.name)
    handlePDF(file)
  }

  const addItem = async () => {
    if (!novoItemProdId || !novoItemCusto) { toast.error('Selecione o produto e informe o custo'); return }
    const prod = produtos.find(p => p.id === novoItemProdId)
    if (!prod) return
    const custo = parseFloat(novoItemCusto) || 0
    const venda = parseFloat(novoItemVenda) || (prod.preco || 0)
    setItens(prev => [...prev, {
      produto_id: prod.id,
      produto_nome: prod.nome,
      quantidade: parseInt(novoItemQtd) || 1,
      preco_custo: custo,
      preco_venda: venda,
      margem: calcMargem(custo, venda),
      estoque_atual: prod.estoque || 0,
    }])
    setNovoItemProdId(''); setNovoItemQtd('1'); setNovoItemCusto(''); setNovoItemVenda('')
    setAddingItem(false)
    setProdSearch('')
  }

  const removeItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx))

  const updateItemVenda = (idx: number, venda: number) => {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, preco_venda: venda, margem: calcMargem(it.preco_custo, venda) } : it))
  }

  const calcTotal = () => itens.reduce((s, i) => s + i.preco_custo * i.quantidade, 0)

  const handleSave = async () => {
    if (!fornecedor) { toast.error('Informe o fornecedor'); return }
    setSaving(true)
    try {
      const total = parseFloat(valorTotal) || calcTotal()

      // 0. Try to upload PDF — non-blocking
      let pdfUrl = ''
      let pdfNome = ''
      if (pdfFile) {
        try {
          const storageRef = ref(storage, `compras/${Date.now()}_${pdfFile.name.replace(/\s/g, '_')}`)
          await uploadBytes(storageRef, pdfFile)
          pdfUrl = await getDownloadURL(storageRef)
          pdfNome = pdfFile.name
        } catch (pdfErr) {
          console.warn('PDF upload failed (non-critical):', pdfErr)
        }
      }

      // 1. Criar conta a pagar
      await addDoc(collection(db, 'contas_pagar'), {
        descricao: `Compra - ${fornecedor}`,
        fornecedor,
        numero_nota: numeroNota,
        valor: total,
        data_emissao: Timestamp.fromDate(new Date(dataCompra + 'T12:00:00')),
        ...(dataVencimento ? { data_vencimento: Timestamp.fromDate(new Date(dataVencimento + 'T12:00:00')) } : {}),
        status: 'pendente',
        origem: 'compra',
        observacoes,
        itens: itens.map(i => ({ produto_id: i.produto_id, produto_nome: i.produto_nome, quantidade: i.quantidade, preco_custo: i.preco_custo })),
        pdf_url: pdfUrl,
        pdf_nome: pdfNome,
        created_at: Timestamp.now(),
      })

      // 1b. Auto-create expense for Dashboard integration
      await addDoc(collection(db, 'expenses'), {
        descricao: `Compra - ${fornecedor}`,
        valor: total,
        categoria: 'Produtos',
        data: Timestamp.fromDate(new Date(dataCompra + 'T12:00:00')),
        fornecedor,
        numero_nota: numeroNota,
        origem: 'compra_fornecedor',
        pdf_url: pdfUrl,
        created_at: Timestamp.now(),
      })

      // 2. Atualizar estoque e preços — non-blocking per item
      let estoqueAtualizado = 0
      for (const item of itens) {
        try {
          const prodRef = doc(db, 'produtos', item.produto_id)
          const prodSnap = await getDoc(prodRef)
          if (!prodSnap.exists()) continue
          const prodData = prodSnap.data()
          const estoqueAtual = prodData.estoque || 0
          const custoAtual = prodData.preco_custo || prodData.preco || item.preco_custo
          const novoQtd = estoqueAtual + item.quantidade
          const custoMedio = novoQtd > 0
            ? ((custoAtual * estoqueAtual) + (item.preco_custo * item.quantidade)) / novoQtd
            : item.preco_custo

          await updateDoc(prodRef, {
            estoque: novoQtd,
            preco_custo: Math.round(custoMedio * 100) / 100,
            preco_venda: item.preco_venda > 0 ? item.preco_venda : (prodData.preco || 0),
            preco: item.preco_venda > 0 ? item.preco_venda : (prodData.preco || 0),
            margem_lucro: item.preco_venda > 0 ? Math.round(((item.preco_venda - (Math.round(custoMedio * 100) / 100)) / item.preco_venda) * 10000) / 100 : (prodData.margem_lucro || 0),
            updated_at: Timestamp.now(),
          })

          // 3. Log movimento
          await addDoc(collection(db, 'estoque_movimentos'), {
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            tipo: 'entrada',
            quantidade: item.quantidade,
            preco_custo: item.preco_custo,
            fornecedor,
            numero_nota: numeroNota,
            data: Timestamp.now(),
            created_at: Timestamp.now(),
          })
          estoqueAtualizado++
        } catch (itemErr) {
          console.warn(`Erro ao atualizar produto ${item.produto_nome}:`, itemErr)
        }
      }

      const msg = estoqueAtualizado > 0
        ? `Compra registrada! ${estoqueAtualizado} produto(s) atualizado(s) no estoque.`
        : 'Compra registrada! Nenhum produto foi vinculado ao estoque.'
      toast.success(msg)
      onSaved()
      onClose()
    } catch (e) {
      console.error('Erro ao salvar compra:', e)
      toast.error('Erro ao salvar compra. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#6F2738]"
  const labelCls = "block text-xs font-medium text-gray-600 mb-1"

  const filteredProdutos = produtos.filter(p =>
    p.nome.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(prodSearch.toLowerCase())
  ).slice(0, 8)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nova Compra de Fornecedor</h2>
            <div className="flex items-center gap-1 mt-1">
              {(['pdf','info','itens','review'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${step === s ? 'bg-[#6F2738]' : ['pdf','info','itens','review'].indexOf(step) > i ? 'bg-green-500' : 'bg-gray-200'}`} />
                  {i < 3 && <div className="w-4 h-0.5 bg-gray-200" />}
                </div>
              ))}
              <span className="text-xs text-gray-400 ml-2">
                {step === 'pdf' ? 'PDF' : step === 'info' ? 'Dados' : step === 'itens' ? 'Produtos' : 'Revisão'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* STEP: PDF */}
          {step === 'pdf' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-[#6F2738] hover:bg-amber-50 transition-all"
              >
                {pdfLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-[#6F2738] animate-spin" />
                    <p className="text-sm text-gray-500">Lendo PDF...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                      <FileText className="w-7 h-7 text-[#6F2738]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Clique para enviar o PDF</p>
                      <p className="text-sm text-gray-400 mt-1">Nota fiscal / invoice do fornecedor</p>
                      <p className="text-xs text-gray-300 mt-1">O sistema tentará preencher os dados automaticamente</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#6F2738] rounded-xl text-white text-sm font-medium">
                      <Upload className="w-4 h-4" /> Selecionar PDF
                    </div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => setStep('info')}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                Pular — Preencher manualmente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP: INFO */}
          {step === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Fornecedor *</label>
                  <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do distribuidor" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Nº da Nota / Invoice</label>
                  <input value={numeroNota} onChange={e => setNumeroNota(e.target.value)} placeholder="INV-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Valor Total ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0.00" className={`${inputCls} pl-7`} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Data da Compra</label>
                  <input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Data de Vencimento</label>
                  <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Observações</label>
                  <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Condições, notas adicionais..." />
                </div>
              </div>
            </div>
          )}

          {/* STEP: ITENS */}
          {step === 'itens' && (
            <div className="space-y-4">
              {/* Item list */}
              {itens.length > 0 && (
                <div className="space-y-2">
                  {itens.map((it, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                      <Package className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{it.produto_nome}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>Qtd: {it.quantidade}</span>
                          <span>Custo: ${it.preco_custo.toFixed(2)}</span>
                          <span>Venda: $
                            <input
                              type="number"
                              step="0.01"
                              value={it.preco_venda}
                              onChange={e => updateItemVenda(i, parseFloat(e.target.value) || 0)}
                              className="w-16 border-b border-gray-300 focus:outline-none focus:border-[#6F2738] ml-0.5 bg-transparent"
                            />
                          </span>
                          <span className={`font-semibold ${it.margem >= 30 ? 'text-green-600' : it.margem >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                            Margem: {it.margem.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <button onClick={() => removeItem(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2">
                    <span>Total calculado:</span>
                    <span className="text-[#6F2738]">${calcTotal().toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Add item */}
              {addingItem ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div>
                    <label className={labelCls}>Buscar Produto</label>
                    <input
                      value={prodSearch}
                      onChange={e => { setProdSearch(e.target.value); loadProdutos() }}
                      onFocus={loadProdutos}
                      placeholder="Digite o nome do produto..."
                      className={inputCls}
                    />
                    {prodSearch && filteredProdutos.length > 0 && (
                      <div className="border border-gray-200 rounded-xl mt-1 bg-white shadow-sm max-h-40 overflow-y-auto">
                        {filteredProdutos.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setNovoItemProdId(p.id); setNovoItemVenda(String(p.preco || '')); setProdSearch(p.nome) }}
                            className={`w-full text-left px-3 py-2 hover:bg-amber-50 text-sm flex justify-between items-center ${novoItemProdId === p.id ? 'bg-amber-100' : ''}`}
                          >
                            <span>{p.nome}</span>
                            <span className="text-xs text-gray-400">Estoque: {p.estoque || 0}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelCls}>Quantidade</label>
                      <input type="number" min="1" value={novoItemQtd} onChange={e => setNovoItemQtd(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Custo Unit. ($) *</label>
                      <input type="number" step="0.01" value={novoItemCusto} onChange={e => setNovoItemCusto(e.target.value)} placeholder="0.00" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Preço Venda ($)</label>
                      <input type="number" step="0.01" value={novoItemVenda} onChange={e => setNovoItemVenda(e.target.value)} placeholder="0.00" className={inputCls} />
                    </div>
                  </div>
                  {novoItemCusto && novoItemVenda && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-700">
                        Margem: {calcMargem(parseFloat(novoItemCusto)||0, parseFloat(novoItemVenda)||0).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => { setAddingItem(false); setProdSearch(''); setNovoItemProdId('') }} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
                    <button onClick={addItem} className="flex-[2] py-2 rounded-xl bg-[#6F2738] text-white text-sm font-semibold">+ Adicionar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingItem(true); loadProdutos() }}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm hover:border-[#6F2738] hover:text-[#6F2738] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Adicionar Produto
                </button>
              )}
            </div>
          )}

          {/* STEP: REVIEW */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Fornecedor</span><span className="font-semibold">{fornecedor}</span></div>
                {numeroNota && <div className="flex justify-between"><span className="text-gray-500">Nota</span><span>{numeroNota}</span></div>}
              {pdfFileName && <div className="flex justify-between items-center"><span className="text-gray-500">PDF Anexado</span><span className="text-xs text-green-600 font-medium">✓ {pdfFileName.substring(0, 30)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Vencimento</span><span>{dataVencimento ? new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</span></div>
                <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span className="text-[#6F2738]">${(parseFloat(valorTotal) || calcTotal()).toFixed(2)}</span>
                </div>
              </div>
              {itens.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Produtos que serão atualizados no estoque</p>
                  <div className="space-y-2">
                    {itens.map((it, i) => (
                      <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{it.produto_nome}</p>
                          <p className="text-xs text-gray-400">{it.estoque_atual} → {it.estoque_atual + it.quantidade} un · Custo ${it.preco_custo.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-700">${it.preco_venda.toFixed(2)}</p>
                          <p className={`text-xs font-semibold ${it.margem >= 30 ? 'text-green-600' : it.margem >= 15 ? 'text-amber-600' : 'text-red-600'}`}>{it.margem.toFixed(1)}% margem</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          {step !== 'pdf' && (
            <button
              onClick={() => setStep(step === 'info' ? 'pdf' : step === 'itens' ? 'info' : 'itens')}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
            >
              Voltar
            </button>
          )}
          {step === 'info' && (
            <button
              onClick={() => { if (!fornecedor) { toast.error('Informe o nome do fornecedor'); return } setStep('itens') }}
              className="flex-1 py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold hover:bg-[#4A1A26] flex items-center justify-center gap-2"
            >
              Próximo — Adicionar Produtos <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'itens' && (
            <button
              onClick={() => setStep('review')}
              className="flex-1 py-3 rounded-xl bg-[#6F2738] text-white text-sm font-bold hover:bg-[#4A1A26] flex items-center justify-center gap-2"
            >
              Revisar e Confirmar <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'review' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Salvando...' : '✅ Confirmar Compra e Atualizar Estoque'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
