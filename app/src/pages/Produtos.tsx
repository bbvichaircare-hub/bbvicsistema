// ============================================
// BBVIC GESTÃO - PRODUTOS (LISTA PREMIUM)
// ============================================

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Search, Package, Trash2 } from 'lucide-react'
import type { Produto } from '@/types'

export function Produtos() {

  const { isAdmin } = useAuth()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
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

      setProdutos(
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Produto[]
      )

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
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
      </div>
    )

  }

  return (

    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Produtos
          </h1>

          <p className="text-gray-500">
            Gerencie seus produtos
          </p>

        </div>

      </div>


      {/* SEARCH */}

      <div className="relative">

        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]"
        />

      </div>


      {/* LISTA */}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

        {filteredProdutos.length === 0 ? (

          <div className="text-center py-12">

            <Package className="w-10 h-10 text-gray-400 mx-auto mb-3" />

            <p className="text-gray-500">
              Nenhum produto encontrado
            </p>

          </div>

        ) : (

          <table className="w-full">

            <thead className="bg-gray-50 border-b">

              <tr className="text-left text-sm text-gray-600">

                <th className="px-6 py-3 font-medium">Produto</th>
                <th className="px-6 py-3 font-medium">Categoria</th>
                <th className="px-6 py-3 font-medium">Preço Venda</th>
                <th className="px-6 py-3 font-medium">Estoque</th>
                {isAdmin && <th className="px-6 py-3 font-medium text-right">Ações</th>}

              </tr>

            </thead>

            <tbody>

              {filteredProdutos.map(produto => (

                <tr
                  key={produto.id}
                  className="border-b hover:bg-gray-50"
                >

                  <td className="px-6 py-4 font-medium text-gray-900">
                    {produto.nome}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {produto.categoria || "-"}
                  </td>

                  <td className="px-6 py-4 text-[#C9A227] font-semibold">
                    {formatCurrency(produto.preco_venda)}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {produto.estoque || 0} un
                  </td>

                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(produto.id!)}
                        className="p-2 rounded-lg hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </td>
                  )}

                </tr>

              ))}

            </tbody>

          </table>

        )}

      </div>

    </div>

  )

}
