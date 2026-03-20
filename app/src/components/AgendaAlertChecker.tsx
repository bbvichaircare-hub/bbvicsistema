import { useEffect, useRef, useState } from 'react'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { Calendar, X, Clock } from 'lucide-react'

interface AlertaAgenda {
  id: string
  cliente_nome: string
  servico: string
  hora: string
  data: Date
  tipo: 'agora' | '30min'
}

export function AgendaAlertChecker() {
  const { user, isAdmin } = useAuth()
  const [alertas, setAlertas] = useState<AlertaAgenda[]>([])
  const alertadosRef = useRef<Set<string>>(new Set(
    JSON.parse(localStorage.getItem('bbvic_alertas_vistos') || '[]')
  ))

  const marcarVisto = (key: string) => {
    alertadosRef.current.add(key)
    localStorage.setItem('bbvic_alertas_vistos', JSON.stringify([...alertadosRef.current]))
  }

  const checarAgendamentos = async () => {
    if (!user) return
    try {
      const agora = new Date()
      const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0)
      const hojeFim = new Date(); hojeFim.setHours(23, 59, 59, 999)

      const q = isAdmin
        ? query(collection(db, 'agenda'), where('data', '>=', Timestamp.fromDate(hojeInicio)), where('data', '<=', Timestamp.fromDate(hojeFim)))
        : query(collection(db, 'agenda'), where('vendedor_id', '==', user.uid), where('data', '>=', Timestamp.fromDate(hojeInicio)), where('data', '<=', Timestamp.fromDate(hojeFim)))

      const snap = await getDocs(q)
      const novosAlertas: AlertaAgenda[] = []

      snap.docs.forEach(d => {
        const a = { id: d.id, ...d.data() } as any
        if (['cancelado', 'concluido'].includes(a.status)) return

        const baseDate: Date = a.data?.toDate ? a.data.toDate() : new Date(a.data)
        const [horaStr, minStr] = (a.hora || '09:00').split(':')
        const dataEvento = new Date(baseDate)
        dataEvento.setHours(parseInt(horaStr), parseInt(minStr), 0, 0)

        const diffMin = (dataEvento.getTime() - agora.getTime()) / 60000

        const key30 = `${a.id}_30min_${dataEvento.toISOString().split('T')[0]}`
        if (diffMin >= -2 && diffMin <= 32 && !alertadosRef.current.has(key30)) {
          novosAlertas.push({ id: key30, cliente_nome: a.cliente_nome, servico: a.servico, hora: a.hora, data: dataEvento, tipo: '30min' })
        }

        const keyNow = `${a.id}_agora_${dataEvento.toISOString().split('T')[0]}`
        if (diffMin >= -2 && diffMin <= 5 && !alertadosRef.current.has(keyNow)) {
          novosAlertas.push({ id: keyNow, cliente_nome: a.cliente_nome, servico: a.servico, hora: a.hora, data: dataEvento, tipo: 'agora' })
        }
      })

      if (novosAlertas.length > 0) {
        setAlertas(prev => {
          const existingIds = new Set(prev.map(a => a.id))
          const reais = novosAlertas.filter(a => !existingIds.has(a.id))
          return reais.length > 0 ? [...prev, ...reais] : prev
        })
        // iOS Safari não suporta Notification API — verificar antes de usar
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          novosAlertas.forEach(a => {
            new Notification(`📅 Agendamento ${a.tipo === '30min' ? 'em 30 min' : 'AGORA'}`, {
              body: `${a.servico} — ${a.cliente_nome} às ${a.hora}`,
              icon: '/logo-bbvic.jpg',
            })
          })
        }
      }
    } catch { /* silently ignore */ }
  }

  useEffect(() => {
    if (!user) return
    // iOS Safari não tem Notification API — verificar antes de usar
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    checarAgendamentos()
    const interval = setInterval(checarAgendamentos, 60000)
    return () => clearInterval(interval)
  }, [user])

  const fecharAlerta = (id: string) => {
    marcarVisto(id)
    setAlertas(prev => prev.filter(a => a.id !== id))
  }

  if (alertas.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-3 max-w-sm w-full">
      {alertas.map(alerta => (
        <div
          key={alerta.id}
          className={`rounded-2xl shadow-2xl border-2 p-4 flex gap-3 items-start animate-in slide-in-from-right-5 duration-300 ${
            alerta.tipo === 'agora'
              ? 'bg-red-50 border-red-400'
              : 'bg-amber-50 border-[#C9A227]'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            alerta.tipo === 'agora' ? 'bg-red-500' : 'bg-[#C9A227]'
          }`}>
            {alerta.tipo === 'agora'
              ? <Calendar className="w-5 h-5 text-white" />
              : <Clock className="w-5 h-5 text-white" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${alerta.tipo === 'agora' ? 'text-red-700' : 'text-amber-800'}`}>
              {alerta.tipo === 'agora' ? '🔴 Agendamento AGORA!' : '⏰ Agendamento em 30 minutos'}
            </p>
            <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{alerta.servico}</p>
            <p className="text-xs text-gray-600">Cliente: {alerta.cliente_nome}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {alerta.hora}
            </p>
          </div>
          <button
            onClick={() => fecharAlerta(alerta.id)}
            className="p-1 rounded-lg hover:bg-black/10 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
