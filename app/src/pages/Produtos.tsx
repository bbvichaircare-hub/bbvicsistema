// ============================================
// BBVIC GESTÃO - PRODUTOS (ADMIN ONLY)
// ============================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, Package, Edit, Trash2 } from 'lucide-react'
import type { Produto } from '@/types'

export function Produtos() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isAdmin) {
      navigate('/')
      return
    }

    fetchProdutos()
  }, [isAdmin])

  const fetchProdutos = async () => {
    try {
      setLoading(true)

      const q = query(
        collection(db, 'produtos'),
        where('ativo', '==', true)
      )

      const snapshot = await getDocs(q)

      const lista = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Produto[]

      setProdutos(lista)

    } catch (error) {
      console.error('Erro ao buscar produtos:', error)
      toast.error('Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return

    try {
      await deleteDoc(doc(db, 'produtos', id))
      toast.success('Produto excluído!')
      fetchProdutos()
    } catch (error) {
      console.error('Erro ao excluir:', error)
      toast.error('Erro ao excluir produto')
    }
  }

  const filteredProdutos = produtos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Produtos
          </h1>
          <p className="text-gray-400">
            Gerencie seus produtos
          </p>
        </div>

        <button
          onClick={() => navigate('/produtos/novo')}
          className="px-4 py-2 rounded-lg bg-[#6F2738] text-white hover:bg-[#4A1A26] flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Produto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white"
        />
      </div>

      {/* Grid */}
      {filteredProdutos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">
            Nenhum produto encontrado
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProdutos.map(produto => (
            <div
              key={produto.id}
              className="bg-white/5 rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex justify-between mb-4">
                <div className="p-3 rounded-lg bg-[#6F2738]/20">
                  <Package className="w-6 h-6 text-[#6F2738]" />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      navigate(`/produtos/${produto.id}/editar`)
                    }
                    className="p-2 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/20"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(produto.id!)
                    }
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-white font-semibold text-lg mb-1">
                {produto.nome}
              </h3>

              <p className="text-gray-400 text-sm mb-4">
                {produto.categoria}
              </p>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">
                    Preço de venda:
                  </span>
                  <span className="text-[#6F2738] font-semibold">
                    {formatCurrency(produto.preco_venda)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">
                    Preço de custo:
                  </span>
                  <span className="text-gray-300">
                    {formatCurrency(produto.preco_custo)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">
                    Estoque:
                  </span>
                  <span className="text-gray-300">
                    {produto.estoque || 0} un
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}