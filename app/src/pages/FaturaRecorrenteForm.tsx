import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Trash2,
  Loader2,
  Calendar,
  Repeat,
  User,
  Search
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  criarFaturaRecorrente,
  atualizarFaturaRecorrente,
  frequenciaLabels,
  calcularProximaCobranca,
  type FaturaRecorrente
} from '@/services/recurringService';
import type { Cliente, InvoiceItem, Produto } from '@/types';

const frequencias: FaturaRecorrente['frequencia'][] = [
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual'
];

export function FaturaRecorrenteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState('');
  const [showClientes, setShowClientes] = useState(false);
  
  const [formData, setFormData] = useState<Partial<FaturaRecorrente>>({
    cliente_id: '',
    cliente_nome: '',
    cliente_email: '',
    cliente_telefone: '',
    items: [],
    subtotal: 0,
    desconto: 0,
    taxa_percentual: 0,
    taxa: 0,
    total: 0,
    frequencia: 'mensal',
    dia_cobranca: new Date().getDate(),
    data_inicio: new Date(),
    ativa: true,
    observacoes: '',
  });
  
  useEffect(() => {
    fetchClientes();
    fetchProdutos();
    if (isEditing) {
      fetchRecorrente();
    }
  }, [id]);
  
  const fetchClientes = async () => {
    try {
      const q = query(
        collection(db, 'clientes'),
        where('ativo', '==', true)
      );
      const snapshot = await getDocs(q);
      setClientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Cliente[]);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
    }
  };
  
  const fetchProdutos = async () => {
    try {
      const q = query(collection(db, 'produtos'), where('ativo', '==', true));
      const snapshot = await getDocs(q);
      setProdutos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Produto[]);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
    }
  };
  
  const fetchRecorrente = async () => {
    try {
      const docRef = doc(db, 'faturas_recorrentes', id!);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({
          ...data,
          data_inicio: data.data_inicio?.toDate?.() || data.data_inicio,
          data_termino: data.data_termino?.toDate?.() || data.data_termino,
        } as FaturaRecorrente);
      } else {
        toast.error('Fatura recorrente não encontrada');
        navigate('/invoices/recorrentes');
      }
    } catch (error) {
      console.error('Erro ao buscar fatura recorrente:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };
  
  const calcularTotais = (items: InvoiceItem[], desconto: number, taxaPercentual: number) => {
    const subtotal = items.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    const taxa = (subtotal * taxaPercentual) / 100;
    const total = subtotal + taxa - desconto;
    
    return { subtotal, taxa, total };
  };
  
  const handleAddItem = (produto: Produto) => {
    const newItem: InvoiceItem = {
      produto_id: produto.id!,
      descricao: produto.nome,
      quantidade: 1,
      preco: produto.preco_venda,
      total: produto.preco_venda,
    };
    
    const newItems = [...(formData.items || []), newItem];
    const { subtotal, taxa, total } = calcularTotais(
      newItems,
      formData.desconto || 0,
      formData.taxa_percentual || 0
    );
    
    setFormData(prev => ({
      ...prev,
      items: newItems,
      subtotal,
      taxa,
      total,
    }));
  };
  
  const handleRemoveItem = (index: number) => {
    const newItems = formData.items?.filter((_, i) => i !== index) || [];
    const { subtotal, taxa, total } = calcularTotais(
      newItems,
      formData.desconto || 0,
      formData.taxa_percentual || 0
    );
    
    setFormData(prev => ({
      ...prev,
      items: newItems,
      subtotal,
      taxa,
      total,
    }));
  };
  
  const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...(formData.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index].total = newItems[index].preco * newItems[index].quantidade;
    
    const { subtotal, taxa, total } = calcularTotais(
      newItems,
      formData.desconto || 0,
      formData.taxa_percentual || 0
    );
    
    setFormData(prev => ({
      ...prev,
      items: newItems,
      subtotal,
      taxa,
      total,
    }));
  };
  
  const handleSelectCliente = (cliente: Cliente) => {
    setFormData(prev => ({
      ...prev,
      cliente_id: cliente.id!,
      cliente_nome: cliente.nome,
      cliente_email: cliente.email,
      cliente_telefone: cliente.telefone,
    }));
    setBuscandoCliente(cliente.nome);
    setShowClientes(false);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.cliente_id) {
      toast.error('Selecione um cliente');
      return;
    }
    
    if (!formData.items?.length) {
      toast.error('Adicione pelo menos um item');
      return;
    }
    
    setSaving(true);
    
    try {
      const dataToSave = {
        ...formData,
        vendedor_id: user?.uid,
        vendedor_nome: user?.nome,
      } as Omit<FaturaRecorrente, 'id' | 'created_at' | 'updated_at' | 'total_gerado'>;
      
      if (isEditing) {
        const sucesso = await atualizarFaturaRecorrente(id!, dataToSave);
        if (sucesso) {
          toast.success('Fatura recorrente atualizada!');
          navigate('/invoices/recorrentes');
        } else {
          toast.error('Erro ao atualizar');
        }
      } else {
        const novoId = await criarFaturaRecorrente(dataToSave);
        if (novoId) {
          toast.success('Fatura recorrente criada!');
          navigate('/invoices/recorrentes');
        } else {
          toast.error('Erro ao criar');
        }
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar fatura recorrente');
    } finally {
      setSaving(false);
    }
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };
  
  const clientesFiltrados = clientes.filter(c => 
    c.nome.toLowerCase().includes(buscandoCliente.toLowerCase()) ||
    c.telefone?.includes(buscandoCliente)
  );
  
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
          onClick={() => navigate('/invoices/recorrentes')}
          className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Editar Recorrência' : 'Nova Recorrência'}
          </h1>
          <p className="text-gray-500 text-sm">
            Configure cobranças automáticas para o cliente
          </p>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cliente */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-[#6F2738]" />
              Cliente
            </h2>
            
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={buscandoCliente || formData.cliente_nome}
                  onChange={(e) => {
                    setBuscandoCliente(e.target.value);
                    setShowClientes(true);
                    if (!e.target.value) {
                      setFormData(prev => ({
                        ...prev,
                        cliente_id: '',
                        cliente_nome: '',
                        cliente_email: '',
                        cliente_telefone: '',
                      }));
                    }
                  }}
                  onFocus={() => setShowClientes(true)}
                  placeholder="Buscar cliente..."
                  className="bbvic-input w-full pl-10"
                />
              </div>
              
              {showClientes && clientesFiltrados.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                  {clientesFiltrados.map(cliente => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => handleSelectCliente(cliente)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-gray-900">{cliente.nome}</p>
                      {cliente.telefone && (
                        <p className="text-sm text-gray-500">{cliente.telefone}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {formData.cliente_email && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Email:</span> {formData.cliente_email}
                </p>
                {formData.cliente_telefone && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Telefone:</span> {formData.cliente_telefone}
                  </p>
                )}
              </div>
            )}
          </div>
          
          {/* Itens */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens da Fatura</h2>
            
            {/* Lista de itens */}
            <div className="space-y-3 mb-4">
              {formData.items?.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="text"
                    value={item.descricao}
                    onChange={(e) => handleUpdateItem(index, 'descricao', e.target.value)}
                    className="flex-1 bg-transparent border-0 p-0 text-gray-900 focus:ring-0"
                    placeholder="Descrição"
                  />
                  <input
                    type="number"
                    value={item.quantidade}
                    onChange={(e) => handleUpdateItem(index, 'quantidade', parseFloat(e.target.value) || 1)}
                    className="w-20 text-center bg-white rounded-lg border border-gray-200 px-2 py-1"
                    min="1"
                  />
                  <input
                    type="number"
                    value={item.preco}
                    onChange={(e) => handleUpdateItem(index, 'preco', parseFloat(e.target.value) || 0)}
                    className="w-28 text-right bg-white rounded-lg border border-gray-200 px-2 py-1"
                    step="0.01"
                    min="0"
                  />
                  <span className="w-24 text-right font-medium text-gray-900">
                    {formatCurrency(item.total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            
            {/* Adicionar produto */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-500 mb-2">Adicionar produto/serviço</p>
              <div className="flex flex-wrap gap-2">
                {produtos.slice(0, 5).map(produto => (
                  <button
                    key={produto.id}
                    type="button"
                    onClick={() => handleAddItem(produto)}
                    className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-[#6F2738]/10 hover:text-[#6F2738] text-sm transition-colors"
                  >
                    + {produto.nome}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddItem({ 
                    id: '', 
                    nome: 'Item personalizado', 
                    preco_custo: 0,
                    preco_venda: 0, 
                    quantidade: 1, 
                    quantidade_minima: 0,
                    unidade: 'un',
                    categoria: 'servico', 
                    ativo: true, 
                    created_at: new Date(), 
                    updated_at: new Date() 
                  })}
                  className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#6F2738] hover:text-[#6F2738] text-sm transition-colors"
                >
                  + Item personalizado
                </button>
              </div>
            </div>
          </div>
          
          {/* Configuração de Recorrência */}
          <div className="bbvic-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-[#6F2738]" />
              Configuração de Recorrência
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequência
                </label>
                <select
                  value={formData.frequencia}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    frequencia: e.target.value as FaturaRecorrente['frequencia'] 
                  }))}
                  className="bbvic-input w-full"
                >
                  {frequencias.map(freq => (
                    <option key={freq} value={freq}>
                      {frequenciaLabels[freq]}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dia de Cobrança
                </label>
                <input
                  type="number"
                  value={formData.dia_cobranca}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    dia_cobranca: parseInt(e.target.value) || 1 
                  }))}
                  className="bbvic-input w-full"
                  min="1"
                  max="31"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Dia do mês em que a fatura será gerada
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Início
                </label>
                <input
                  type="date"
                  value={formData.data_inicio ? new Date(formData.data_inicio).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    data_inicio: new Date(e.target.value) 
                  }))}
                  className="bbvic-input w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Término (opcional)
                </label>
                <input
                  type="date"
                  value={formData.data_termino ? new Date(formData.data_termino).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    data_termino: e.target.value ? new Date(e.target.value) : undefined 
                  }))}
                  className="bbvic-input w-full"
                />
              </div>
            </div>
            
            {/* Preview da próxima cobrança */}
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="text-blue-700 font-medium">
                  Próxima cobrança: {calcularProximaCobranca(
                    formData.data_inicio || new Date(),
                    formData.frequencia || 'mensal',
                    formData.dia_cobranca
                  ).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            
            {/* Observações */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                rows={3}
                className="bbvic-input w-full resize-none"
                placeholder="Observações que aparecerão em todas as faturas geradas..."
              />
            </div>
          </div>
        </div>
        
        {/* Coluna Lateral - Resumo */}
        <div className="space-y-6">
          <div className="bbvic-card sticky top-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">{formatCurrency(formData.subtotal || 0)}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Taxa (%)</span>
                <input
                  type="number"
                  value={formData.taxa_percentual}
                  onChange={(e) => {
                    const taxaPercentual = parseFloat(e.target.value) || 0;
                    const { taxa, total } = calcularTotais(
                      formData.items || [],
                      formData.desconto || 0,
                      taxaPercentual
                    );
                    setFormData(prev => ({ ...prev, taxa_percentual: taxaPercentual, taxa, total }));
                  }}
                  className="w-20 text-right bg-white rounded-lg border border-gray-200 px-2 py-1 text-sm"
                  step="0.01"
                  min="0"
                />
              </div>
              
              {(formData.taxa || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Valor Taxa</span>
                  <span className="text-gray-900">{formatCurrency(formData.taxa || 0)}</span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Desconto</span>
                <input
                  type="number"
                  value={formData.desconto}
                  onChange={(e) => {
                    const desconto = parseFloat(e.target.value) || 0;
                    const { subtotal, taxa, total } = calcularTotais(
                      formData.items || [],
                      desconto,
                      formData.taxa_percentual || 0
                    );
                    setFormData(prev => ({ ...prev, desconto, subtotal, taxa, total }));
                  }}
                  className="w-28 text-right bg-white rounded-lg border border-gray-200 px-2 py-1 text-sm"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-[#6F2738]">
                    {formatCurrency(formData.total || 0)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Valor cobrado a cada {frequenciaLabels[formData.frequencia || 'mensal'].toLowerCase()}
                </p>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={saving || !formData.cliente_id || !formData.items?.length}
              className="w-full mt-6 bbvic-btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isEditing ? 'Salvar Alterações' : 'Criar Recorrência'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
