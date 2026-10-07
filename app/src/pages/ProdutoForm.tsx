// ============================================
// BBVIC GESTÃO - FORMULÁRIO DE PRODUTO (ADMIN ONLY)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, addDoc, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import type { Produto } from '@/types';

const CATEGORIAS = [
  'Shampoo',
  'Condicionador',
  'Máscara',
  'Óleo',
  'Creme',
  'Tratamento',
  'Finalizador',
  'Outros'
];

export function ProdutoForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Produto>>({
    nome: '',
    descricao: '',
    categoria: 'Outros',
    preco_custo: 0,
    preco_venda: 0,
    estoque: 0,
    estoque_minimo: 0,
    comissao_percentual: 0,
    ativo: true,
  });

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    if (isEditing && id) {
      fetchProduto(id);
    }
  }, [id, isAdmin]);

  const fetchProduto = async (produtoId: string) => {
    try {
      setLoading(true);
      const docSnap = await getDoc(doc(db, 'produtos', produtoId));
      if (docSnap.exists()) {
        setFormData(docSnap.data() as Produto);
      }
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      toast.error('Erro ao carregar produto');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const produtoData = {
        ...formData,
        updated_at: Timestamp.now(),
      };

      if (isEditing && id) {
        await updateDoc(doc(db, 'produtos', id), produtoData);
        toast.success('Produto atualizado!');
      } else {
        await addDoc(collection(db, 'produtos'), {
          ...produtoData,
          created_at: Timestamp.now(),
        });
        toast.success('Produto criado!');
      }
      navigate('/produtos');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar produto');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? parseFloat(value) || 0 : value 
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/produtos')}
          className="p-2 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isEditing ? 'Editar Produto' : 'Novo Produto'}
          </h1>
          <p className="text-gray-400">{isEditing ? 'Atualize os dados do produto' : 'Cadastre um novo produto'}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-6">
        {/* Nome */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Nome *</label>
          <input
            type="text"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
            placeholder="Nome do produto"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Descrição</label>
          <textarea
            name="descricao"
            value={formData.descricao}
            onChange={handleChange}
            rows={3}
            placeholder="Descrição do produto..."
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none resize-none"
          />
        </div>

        {/* Categoria */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Categoria</label>
          <select
            name="categoria"
            value={formData.categoria}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white"
          >
            {CATEGORIAS.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Preços */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Preço de Custo (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="preco_custo"
              value={formData.preco_custo}
              onChange={handleChange}
              placeholder="0,00"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Preço de Venda (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="preco_venda"
              value={formData.preco_venda}
              onChange={handleChange}
              placeholder="0,00"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
            />
          </div>
        </div>

        {/* Estoque */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Estoque Atual</label>
            <input
              type="number"
              min="0"
              name="estoque"
              value={formData.estoque}
              onChange={handleChange}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Estoque Mínimo</label>
            <input
              type="number"
              min="0"
              name="estoque_minimo"
              value={formData.estoque_minimo}
              onChange={handleChange}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
            />
          </div>
        </div>

        {/* Comissão */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Comissão (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="comissao_percentual"
            value={formData.comissao_percentual || ''}
            onChange={handleChange}
            placeholder="0"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:border-[#6F2738] outline-none"
          />
          <p className="text-gray-500 text-xs mt-1">Porcentagem de comissão para vendedores</p>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/produtos')}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-700 text-white hover:bg-gray-600 text-center transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-xl bg-[#6F2738] text-white hover:bg-[#4A1A26] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
