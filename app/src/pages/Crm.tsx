import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Plus, Search, Trash2, X, Store, Calendar, User as UserIcon,
  MapPin, Phone, MessageSquare, Package, CheckCircle2, Loader2, Filter,
  LayoutGrid, List, BellRing, TrendingUp, Megaphone, Tag as TagIcon, Send, AlertTriangle, Clock
} from 'lucide-react';
import type { VisitaCRM, ResultadoVisita, Cliente, CampanhaCRM } from '@/types';
import { LABEL_RESULTADO_VISITA } from '@/types';

const RESULTADO_STYLE: Record<ResultadoVisita, string> = {
  muito_interessado: 'bg-green-100 text-green-700',
  interessado: 'bg-blue-100 text-blue-700',
  neutro: 'bg-yellow-100 text-yellow-700',
  nao_interessado: 'bg-gray-100 text-gray-600',
  fechou_venda: 'bg-[#6F2738]/12 text-[#6F2738] font-semibold',
};

const FUNIL_ORDER: ResultadoVisita[] = ['neutro', 'interessado', 'muito_interessado', 'fechou_venda', 'nao_interessado'];

const FUNIL_COLOR: Record<ResultadoVisita, string> = {
  neutro: 'border-yellow-300 bg-yellow-50',
  interessado: 'border-blue-300 bg-blue-50',
  muito_interessado: 'border-green-300 bg-green-50',
  fechou_venda: 'border-[#6F2738]/40 bg-[#6F2738]/5',
  nao_interessado: 'border-gray-300 bg-gray-50',
};

interface Vendedor { uid: string; nome: string; }
type Tab = 'visitas' | 'funil' | 'retornos' | 'ranking' | 'campanhas';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'visitas', label: 'Visitas', icon: List },
  { id: 'funil', label: 'Funil de Vendas', icon: LayoutGrid },
  { id: 'retornos', label: 'Retornos Pendentes', icon: BellRing },
  { id: 'ranking', label: 'Ranking de Salões', icon: TrendingUp },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
];

