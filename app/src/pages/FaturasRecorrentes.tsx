import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Calendar,
  Repeat,
  DollarSign,
  Loader2,
  Pause,
  Trash2,
  Edit3,
  CheckCircle,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  buscarFaturasRecorrentes,
  desativarFaturaRecorrente,
  excluirFaturaRecorrente,
  processarFaturasRecorrentes,
  frequenciaLabels,
  type FaturaRecorrente
} from '@/services/recurringService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function FaturasRecorrentes() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  
  const [recorrentes, setRecorrentes] = useState<FaturaRecorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [recorrenteSelecionada, setRecorrenteSelecionada] = useState<FaturaRecorrente | null>(null);
  const [modalDetalhes, setModalDetalhes] = useState(false);
  const [modalConfirmar, setModalConfirmar] = useState<{tipo: 'pausar' | 'excluir'; id: string} | null>(null);
  
  useEffect(() => {
    fetchRecorrentes();
  }, []);
  
  const fetchRecorrentes = async () => {
    setLoading(true);
    try {
      const data = await buscarFaturasRecorrentes(isAdmin ? undefined : user?.uid);
      setRecorrentes(data);
    } catch (error) {
      console.error('Erro ao buscar faturas recorrentes:', error);
      toast.error('Erro ao carregar faturas recorrentes');
    } finally {
      setLoading(false);
    }
  };
  
  const handleProcessarAgora = async () => {
    setProcessando(true);
    try {
      const resultado = await processarFaturasRecorrentes(isAdmin ? undefined : user?.uid);
      
      if (resultado.geradas > 0) {
        toast.success(`${resultado.geradas} fatura(s) gerada(s) com sucesso!`);
        fetchRecorrentes();
      } else if (resultado.processadas === 0) {
        toast.info('Nenhuma fatura para gerar hoje');
      } else {
        toast.error('Erro ao gerar algumas faturas');
      }
    } catch (error) {
      console.error('Erro ao processar faturas:', error);
      toast.error('Erro ao processar faturas recorrentes');
    } finally {
      setProcessando(false);
    }
  };
  
  const handlePausar = async () => {
    if (!modalConfirmar) return;
    
    try {
      const sucesso = await desativarFaturaRecorrente(modalConfirmar.id);
      if (sucesso) {
        toast.success('Fatura recorrente pausada');
        fetchRecorrentes();
      } else {
        toast.error('Erro ao pausar fatura');
      }
    } catch (error) {
      toast.error('Erro ao pausar fatura');
    } finally {
      setModalConfirmar(null);
    }
  };
  
  const handleExcluir = async () => {
    if (!modalConfirmar) return;
    
    try {
      const sucesso = await excluirFaturaRecorrente(modalConfirmar.id);
      if (sucesso) {
        toast.success('Fatura recorrente excluída');
        fetchRecorrentes();
      } else {
        toast.error('Erro ao excluir fatura');
      }
    } catch (error) {
      toast.error('Erro ao excluir fatura');
    } finally {
      setModalConfirmar(null);
    }
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };
  
  const formatDate = (date: Date | any) => {
    if (!date) return '-';
    const d = new Date(date?.toDate?.() || date);
    return d.toLocaleDateString('pt-BR');
  };
  
  const diasAteCobranca = (data: Date | any) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const cobranca = new Date(data?.toDate?.() || data);
    cobranca.setHours(0, 0, 0, 0);
    const diff = Math.ceil((cobranca.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/invoices')}
            className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Faturas Recorrentes</h1>
            <p className="text-gray-500 text-sm">Gerencie cobranças automáticas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcessarAgora}
            disabled={processando}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            {processando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Processar Agora
          </button>
          <button
            onClick={() => navigate('/invoices/recorrentes/nova')}
            className="px-4 py-2 rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Recorrência
          </button>
        </div>
      </div>
      
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bbvic-card bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Repeat className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-700">Recorrências Ativas</p>
              <p className="text-2xl font-bold text-blue-800">{recorrentes.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bbvic-card bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-green-700">Valor Mensal Total</p>
              <p className="text-2xl font-bold text-green-800">
                {formatCurrency(recorrentes
                  .filter(r => r.frequencia === 'mensal')
                  .reduce((acc, r) => acc + r.total, 0))}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bbvic-card bg-purple-50 border-purple-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-purple-700">Próximas Cobranças</p>
              <p className="text-2xl font-bold text-purple-800">
                {recorrentes.filter(r => diasAteCobranca(r.proxima_cobranca) <= 7).length}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#6F2738] animate-spin" />
        </div>
      ) : recorrentes.length === 0 ? (
        <div className="bbvic-card text-center py-16">
          <Repeat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma fatura recorrente</h3>
          <p className="text-gray-500 mb-6">Crie sua primeira cobrança automática</p>
          <button
            onClick={() => navigate('/invoices/recorrentes/nova')}
            className="bbvic-btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ciar Recorrência
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {recorrentes.map((recorrente) => {
            const dias = diasAteCobranca(recorrente.proxima_cobranca);
            
            return (
              <div 
                key={recorrente.id}
                className="bbvic-card hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => { setRecorrenteSelecionada(recorrente); setModalDetalhes(true); }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#6F2738]/10 flex items-center justify-center">
                      <Repeat className="w-6 h-6 text-[#6F2738]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{recorrente.cliente_nome}</h3>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          dias <= 3 ? "bg-red-100 text-red-700" :
                          dias <= 7 ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        )}>
                          {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `${dias} dias`}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {frequenciaLabels[recorrente.frequencia]}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          {formatCurrency(recorrente.total)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {recorrente.total_gerado} gerada(s)
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalConfirmar({ tipo: 'pausar', id: recorrente.id! });
                      }}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-yellow-600 transition-colors"
                      title="Pausar"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/invoices/recorrentes/editar/${recorrente.id}`);
                      }}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                      title="Editar"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalConfirmar({ tipo: 'excluir', id: recorrente.id! });
                      }}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-2" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Modal de Detalhes */}
      <Dialog open={modalDetalhes} onOpenChange={setModalDetalhes}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-[#6F2738]" />
              Detalhes da Recorrência
            </DialogTitle>
          </DialogHeader>
          
          {recorrenteSelecionada && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">Cliente</p>
                <p className="font-semibold text-gray-900">{recorrenteSelecionada.cliente_nome}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500">Frequência</p>
                  <p className="font-semibold text-gray-900">
                    {frequenciaLabels[recorrenteSelecionada.frequencia]}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500">Dia de Cobrança</p>
                  <p className="font-semibold text-gray-900">
                    Dia {recorrenteSelecionada.dia_cobranca}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-600">Próxima Cobrança</p>
                  <p className="font-semibold text-blue-800">
                    {formatDate(recorrenteSelecionada.proxima_cobranca)}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-sm text-green-600">Valor</p>
                  <p className="font-semibold text-green-800">
                    {formatCurrency(recorrenteSelecionada.total)}
                  </p>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-2">Itens</p>
                <div className="space-y-2">
                  {recorrenteSelecionada.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.descricao}</span>
                      <span className="text-gray-900 font-medium">
                        {formatCurrency(item.preco * item.quantidade)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              {recorrenteSelecionada.observacoes && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500">Observações</p>
                  <p className="text-gray-700">{recorrenteSelecionada.observacoes}</p>
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setModalDetalhes(false); navigate(`/invoices/recorrentes/editar/${recorrenteSelecionada.id}`); }}
                  className="flex-1 py-2.5 rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26] font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={() => { setModalDetalhes(false); setModalConfirmar({ tipo: 'pausar', id: recorrenteSelecionada.id! }); }}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Pausar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Modal de Confirmação */}
      <Dialog open={!!modalConfirmar} onOpenChange={() => setModalConfirmar(null)}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {modalConfirmar?.tipo === 'pausar' ? 'Pausar Recorrência' : 'Excluir Recorrência'}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {modalConfirmar?.tipo === 'pausar' 
                ? 'A recorrência será pausada e não gerará mais faturas automaticamente.' 
                : 'Esta ação não pode ser desfeita. Todas as faturas já geradas permanecerão no sistema.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setModalConfirmar(null)}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={modalConfirmar?.tipo === 'pausar' ? handlePausar : handleExcluir}
              className={cn(
                "flex-1 py-2.5 rounded-lg font-medium",
                modalConfirmar?.tipo === 'pausar'
                  ? "bg-yellow-500 text-white hover:bg-yellow-600"
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              {modalConfirmar?.tipo === 'pausar' ? 'Pausar' : 'Excluir'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
