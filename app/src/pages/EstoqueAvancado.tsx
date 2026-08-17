import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy, limit, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateStock } from '@/lib/inventory';
import { toast } from 'sonner';
import { Package, Search, AlertTriangle, Plus, Minus, RotateCcw, TrendingUp, DollarSign, ShoppingBag, Download, Upload, Edit2, X, History, ArrowUpCircle, ArrowDownCircle, SlidersHorizontal, ShoppingCart, Filter, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Produto } from '@/types';

interface ProdutoForm {
  nome: string
  categoria: string
  preco: string
  preco_custo: string
  estoque: string
  estoque_minimo: string
  unidade: string
  comissao_percentual: string
}

interface Movimento {
  id?: string
  produto_id: string
  produto_nome: string
  tipo: 'entrada' | 'saida' | 'ajuste' | 'venda'
  quantidade: number
  estoque_antes: number
  estoque_depois: number
  observacao?: string
  created_at: any
}

const emptyForm: ProdutoForm = { nome:'', categoria:'', preco:'', preco_custo:'', estoque:'0', estoque_minimo:'0', unidade:'un', comissao_percentual:'' }

const tipoCls: Record<string, string> = {
  entrada: 'bg-green-100 text-green-700',
  saida:   'bg-orange-100 text-orange-700',
  ajuste:  'bg-blue-100 text-blue-700',
  venda:   'bg-purple-100 text-purple-700',
}
const tipoLabel: Record<string, string> = {
  entrada: 'Entrada',
  saida:   'Sa\u00edda',
  ajuste:  'Ajuste',
  venda:   'Venda',
}

