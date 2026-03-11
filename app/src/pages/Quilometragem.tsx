import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Calendar, Car, Loader2 } from 'lucide-react';

interface QuilometragemItem {
  id?: string; data: any; origem: string; destino: string
  quilometragem: number; valor_reembolso: number
  vendedor_id: string; vendedor_nome: string; created_at: any
}

const VALOR_POR_KM = 0.67;

export function Quilometragem() {
  const { user, isAdmin } = useAuth();
  const [registros, setRegistros] = useState<QuilometragemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [quilometragem, setQuilometragem] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRegistros(); }, []);

  const fetchRegistros = async () => {
    try {
      setLoading(true);
      const q = isAdmin
        ? query(collection(db, 'quilometragem'), where('data', '>=', Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))))
        : query(collection(db, 'quilometragem'), where('vendedor_id', '==', user?.uid), where('data', '>=', Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QuilometragemItem[];
      setRegistros(items.sort((a, b) => b.data.toMillis() - a.data.toMillis()));
    } catch { toast.error('Erro ao carregar registros'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origem || !destino || !quilometragem) { toast.error('Preencha todos os campos'); return; }
    const km = parseFloat(quilometragem);
    setSaving(true);
    try {
      await addDoc(collection(db, 'quilometragem'), {
        origem, destino, quilometragem: km,
        valor_reembolso: km * VALOR_POR_KM,
        data: Timestamp.fromDate(new Date(data)),
        vendedor_id: user?.uid, vendedor_nome: (user as any)?.nome,
        created_at: Timestamp.now(),
      });
      toast.success('Registro adicionado!');
      setOrigem(''); setDestino(''); setQuilometragem('');
      setShowForm(false); fetchRegistros();
    } catch { toast.error('Erro ao adicionar registro'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro?')) return;
    try { await deleteDoc(doc(db, 'quilometragem', id)); toast.success('Excluído!'); fetchRegistros(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const filtered = registros.filter(r =>
    r.origem.toLowerCase().includes(search.toLowerCase()) ||
    r.destino.toLowerCase().includes(search.toLowerCase())
  );
  const totalKm = filtered.reduce((a, r) => a + r.quilometragem, 0);
  const totalReembolso = filtered.reduce((a, r) => a + r.valor_reembolso, 0);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quilometragem</h1>
          <p className="text-gray-500 text-sm">Controle de deslocamentos e reembolsos</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-sm font-medium">
          <Plus className="w-4 h-4"/> {showForm ? 'Cancelar' : 'Novo Registro'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Car className="w-5 h-5 text-blue-600"/></div>
            <div><p className="text-sm text-gray-500">Total KM</p><p className="text-2xl font-bold text-gray-900">{totalKm.toFixed(1)} mi</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Calendar className="w-5 h-5 text-green-600"/></div>
            <div><p className="text-sm text-gray-500">Reembolso Estimado</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(totalReembolso)}</p></div>
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">Novo Registro</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origem *</label>
              <input type="text" value={origem} onChange={e => setOrigem(e.target.value)} placeholder="Local de origem" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destino *</label>
              <input type="text" value={destino} onChange={e => setDestino(e.target.value)} placeholder="Local de destino" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Milhas (mi) *</label>
              <input type="number" step="0.1" min="0" value={quilometragem} onChange={e => setQuilometragem(e.target.value)} placeholder="0.0" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"/>
            </div>
          </div>
          {quilometragem && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-amber-800 text-sm">Reembolso estimado: <span className="font-bold">{formatCurrency(parseFloat(quilometragem) * VALOR_POR_KM)}</span> <span className="text-amber-600 text-xs">(base: ${VALOR_POR_KM}/mi)</span></p>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-medium hover:bg-[#9A7B1A] disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin"/>} Adicionar
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar registro..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm"><Car className="w-10 h-10 mx-auto mb-2 opacity-30"/><p>Nenhum registro encontrado</p></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Car className="w-4 h-4 text-blue-600"/></div>
                  <div>
                    <p className="font-medium text-gray-900">{r.origem} → {r.destino}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/>{formatDate(r.data)}</span>
                      <span>{r.quilometragem.toFixed(1)} mi</span>
                      {isAdmin && r.vendedor_nome && <span>• {r.vendedor_nome}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-semibold text-green-600">{formatCurrency(r.valor_reembolso)}</p>
                  <button onClick={() => handleDelete(r.id!)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
