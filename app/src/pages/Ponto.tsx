import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  Play, 
  Coffee, 
  LogOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  History
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  registrarPonto, 
  verificarStatusTrabalho, 
  buscarJornadas,
  type JornadaTrabalho,
  type RegistroPonto
} from '@/services/timeTrackingService';

export function Ponto() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<{ trabalhando: boolean; emIntervalo: boolean }>({
    trabalhando: false,
    emIntervalo: false,
  });
  const [loading, setLoading] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [jornadas, setJornadas] = useState<JornadaTrabalho[]>([]);
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [localizacao, setLocalizacao] = useState<{ latitude: number; longitude: number } | null>(null);
  
  useEffect(() => {
    fetchStatus();
    fetchJornadas();
    
    // Atualizar hora a cada segundo
    const interval = setInterval(() => setHoraAtual(new Date()), 1000);
    
    // Obter localização
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocalizacao({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
        () => console.log('Localização não disponível')
      );
    }
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchStatus = async () => {
    if (!user?.uid) return;
    const statusAtual = await verificarStatusTrabalho(user.uid);
    setStatus({ trabalhando: statusAtual.trabalhando, emIntervalo: statusAtual.emIntervalo });
    setLoading(false);
  };
  
  const fetchJornadas = async () => {
    if (!user?.uid) return;
    
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 30); // Últimos 30 dias
    
    const data = await buscarJornadas(user.uid, dataInicio);
    setJornadas(data);
  };
  
  const handleRegistrar = async (tipo: RegistroPonto['tipo']) => {
    if (!user?.uid) return;
    
    setRegistrando(true);
    try {
      const registroId = await registrarPonto(
        user.uid,
        user.nome,
        tipo,
        {
          localizacao: localizacao || undefined,
          notas: undefined,
        }
      );
      
      if (registroId) {
        const mensagens: Record<string, string> = {
          entrada: 'Entrada registrada com sucesso!',
          saida: 'Saída registrada! Bom descanso!',
          intervalo_inicio: 'Intervalo iniciado!',
          intervalo_fim: 'Intervalo finalizado! Bem-vindo de volta!',
        };
        toast.success(mensagens[tipo]);
        fetchStatus();
        fetchJornadas();
      } else {
        toast.error('Erro ao registrar ponto');
      }
    } catch (error) {
      toast.error('Erro ao registrar ponto');
    } finally {
      setRegistrando(false);
    }
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  
  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };
  
  // Calcular total do mês
  const totalHorasMes = jornadas.reduce((acc, j) => acc + j.horas_totais, 0);
  const diasTrabalhados = jornadas.filter(j => j.status === 'completo').length;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#6F2738] animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Ponto</h1>
          <p className="text-gray-500 text-sm">Registre suas horas de trabalho</p>
        </div>
      </div>
      
      {/* Relógio e Status */}
      <div className="bbvic-card bg-gradient-to-br from-[#6F2738] to-[#4A1A26] text-white">
        <div className="text-center">
          <p className="text-5xl font-bold">{formatTime(horaAtual)}</p>
          <p className="text-lg opacity-80 mt-1">{formatDate(horaAtual)}</p>
          
          <div className="mt-4 flex items-center justify-center gap-2">
            {status.trabalhando ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-green-500 rounded-full text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Trabalhando
              </span>
            ) : status.emIntervalo ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-full text-sm font-medium">
                <Coffee className="w-4 h-4" />
                Em Intervalo
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-gray-500 rounded-full text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                Fora de Serviço
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Botões de Ação */}
      <div className="grid grid-cols-2 gap-4">
        {!status.trabalhando && !status.emIntervalo && (
          <button
            onClick={() => handleRegistrar('entrada')}
            disabled={registrando}
            className="col-span-2 py-6 rounded-xl bg-green-500 text-white hover:bg-green-600 flex flex-col items-center gap-2 transition-colors"
          >
            {registrando ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Play className="w-8 h-8" />
                <span className="text-lg font-semibold">Registrar Entrada</span>
              </>
            )}
          </button>
        )}
        
        {status.trabalhando && (
          <>
            <button
              onClick={() => handleRegistrar('intervalo_inicio')}
              disabled={registrando}
              className="py-6 rounded-xl bg-orange-500 text-white hover:bg-orange-600 flex flex-col items-center gap-2 transition-colors"
            >
              <Coffee className="w-8 h-8" />
              <span className="text-lg font-semibold">Iniciar Intervalo</span>
            </button>
            
            <button
              onClick={() => handleRegistrar('saida')}
              disabled={registrando}
              className="py-6 rounded-xl bg-red-500 text-white hover:bg-red-600 flex flex-col items-center gap-2 transition-colors"
            >
              <LogOut className="w-8 h-8" />
              <span className="text-lg font-semibold">Registrar Saída</span>
            </button>
          </>
        )}
        
        {status.emIntervalo && (
          <button
            onClick={() => handleRegistrar('intervalo_fim')}
            disabled={registrando}
            className="col-span-2 py-6 rounded-xl bg-blue-500 text-white hover:bg-blue-600 flex flex-col items-center gap-2 transition-colors"
          >
            {registrando ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Play className="w-8 h-8" />
                <span className="text-lg font-semibold">Finalizar Intervalo</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Resumo do Mês */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bbvic-card bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-700">Horas este mês</p>
              <p className="text-2xl font-bold text-blue-800">{formatDuration(totalHorasMes)}</p>
            </div>
          </div>
        </div>
        
        <div className="bbvic-card bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-green-700">Dias trabalhados</p>
              <p className="text-2xl font-bold text-green-800">{diasTrabalhados}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Histórico */}
      <div className="bbvic-card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-[#6F2738]" />
          Histórico de Jornadas
        </h2>
        
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {jornadas.map((jornada) => (
            <div key={jornada.id} className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {formatDate(jornada.data)}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    {jornada.entrada && (
                      <span>Entrada: {formatTime(jornada.entrada)}</span>
                    )}
                    {jornada.saida && (
                      <span>Saída: {formatTime(jornada.saida)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {formatDuration(jornada.horas_totais)}
                  </p>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    jornada.status === 'completo' ? "bg-green-100 text-green-700" :
                    jornada.status === 'em_andamento' ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-700"
                  )}>
                    {jornada.status === 'completo' ? 'Completo' :
                     jornada.status === 'em_andamento' ? 'Em andamento' : 'Incompleto'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          
          {jornadas.length === 0 && (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
