import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { Mail, LogIn, Loader2, ShoppingBag, Receipt, Clock } from 'lucide-react'

const SPARKS = [
  { top:'8%',  left:'10%', s:12, d:0,   du:2.8 },
  { top:'15%', left:'80%', s:9,  d:0.6, du:3.3 },
  { top:'26%', left:'40%', s:16, d:1.1, du:2.6 },
  { top:'40%', left:'88%', s:11, d:0.4, du:3.5 },
  { top:'55%', left:'6%',  s:14, d:1.8, du:2.9 },
  { top:'68%', left:'75%', s:10, d:0.6, du:3.2 },
  { top:'80%', left:'25%', s:18, d:1.3, du:2.7 },
  { top:'90%', left:'55%', s:8,  d:0.2, du:3.6 },
]

function Spark({ top, left, s, d, du }: typeof SPARKS[0]) {
  return (
    <div className="absolute pointer-events-none" style={{ top, left, animation: `portalSpark ${du}s ease-in-out ${d}s infinite` }}>
      <svg width={s} height={s} viewBox="0 0 24 24">
        <path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z" fill="#6F2738" opacity="0.5" />
      </svg>
    </div>
  )
}

const perks = [
  { icon: Receipt, text: 'Suas faturas e orçamentos em um só lugar' },
  { icon: ShoppingBag, text: 'Histórico completo de compras' },
  { icon: Clock, text: 'Acompanhe status e vencimentos em tempo real' },
]

export function PortalLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const emailTrimmed = email.trim()
      const emailNormalized = emailTrimmed.toLowerCase()
      const variantes = Array.from(new Set([
        emailTrimmed,
        emailNormalized,
        emailNormalized.toUpperCase(),
        emailNormalized.charAt(0).toUpperCase() + emailNormalized.slice(1),
      ]))
      const snap = await getDocs(query(collection(db, 'clientes'), where('email', 'in', variantes)))
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
    <>
      <style>{`
        @keyframes portalSpark {
          0%,100%{ opacity:0; transform:scale(.3) rotate(0deg); }
          40%{ opacity:1; transform:scale(1.2) rotate(25deg); }
          70%{ opacity:.5; transform:scale(.7) rotate(-12deg); }
        }
        @keyframes portalFloatY {
          0%,100%{ transform:translateY(0); }
          50%{ transform:translateY(-8px); }
        }
        @keyframes portalFadeIn {
          from{ opacity:0; transform:translateY(14px); }
          to{ opacity:1; transform:translateY(0); }
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #F7F3EE 0%, #F0E6E0 40%, #F7F3EE 100%)' }}>

        {/* Soft radial blob */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 40%, rgba(111,39,56,0.10) 0%, transparent 70%)' }} />

        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage:'linear-gradient(#193654 1px,transparent 1px),linear-gradient(90deg,#193654 1px,transparent 1px)', backgroundSize:'48px 48px' }} />

        {/* Sparks */}
        {SPARKS.map((s,i) => <Spark key={i} {...s} />)}

        <div className="w-full max-w-md relative z-10" style={{ animation:'portalFadeIn .6s ease both' }}>
          {/* Logo */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center mb-3" style={{ animation:'portalFloatY 4s ease-in-out infinite' }}>
              <img src="/bbvic-logo-new.png" alt="BBVIC" className="h-24 w-auto object-contain drop-shadow-sm" />
            </div>
            <div className="flex items-center gap-3 justify-center mb-2">
              <div className="h-px flex-1 max-w-[50px]" style={{ background:'linear-gradient(to right,transparent,#6F2738)' }} />
              <span className="text-[#6F2738] text-xs font-semibold tracking-[0.28em] uppercase">Portal do Cliente</span>
              <div className="h-px flex-1 max-w-[50px]" style={{ background:'linear-gradient(to left,transparent,#6F2738)' }} />
            </div>
            <p className="text-gray-500 text-sm">Acesse seus orçamentos, faturas e histórico de compras</p>
          </div>

          {/* Card */}
          <div className="bg-white border border-[#e8ddd6] rounded-3xl p-8 shadow-xl"
            style={{ boxShadow: '0 12px 40px rgba(111,39,56,0.10)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-1">Acessar minha conta</h2>
            <p className="text-gray-400 text-sm mb-6">Digite o email cadastrado no sistema para acessar seu portal.</p>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Email cadastrado</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-sm placeholder-gray-300 outline-none transition-all duration-200 focus:bg-white focus:border-[#6F2738]"
                    style={{ boxShadow:'inset 0 1px 3px rgba(0,0,0,0.04)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: (loading || !email)
                    ? '#8a3a4d'
                    : 'linear-gradient(135deg,#6F2738 0%,#8B3348 45%,#4A1A26 100%)',
                  boxShadow: (loading || !email) ? 'none' : '0 6px 28px rgba(111,39,56,0.45)',
                }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin"/>Verificando...</>
                ) : (
                  <><LogIn className="w-4 h-4"/>Acessar Portal</>
                )}
              </button>
            </form>

            {/* Perks */}
            <div className="mt-6 pt-5 border-t border-gray-100 space-y-2.5">
              {perks.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <p.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color:'#6F2738' }} />
                  <span className="text-gray-500 text-xs">{p.text}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-5 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Não consegue acessar? Entre em contato com a BBVIC Hair Care.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
