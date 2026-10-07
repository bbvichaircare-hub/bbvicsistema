import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { Save, Loader2, ArrowLeft, User, Building2 } from 'lucide-react';
import type { Cliente } from '@/types';

interface VendedorOpt { uid: string; nome: string }

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

export function ClienteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isAdmin, getVendedores } = useAuth();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCliente, setSavedCliente] = useState<{id:string, nome:string} | null>(null);
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([]);
  const [vendedorIdSelecionado, setVendedorIdSelecionado] = useState('');

  const [formData, setFormData] = useState<Partial<Cliente>>({
    nome: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    tipo: 'pessoa',
    data_nascimento: '',
    observacoes: '',
    status: 'ativo',
  });

  useEffect(() => {
    if (isEditing && id) fetchCliente(id);
    if (isAdmin) {
      getVendedores().then(vs => setVendedores(vs as VendedorOpt[]));
    }
  }, [id]);

  const fetchCliente = async (clienteId: string) => {
    try {
      setLoading(true);
      const docSnap = await getDoc(doc(db, 'clientes', clienteId));
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setFormData(data as Cliente);
        if (data.vendedor_id) setVendedorIdSelecionado(data.vendedor_id);
      }
    } catch {
      toast.error('Erro ao carregar cliente');
    } finally {
      setLoading(false);
    }
  };

  const checkDuplicate = async (): Promise<string | null> => {
    try {
      const allSnap = await getDocs(collection(db, 'clientes'))
      const allClientes = allSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

      const phone = formData.telefone?.trim().replace(/\D/g, '')
      const email = formData.email?.trim().toLowerCase()

      for (const c of allClientes) {
        if (c.id === id) continue

        if (phone && phone.length >= 7) {
          const existingPhone = (c.telefone || '').replace(/\D/g, '')
          if (existingPhone === phone) {
            return `Telefone já cadastrado para o cliente: ${c.nome}`
          }
        }

        if (email) {
          const existingEmail = (c.email || '').trim().toLowerCase()
          if (existingEmail === email) {
            return `E-mail já cadastrado para o cliente: ${c.nome}`
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) { toast.error('Nome é obrigatório'); return; }

    setSaving(true);
    try {
      const duplicateMsg = await checkDuplicate()
      if (duplicateMsg) {
        toast.error(duplicateMsg, { duration: 5000 })
        setSaving(false)
        return
      }

      const vendedorFinal = isAdmin && vendedorIdSelecionado
        ? vendedorIdSelecionado
        : user?.uid;
      const vendedorNomeFinal = isAdmin && vendedorIdSelecionado
        ? (vendedores.find(v => v.uid === vendedorIdSelecionado)?.nome || '')
        : (user as any)?.nome;

      const clienteData = {
        ...formData,
        vendedor_id: vendedorFinal,
        vendedor_nome: vendedorNomeFinal,
        ativo: true,
        updated_at: Timestamp.now(),
      };

      if (isEditing && id) {
        await updateDoc(doc(db, 'clientes', id), clienteData);
        toast.success('Cliente atualizado!');
        setSavedCliente({ id, nome: formData.nome! });
      } else {
        const ref = await addDoc(collection(db, 'clientes'), { ...clienteData, created_at: Timestamp.now() });
        toast.success('Cliente criado!');
        setSavedCliente({ id: ref.id, nome: formData.nome! });
      }
    } catch {
      toast.error('Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#6F2738] focus:outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/clientes')}
          className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </h1>
          <p className="text-gray-500 text-sm">
            {isEditing ? 'Atualize os dados do cliente' : 'Cadastre um novo cliente'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Tipo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tipo de Cliente</h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tipo: 'pessoa' }))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors text-sm font-medium ${
                formData.tipo === 'pessoa'
                  ? 'border-[#6F2738] bg-[#6F2738]/10 text-[#6F2738]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" /> Pessoa Física
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tipo: 'empresa' }))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors text-sm font-medium ${
                formData.tipo === 'empresa'
                  ? 'border-[#6F2738] bg-[#6F2738]/10 text-[#6F2738]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Building2 className="w-4 h-4" /> Empresa
            </button>
          </div>
        </div>

        {/* Vendedor (admin only) */}
        {isAdmin && vendedores.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Vendedor Responsável</h2>
            <p className="text-xs text-gray-400">Selecione o vendedor deste cliente. Ele verá este cliente em sua lista.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVendedorIdSelecionado('')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${!vendedorIdSelecionado ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}
              >
                Sem vendedor
              </button>
              {vendedores.map(v => (
                <button
                  key={v.uid}
                  type="button"
                  onClick={() => setVendedorIdSelecionado(v.uid)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition truncate ${vendedorIdSelecionado === v.uid ? 'bg-[#6F2738] text-white border-[#6F2738]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#6F2738]'}`}
                >
                  {v.nome}
                </button>
              ))}
            </div>
            {vendedorIdSelecionado && (
              <p className="text-xs text-green-600">✓ Cliente atribuído para: <strong>{vendedores.find(v => v.uid === vendedorIdSelecionado)?.nome}</strong></p>
            )}
          </div>
        )}

        {/* Informações Pessoais */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Informações Pessoais</h2>

          <div>
            <label className={labelClass}>
              {formData.tipo === 'empresa' ? 'Nome da Empresa *' : 'Nome Completo *'}
            </label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              placeholder={formData.tipo === 'empresa' ? 'Nome da empresa' : 'First and last name'}
              className={inputClass}
            />
          </div>

          {formData.tipo === 'pessoa' && (
            <div>
              <label className={labelClass}>Data de Nascimento</label>
              <input
                type="date"
                name="data_nascimento"
                value={(formData as any).data_nascimento || ''}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* Contato */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contato</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Telefone</label>
              <input
                type="tel"
                name="telefone"
                value={formData.telefone}
                onChange={handleChange}
                placeholder="(617) 000-0000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="email@example.com"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Endereço (formato EUA) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Endereço</h2>

          <div>
            <label className={labelClass}>Street Address</label>
            <input
              type="text"
              name="endereco"
              value={formData.endereco}
              onChange={handleChange}
              placeholder="123 Main St, Apt 4B"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className={labelClass}>City</label>
              <input
                type="text"
                name="cidade"
                value={formData.cidade}
                onChange={handleChange}
                placeholder="Boston"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">-- State --</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>ZIP Code</label>
              <input
                type="text"
                name="cep"
                value={formData.cep}
                onChange={handleChange}
                placeholder="02101"
                maxLength={10}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <label className={labelClass}>Observações</label>
          <textarea
            name="observacoes"
            value={formData.observacoes}
            onChange={handleChange}
            rows={3}
            placeholder="Informações adicionais sobre o cliente..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Botões */}
        {savedCliente ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-green-800 font-medium text-sm">✓ Cliente <strong>{savedCliente.nome}</strong> salvo! O que deseja fazer?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate(`/estimates/novo?cliente_id=${savedCliente.id}&cliente_nome=${encodeURIComponent(savedCliente.nome)}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                Criar Orçamento
              </button>
              <button type="button" onClick={() => navigate(`/invoices/novo?cliente_id=${savedCliente.id}&cliente_nome=${encodeURIComponent(savedCliente.nome)}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                Criar Fatura
              </button>
              <button type="button" onClick={() => navigate(`/clientes/${savedCliente.id}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#6F2738] text-white text-sm font-medium hover:bg-[#4A1A26]">
                Ver Cliente
              </button>
              <button type="button" onClick={() => navigate('/clientes')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                Lista de Clientes
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/clientes')}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] px-4 py-3 rounded-xl bg-[#6F2738] text-white font-bold hover:bg-[#4A1A26] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar Cliente'}
            </button>
          </div>
        )}

      </form>
    </div>
  );
}
