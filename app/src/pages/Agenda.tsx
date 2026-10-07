import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Calendar, Clock, Loader2, Eye, Edit2, X, Phone, MessageSquare } from 'lucide-react';

interface Agendamento {
  id?: string; data: any; hora: string; cliente_nome: string
  cliente_telefone: string; servico: string; observacoes: string
  status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido'
  vendedor_id: string; vendedor_nome: string; created_at: any
}

const statusCls: Record<string, string> = {
  agendado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
  concluido: 'bg-gray-100 text-gray-600',
};

const STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

export function Agenda() {
  const { user, isAdmin } = useAuth();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Agendamento | null>(null);

  // Form fields
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [servico, setServico] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [hora, setHora] = useState('09:00');
  const [observacoes, setObservacoes] = useState('');
  const [statusForm, setStatusForm] = useState<Agendamento['status']>('agendado');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAgendamentos(); }, []);

  const fetchAgendamentos = async () => {
    try {
      setLoading(true);
      const q = isAdmin
        ? query(collection(db, 'agenda'))
        : query(collection(db, 'agenda'), where('vendedor_id', '==', user?.uid));
      const snap = await getDocs(q);
      const ontem = new Date(); ontem.setDate(ontem.getDate() - 1); ontem.setHours(0, 0, 0, 0);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[];
      const futuros = items.filter(a => {
        try { return a.data.toDate() >= ontem } catch { return true }
      });
      setAgendamentos(futuros.sort((a, b) => a.data.toMillis() - b.data.toMillis()));
    } catch (e) { console.error(e); toast.error('Erro ao carregar agenda'); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setEditingId(null);
    setClienteNome(''); setClienteTelefone(''); setServico(''); setObservacoes('');
    setData(new Date().toISOString().split('T')[0]); setHora('09:00'); setStatusForm('agendado');
    setShowForm(true);
  };

  const openEdit = (a: Agendamento) => {
    setEditingId(a.id!);
    setClienteNome(a.cliente_nome); setClienteTelefone(a.cliente_telefone || '');
    setServico(a.servico); setObservacoes(a.observacoes || '');
    const d = a.data?.toDate ? a.data.toDate() : new Date(a.data);
    setData(d.toISOString().split('T')[0]); setHora(a.hora || '09:00'); setStatusForm(a.status);
    setViewItem(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome || !servico) { toast.error('Preencha os campos obrigatórios'); return; }
    setSaving(true);
    try {
      const payload = {
        cliente_nome: clienteNome, cliente_telefone: clienteTelefone,
        servico, data: Timestamp.fromDate(new Date(data + 'T12:00:00')), hora, observacoes,
        status: statusForm, vendedor_id: user?.uid, vendedor_nome: (user as any)?.nome,
      };
      if (editingId) {
        await updateDoc(doc(db, 'agenda', editingId), { ...payload, updated_at: Timestamp.now() });
        toast.success('Agendamento atualizado!');
      } else {
        await addDoc(collection(db, 'agenda'), { ...payload, created_at: Timestamp.now() });
        toast.success('Agendamento criado!');
      }
      setClienteNome(''); setClienteTelefone(''); setServico(''); setObservacoes('');
      setEditingId(null); setShowForm(false); fetchAgendamentos();
    } catch { toast.error('Erro ao salvar agendamento'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este agendamento?')) return;
    try { await deleteDoc(doc(db, 'agenda', id)); toast.success('Excluído!'); setViewItem(null); fetchAgendamentos(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const filtered = agendamentos.filter(a =>
    a.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
    a.servico.toLowerCase().includes(search.toLowerCase())
  );

  const porData: Record<string, Agendamento[]> = {};
  filtered.forEach(a => {
    const key = a.data.toDate().toISOString().split('T')[0];
    if (!porData[key]) porData[key] = [];
    porData[key].push(a);
  });

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Agenda</h1>
          <p className="text-gray-500 text-sm">Gerencie seus agendamentos</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium">
          <Plus className="w-4 h-4"/> Novo Agendamento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{editingId ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-4 h-4"/></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input type="text" value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome do cliente" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input type="tel" value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="(000) 000-0000" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Serviço *</label>
              <input type="text" value={servico} onChange={e => setServico(e.target.value)} placeholder="Descrição do serviço" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
              <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]"/>
            </div>
            {editingId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={statusForm} onChange={e => setStatusForm(e.target.value as Agendamento['status'])} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738]">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div className={editingId ? '' : 'md:col-span-2'}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} placeholder="Observações adicionais..." className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#6F2738] resize-none"/>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#4A1A26] disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin"/>} {editingId ? 'Salvar' : 'Agendar'}
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar agendamento..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6F2738]"/>
      </div>

      {Object.keys(porData).length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2"/>
          <p className="text-gray-400">Nenhum agendamento encontrado</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(porData).map(([key, items]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#6F2738]"/>
                {new Date(key + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
                {items.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#6F2738]/10 flex items-center justify-center flex-shrink-0"><Clock className="w-5 h-5 text-[#6F2738]"/></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{a.hora}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls[a.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status}</span>
                        </div>
                        <p className="text-gray-700 text-sm truncate">{a.cliente_nome}</p>
                        <p className="text-gray-400 text-xs truncate">{a.servico}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <button onClick={() => setViewItem(a)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50" title="Ver detalhes"><Eye className="w-4 h-4"/></button>
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-[#6F2738] hover:bg-yellow-50" title="Editar"><Edit2 className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(a.id!)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50" title="Excluir"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Details Modal */}
      {viewItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#6F2738]/10 flex items-center justify-center"><Clock className="w-5 h-5 text-[#6F2738]"/></div>
                <div>
                  <p className="font-bold text-gray-900">{viewItem.hora}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls[viewItem.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_OPTIONS.find(s => s.value === viewItem.status)?.label || viewItem.status}
                  </span>
                </div>
              </div>
              <button onClick={() => setViewItem(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><X className="w-4 h-4"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Cliente</p>
                <p className="font-semibold text-gray-900 text-lg">{viewItem.cliente_nome}</p>
                {viewItem.cliente_telefone && (
                  <a href={`tel:${viewItem.cliente_telefone}`} className="flex items-center gap-2 text-sm text-blue-500 hover:underline mt-1">
                    <Phone className="w-3.5 h-3.5"/>{viewItem.cliente_telefone}
                  </a>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Serviço</p>
                <p className="text-gray-800">{viewItem.servico}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Data</p>
                  <p className="text-gray-800">{viewItem.data?.toDate ? viewItem.data.toDate().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : viewItem.data}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Hora</p>
                  <p className="text-gray-800 font-semibold">{viewItem.hora}</p>
                </div>
              </div>
              {viewItem.observacoes && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-gray-600 text-sm bg-gray-50 rounded-xl p-3">{viewItem.observacoes}</p>
                </div>
              )}
              {viewItem.vendedor_nome && isAdmin && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Vendedor / Responsável</p>
                  <p className="text-gray-700 text-sm">{viewItem.vendedor_nome}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              {viewItem.cliente_telefone && (
                <a
                  href={`https://wa.me/${viewItem.cliente_telefone.replace(/\D/g,'')}?text=${encodeURIComponent('Olá ' + viewItem.cliente_nome + '! Confirmando seu agendamento para ' + viewItem.hora + '. Serviço: ' + viewItem.servico)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600"
                >
                  <MessageSquare className="w-4 h-4"/> WhatsApp
                </a>
              )}
              <button onClick={() => openEdit(viewItem)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#4A1A26]">
                <Edit2 className="w-4 h-4"/> Editar
              </button>
              <button onClick={() => handleDelete(viewItem.id!)} className="p-2.5 rounded-xl border border-red-200 text-red-400 hover:bg-red-50">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
