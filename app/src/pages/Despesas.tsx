import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Calendar, Tag, Loader2, TrendingDown, CheckCircle, Eye, X, Package, FileText, Building2 } from 'lucide-react';
import type { Expense } from '@/types';

const CATEGORIAS_DESPESA = ['Comissão','Produtos','Equipamentos','Aluguel','Utilities','Marketing','Transporte','Outros'];

export function Despesas() {
  const { user, isAdmin } = useAuth();
  const [despesas, setDespesas] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('todas');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('Outros');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [compraModal, setCompraModal] = useState<any | null>(null);
  const [loadingCompra, setLoadingCompra] = useState(false);
  const [markingPago, setMarkingPago] = useState<string | null>(null);

  useEffect(() => { fetchDespesas(); }, []);

  const fetchDespesas = async () => {
    try {
      setLoading(true);
      const q = isAdmin
        ? query(collection(db,'expenses'), where('data','>=',Timestamp.fromDate(new Date(Date.now()-90*24*60*60*1000))))
        : query(collection(db,'expenses'), where('vendedor_id','==',user?.uid), where('data','>=',Timestamp.fromDate(new Date(Date.now()-90*24*60*60*1000))));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id:d.id,...d.data() })) as Expense[];
      setDespesas(items.sort((a:any,b:any) => b.data.toMillis()-a.data.toMillis()));
    } catch { toast.error('Erro ao carregar despesas'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || !valor) { toast.error('Preencha todos os campos'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db,'expenses'), {
        descricao, valor:parseFloat(valor), categoria,
        data:Timestamp.fromDate(new Date(data)),
        vendedor_id:user?.uid, vendedor_nome:(user as any)?.nome, created_at:Timestamp.now(),
      });
      toast.success('Despesa adicionada!');
      setDescricao(''); setValor(''); setCategoria('Outros');
      setShowForm(false); fetchDespesas();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta despesa?')) return;
    try { await deleteDoc(doc(db,'expenses',id)); toast.success('Excluída!'); fetchDespesas(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const verCompra = async (compra_id: string) => {
    setLoadingCompra(true);
    setCompraModal({ loading: true });
    try {
      const compraSnap = await getDoc(doc(db, 'compras', compra_id));
      if (!compraSnap.exists()) { toast.error('Compra não encontrada'); setCompraModal(null); return; }
      setCompraModal({ id: compraSnap.id, ...compraSnap.data() });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar compra');
      setCompraModal(null);
    } finally {
      setLoadingCompra(false);
    }
  };

  const marcarPago = async (despesa: any) => {
    if (!despesa.compra_id) return;
    setMarkingPago(despesa.id);
    try {
      // Mark compra as paid
      await updateDoc(doc(db, 'compras', despesa.compra_id), {
        status: 'pago',
        data_pagamento: Timestamp.now(),
      });
      // Mark contas_pagar as paid
      const cpSnap = await getDocs(query(collection(db, 'contas_pagar'), where('compra_id', '==', despesa.compra_id)));
      for (const cpDoc of cpSnap.docs) {
        await updateDoc(cpDoc.ref, { status: 'pago', data_pagamento: Timestamp.now() });
      }
      toast.success('Compra marcada como paga!');
      fetchDespesas();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao marcar como pago');
    } finally {
      setMarkingPago(null);
    }
  };

  const filtered = despesas.filter(d => {
    const okSearch = d.descricao.toLowerCase().includes(search.toLowerCase());
    const okCat = categoriaFilter === 'todas' || d.categoria === categoriaFilter;
    return okSearch && okCat;
  });

  const total = filtered.reduce((a,d) => a+d.valor, 0);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Despesas</h1>
          <p className="text-gray-500 text-sm">Controle suas despesas (últimos 90 dias)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-sm font-medium">
          <Plus className="w-4 h-4"/> {showForm ? 'Cancelar' : 'Nova Despesa'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-500"/></div>
          <div><p className="text-sm text-gray-500">Total em Despesas</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</p></div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">Nova Despesa</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição da despesa" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} placeholder="0.00" className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]">
                {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-medium hover:bg-[#9A7B1A] disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin"/>} Salvar
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar despesa..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
        </div>
        <select value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-[#C9A227]">
          <option value="todas">Todas Categorias</option>
          {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm"><TrendingDown className="w-10 h-10 mx-auto mb-2 opacity-30"/><p>Nenhuma despesa encontrada</p></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(d => {
              const isCompra = (d as any).origem === 'compra' && (d as any).compra_id;
              const isPago = (d as any).status === 'pago';
              return (
                <div key={d.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isCompra ? 'bg-blue-100' : 'bg-red-100'}`}>
                      {isCompra ? <Building2 className="w-4 h-4 text-blue-500"/> : <Tag className="w-4 h-4 text-red-500"/>}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{d.descricao}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                        <Calendar className="w-3 h-3"/>
                        <span>{formatDate((d as any).data)}</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{d.categoria}</span>
                        {isCompra && (
                          <span className={`px-1.5 py-0.5 rounded font-medium ${isPago ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {isPago ? '✓ Paga' : 'Pendente'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-red-500">-{formatCurrency(d.valor)}</p>
                    {isCompra && (
                      <>
                        <button
                          onClick={() => verCompra((d as any).compra_id)}
                          title="Ver detalhes da compra"
                          className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        {!isPago && (
                          <button
                            onClick={() => marcarPago(d)}
                            disabled={markingPago === d.id}
                            title="Marcar como paga"
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            {markingPago === d.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => handleDelete(d.id!)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Compra */}
      {compraModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setCompraModal(null)}>
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600"/>
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Detalhes da Compra</h2>
                  {compraModal.numero && <p className="text-xs text-gray-400">{compraModal.numero}</p>}
                </div>
              </div>
              <button onClick={() => setCompraModal(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {compraModal.loading || loadingCompra ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A227]"/></div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                {/* Supplier Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Fornecedor</p>
                    <p className="font-semibold text-gray-900">{compraModal.fornecedor || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Nº Nota</p>
                    <p className="font-semibold text-gray-900">{compraModal.numero_nota || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Data da Compra</p>
                    <p className="text-gray-700 text-sm">{compraModal.data_compra?.toDate ? formatDate(compraModal.data_compra.toDate()) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Vencimento</p>
                    <p className="text-gray-700 text-sm">{compraModal.data_vencimento?.toDate ? formatDate(compraModal.data_vencimento.toDate()) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Status</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${compraModal.status === 'pago' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {compraModal.status === 'pago' ? 'Pago' : 'Pendente'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Total</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(compraModal.total || 0)}</p>
                  </div>
                </div>

                {/* PDF */}
                {compraModal.pdf_url && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600"/>
                      <span className="text-sm text-blue-700 font-medium">{compraModal.pdf_nome || 'Nota Fiscal PDF'}</span>
                    </div>
                    <a href={compraModal.pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                      Abrir PDF
                    </a>
                  </div>
                )}

                {/* Items */}
                {(compraModal.items || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5"/> Produtos Comprados
                    </p>
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
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
                          {(compraModal.items || []).map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{item.produto_nome}</td>
                              <td className="px-4 py-2.5 text-center text-gray-600">{item.quantidade}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(item.preco_custo || 0)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency((item.preco_custo || 0) * (item.quantidade || 1))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-gray-700 text-right">Total</td>
                            <td className="px-4 py-2.5 font-bold text-gray-900 text-right">{formatCurrency(compraModal.total || 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setCompraModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                    Fechar
                  </button>
                  {compraModal.status !== 'pago' && (
                    <button
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'compras', compraModal.id), { status: 'pago', data_pagamento: Timestamp.now() });
                          const cpSnap = await getDocs(query(collection(db, 'contas_pagar'), where('compra_id', '==', compraModal.id)));
                          for (const cpDoc of cpSnap.docs) await updateDoc(cpDoc.ref, { status: 'pago', data_pagamento: Timestamp.now() });
                          toast.success('Compra marcada como paga!');
                          setCompraModal((prev: any) => ({ ...prev, status: 'pago' }));
                          fetchDespesas();
                        } catch { toast.error('Erro ao marcar como pago'); }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4"/> Marcar como Paga
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
