import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { Mail, LogIn, Sparkles, ArrowLeft } from 'lucide-react'

export function PortalLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const emailNormalized = email.trim().toLowerCase()
      const snap = await getDocs(collection(db, 'clientes'))
      const clienteDoc = snap.docs.find(d => {
        const data = d.data()
        const storedEmail = (data.email || '').trim().toLowerCase()
        return storedEmail === emailNormalized && data.ativo !== false
      })
      if (!clienteDoc) {
        toast.error('Email não encontrado. Entre em contato com o administrador.')
        setLoading(false)
        return
      }
      const cliente = { id: clienteDoc.id, ...clienteDoc.data() } as any
      sessionStorage.setItem('portal_cliente', JSON.stringify({ id: cliente.id, nome: cliente.nome, email: cliente.email }))
      navigate('/portal/dashboard')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao verificar acesso. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#C9A227]/5 rounded-full blur-3xl"/>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#C9A227]/8 rounded-full blur-2xl"/>
        {[...Array(20)].map((_,i) => (
          <div key={i} className="absolute animate-pulse" style={{ left:`${(i*17+7)%100}%`, top:`${(i*23+13)%100}%`, animationDelay:`${i*0.3}s`, animationDuration:`${2+i%3}s` }}>
            <Sparkles className="w-2 h-2 text-[#C9A227]/20"/>
          </div>
        ))}
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A227]/15 border border-[#C9A227]/30 mb-4">
            <img src="/logo-bbvic.jpg" alt="BBVIC" className="w-10 h-10 rounded-xl object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">BBVIC Hair Care</h1>
          <p className="text-[#C9A227] text-sm font-medium">Portal do Cliente</p>
          <p className="text-gray-500 text-xs mt-2">Acesse seus orçamentos, faturas e histórico de compras</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-2">Acessar minha conta</h2>
          <p className="text-gray-400 text-sm mb-6">Digite o email cadastrado no sistema para acessar seu portal.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email cadastrado</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]/30 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 rounded-xl bg-[#C9A227] text-black font-bold text-sm hover:bg-[#e0b52d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/>
              ) : (
                <>
                  <LogIn className="w-4 h-4"/>
                  Acessar Portal
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500">
              Não consegue acessar? Entre em contato com a BBVIC Hair Care.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => navigate('/login')} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors mx-auto">
            <ArrowLeft className="w-3 h-3"/> Voltar ao login administrativo
          </button>
        </div>
      </div>
    </div>
  )
}