export function EstoqueAvancado() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortAZ, setSortAZ] = useState(false);
  const [showBaixoEstoque, setShowBaixoEstoque] = useState(false);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [quantidadeAjuste, setQuantidadeAjuste] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProdutoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loadingMovimentos, setLoadingMovimentos] = useState(false);
  const [activeTab, setActiveTab] = useState<'produtos' | 'historico'>('produtos');
  const [filtroMovTipo, setFiltroMovTipo] = useState<'todos' | 'entrada' | 'saida' | 'ajuste' | 'venda'>('todos');
  const [filtroMovProduto, setFiltroMovProduto] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; nome: string} | null>(null)
  const [deletingProd, setDeletingProd] = useState(false)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [undoStack, setUndoStack] = useState<Produto[]>([])
  const [showUndo, setShowUndo] = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return; }
    fetchProdutos();
    fetchMovimentos();
  }, [isAdmin]);

  const fetchProdutos = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db,'produtos'), where('ativo','==',true)));
      setProdutos(snap.docs.map(d => ({ id:d.id,...d.data() })) as Produto[]);
    } catch{ toast.error('Erro ao carregar estoque'); }
    finally { setLoading(false); }
  };

  const fetchMovimentos = async () => {
    setLoadingMovimentos(true);
    try {
      const snap = await getDocs(query(collection(db,'movimentos_estoque'), orderBy('created_at','desc'), limit(300)));
      setMovimentos(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Movimento[]);
    } catch(e) { console.error('Erro ao carregar movimentos:', e); }
    finally { setLoadingMovimentos(false); }
  };

  const registrarMovimento = async (produto: Produto, tipo: 'entrada' | 'saida' | 'ajuste' | 'venda', qtd: number, obs?: string) => {
    try {
      const estoque_antes = produto.estoque || 0;
      const estoque_depois = tipo === 'entrada'
        ? estoque_antes + qtd
        : tipo === 'saida' || tipo === 'venda'
          ? estoque_antes - qtd
          : qtd;
      await addDoc(collection(db,'movimentos_estoque'), {
        produto_id: produto.id,
        produto_nome: produto.nome,
        tipo,
        quantidade: qtd,
        estoque_antes,
        estoque_depois,
        observacao: obs || '',
        created_at: Timestamp.now(),
      });
    } catch(e) { console.error('Erro ao registrar movimento:', e); }
  };

  const handleAjuste = async (produtoId: string, tipo: 'entrada' | 'saida') => {
    const qtd = parseInt(quantidadeAjuste);
    if (!qtd || qtd <= 0) { toast.error('Quantidade inv\u00e1lida'); return; }
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    if (tipo==='saida' && (produto.estoque||0) - qtd < 0) { toast.error('Estoque n\u00e3o pode ficar negativo'); return; }
    try {
      await updateStock(produtoId, tipo==='entrada' ? qtd : -qtd, 0);
      await registrarMovimento(produto, tipo, qtd);
      toast.success(`Estoque ${tipo==='entrada'?'adicionado':'removido'}!`);
      setAjustando(null); setQuantidadeAjuste('');
      fetchProdutos();
      fetchMovimentos();
    } catch{ toast.error('Erro ao ajustar estoque'); }
  };

  const openNew = () => { setForm(emptyForm); setEditingId(null); setShowModal(true); };
  const openEdit = (p: Produto) => {
    setForm({
      nome: p.nome || '',
      categoria: p.categoria || '',
      preco: String((p as any).preco || ''),
      preco_custo: String((p as any).preco_custo || ''),
      estoque: String(p.estoque || 0),
      estoque_minimo: String(p.estoque_minimo || 0),
      unidade: (p as any).unidade || 'un',
      comissao_percentual: String((p as any).comissao_percentual || ''),
    });
    setEditingId(p.id!);
    setShowModal(true);
  };

  const calcMargem = (custo: number, venda: number) => venda > 0 ? Math.round(((venda - custo) / custo) * 10000) / 100 : 0;

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigat\u00f3rio'); return; }
    setSaving(true);
    try {
      const custo = parseFloat(form.preco_custo) || 0;
      const venda = parseFloat(form.preco) || 0;
      const novoEstoque = parseInt(form.estoque) || 0;
      const data = {
        nome: form.nome.trim(),
        categoria: form.categoria.trim(),
        preco: venda,
        preco_venda: venda,
        preco_custo: custo,
        margem_lucro: calcMargem(custo, venda),
        estoque: novoEstoque,
        estoque_minimo: parseInt(form.estoque_minimo) || 0,
        unidade: form.unidade || 'un',
        comissao_percentual: parseFloat(form.comissao_percentual) || 0,
        ativo: true,
        updated_at: Timestamp.now(),
      };
      if (editingId) {
        const oldProduto = produtos.find(p => p.id === editingId);
        await updateDoc(doc(db, 'produtos', editingId), data);
        if (oldProduto && novoEstoque !== (oldProduto.estoque || 0)) {
          await registrarMovimento(
            oldProduto,
            'ajuste',
            novoEstoque,
            `Ajuste manual: ${oldProduto.estoque || 0} \u2192 ${novoEstoque}`
          );
        }
        toast.success('Produto atualizado!');
      } else {
        await addDoc(collection(db, 'produtos'), { ...data, created_at: Timestamp.now() });
        toast.success('Produto criado!');
      }
      setShowModal(false);
      fetchProdutos();
      fetchMovimentos();
    } catch(e) { console.error(e); toast.error('Erro ao salvar produto'); }
    finally { setSaving(false); }
  };

  const handleExport = () => {
    const rows = produtos.map(p => ({
      'Nome': p.nome,
      'Categoria': p.categoria || '',
      'Pre\u00e7o Venda ($)': (p as any).preco || 0,
      'Pre\u00e7o Custo ($)': (p as any).preco_custo || 0,
      'Margem (%)': (p as any).margem_lucro || 0,
      'Estoque': p.estoque || 0,
      'Estoque M\u00ednimo': p.estoque_minimo || 0,
      'Unidade': (p as any).unidade || 'un',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, `estoque_bbvic_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Estoque exportado para Excel!');
  };

  const handleExportHistorico = () => {
    const rows = movimentosFiltrados.map(m => ({
      'Data': m.created_at?.toDate ? m.created_at.toDate().toLocaleString('pt-BR') : '',
      'Produto': m.produto_nome,
      'Tipo': tipoLabel[m.tipo] || m.tipo,
      'Quantidade': m.quantidade,
      'Estoque Antes': m.estoque_antes,
      'Estoque Depois': m.estoque_depois,
      'Observa\u00e7\u00e3o': m.observacao || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hist\u00f3rico');
    XLSX.writeFile(wb, `historico_estoque_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Hist\u00f3rico exportado!');
  };

  const getCol = (row: any, ...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim())
      if (found !== undefined && row[found] !== undefined && row[found] !== '') return row[found]
    }
    return undefined
  }

  const handleDownloadTemplate = () => {
    const template = [
      { 'Nome': 'Exemplo Produto', 'Categoria': 'Cabelo', 'Preco Venda': 25.00, 'Preco Custo': 15.00, 'Estoque': 10, 'Estoque Minimo': 2, 'Unidade': 'un' }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo')
    XLSX.writeFile(wb, 'modelo_estoque.xlsx')
    toast.success('Modelo baixado!')
  }

  const cleanNum = (v: any): number => {
    if (v === undefined || v === null || v === '') return 0
    // Remove $, spaces, then replace comma decimal separator with dot
    const s = String(v).replace(/[$\s]/g, '').replace(',', '.')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.info('Importando planilha...')
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        // tenta aba "Estoque" primeiro, senão usa a primeira aba
        const sheetName = wb.SheetNames.includes('Estoque') ? 'Estoque' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) { toast.error('Planilha vazia ou formato inválido'); return; }

        // Buscar produtos existentes para fazer upsert (update ou create)
        const existSnap = await getDocs(query(collection(db, 'produtos'), where('admin_id', '==', user?.uid)));
        const existingMap: Record<string, string> = {}; // nome_normalizado -> docId
        existSnap.forEach(d => {
          const n = (d.data().nome || '').toString().toUpperCase().trim().replace(/\s+/g, ' ');
          existingMap[n] = d.id;
        });

        let atualizados = 0;
        let criados = 0;
        let skipped = 0;

        for (const row of rows) {
          const nome = getCol(row, 'Nome', 'NOME', 'name', 'produto', 'product', 'descricao', 'description')
          if (!nome) { skipped++; continue; }
          const nomeStr = String(nome).trim();
          const nomeNorm = nomeStr.toUpperCase().replace(/\s+/g, ' ');

          // Suporta tanto "PreCo Venda ($)" quanto "Preço Venda ($)" e variações
          const custo = cleanNum(getCol(row,
            'PreCo Custo ($)', 'Preco Custo ($)', 'Preço Custo ($)', 'Preco Custo', 'Preço Custo',
            'preco_custo', 'custo', 'cost', 'PRECO CUSTO', 'PRECO CUSTO ($)'))
          const venda = cleanNum(getCol(row,
            'PreCo Venda ($)', 'Preco Venda ($)', 'Preço Venda ($)', 'Preco Venda', 'Preço Venda',
            'preco_venda', 'preco', 'venda', 'price', 'PRECO VENDA', 'PRECO VENDA ($)'))
          const estoque = Math.round(cleanNum(getCol(row, 'Estoque', 'estoque', 'qty', 'quantidade', 'stock', 'ESTOQUE')))
          const estoqueMin = Math.round(cleanNum(getCol(row,
            'Estoque MInimo', 'Estoque Minimo', 'Estoque Mínimo', 'estoque_minimo', 'minimo', 'min', 'ESTOQUE MINIMO')))
          const categoria = String(getCol(row, 'Categoria', 'categoria', 'category', 'CATEGORIA') || '').trim()
          const unidade = String(getCol(row, 'Unidade', 'unidade', 'unit', 'UNIDADE') || 'un').trim()
          const margem = venda > 0 ? Math.round(((venda - custo) / custo) * 10000) / 100 : 0

          const dadosProduto: any = {
            nome: nomeStr,
            categoria,
            preco: venda,
            preco_venda: venda,
            preco_custo: custo,
            margem_lucro: margem,
            estoque: isNaN(estoque) ? 0 : estoque,
            estoque_minimo: isNaN(estoqueMin) ? 0 : estoqueMin,
            unidade,
            ativo: true,
            updated_at: Timestamp.now(),
          };

          if (existingMap[nomeNorm]) {
            // Produto já existe: ATUALIZAR
            await updateDoc(doc(db, 'produtos', existingMap[nomeNorm]), dadosProduto);
            atualizados++;
          } else {
            // Produto novo: CRIAR
            dadosProduto.admin_id = user?.uid;
            dadosProduto.created_at = Timestamp.now();
            await addDoc(collection(db, 'produtos'), dadosProduto);
            criados++;
          }
        }

        if (criados === 0 && atualizados === 0) {
          toast.error(`Nenhum produto importado. Verifique se a planilha tem a coluna "Nome". Linhas ignoradas: ${skipped}`)
        } else {
          toast.success(`Importação concluída! ${atualizados} atualizado(s), ${criados} novo(s)${skipped > 0 ? `, ${skipped} ignorado(s)` : ''}`)
          fetchProdutos();
        }
      } catch(err) {
        console.error('Erro importação:', err)
        toast.error('Erro ao ler planilha. Verifique se o arquivo é .xlsx válido.')
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const filtered = produtos
    .filter(p => p.nome.toLowerCase().includes(search.toLowerCase()) || p.categoria?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortAZ ? (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }) : 0);
  const baixoEstoque = filtered.filter(p => (p.estoque||0) <= (p.estoque_minimo||0));

  const movimentosFiltrados = movimentos.filter(m => {
    const matchTipo = filtroMovTipo === 'todos' || m.tipo === filtroMovTipo;
    const matchProd = !filtroMovProduto || m.produto_nome.toLowerCase().includes(filtroMovProduto.toLowerCase());
    return matchTipo && matchProd;
  });

  const totalValorVenda = produtos.reduce((sum, p) => sum + ((p as any).preco||0) * (p.estoque||0), 0);
  const totalValorCusto = produtos.reduce((sum, p) => sum + ((p as any).preco_custo||0) * (p.estoque||0), 0);
  const lucroEstoque = totalValorVenda - totalValorCusto;
  const margemMediaGeral = totalValorVenda > 0 ? (lucroEstoque / totalValorVenda) * 100 : 0;
  const totalItens = produtos.reduce((sum, p) => sum + (p.estoque||0), 0);

  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#C9A227]';
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>;

  const triggerUndo = (deletados: Produto[]) => {
    setUndoStack(deletados)
    setShowUndo(true)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setShowUndo(false), 10000)
  }

  const handleUndo = async () => {
    if (undoStack.length === 0) return
    try {
      const batch = writeBatch(db)
      for (const p of undoStack) {
        const { id, ...data } = p
        const ref = doc(db, 'produtos', id!)
        batch.set(ref, data)
      }
      await batch.commit()
      setProdutos(prev => [...prev, ...undoStack])
      setUndoStack([])
      setShowUndo(false)
      toast.success(`${undoStack.length} produto(s) restaurado(s)!`)
    } catch (e) {
      toast.error('Erro ao desfazer exclusão')
    }
  }

  const handleDeleteProd = async () => {
    if (!deleteConfirm) return
    setDeletingProd(true)
    try {
      const produtoParaApagar = produtos.find(p => p.id === deleteConfirm.id)
      await deleteDoc(doc(db, 'produtos', deleteConfirm.id))
      setProdutos(prev => prev.filter(p => p.id !== deleteConfirm.id))
      if (produtoParaApagar) triggerUndo([produtoParaApagar])
      toast.success(`Produto "${deleteConfirm.nome}" excluído!`)
      setDeleteConfirm(null)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir produto')
    } finally {
      setDeletingProd(false)
    }
  }

  const handleDeleteAll = async () => {
    setDeletingAll(true)
    try {
      const batch = writeBatch(db)
      produtos.forEach(p => {
        batch.delete(doc(db, 'produtos', p.id!))
      })
      await batch.commit()
      setProdutos([])
      toast.success(`${produtos.length} produto(s) excluído(s)!`)
      setDeleteAllConfirm(false)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir todos os produtos')
    } finally {
      setDeletingAll(false)
    }
  }

  const handleRemoverDuplicatas = async () => {
    const mapa = new Map<string, Produto[]>()
    for (const p of produtos) {
      const key = (p.nome || '').trim().toUpperCase().replace(/\s+/g, ' ')
      if (!mapa.has(key)) mapa.set(key, [])
      mapa.get(key)!.push(p)
    }
    const paraApagar: Produto[] = []
    for (const [, lista] of mapa.entries()) {
      if (lista.length <= 1) continue
      lista.sort((a, b) => {
        const va = parseFloat(String(a.preco_venda || (a as any).preco || 0))
        const vb = parseFloat(String(b.preco_venda || (b as any).preco || 0))
        return vb - va
      })
      paraApagar.push(...lista.slice(1))
    }
    if (paraApagar.length === 0) { toast.info('Nenhuma duplicata encontrada!'); return }
    try {
      const BATCH_SIZE = 400
      for (let i = 0; i < paraApagar.length; i += BATCH_SIZE) {
        const lote = paraApagar.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        lote.forEach(p => batch.delete(doc(db, 'produtos', p.id!)))
        await batch.commit()
      }
      const idsApagar = new Set(paraApagar.map(p => p.id))
      setProdutos(prev => prev.filter(p => !idsApagar.has(p.id)))
      triggerUndo(paraApagar)
      toast.success(`${paraApagar.length} duplicata(s) removida(s)!`)
    } catch (e) {
      toast.error('Erro ao remover duplicatas')
    }
  }
  const handleRemoverZerados = async () => {
    const zerados = produtos.filter(p => {
      const venda = parseFloat(String(p.preco_venda || 0))
      const custo = parseFloat(String(p.preco_custo || 0))
      return venda === 0 && custo === 0
    })
    if (zerados.length === 0) {
      toast.info('Nenhum produto com custo e venda zerados encontrado.')
      return
    }
    try {
      const BATCH_SIZE = 400
      for (let i = 0; i < zerados.length; i += BATCH_SIZE) {
        const lote = zerados.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        lote.forEach(p => batch.delete(doc(db, 'produtos', p.id!)))
        await batch.commit()
      }
      setProdutos(prev => prev.filter(p => {
        const venda = parseFloat(String(p.preco_venda || 0))
        const custo = parseFloat(String(p.preco_custo || 0))
        return !(venda === 0 && custo === 0)
      }))
      triggerUndo(zerados)
      toast.success(`${zerados.length} produto(s) zerado(s) removido(s)!`)
    } catch (e) {
      toast.error('Erro ao remover produtos zerados')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Controle de Estoque</h1>
          <p className="text-gray-500 text-sm">Gerencie produtos, quantidades e pre\u00e7os</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'produtos' ? (
            <>
              <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                <Download className="w-4 h-4"/> Exportar Excel
              </button>
              <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#C9A227]/50 text-[#C9A227] text-sm hover:bg-[#C9A227]/5">
                <Download className="w-4 h-4"/> Baixar Modelo
              </button>
              <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                <Upload className="w-4 h-4"/> Importar Excel
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport}/>
              <button onClick={handleRemoverDuplicatas} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 text-blue-600 text-sm hover:bg-blue-50" title="Remove produtos com nome duplicado, mantendo o com maior preço">
                <Trash2 className="w-4 h-4"/> Remover Duplicatas
              </button>
              <button onClick={handleRemoverZerados} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-orange-200 text-orange-600 text-sm hover:bg-orange-50" title="Remove todos produtos com preço de custo e venda iguais a zero">
                <Trash2 className="w-4 h-4"/> Remover Zerados
              </button>
              <div className="flex gap-2">
                {produtos.length > 0 && (
                  <button
                    onClick={() => setDeleteAllConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir Todos
                  </button>
                )}
                <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-medium hover:bg-[#9A7B1A]">
                  <Plus className="w-4 h-4"/> Novo Produto
                </button>
              </div>
            </>
          ) : (
            <button onClick={handleExportHistorico} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
              <Download className="w-4 h-4"/> Exportar Excel
            </button>
          )}
          {baixoEstoque.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg">
              <AlertTriangle className="w-4 h-4"/> {baixoEstoque.length} com estoque baixo
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('produtos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab==='produtos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package className="w-4 h-4"/> Produtos
        </button>
        <button
          onClick={() => { setActiveTab('historico'); fetchMovimentos(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab==='historico' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <History className="w-4 h-4"/> Hist\u00f3rico
        </button>
      </div>

      {activeTab === 'produtos' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Valor em Estoque</span>
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-blue-600"/></div>
              </div>
              <p className="text-2xl font-bold text-gray-900">${fmt(totalValorVenda)}</p>
              <p className="text-xs text-gray-400 mt-1">{totalItens} unidades \u00b7 pre\u00e7o de venda</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lucro Potencial</span>
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-green-600"/></div>
              </div>
              <p className="text-2xl font-bold text-green-700">${fmt(lucroEstoque)}</p>
              <p className="text-xs text-gray-400 mt-1">se vender todo o estoque</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Margem M\u00e9dia</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${margemMediaGeral>=30?'bg-green-100':margemMediaGeral>=15?'bg-amber-100':'bg-red-100'}`}>
                  <DollarSign className={`w-4 h-4 ${margemMediaGeral>=30?'text-green-600':margemMediaGeral>=15?'text-amber-600':'text-red-600'}`}/>
                </div>
              </div>
              <p className={`text-2xl font-bold ${margemMediaGeral>=30?'text-green-700':margemMediaGeral>=15?'text-amber-600':'text-red-600'}`}>{margemMediaGeral.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-1">custo investido: ${fmt(totalValorCusto)}</p>
            </div>
          </div>

          {baixoEstoque.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowBaixoEstoque(p => !p)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
                  <span className="font-semibold text-sm">
                    {baixoEstoque.length} produto{baixoEstoque.length > 1 ? 's' : ''} com estoque baixo
                  </span>
                </div>
                <span className="text-amber-500 text-xs font-medium">
                  {showBaixoEstoque ? 'Ocultar \u25b2' : 'Ver quais \u25bc'}
                </span>
              </button>
              {showBaixoEstoque && (
                <div className="border-t border-amber-200 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {baixoEstoque.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-white border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full">
                        <span className="font-medium">{p.nome}</span>
                        <span className="text-amber-400">\u00b7</span>
                        <span>{p.estoque || 0} un</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <button
              onClick={() => setSortAZ(v => !v)}
              title="Ordenar A-Z"
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${sortAZ ? 'bg-[#C9A227] border-[#C9A227] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#C9A227]'}`}
            >
              A↕Z
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {filtered.length===0 ? (
              <div className="text-center py-12"><Package className="w-10 h-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500 text-sm">Nenhum produto encontrado</p></div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Produto</th>
                    <th className="px-5 py-3 font-medium hidden md:table-cell">Categoria</th>
                    <th className="px-5 py-3 font-medium text-center">Estoque</th>
                    <th className="px-5 py-3 font-medium text-center hidden sm:table-cell">Mínimo</th>
                    <th className="px-5 py-3 font-medium text-right">Custo</th>
                    <th className="px-5 py-3 font-medium text-right">Venda</th>
                    <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Margem %</th>
                    <th className="px-5 py-3 font-medium text-center">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(produto => {
                    const baixo = (produto.estoque||0) <= (produto.estoque_minimo||0);
                    return (
                      <tr key={produto.id} className={`hover:bg-gray-50 ${baixo?'bg-red-50/30':''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${baixo?'bg-red-100':'bg-[#C9A227]/15'}`}>
                              <Package className={`w-4 h-4 ${baixo?'text-red-500':'text-[#C9A227]'}`}/>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{produto.nome}</p>
                              <p className="text-xs text-gray-400 md:hidden">{(produto as any).categoria||'Sem categoria'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500 text-sm hidden md:table-cell">{produto.categoria}</td>
                        <td className="px-5 py-4 text-center"><span className={`text-xl font-bold ${baixo?'text-red-500':'text-gray-900'}`}>{produto.estoque||0}</span></td>
                        <td className="px-5 py-4 text-center text-gray-400 text-sm hidden sm:table-cell">{produto.estoque_minimo||0}</td>
                        <td className="px-5 py-4 text-right text-sm font-medium text-gray-700">${((produto as any).preco_custo||0).toFixed(2)}</td>
                        <td className="px-5 py-4 text-right text-sm font-semibold text-gray-900">${((produto as any).preco||0).toFixed(2)}</td>
                        <td className="px-5 py-4 text-right hidden sm:table-cell">
                          {(() => {
                            const custo = (produto as any).preco_custo || 0;
                            const venda = (produto as any).preco || 0;
                            const margem = venda > 0 ? ((venda - custo) / custo) * 100 : 0;
                            return (
                              <span className={`text-sm font-bold ${margem >= 30 ? 'text-green-600' : margem >= 15 ? 'text-amber-600' : margem > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {margem > 0 ? `${margem.toFixed(1)}%` : '—'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {baixo
                            ? <span className="flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full justify-center"><AlertTriangle className="w-3 h-3"/> Baixo</span>
                            : <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full">Normal</span>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={()=>openEdit(produto)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Editar produto"><Edit2 className="w-4 h-4"/></button>
                            <button
                              onClick={() => setDeleteConfirm({ id: produto.id!, nome: produto.nome })}
                              className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100"
                              title="Excluir produto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {ajustando===produto.id ? (
                              <div className="flex items-center gap-1">
                                <input type="number" min="1" value={quantidadeAjuste} onChange={e=>setQuantidadeAjuste(e.target.value)} placeholder="Qtd" className="w-14 px-2 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-900 text-center focus:outline-none focus:border-[#C9A227]" autoFocus/>
                                <button onClick={()=>handleAjuste(produto.id!,'entrada')} className="p-1.5 rounded-lg bg-green-100 text-green-600 hover:bg-green-200" title="Entrada"><Plus className="w-4 h-4"/></button>
                                <button onClick={()=>handleAjuste(produto.id!,'saida')} className="p-1.5 rounded-lg bg-red-100 text-red-500 hover:bg-red-200" title="Sa\u00edda"><Minus className="w-4 h-4"/></button>
                                <button onClick={()=>{setAjustando(null);setQuantidadeAjuste('');}} className="p-1.5 rounded-lg bg-gray-100 text-gray-500"><RotateCcw className="w-4 h-4"/></button>
                              </div>
                            ) : (
                              <button onClick={()=>setAjustando(produto.id!)} className="px-3 py-1.5 rounded-lg bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-xs font-medium">Ajustar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'historico' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['entrada','saida','ajuste','venda'] as const).map(tipo => {
              const count = movimentos.filter(m => m.tipo === tipo).length;
              const icons = {
                entrada: <ArrowUpCircle className="w-4 h-4 text-green-600" />,
                saida:   <ArrowDownCircle className="w-4 h-4 text-orange-500" />,
                ajuste:  <SlidersHorizontal className="w-4 h-4 text-blue-500" />,
                venda:   <ShoppingCart className="w-4 h-4 text-purple-600" />,
              };
              return (
                <div key={tipo} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    {icons[tipo]}
                    <span className="text-xs font-medium text-gray-500 uppercase">{tipoLabel[tipo]}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-400 mt-0.5">movimentos</p>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input
                value={filtroMovProduto}
                onChange={e => setFiltroMovProduto(e.target.value)}
                placeholder="Buscar por produto..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400"/>
              <div className="flex gap-1 flex-wrap">
                {(['todos','entrada','saida','ajuste','venda'] as const).map(tipo => (
                  <button
                    key={tipo}
                    onClick={() => setFiltroMovTipo(tipo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroMovTipo === tipo ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {tipo === 'todos' ? 'Todos' : tipoLabel[tipo]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingMovimentos ? (
              <div className="flex justify-center p-10"><div className="w-6 h-6 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>
            ) : movimentosFiltrados.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-500 text-sm">Nenhum movimento encontrado</p>
                <p className="text-gray-400 text-xs mt-1">Os movimentos aparecem aqui conforme voc\u00ea faz ajustes ou registra vendas</p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-5 py-3 font-medium">Data/Hora</th>
                        <th className="px-5 py-3 font-medium">Produto</th>
                        <th className="px-5 py-3 font-medium text-center">Tipo</th>
                        <th className="px-5 py-3 font-medium text-center">Quantidade</th>
                        <th className="px-5 py-3 font-medium text-center">Antes \u2192 Depois</th>
                        <th className="px-5 py-3 font-medium">Observa\u00e7\u00e3o</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {movimentosFiltrados.map(m => {
                        const data = m.created_at?.toDate ? m.created_at.toDate() : new Date();
                        const sinal = m.tipo === 'entrada' ? '+' : m.tipo === 'saida' || m.tipo === 'venda' ? '-' : '\u2192';
                        const qtdCls = m.tipo === 'entrada' ? 'text-green-600' : m.tipo === 'saida' || m.tipo === 'venda' ? 'text-red-500' : 'text-blue-600';
                        const iconMap = {
                          entrada: <ArrowUpCircle className="w-4 h-4 text-green-600" />,
                          saida:   <ArrowDownCircle className="w-4 h-4 text-orange-500" />,
                          ajuste:  <SlidersHorizontal className="w-4 h-4 text-blue-500" />,
                          venda:   <ShoppingCart className="w-4 h-4 text-purple-600" />,
                        };
                        return (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3">
                              <p className="text-sm text-gray-700">{data.toLocaleDateString('pt-BR')}</p>
                              <p className="text-xs text-gray-400">{data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                                  <Package className="w-3.5 h-3.5 text-gray-500"/>
                                </div>
                                <span className="text-sm font-medium text-gray-800">{m.produto_nome}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${tipoCls[m.tipo]}`}>
                                {iconMap[m.tipo]}
                                {tipoLabel[m.tipo]}
                              </span>
                            </td>
                            <td className={`px-5 py-3 text-center text-base font-bold ${qtdCls}`}>
                              {sinal}{m.quantidade}
                            </td>
                            <td className="px-5 py-3 text-center text-sm text-gray-600">
                              <span className="text-gray-400">{m.estoque_antes}</span>
                              <span className="mx-1.5 text-gray-300">\u2192</span>
                              <span className="font-semibold text-gray-800">{m.estoque_depois}</span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-400">{m.observacao || '\u2014'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-gray-100">
                  {movimentosFiltrados.map(m => {
                    const data = m.created_at?.toDate ? m.created_at.toDate() : new Date();
                    const sinal = m.tipo === 'entrada' ? '+' : m.tipo === 'saida' || m.tipo === 'venda' ? '-' : '\u2192';
                    const qtdCls = m.tipo === 'entrada' ? 'text-green-600' : m.tipo === 'saida' || m.tipo === 'venda' ? 'text-red-500' : 'text-blue-600';
                    const iconMap = {
                      entrada: <ArrowUpCircle className="w-4 h-4 text-green-600" />,
                      saida:   <ArrowDownCircle className="w-4 h-4 text-orange-500" />,
                      ajuste:  <SlidersHorizontal className="w-4 h-4 text-blue-500" />,
                      venda:   <ShoppingCart className="w-4 h-4 text-purple-600" />,
                    };
                    return (
                      <div key={m.id} className="p-4 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          {iconMap[m.tipo]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-gray-900 text-sm truncate">{m.produto_nome}</p>
                            <span className={`text-sm font-bold flex-shrink-0 ${qtdCls}`}>{sinal}{m.quantidade}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tipoCls[m.tipo]}`}>{tipoLabel[m.tipo]}</span>
                            <span className="text-xs text-gray-400">{m.estoque_antes} \u2192 {m.estoque_depois} un</span>
                            <span className="text-xs text-gray-400">{data.toLocaleDateString('pt-BR')} {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {m.observacao && <p className="text-xs text-gray-400 mt-1">{m.observacao}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-400">{movimentosFiltrados.length} movimento{movimentosFiltrados.length !== 1 ? 's' : ''} encontrado{movimentosFiltrados.length !== 1 ? 's' : ''}</p>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={()=>setShowModal(false)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={()=>setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={labelCls}>Nome *</label>
                <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome do produto" className={inputCls}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Categoria</label>
                  <input value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} placeholder="Ex: Shampoo" className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select value={form.unidade} onChange={e=>setForm(f=>({...f,unidade:e.target.value}))} className={inputCls}>
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="L">Litro (L)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="g">Grama (g)</option>
                    <option value="cx">Caixa (cx)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Pre\u00e7o de Venda ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" value={form.preco} onChange={e=>setForm(f=>({...f,preco:e.target.value}))} placeholder="0.00" className={`${inputCls} pl-7`}/>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Pre\u00e7o de Custo ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" value={form.preco_custo} onChange={e=>setForm(f=>({...f,preco_custo:e.target.value}))} placeholder="0.00" className={`${inputCls} pl-7`}/>
                  </div>
                </div>
              </div>
              {form.preco && form.preco_custo && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                  <span className="text-gray-500">Margem calculada: </span>
                  <span className={`font-bold ${calcMargem(parseFloat(form.preco_custo)||0, parseFloat(form.preco)||0)>=30?'text-green-600':calcMargem(parseFloat(form.preco_custo)||0, parseFloat(form.preco)||0)>=15?'text-amber-600':'text-red-600'}`}>
                    {calcMargem(parseFloat(form.preco_custo)||0, parseFloat(form.preco)||0).toFixed(1)}%
                  </span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">% Comissão do Produto</label>
                <div className="relative">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    value={form.comissao_percentual}
                    onChange={e => setForm({ ...form, comissao_percentual: e.target.value })}
                    placeholder="Ex: 5"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227] pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Comissão específica para este produto (substitui % do vendedor)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Estoque Atual</label>
                  <input type="number" min="0" value={form.estoque} onChange={e=>setForm(f=>({...f,estoque:e.target.value}))} className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Estoque M\u00ednimo</label>
                  <input type="number" min="0" value={form.estoque_minimo} onChange={e=>setForm(f=>({...f,estoque_minimo:e.target.value}))} className={inputCls}/>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={()=>setShowModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white text-sm font-bold hover:bg-[#9A7B1A] disabled:opacity-50">
                {saving ? 'Salvando...' : (editingId ? 'Salvar Altera\u00e7\u00f5es' : 'Criar Produto')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Single Product Modal */}
      {showUndo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="text-sm">{undoStack.length} produto(s) excluído(s)</span>
          <button onClick={handleUndo} className="px-4 py-1.5 bg-[#C9A227] text-white text-sm font-semibold rounded-xl hover:bg-[#b8911f]">
            Desfazer
          </button>
          <button onClick={() => setShowUndo(false)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Produto</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir <span className="font-semibold text-gray-900">"{deleteConfirm.nome}"</span>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDeleteProd} disabled={deletingProd} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deletingProd && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Products Modal */}
      {deleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteAllConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Todos os Produtos</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Isso vai excluir <span className="font-semibold text-red-600">todos os {produtos.length} produtos</span> do estoque permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAllConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDeleteAll} disabled={deletingAll} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deletingAll && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>}
                {deletingAll ? 'Excluindo...' : 'Excluir Tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



