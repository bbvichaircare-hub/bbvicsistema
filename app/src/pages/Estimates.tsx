// ============================================
// BBVIC GESTÃO - LISTA DE ORÇAMENTOS (PREMIUM)
// ============================================

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  deleteDoc,
  doc
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import { formatCurrency } from "@/lib/utils"

import {
  Plus,
  Search,
  ClipboardList,
  Eye,
  Trash2
} from "lucide-react"

import type { Estimate } from "@/types"

export function Estimates() {

  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()

  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; numero: string; cliente: string} | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchEstimates()
  }, [user, isAdmin])

  const fetchEstimates = async () => {

    try {

      setLoading(true)

      let q

      if (isAdmin) {

        q = query(
          collection(db, "estimates"),
          orderBy("created_at", "desc")
        )

      } else {

        q = query(
          collection(db, "estimates"),
          where("vendedor_id", "==", user?.uid),
          orderBy("created_at", "desc")
        )

      }

      const snapshot = await getDocs(q)

      setEstimates(
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Estimate[]
      )

    } catch (error) {

      console.error("Erro ao buscar orçamentos:", error)

    } finally {

      setLoading(false)

    }

  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, "estimates", deleteConfirm.id))
      setEstimates(prev => prev.filter(e => e.id !== deleteConfirm.id))
      setDeleteConfirm(null)
    } catch (e) {
      console.error("Erro ao excluir:", e)
      alert("Erro ao excluir orçamento")
    } finally {
      setDeleting(false)
    }
  }

  const filteredEstimates = estimates.filter(est =>
    est.status !== "aprovado" &&
    est.status !== "convertido" &&
    (
      est.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      est.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const getStatusColor = (status: string) => {

    const colors: Record<string, string> = {

      aprovado: "bg-green-100 text-green-700",
      enviado: "bg-blue-100 text-blue-700",
      visualizado: "bg-purple-100 text-purple-700",
      rascunho: "bg-gray-100 text-gray-700",
      recusado: "bg-red-100 text-red-700",
      expirado: "bg-orange-100 text-orange-700"

    }

    return colors[status] || "bg-gray-100 text-gray-700"

  }

  if (loading) {

    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/>
      </div>
    )

  }

  return (

    <div className="space-y-8">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Orçamentos
          </h1>

          <p className="text-gray-500">
            Gerencie os orçamentos dos clientes
          </p>

        </div>

        <button
          onClick={() => navigate("/estimates/novo")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A227] text-white hover:bg-[#9A7B1A]"
        >
          <Plus className="w-5 h-5"/>
          Novo Orçamento
        </button>

      </div>


      {/* SEARCH */}

      <div className="relative">

        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar orçamento ou cliente..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]"
        />

      </div>


      {/* LISTA */}

      {filteredEstimates.length === 0 ? (

        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">

          <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4"/>

          <p className="text-gray-500">
            Nenhum orçamento encontrado
          </p>

        </div>

      ) : (

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {filteredEstimates.map((estimate) => (

            <div
              key={estimate.id}
              className="flex items-center justify-between px-6 py-4 border-b hover:bg-gray-50 transition cursor-pointer"
              onClick={() => navigate(`/estimates/${estimate.id}/editar`)}
            >

              <div className="flex items-center gap-4 flex-1 min-w-0">

                <div className="w-10 h-10 rounded-lg bg-[#C9A227]/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-[#C9A227]"/>
                </div>

                <div>

                  <p className="font-medium text-gray-900">
                    {estimate.numero}
                  </p>

                  <p className="text-sm text-gray-500">
                    {estimate.cliente_nome}
                  </p>

                </div>

              </div>


                  <div className="flex items-center gap-2 sm:gap-6">

                <span className="font-semibold text-gray-900">
                  {formatCurrency(estimate.total)}
                </span>

                <span
                  className={`text-xs px-2 py-1 rounded-full ${getStatusColor(estimate.status)}`}
                >
                  {estimate.status}
                </span>

                <button
                  className="p-2 rounded-lg hover:bg-gray-100"
                >
                  <Eye className="w-5 h-5 text-gray-500"/>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: estimate.id!, numero: estimate.numero, cliente: estimate.cliente_nome }) }}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-400"
                  title="Excluir orçamento"
                >
                  <Trash2 className="w-5 h-5"/>
                </button>

              </div>

            </div>

          ))}

        </div>

      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Orçamento</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir o orçamento <span className="font-semibold text-gray-900">{deleteConfirm.numero}</span> de <span className="font-semibold">{deleteConfirm.cliente}</span>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  )

}