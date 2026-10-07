import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  Calendar,
  Download,
  Loader2,
  CheckCircle,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  buscarTodosRegistros,
  buscarJornadas,
  aprovarRegistro,
  gerarRelatorioPagamento,
  type RegistroPonto,
  type JornadaTrabalho
} from '@/services/timeTrackingService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Vendedor {
  id: string;
  nome: string;
  email: string;
}

export function AdminPonto() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>('');
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [jornadas, setJornadas] = useState<JornadaTrabalho[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [relatorio, setRelatorio] = useState<{
    totalHoras: number;
    horasExtras: number;
    valorTotal: number;
    diasTrabalhados: number;
  } | null>(null);
  
  useEffect(() => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem acessar esta página');
      navigate('/dashboard');
      return;
    }
    fetchVendedores();
  }, []);
  
  useEffect(() => {
    if (vendedorSelecionado) {
      fetchDados();
    }
  }, [vendedorSelecionado, dataInicio, dataFim]);
  
  const fetchVendedores = async () => {
    try {
      const q = query(collection(db, 'users'), where('ativo', '==', true));
      const snapshot = await getDocs(q);
      const vends = snapshot.docs.map(doc => ({
        id: doc.id,
        nome: doc.data().nome,
        email: doc.data().email,
      }));
      setVendedores(vends);
      if (vends.length > 0) {
        setVendedorSelecionado(vends[0].id);
      }
    } catch (error) {
      console.error('Erro ao buscar vendedores:', error);
    }
  };
  
  const fetchDados = async () => {
    setLoading(true);
    try {
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      
      const [regs, jorns, rel] = await Promise.all([
        buscarTodosRegistros(inicio, fim),
        buscarJornadas(vendedorSelecionado, inicio, fim),
        gerarRelatorioPagamento(vendedorSelecionado, inicio, fim),
      ]);
      
      setRegistros(regs.filter(r => r.vendedor_id === vendedorSelecionado));
      setJornadas(jorns);
      setRelatorio(rel);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAprovar = async (registroId: string) => {
    if (!user?.uid) return;
    
    const sucesso = await aprovarRegistro(registroId, user.uid);
    if (sucesso) {
      toast.success('Registro aprovado');
      fetchDados();
    } else {
      toast.error('Erro ao aprovar registro');
    }
  };
  
  const handleExportar = () => {
    if (!relatorio) return;
    
    const vendedor = vendedores.find(v => v.id === vendedorSelecionado);
    const csv = [
      ['Relatório de Ponto - BBVIC HAIR CARE'],
      ['Vendedor:', vendedor?.nome || ''],
      ['Período:', `${dataInicio} a ${dataFim}`],
      [''],
      ['Resumo:'],
      ['Total de Horas:', relatorio.totalHoras.toFixed(2)],
      ['Horas Extras:', relatorio.horasExtras.toFixed(2)],
      ['Dias Trabalhados:', relatorio.diasTrabalhados],
      ['Valor Total:', relatorio.valorTotal.toFixed(2)],
      [''],
      ['Detalhamento:'],
      ['Data', 'Entrada', 'Saída', 'Horas Trabalhadas', 'Horas Intervalo', 'Total', 'Status'],
      ...jornadas.map(j => [
        j.data.toLocaleDateString('pt-BR'),
        j.entrada?.toLocaleTimeString('pt-BR') || '-',
        j.saida?.toLocaleTimeString('pt-BR') || '-',
        j.horas_trabalhadas.toFixed(2),
        j.horas_intervalo.toFixed(2),
        j.horas_totais.toFixed(2),
        j.status,
      ]),
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ponto_${vendedor?.nome}_${dataInicio}_${dataFim}.csv`;
    link.click();
    
    toast.success('Relatório exportado');
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR');
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Controle de Ponto</h1>
            <p className="text-gray-500 text-sm">Gerencie as horas dos vendedores</p>
          </div>
        </div>
        <button
          onClick={handleExportar}
          disabled={!relatorio}
          className="px-4 py-2 rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26] flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>
      
      {/* Filtros */}
      <div className="bbvic-card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
            <select
              value={vendedorSelecionado}
              onChange={(e) => setVendedorSelecionado(e.target.value)}
              className="bbvic-input w-56"
            >
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bbvic-input"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bbvic-input"
            />
          </div>
        </div>
      </div>
      
      {/* Resumo */}
      {relatorio && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bbvic-card bg-blue-50 border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-blue-700">Total Horas</p>
                <p className="text-2xl font-bold text-blue-800">{relatorio.totalHoras.toFixed(1)}h</p>
              </div>
            </div>
          </div>
          
          <div className="bbvic-card bg-orange-50 border-orange-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-orange-700">Horas Extras</p>
                <p className="text-2xl font-bold text-orange-800">{relatorio.horasExtras.toFixed(1)}h</p>
              </div>
            </div>
          </div>
          
          <div className="bbvic-card bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-green-700">Dias Trabalhados</p>
                <p className="text-2xl font-bold text-green-800">{relatorio.diasTrabalhados}</p>
              </div>
            </div>
          </div>
          
          <div className="bbvic-card bg-purple-50 border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-purple-700">Valor Total</p>
                <p className="text-2xl font-bold text-purple-800">${relatorio.valorTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Jornadas */}
      <div className="bbvic-card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Jornadas</h2>
        
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-[#6F2738] animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Data</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Entrada</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Saída</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Horas</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {jornadas.map((jornada) => (
                  <tr key={jornada.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900">{formatDate(jornada.data)}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {jornada.entrada ? formatTime(jornada.entrada) : '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {jornada.saida ? formatTime(jornada.saida) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">
                      {jornada.horas_totais.toFixed(2)}h
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        jornada.status === 'completo' ? "bg-green-100 text-green-700" :
                        jornada.status === 'em_andamento' ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {jornada.status === 'completo' ? 'Completo' :
                         jornada.status === 'em_andamento' ? 'Em andamento' : 'Incompleto'}
                      </span>
                    </td>
                  </tr>
                ))}
                
                {jornadas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      Nenhuma jornada encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Registros Pendentes */}
      <div className="bbvic-card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Registros Pendentes de Aprovação</h2>
        
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {registros
            .filter(r => !r.aprovado)
            .map((registro) => (
              <div key={registro.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {registro.tipo === 'entrada' ? 'Entrada' :
                       registro.tipo === 'saida' ? 'Saída' :
                       registro.tipo === 'intervalo_inicio' ? 'Início Intervalo' : 'Fim Intervalo'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(registro.timestamp)} às {formatTime(registro.timestamp)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleAprovar(registro.id!)}
                  className="px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Aprovar
                </button>
              </div>
            ))}
          
          {registros.filter(r => !r.aprovado).length === 0 && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum registro pendente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