function diasEntre(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function Crm() {
  const { user, isAdmin, getVendedores } = useAuth();
  const [tab, setTab] = useState<Tab>('visitas');
  const [visitas, setVisitas] = useState<VisitaCRM[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaCRM[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [filtroResultado, setFiltroResultado] = useState('todos');
  const [filtroTag, setFiltroTag] = useState('todas');

  // form state (nova visita)
  const [salaoNome, setSalaoNome] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [salaoTelefone, setSalaoTelefone] = useState('');
  const [salaoEndereco, setSalaoEndereco] = useState('');
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [produtosOferecidos, setProdutosOferecidos] = useState('');
  const [feedback, setFeedback] = useState('');
  const [resultado, setResultado] = useState<ResultadoVisita>('interessado');
  const [proximaVisita, setProximaVisita] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [vendedorSelecionado, setVendedorSelecionado] = useState('');

  // campanhas state
  const [campNome, setCampNome] = useState('');
  const [campMensagem, setCampMensagem] = useState('Olá {SALAO}! Passando para lembrar da nossa visita e apresentar nossas novidades da BBVIC Hair Cosmetics. Ficamos à disposição!');
  const [campSegmento, setCampSegmento] = useState<'todos' | 'tag' | 'inativos' | 'interessados'>('interessados');
  const [campTag, setCampTag] = useState('');
  const [campSalvando, setCampSalvando] = useState(false);
  const [enviosModal, setEnviosModal] = useState<{ salao: string; telefone: string; selecionado: boolean }[] | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const visitasQuery = isAdmin
        ? query(collection(db, 'visitas_crm'), orderBy('data_visita', 'desc'))
        : query(collection(db, 'visitas_crm'), where('vendedor_id', '==', user?.uid));
      const [visitasSnap, clientesSnap] = await Promise.all([
        getDocs(visitasQuery),
        getDocs(collection(db, 'clientes')),
      ]);
      const visitasData = visitasSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          data_visita: data.data_visita?.toDate?.() || new Date(),
          proxima_visita: data.proxima_visita?.toDate?.() || null,
        };
      }) as VisitaCRM[];
      if (!isAdmin) visitasData.sort((a, b) => b.data_visita.getTime() - a.data_visita.getTime());
      setVisitas(visitasData);
      setClientes(clientesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Cliente[]);
      if (isAdmin) {
        const vend = await getVendedores();
        setVendedores(vend.map(v => ({ uid: v.uid, nome: v.nome })));
        try {
          const campSnap = await getDocs(query(collection(db, 'campanhas_crm'), orderBy('created_at', 'desc')));
          setCampanhas(campSnap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data, created_at: data.created_at?.toDate?.() || new Date() };
          }) as CampanhaCRM[]);
        } catch { /* coleção pode não existir ainda */ }
      }
    } catch (e) {
      toast.error('Erro ao carregar visitas');
    } finally { setLoading(false); }
  };

  const resetForm = () => {
    setSalaoNome(''); setClienteId(''); setSalaoTelefone(''); setSalaoEndereco('');
    setDataVisita(new Date().toISOString().split('T')[0]);
    setProdutosOferecidos(''); setFeedback(''); setResultado('interessado');
    setProximaVisita(''); setObservacoes(''); setTagsInput(''); setVendedorSelecionado('');
  };

  const handleSelectCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find(cl => cl.id === id);
    if (c) {
      setSalaoNome(c.nome);
      setSalaoTelefone(c.telefone || '');
      setSalaoEndereco(c.endereco || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaoNome.trim()) { toast.error('Informe o nome do salão'); return; }
    if (!dataVisita) { toast.error('Informe a data da visita'); return; }

    const vendedorId = isAdmin && vendedorSelecionado ? vendedorSelecionado : user?.uid;
    const vendedorNomeFinal = isAdmin && vendedorSelecionado
      ? vendedores.find(v => v.uid === vendedorSelecionado)?.nome
      : (user as any)?.nome;

    setSaving(true);
    try {
      await addDoc(collection(db, 'visitas_crm'), {
        cliente_id: clienteId || null,
        salao_nome: salaoNome.trim(),
        salao_telefone: salaoTelefone || '',
        salao_endereco: salaoEndereco || '',
        vendedor_id: vendedorId,
        vendedor_nome: vendedorNomeFinal || '',
        data_visita: Timestamp.fromDate(new Date(dataVisita)),
        produtos_oferecidos: produtosOferecidos || '',
        feedback: feedback || '',
        resultado,
        proxima_visita: proximaVisita ? Timestamp.fromDate(new Date(proximaVisita)) : null,
        observacoes: observacoes || '',
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        created_at: Timestamp.now(),
      });
      toast.success('Visita registrada com sucesso!');
      resetForm();
      setShowForm(false);
      fetchAll();
    } catch (e) {
      toast.error('Erro ao registrar visita');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta visita?')) return;
    try { await deleteDoc(doc(db, 'visitas_crm', id)); toast.success('Visita excluída'); fetchAll(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const todasTags = useMemo(() => {
    const s = new Set<string>();
    visitas.forEach(v => (v.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [visitas]);

  const filtered = useMemo(() => {
    return visitas.filter(v => {
      if (search && !v.salao_nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (filtroVendedor !== 'todos' && v.vendedor_id !== filtroVendedor) return false;
      if (filtroResultado !== 'todos' && v.resultado !== filtroResultado) return false;
      if (filtroTag !== 'todas' && !(v.tags || []).includes(filtroTag)) return false;
      return true;
    });
  }, [visitas, search, filtroVendedor, filtroResultado, filtroTag]);

  const stats = useMemo(() => ({
    total: filtered.length,
    saloesUnicos: new Set(filtered.map(v => v.salao_nome)).size,
    interessados: filtered.filter(v => v.resultado === 'muito_interessado' || v.resultado === 'interessado').length,
    fechadas: filtered.filter(v => v.resultado === 'fechou_venda').length,
  }), [filtered]);

  // Agrupamento por salão (usado no Funil e no Ranking)
  const salaoAgrupado = useMemo(() => {
    const map = new Map<string, VisitaCRM[]>();
    visitas.forEach(v => {
      const key = v.salao_nome.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return Array.from(map.entries()).map(([, lista]) => {
      const ordenadas = [...lista].sort((a, b) => b.data_visita.getTime() - a.data_visita.getTime());
      const ultima = ordenadas[0];
      const vendedoresSet = new Set(lista.map(v => v.vendedor_nome).filter(Boolean));
      return {
        nome: ultima.salao_nome,
        telefone: ultima.salao_telefone || '',
        ultimaVisita: ultima.data_visita,
        ultimoResultado: ultima.resultado,
        totalVisitas: lista.length,
        vendasFechadas: lista.filter(v => v.resultado === 'fechou_venda').length,
        vendedores: Array.from(vendedoresSet).join(', '),
        tags: Array.from(new Set(lista.flatMap(v => v.tags || []))),
        diasDesdeUltima: diasEntre(new Date(), ultima.data_visita),
      };
    });
  }, [visitas]);

  const funilColunas = useMemo(() => {
    const cols: Record<ResultadoVisita, typeof salaoAgrupado> = {
      neutro: [], interessado: [], muito_interessado: [], fechou_venda: [], nao_interessado: [],
    };
    salaoAgrupado.forEach(s => cols[s.ultimoResultado].push(s));
    return cols;
  }, [salaoAgrupado]);

  const retornos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const comRetorno = visitas.filter(v => v.proxima_visita);
    const atrasados = comRetorno.filter(v => v.proxima_visita! < hoje).sort((a, b) => a.proxima_visita!.getTime() - b.proxima_visita!.getTime());
    const proximos = comRetorno.filter(v => {
      const d = diasEntre(v.proxima_visita!, hoje);
      return d >= 0 && d <= 7;
    }).sort((a, b) => a.proxima_visita!.getTime() - b.proxima_visita!.getTime());
    const inativos30 = salaoAgrupado.filter(s => s.diasDesdeUltima >= 30 && s.ultimoResultado !== 'nao_interessado')
      .sort((a, b) => b.diasDesdeUltima - a.diasDesdeUltima);
    return { atrasados, proximos, inativos30 };
  }, [visitas, salaoAgrupado]);

  const rankingOrdenado = useMemo(() => [...salaoAgrupado].sort((a, b) => b.totalVisitas - a.totalVisitas), [salaoAgrupado]);

  const gerarSegmento = () => {
    let base = salaoAgrupado.filter(s => s.telefone.trim() !== '');
    if (campSegmento === 'tag' && campTag) base = base.filter(s => s.tags.includes(campTag));
    if (campSegmento === 'inativos') base = base.filter(s => s.diasDesdeUltima >= 30);
    if (campSegmento === 'interessados') base = base.filter(s => s.ultimoResultado === 'muito_interessado' || s.ultimoResultado === 'interessado');
    return base;
  };

  const handleGerarEnvios = () => {
    if (!campNome.trim() || !campMensagem.trim()) { toast.error('Preencha nome e mensagem da campanha'); return; }
    const lista = gerarSegmento();
    if (lista.length === 0) { toast.error('Nenhum salão com telefone encontrado para esse segmento'); return; }
    setEnviosModal(lista.map(s => ({ salao: s.nome, telefone: s.telefone, selecionado: true })));
  };

  const handleEnviarCampanha = async () => {
    if (!enviosModal) return;
    const selecionados = enviosModal.filter(e => e.selecionado);
    selecionados.forEach((e, i) => {
      const phone = e.telefone.replace(/\D/g, '');
      if (!phone) return;
      const msg = campMensagem.replace(/{SALAO}/g, e.salao);
      const url = `https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`;
      setTimeout(() => {
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100);
      }, i * 250);
    });
    setCampSalvando(true);
    try {
      await addDoc(collection(db, 'campanhas_crm'), {
        nome: campNome.trim(),
        mensagem: campMensagem,
        segmento: campSegmento === 'tag' ? `Tag: ${campTag}` : campSegmento,
        quantidade_enviada: selecionados.length,
        criado_por: (user as any)?.nome || '',
        created_at: Timestamp.now(),
      });
      toast.success(`Campanha enviada para ${selecionados.length} salão(ões)`);
      setCampNome('');
      setEnviosModal(null);
      fetchAll();
    } catch { toast.error('Erro ao salvar histórico da campanha'); }
    finally { setCampSalvando(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-[#6F2738] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM - Visitas a Salões</h1>
          <p className="text-gray-500 text-sm">Controle de visitas, funil de vendas, retornos e campanhas</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Nova Visita
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6F2738]/12 flex items-center justify-center"><Store className="w-5 h-5 text-[#6F2738]" /></div>
            <div><p className="text-sm text-gray-500">Visitas</p><p className="text-2xl font-bold text-gray-900">{stats.total}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><MapPin className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-sm text-gray-500">Salões Visitados</p><p className="text-2xl font-bold text-gray-900">{stats.saloesUnicos}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-sm text-gray-500">Interessados</p><p className="text-2xl font-bold text-gray-900">{stats.interessados}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-sm text-gray-500">Vendas Fechadas</p><p className="text-2xl font-bold text-gray-900">{stats.fechadas}</p></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active ? 'border-[#6F2738] text-[#6F2738]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
              {t.id === 'retornos' && (retornos.atrasados.length > 0) && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">{retornos.atrasados.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===================== TAB VISITAS ===================== */}
      {tab === 'visitas' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por salão..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30"
              />
            </div>
            {isAdmin && (
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                <option value="todos">Todos os vendedores</option>
                {vendedores.map(v => <option key={v.uid} value={v.uid}>{v.nome}</option>)}
              </select>
            )}
            <select value={filtroResultado} onChange={e => setFiltroResultado(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
              <option value="todos">Todos os resultados</option>
              {Object.entries(LABEL_RESULTADO_VISITA).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            {todasTags.length > 0 && (
              <select value={filtroTag} onChange={e => setFiltroTag(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                <option value="todas">Todas as tags</option>
                {todasTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-400"><Filter className="w-3.5 h-3.5" /> {filtered.length} resultado(s)</div>
          </div>

          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
                Nenhuma visita registrada ainda. Clique em "Nova Visita" para começar.
              </div>
            )}
            {filtered.map(v => (
              <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-1.5"><Store className="w-4 h-4 text-[#6F2738]" /> {v.salao_nome}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${RESULTADO_STYLE[v.resultado]}`}>{LABEL_RESULTADO_VISITA[v.resultado]}</span>
                      {(v.tags || []).map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-[#193654]/10 text-[#193654] flex items-center gap-1">
                          <TagIcon className="w-3 h-3" /> {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(v.data_visita)}</span>
                      {isAdmin && v.vendedor_nome && <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {v.vendedor_nome}</span>}
                      {v.salao_telefone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {v.salao_telefone}</span>}
                      {v.proxima_visita && <span className="flex items-center gap-1 text-[#6F2738] font-medium"><Calendar className="w-3.5 h-3.5" /> Retorno: {formatDate(v.proxima_visita)}</span>}
                    </div>
                    {v.produtos_oferecidos && (
                      <p className="mt-2 text-sm text-gray-700 flex items-start gap-1.5"><Package className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" /> <span><span className="text-gray-400">Oferecido:</span> {v.produtos_oferecidos}</span></p>
                    )}
                    {v.feedback && (
                      <p className="mt-1 text-sm text-gray-700 flex items-start gap-1.5"><MessageSquare className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" /> <span><span className="text-gray-400">Feedback do dono:</span> {v.feedback}</span></p>
                    )}
                    {v.observacoes && <p className="mt-1 text-xs text-gray-400 italic">{v.observacoes}</p>}
                  </div>
                  {isAdmin && (
                    <button onClick={() => v.id && handleDelete(v.id)} className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== TAB FUNIL ===================== */}
      {tab === 'funil' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {FUNIL_ORDER.map(stage => (
            <div key={stage} className={`rounded-xl border-2 p-3 ${FUNIL_COLOR[stage]}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">{LABEL_RESULTADO_VISITA[stage]}</h3>
                <span className="text-xs font-bold text-gray-500 bg-white/70 rounded-full px-2 py-0.5">{funilColunas[stage].length}</span>
              </div>
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                {funilColunas[stage].map(s => (
                  <div key={s.nome} className="bg-white rounded-lg border border-gray-200 p-3 text-sm shadow-sm">
                    <p className="font-medium text-gray-900 flex items-center gap-1"><Store className="w-3.5 h-3.5 text-[#6F2738]" /> {s.nome}</p>
                    <p className="text-xs text-gray-500 mt-1">Última visita: {formatDate(s.ultimaVisita)}</p>
                    {isAdmin && s.vendedores && <p className="text-xs text-gray-400">{s.vendedores}</p>}
                    <p className="text-xs text-gray-400">{s.totalVisitas} visita(s)</p>
                  </div>
                ))}
                {funilColunas[stage].length === 0 && <p className="text-xs text-gray-400 text-center py-4">Vazio</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================== TAB RETORNOS ===================== */}
      {tab === 'retornos' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4" /> Retornos Atrasados ({retornos.atrasados.length})</h3>
            <div className="space-y-2">
              {retornos.atrasados.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-4">Nenhum retorno atrasado.</p>}
              {retornos.atrasados.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-red-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900">{v.salao_nome}</p>
                    <p className="text-xs text-gray-500">Retorno previsto: {formatDate(v.proxima_visita!)} · {isAdmin ? v.vendedor_nome : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">{Math.abs(diasEntre(v.proxima_visita!, new Date()))} dia(s) atrasado</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#6F2738] flex items-center gap-1.5 mb-2"><Clock className="w-4 h-4" /> Próximos 7 dias ({retornos.proximos.length})</h3>
            <div className="space-y-2">
              {retornos.proximos.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-4">Nenhum retorno agendado para os próximos 7 dias.</p>}
              {retornos.proximos.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900">{v.salao_nome}</p>
                    <p className="text-xs text-gray-500">{isAdmin ? v.vendedor_nome : ''}</p>
                  </div>
                  <span className="text-xs font-medium text-[#6F2738] bg-[#6F2738]/10 px-2 py-1 rounded-full">{formatDate(v.proxima_visita!)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-yellow-700 flex items-center gap-1.5 mb-2"><BellRing className="w-4 h-4" /> Salões sem visita há 30+ dias ({retornos.inativos30.length})</h3>
            <div className="space-y-2">
              {retornos.inativos30.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-4">Nenhum salão inativo.</p>}
              {retornos.inativos30.map(s => (
                <div key={s.nome} className="bg-white rounded-xl border border-yellow-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900">{s.nome}</p>
                    <p className="text-xs text-gray-500">Última visita: {formatDate(s.ultimaVisita)}</p>
                  </div>
                  <span className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded-full">{s.diasDesdeUltima} dias sem visita</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB RANKING ===================== */}
      {tab === 'ranking' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Salão</th>
                {isAdmin && <th className="text-left px-4 py-3">Vendedor(es)</th>}
                <th className="text-center px-4 py-3">Total Visitas</th>
                <th className="text-center px-4 py-3">Vendas Fechadas</th>
                <th className="text-left px-4 py-3">Última Visita</th>
                <th className="text-center px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rankingOrdenado.map(s => (
                <tr key={s.nome} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.nome}</td>
                  {isAdmin && <td className="px-4 py-3 text-gray-500">{s.vendedores}</td>}
                  <td className="px-4 py-3 text-center font-semibold">{s.totalVisitas}</td>
                  <td className="px-4 py-3 text-center">{s.vendasFechadas > 0 ? <span className="text-[#6F2738] font-semibold">{s.vendasFechadas}</span> : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(s.ultimaVisita)}</td>
                  <td className="px-4 py-3 text-center">
                    {s.diasDesdeUltima >= 30
                      ? <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">Sumindo ({s.diasDesdeUltima}d)</span>
                      : <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">Ativo</span>}
                  </td>
                </tr>
              ))}
              {rankingOrdenado.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} className="text-center text-gray-400 py-8">Nenhum dado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== TAB CAMPANHAS ===================== */}
      {tab === 'campanhas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Megaphone className="w-4 h-4 text-[#6F2738]" /> Nova Campanha</h3>
            <div>
              <label className="text-xs font-medium text-gray-600">Nome da campanha</label>
              <input value={campNome} onChange={e => setCampNome(e.target.value)} placeholder="Ex: Promoção Kit Total Repair"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Mensagem (use {'{SALAO}'} para inserir o nome do salão)</label>
              <textarea value={campMensagem} onChange={e => setCampMensagem(e.target.value)} rows={4}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Segmento de envio</label>
              <select value={campSegmento} onChange={e => setCampSegmento(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                <option value="interessados">Salões interessados (última visita)</option>
                <option value="inativos">Salões sem visita há 30+ dias</option>
                <option value="tag">Por tag específica</option>
                <option value="todos">Todos os salões com telefone</option>
              </select>
            </div>
            {campSegmento === 'tag' && (
              <div>
                <label className="text-xs font-medium text-gray-600">Tag</label>
                <select value={campTag} onChange={e => setCampTag(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                  <option value="">Selecione uma tag</option>
                  {todasTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <button onClick={handleGerarEnvios}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium">
              <Send className="w-4 h-4" /> Gerar Lista de Envio
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Histórico de Campanhas</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {campanhas.length === 0 && <p className="text-sm text-gray-400">Nenhuma campanha enviada ainda.</p>}
              {campanhas.map(c => (
                <div key={c.id} className="border border-gray-100 rounded-lg p-3">
                  <p className="font-medium text-sm text-gray-900">{c.nome}</p>
                  <p className="text-xs text-gray-500">{c.segmento} · {c.quantidade_enviada} envio(s) · {c.created_at ? formatDate(c.created_at) : ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Visita */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nova Visita</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Salão cadastrado (opcional)</label>
                <select value={clienteId} onChange={e => handleSelectCliente(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                  <option value="">— Salão novo / não cadastrado —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Nome do Salão *</label>
                <input value={salaoNome} onChange={e => setSalaoNome(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Telefone</label>
                  <input value={salaoTelefone} onChange={e => setSalaoTelefone(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Data da Visita *</label>
                  <input type="date" value={dataVisita} onChange={e => setDataVisita(e.target.value)} required
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Endereço</label>
                <input value={salaoEndereco} onChange={e => setSalaoEndereco(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Vendedor responsável pela visita</label>
                  <select value={vendedorSelecionado} onChange={e => setVendedorSelecionado(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                    <option value="">— Eu mesmo(a) —</option>
                    {vendedores.map(v => <option key={v.uid} value={v.uid}>{v.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Produtos / serviços oferecidos</label>
                <textarea value={produtosOferecidos} onChange={e => setProdutosOferecidos(e.target.value)} rows={2}
                  placeholder="Ex: Kit Total Repair, linha Gold Caviar..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">O que o dono do salão achou (feedback)</label>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
                  placeholder="Ex: Gostou, mas quer comparar preço com o fornecedor atual..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Resultado da visita</label>
                  <select value={resultado} onChange={e => setResultado(e.target.value as ResultadoVisita)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30">
                    {Object.entries(LABEL_RESULTADO_VISITA).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Agendar retorno (opcional)</label>
                  <input type="date" value={proximaVisita} onChange={e => setProximaVisita(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tags (separadas por vírgula)</label>
                <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Ex: VIP, Concorrente Forte, Prospect Frio"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Observações</label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] text-sm font-medium disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Salvar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Envio de Campanha */}
      {enviosModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEnviosModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Confirmar Envio</h2>
              <button onClick={() => setEnviosModal(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500">Selecione os salões que vão receber a mensagem via WhatsApp:</p>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto border border-gray-100 rounded-lg p-2">
              {enviosModal.map((e, i) => (
                <label key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={e.selecionado} onChange={ev => {
                      const copy = [...enviosModal]; copy[i].selecionado = ev.target.checked; setEnviosModal(copy);
                    }} className="rounded" />
                    {e.salao}
                  </span>
                  <span className="text-gray-400 text-xs">{e.telefone}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400">{enviosModal.filter(e => e.selecionado).length} salão(ões) receberão via WhatsApp (abre uma aba por envio).</p>
            <button onClick={handleEnviarCampanha} disabled={campSalvando}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-60">
              <Send className="w-4 h-4" /> {campSalvando ? 'Enviando...' : `Enviar WhatsApp para ${enviosModal.filter(e => e.selecionado).length} salão(ões)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
