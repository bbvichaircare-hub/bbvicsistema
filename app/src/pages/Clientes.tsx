// ============================================
// BBVIC GESTÃO - CLIENTES (LAYOUT LISTA PREMIUM)
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
  doc,
  addDoc,
  Timestamp
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Plus, Search, Users, Download, Upload, Trash2 } from "lucide-react"
import * as XLSX from 'xlsx'
import { useRef } from 'react'
import { toast } from 'sonner'
import type { Cliente } from "@/types"

export function Clientes() {

  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const importClienteRef = useRef<HTMLInputElement>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; nome: string} | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchClientes()
  }, [user, isAdmin])

  const fetchClientes = async () => {

    try {

      setLoading(true)

      let q

      if (isAdmin) {
        q = query(
          collection(db, "clientes"),
          orderBy("nome")
        )
        const snapshot = await getDocs(q)
        setClientes(
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Cliente[]
        )
      } else {
        const vendorQ = query(
          collection(db, "clientes"),
          where("vendedor_id", "==", user?.uid)
        )
        const snapshot = await getDocs(vendorQ)
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Cliente[]
        list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
        setClientes(list)
      }

    } catch (error) {

      console.error("Erro ao buscar clientes:", error)

    } finally {

      setLoading(false)

    }

  }

  const filteredClientes = clientes.filter(c =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefone?.includes(searchTerm)
  )

  if (loading) {

    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
      </div>
    )

  }

  const handleExportClientes = () => {
    const rows = clientes.map(c => ({
      'Nome': c.nome || '',
      'Email': c.email || '',
      'Telefone': c.telefone || '',
      'Endereço': c.endereco || '',
      'Cidade': (c as any).cidade || '',
      'Estado': (c as any).estado || '',
      'CEP': (c as any).cep || '',
      'Data Nascimento': (c as any).data_nascimento || '',
      'Empresa': (c as any).empresa || '',
      'Observações': (c as any).observacoes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, `clientes_bbvic_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('Clientes exportados para Excel!')
  }

  const getColCli = (row: any, ...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim())
      if (found !== undefined && row[found] !== undefined && row[found] !== '') return row[found]
    }
    return undefined
  }

  const handleDownloadTemplateCli = () => {
    const template = [
      { 'Nome': 'Maria Silva', 'Email': 'maria@email.com', 'Telefone': '617-555-0100', 'Endereco': '123 Main St', 'Cidade': 'Framingham', 'Estado': 'MA', 'CEP': '01701', 'Data Nascimento': '1990-01-15', 'Empresa': '', 'Observacoes': '' }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo')
    XLSX.writeFile(wb, 'modelo_clientes.xlsx')
    toast.success('Modelo baixado!')
  }

  const handleImportClientes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    toast.info('Importando clientes...')
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (rows.length === 0) { toast.error('Planilha vazia ou formato inv\u00e1lido'); return }
        let count = 0
        let duplicados = 0
        let skipped = 0
        for (const row of rows) {
          const nome = getColCli(row, 'Nome', 'name', 'cliente', 'client', 'nome completo', 'full name')
          if (!nome) { skipped++; continue }
          const email = String(getColCli(row, 'Email', 'email', 'e-mail') || '').toLowerCase().trim()
          const telefone = String(getColCli(row, 'Telefone', 'telefone', 'phone', 'tel', 'celular') || '').trim()
          // Check duplicate
          if (email) {
            const snap = await getDocs(query(collection(db, 'clientes'), where('email', '==', email)))
            if (!snap.empty) { duplicados++; continue }
          }
          if (telefone && !email) {
            const snap = await getDocs(query(collection(db, 'clientes'), where('telefone', '==', telefone)))
            if (!snap.empty) { duplicados++; continue }
          }
          await addDoc(collection(db, 'clientes'), {
            nome: String(nome).trim(),
            email,
            telefone,
            endereco: String(getColCli(row, 'Endereco', 'Endere\u00e7o', 'endereco', 'address') || '').trim(),
            cidade: String(getColCli(row, 'Cidade', 'cidade', 'city') || '').trim(),
            estado: String(getColCli(row, 'Estado', 'estado', 'state') || '').trim(),
            cep: String(getColCli(row, 'CEP', 'cep', 'zip', 'zipcode') || '').trim(),
            data_nascimento: String(getColCli(row, 'Data Nascimento', 'data_nascimento', 'birthday', 'nascimento') || '').trim(),
            empresa: String(getColCli(row, 'Empresa', 'empresa', 'company') || '').trim(),
            observacoes: String(getColCli(row, 'Observacoes', 'Observa\u00e7\u00f5es', 'observacoes', 'notes') || '').trim(),
            vendedor_id: user?.uid || '',
            ativo: true,
            created_at: Timestamp.now(),
          })
          count++
        }
        if (count === 0 && duplicados === 0) {
          toast.error(`Nenhum cliente importado. Verifique se a planilha tem coluna "Nome". Linhas ignoradas: ${skipped}`)
        } else {
          let msg = `${count} cliente(s) importado(s)!`
          if (duplicados > 0) msg += ` (${duplicados} duplicado(s) ignorado(s))`
          toast.success(msg)
          fetchClientes()
        }
      } catch(err) {
        console.error('Erro importa\u00e7\u00e3o clientes:', err)
        toast.error('Erro ao ler planilha. Verifique se o arquivo \u00e9 .xlsx ou .csv v\u00e1lido.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'clientes', deleteConfirm.id))
      toast.success(`Cliente ${deleteConfirm.nome} excluído!`)
      setDeleteConfirm(null)
      fetchClientes()
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir cliente')
    } finally {
      setDeleting(false)
    }
  }

  return (

    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Clientes
          </h1>

          <p className="text-gray-500">
            Gerencie os clientes da BBVIC
          </p>

        </div>

        <input ref={importClienteRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportClientes}/>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportClientes}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            <Download className="w-4 h-4"/> Exportar
          </button>
          <button
            onClick={handleDownloadTemplateCli}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#C9A227]/50 text-[#C9A227] text-sm hover:bg-[#C9A227]/5"
          >
            <Download className="w-4 h-4"/> Baixar Modelo
          </button>
          <button
            onClick={() => importClienteRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            <Upload className="w-4 h-4"/> Importar
          </button>
          <button
            onClick={() => navigate("/clientes/novo")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A227] text-white hover:bg-[#9A7B1A]"
          >
            <Plus className="w-5 h-5" />
            Novo Cliente
          </button>
        </div>

      </div>


      {/* SEARCH */}

      <div className="relative">

        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]"
        />

      </div>


      {/* LISTA */}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">

        {filteredClientes.length === 0 ? (

          <div className="text-center py-12">

            <Users className="w-10 h-10 text-gray-400 mx-auto mb-3" />

            <p className="text-gray-500">
              Nenhum cliente encontrado
            </p>

          </div>

        ) : (
          <>
          <table className="w-full hidden sm:table">

            <thead className="bg-gray-50 border-b">

              <tr className="text-left text-sm text-gray-600">

                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Telefone</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>

              </tr>

            </thead>

            <tbody>

              {filteredClientes.map(cliente => (

                <tr
                  key={cliente.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/clientes/${cliente.id}`)}
                >

                  <td className="px-6 py-4">

                    <div className="flex items-center gap-3">

                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C9A227] to-[#9A7B1A] flex items-center justify-center">

                        <span className="text-white text-xs font-bold">

                          {cliente.nome
                            .split(" ")
                            .map(n => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()}

                        </span>

                      </div>

                      <span className="font-medium text-gray-900">

                        {cliente.nome}

                      </span>

                    </div>

                  </td>

                  <td className="px-6 py-4 text-gray-600">

                    {cliente.telefone}

                  </td>

                  <td className="px-6 py-4">

                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        cliente.status === "ativo"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >

                      {cliente.status}

                    </span>

                  </td>

                  <td className="px-6 py-4 text-right">

                    <button
                      className="text-sm text-[#C9A227] hover:underline"
                    >
                      Ver
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: cliente.id!, nome: cliente.nome }) }}
                      className="p-2 rounded-xl text-red-400 hover:bg-red-50 transition-colors ml-1"
                      title="Excluir cliente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-gray-100">
            {filteredClientes.map(cliente => (
              <div key={cliente.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C9A227] to-[#9A7B1A] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{cliente.nome?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{cliente.nome}</p>
                    <p className="text-xs text-gray-400 truncate">{cliente.telefone || cliente.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cliente.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {cliente.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                  <button onClick={() => navigate(`/clientes/${cliente.id}/editar`)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: cliente.id!, nome: cliente.nome }) }}
                    className="p-2 rounded-xl text-red-400 hover:bg-red-50 transition-colors"
                    title="Excluir cliente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          </>
        )}

      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Excluir Cliente</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir <span className="font-semibold text-gray-900">{deleteConfirm.nome}</span>? Os orçamentos e faturas vinculados não serão removidos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2"
              >
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