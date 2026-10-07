import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Mail, 
  MessageCircle, 
  Bell, 
  Clock,
  Loader2,
  Send,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  Timestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  defaultLembreteConfig, 
  enviarTodosLembretes,
  type LembreteConfig 
} from '@/services/notificationService';

export function ConfiguracoesLembretes() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  
  const [config, setConfig] = useState<LembreteConfig>(defaultLembreteConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enviandoLembretes, setEnviandoLembretes] = useState(false);
  const [historicoLembretes, setHistoricoLembretes] = useState<any[]>([]);
  
  useEffect(() => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem acessar esta página');
      navigate('/dashboard');
      return;
    }
    fetchConfig();
    fetchHistorico();
  }, []);
  
  const fetchConfig = async () => {
    try {
      const configSnap = await getDocs(collection(db, 'configuracoes'));
      if (!configSnap.empty) {
        const data = configSnap.docs[0].data();
        if (data.lembretes) {
          setConfig(data.lembretes);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchHistorico = async () => {
    try {
      const q = query(
        collection(db, 'lembretes_enviados'),
        orderBy('enviado_em', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const lembretes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHistoricoLembretes(lembretes);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    }
  };
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const configRef = doc(db, 'configuracoes', 'principal');
      await setDoc(configRef, {
        lembretes: config,
        updated_at: Timestamp.now(),
        updated_by: user?.uid,
      }, { merge: true });
      
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };
  
  const handleEnviarLembretes = async () => {
    setEnviandoLembretes(true);
    try {
      const resultado = await enviarTodosLembretes();
      
      if (resultado.enviados > 0) {
        toast.success(`${resultado.enviados} lembrete(s) enviado(s) com sucesso!`);
        fetchHistorico();
      } else if (resultado.total === 0) {
        toast.info('Nenhum lembrete pendente para enviar');
      } else {
        toast.error('Erro ao enviar lembretes');
      }
    } catch (error) {
      console.error('Erro ao enviar lembretes:', error);
      toast.error('Erro ao enviar lembretes');
    } finally {
      setEnviandoLembretes(false);
    }
  };
  
  const toggleDiaAntes = (dia: number) => {
    setConfig(prev => ({
      ...prev,
      diasAntesVencimento: prev.diasAntesVencimento.includes(dia)
        ? prev.diasAntesVencimento.filter(d => d !== dia)
        : [...prev.diasAntesVencimento, dia].sort((a, b) => b - a)
    }));
  };
  
  const toggleDiaApos = (dia: number) => {
    setConfig(prev => ({
      ...prev,
      diasAposVencimento: prev.diasAposVencimento.includes(dia)
        ? prev.diasAposVencimento.filter(d => d !== dia)
        : [...prev.diasAposVencimento, dia].sort((a, b) => a - b)
    }));
  };
  
  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = new Date(date?.toDate?.() || date);
    return d.toLocaleString('pt-BR');
  };
  
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
          onClick={() => navigate('/configuracoes')}
          className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações de Lembretes</h1>
          <p className="text-gray-500 text-sm">Configure lembretes automáticos de pagamento</p>
        </div>
      </div>
      
      {/* Ação Rápida */}
      <div className="bbvic-card bg-gradient-to-r from-[#6F2738]/10 to-[#6F2738]/5 border-[#6F2738]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#6F2738]/20 flex items-center justify-center">
              <Send className="w-6 h-6 text-[#6F2738]" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Enviar Lembretes Agora</h3>
              <p className="text-sm text-gray-500">Verifica e envia lembretes para faturas pendentes</p>
            </div>
          </div>
          <button
            onClick={handleEnviarLembretes}
            disabled={enviandoLembretes}
            className="bbvic-btn-primary flex items-center gap-2"
          >
            {enviandoLembretes ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar Agora
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configurações */}
        <div className="space-y-6">
          {/* Canais de Comunicação */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#6F2738]" />
              Canais de Comunicação
            </h2>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={config.enviarEmail}
                  onChange={(e) => setConfig(prev => ({ ...prev, enviarEmail: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-[#6F2738] focus:ring-[#6F2738]"
                />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Email</p>
                    <p className="text-sm text-gray-500">Enviar lembretes por email</p>
                  </div>
                </div>
              </label>
              
              <label className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={config.enviarWhatsApp}
                  onChange={(e) => setConfig(prev => ({ ...prev, enviarWhatsApp: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-[#6F2738] focus:ring-[#6F2738]"
                />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">WhatsApp</p>
                    <p className="text-sm text-gray-500">Enviar lembretes por WhatsApp</p>
                  </div>
                </div>
              </label>
            </div>
          </div>
          
          {/* Lembretes Antes do Vencimento */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#6F2738]" />
              Lembretes Antes do Vencimento
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Selecione quando enviar lembretes antes da data de vencimento
            </p>
            
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 7, 10, 15].map(dia => (
                <button
                  key={dia}
                  onClick={() => toggleDiaAntes(dia)}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-all",
                    config.diasAntesVencimento.includes(dia)
                      ? "bg-[#6F2738] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {dia} dia{dia > 1 ? 's' : ''} antes
                </button>
              ))}
            </div>
          </div>
          
          {/* Lembretes Após o Vencimento */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Lembretes Após o Vencimento
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Selecione quando enviar lembretes após a data de vencimento
            </p>
            
            <div className="flex flex-wrap gap-2">
              {[1, 3, 5, 7, 10, 15, 30].map(dia => (
                <button
                  key={dia}
                  onClick={() => toggleDiaApos(dia)}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-all",
                    config.diasAposVencimento.includes(dia)
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {dia} dia{dia > 1 ? 's' : ''} após
                </button>
              ))}
            </div>
          </div>
          
          {/* Botão Salvar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bbvic-btn-primary flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
        
        {/* Templates e Histórico */}
        <div className="space-y-6">
          {/* Template de Email */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Template de Email
            </h2>
            <textarea
              value={config.templateEmail}
              onChange={(e) => setConfig(prev => ({ ...prev, templateEmail: e.target.value }))}
              rows={12}
              className="bbvic-input w-full font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Variáveis disponíveis: {'{clienteNome}'}, {'{faturaNumero}'}, {'{faturaValor}'}, {'{dataVencimento}'}, {'{statusPagamento}'}, {'{faturaLink}'}
            </p>
          </div>
          
          {/* Template de WhatsApp */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Template de WhatsApp
            </h2>
            <textarea
              value={config.templateWhatsApp}
              onChange={(e) => setConfig(prev => ({ ...prev, templateWhatsApp: e.target.value }))}
              rows={8}
              className="bbvic-input w-full font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Variáveis disponíveis: {'{clienteNome}'}, {'{faturaNumero}'}, {'{faturaValor}'}, {'{dataVencimento}'}, {'{statusPagamento}'}, {'{faturaLink}'}
            </p>
          </div>
          
          {/* Histórico de Lembretes */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Histórico de Lembretes Enviados</h2>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {historicoLembretes.length > 0 ? (
                historicoLembretes.map((lembrete) => (
                  <div key={lembrete.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    {lembrete.tipo === 'email' ? (
                      <Mail className="w-4 h-4 text-blue-600" />
                    ) : (
                      <MessageCircle className="w-4 h-4 text-green-600" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {lembrete.cliente_nome}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(lembrete.enviado_em)}
                      </p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">Nenhum lembrete enviado ainda</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
