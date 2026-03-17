import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, Edit, Phone, Mail, MapPin, FileText, FilePlus, Receipt } from 'lucide-react';
import type { Cliente, Invoice, Estimate } from '@/types';

export function ClienteDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [faturas, setFaturas] = useState<Invoice[]>([]);
  const [orcamentos, setOrcamentos] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) fetchCliente(id); }, [id]);

  const fetchCliente = async (clienteId: string) => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'clientes', clienteId));
      if (snap.exists()) {
        setCliente({ id: snap.id, ...snap.data() } as Cliente);
        const [fatSnap, orcSnap] = await Promise.all([
          getDocs(query(collection(db,'invoices'), where('cliente_id','==',clienteId))),
          getDocs(query(collection(db,'estimates'), where('cliente_id','==',clienteId))),
        ]);
        setFaturas(fatSnap.docs.map(d => ({ id:d.id,...d.data() })) as Invoice[]);
        setOrcamentos(orcSnap.docs.map(d => ({ id:d.id,...d.data() })) as Estimate[]);
      }
    } catch { toast.error('Erro ao carregar cliente'); }
    finally { setLoading(false); }
  };

  const statusBadge = (status: string) => {
    const cls: Record<string,string> = { pago:'bg-green-100 text-green-700', enviado:'bg-blue-100 text-blue-700', aprovado:'bg-green-100 text-green-700', visualizado:'bg-purple-100 text-purple-700' };
    return cls[status] || 'bg-gray-100 text-gray-600';
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/></div>;
  if (!cliente) return <div className="text-center py-12 text-gray-400">Cliente não encontrado</div>;

  const totalGasto = faturas.filter(f => f.status === 'pago').reduce((a,f) => a+f.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/clientes')} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ArrowLeft className="w-5 h-5"/></button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{cliente.nome}</h1>
            <p className="text-gray-500 text-sm">{cliente.tipo === 'empresa' ? 'Empresa' : 'Pessoa Física'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => navigate(`/estimates/novo?cliente_id=${cliente.id}&cliente_nome=${encodeURIComponent(cliente.nome)}`)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium">
            <FilePlus className="w-4 h-4"/> Novo Orçamento
          </button>
          <button onClick={() => navigate(`/invoices/novo?cliente_id=${cliente.id}&cliente_nome=${encodeURIComponent(cliente.nome)}`)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium">
            <Receipt className="w-4 h-4"/> Nova Fatura
          </button>
          <button onClick={() => navigate(`/clientes/${cliente.id}/editar`)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white hover:bg-[#9A7B1A] text-sm font-medium">
            <Edit className="w-4 h-4"/> Editar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Phone className="w-4 h-4 text-blue-600"/></div><p className="text-sm text-gray-500">Telefone</p></div>
          <p className="font-medium text-gray-900">{cliente.telefone || 'Não informado'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"><Mail className="w-4 h-4 text-green-600"/></div><p className="text-sm text-gray-500">Email</p></div>
          <p className="font-medium text-gray-900">{cliente.email || 'Não informado'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center"><MapPin className="w-4 h-4 text-purple-600"/></div><p className="text-sm text-gray-500">Endereço</p></div>
          <p className="font-medium text-gray-900 text-sm">{cliente.endereco ? `${cliente.endereco}, ${cliente.cidade} - ${cliente.estado}` : 'Não informado'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#C9A227]/30 p-5 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Total gasto (faturas pagas)</p>
        <p className="text-2xl font-bold text-[#C9A227]">{formatCurrency(totalGasto)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center gap-2"><FileText className="w-4 h-4 text-[#C9A227]"/><h3 className="font-semibold text-gray-900">Faturas ({faturas.length})</h3></div>
          {faturas.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">Nenhuma fatura</p> : (
            <div className="divide-y divide-gray-100">
              {faturas.map(f => (
                <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition" onClick={() => navigate(`/invoices/${f.id}/editar`)}>
                  <div><p className="font-medium text-gray-900 text-sm">{f.numero}</p><p className="text-xs text-gray-400">{formatDate(f.data_emissao)}</p></div>
                  <div className="text-right"><p className="font-semibold text-[#C9A227] text-sm">{formatCurrency(f.total)}</p><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(f.status)}`}>{f.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center gap-2"><FileText className="w-4 h-4 text-[#C9A227]"/><h3 className="font-semibold text-gray-900">Orçamentos ({orcamentos.length})</h3></div>
          {orcamentos.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">Nenhum orçamento</p> : (
            <div className="divide-y divide-gray-100">
              {orcamentos.map(o => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition" onClick={() => navigate(`/estimates/${o.id}/editar`)}>
                  <div><p className="font-medium text-gray-900 text-sm">{o.numero}</p><p className="text-xs text-gray-400">{formatDate(o.data_emissao)}</p></div>
                  <div className="text-right"><p className="font-semibold text-[#C9A227] text-sm">{formatCurrency(o.total)}</p><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(o.status)}`}>{o.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
