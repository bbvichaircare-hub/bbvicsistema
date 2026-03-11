import { useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Download, Database, Shield, CheckCircle, Loader2, Archive, Clock, HardDrive } from 'lucide-react'

const COLLECTIONS = [
  { id: 'invoices',           label: 'Faturas',              color: 'bg-green-100 text-green-700' },
  { id: 'estimates',          label: 'Orçamentos',           color: 'bg-yellow-100 text-yellow-700' },
  { id: 'clientes',           label: 'Clientes',             color: 'bg-blue-100 text-blue-700' },
  { id: 'produtos',           label: 'Produtos',             color: 'bg-purple-100 text-purple-700' },
  { id: 'expenses',           label: 'Despesas',             color: 'bg-red-100 text-red-700' },
  { id: 'vendedores',         label: 'Vendedores',           color: 'bg-pink-100 text-pink-700' },
  { id: 'contas_pagar',       label: 'Compras/Contas Pagar', color: 'bg-orange-100 text-orange-700' },
  { id: 'movimentos_estoque', label: 'Histórico Estoque',    color: 'bg-amber-100 text-amber-700' },
  { id: 'comissoes',          label: 'Comissões',            color: 'bg-indigo-100 text-indigo-700' },
  { id: 'agendamentos',       label: 'Agendamentos',         color: 'bg-cyan-100 text-cyan-700' },
  { id: 'audit_log',          label: 'Log de Auditoria',     color: 'bg-gray-100 text-gray-700' },
]

const toExcelSafe = (val: any): any => {
  if (val === null || val === undefined) return ''
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não'
  if (val?.toDate) return val.toDate().toLocaleString('pt-BR')
  if (val instanceof Date) return val.toLocaleString('pt-BR')
  if (typeof val === 'object') return JSON.stringify(val)
  return val
}

export function Backup() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ col: string; status: 'pending' | 'loading' | 'done' | 'error'; count: number }[]>(
    COLLECTIONS.map(c => ({ col: c.id, status: 'pending', count: 0 }))
  )
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem('bbvic_last_backup'))
  const [done, setDone] = useState(false)

  const handleBackup = async () => {
    setLoading(true)
    setDone(false)
    setProgress(COLLECTIONS.map(c => ({ col: c.id, status: 'pending', count: 0 })))

    try {
      const wb = XLSX.utils.book_new()
      const now = new Date()

      for (const col of COLLECTIONS) {
        setProgress(prev => prev.map(p => p.col === col.id ? { ...p, status: 'loading' } : p))
        try {
          const snap = await getDocs(collection(db, col.id))
          const rows = snap.docs.map(d => {
            const data = d.data()
            const row: Record<string, any> = { id: d.id }
            for (const [k, v] of Object.entries(data)) {
              row[k] = toExcelSafe(v)
            }
            return row
          })
          if (rows.length > 0) {
            const ws = XLSX.utils.json_to_sheet(rows)
            XLSX.utils.book_append_sheet(wb, ws, col.label.substring(0, 31))
          } else {
            const ws = XLSX.utils.aoa_to_sheet([['Sem dados neste período']])
            XLSX.utils.book_append_sheet(wb, ws, col.label.substring(0, 31))
          }
          setProgress(prev => prev.map(p => p.col === col.id ? { ...p, status: 'done', count: rows.length } : p))
        } catch (e) {
          console.error(`Error backing up ${col.id}:`, e)
          setProgress(prev => prev.map(p => p.col === col.id ? { ...p, status: 'error' } : p))
        }
      }

      // Metadata sheet
      const metaData = [
        ['BBVIC GESTÃO - BACKUP COMPLETO'],
        ['Data do Backup', now.toLocaleString('pt-BR')],
        ['Sistema', 'BBVIC Gestão Premium'],
        ['URL', 'https://bbvic-gestao-premium.web.app'],
        [''],
        ['Coleção', 'Registros'],
        ...COLLECTIONS.map(c => [c.label, progress.find(p => p.col === c.id)?.count || 0]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaData), 'Info')

      const filename = `BBVIC_Backup_${now.toISOString().split('T')[0]}_${now.toTimeString().slice(0,5).replace(':','h')}.xlsx`
      XLSX.writeFile(wb, filename)

      const nowStr = now.toLocaleString('pt-BR')
      localStorage.setItem('bbvic_last_backup', nowStr)
      setLastBackup(nowStr)
      setDone(true)
      toast.success('Backup completo! Arquivo salvo.')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao fazer backup')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Backup do Sistema</h1>
          <p className="text-gray-500 text-sm mt-0.5">Exporte todos os dados do sistema para segurança</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
          <HardDrive className="w-6 h-6 text-blue-600"/>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400"/>
            <span className="text-xs font-medium text-gray-500">Último Backup</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">{lastBackup || 'Nunca realizado'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-gray-400"/>
            <span className="text-xs font-medium text-gray-500">Coleções</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">{COLLECTIONS.length} coleções incluídas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-gray-400"/>
            <span className="text-xs font-medium text-gray-500">Formato</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">Excel (.xlsx)</p>
        </div>
      </div>

      {/* Main Action */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Archive className="w-6 h-6 text-green-600"/>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Backup Completo</h2>
            <p className="text-gray-500 text-sm mt-1">
              Exporta todos os dados do sistema (faturas, orçamentos, clientes, estoque, despesas, comissões, auditoria...) em um único arquivo Excel com múltiplas abas.
            </p>
          </div>
        </div>

        {/* Progress */}
        {loading && (
          <div className="mb-5 space-y-2">
            {COLLECTIONS.map(col => {
              const p = progress.find(x => x.col === col.id)
              return (
                <div key={col.id} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                    {p?.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500"/>}
                    {p?.status === 'loading' && <Loader2 className="w-4 h-4 text-[#C9A227] animate-spin"/>}
                    {p?.status === 'error' && <span className="text-red-400 text-xs">✕</span>}
                    {p?.status === 'pending' && <div className="w-3 h-3 rounded-full bg-gray-200"/>}
                  </div>
                  <span className="text-sm text-gray-600 flex-1">{col.label}</span>
                  {p?.status === 'done' && <span className="text-xs text-gray-400">{p.count} registros</span>}
                </div>
              )
            })}
          </div>
        )}

        {done && !loading && (
          <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-green-700">Backup realizado com sucesso!</p>
              <p className="text-xs text-green-600 mt-0.5">O arquivo foi baixado automaticamente para o seu computador.</p>
            </div>
          </div>
        )}

        <button
          onClick={handleBackup}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gray-900 font-semibold text-sm hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin"/> Fazendo backup...</>
          ) : (
            <><Download className="w-4 h-4"/> Fazer Backup Completo</>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          Recomendamos fazer backup semanalmente. O arquivo fica salvo no seu computador.
        </p>
      </div>

      {/* Collections List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">O que está incluído no backup:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {COLLECTIONS.map(col => (
            <div key={col.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-gray-50">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${col.color}`}>{col.label}</span>
              <span className="text-xs text-gray-400 font-mono">{col.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
