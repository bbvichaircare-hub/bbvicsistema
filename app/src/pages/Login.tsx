import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const SPARKS = [
  { top:'6%',  left:'8%',  s:14, d:0,    du:2.8 },
  { top:'12%', left:'72%', s:10, d:0.7,  du:3.3 },
  { top:'20%', left:'45%', s:18, d:1.2,  du:2.6 },
  { top:'32%', left:'88%', s:12, d:0.4,  du:3.5 },
  { top:'48%', left:'5%',  s:16, d:1.9,  du:2.9 },
  { top:'60%', left:'80%', s:11, d:0.6,  du:3.2 },
  { top:'70%', left:'30%', s:20, d:1.4,  du:2.7 },
  { top:'80%', left:'60%', s:9,  d:0.2,  du:3.6 },
  { top:'88%', left:'18%', s:15, d:1.0,  du:2.5 },
  { top:'92%', left:'85%', s:13, d:0.8,  du:3.0 },
  { top:'38%', left:'55%', s:8,  d:2.1,  du:2.4 },
  { top:'55%', left:'40%', s:17, d:0.3,  du:3.4 },
];

function Spark({ top, left, s, d, du }: typeof SPARKS[0]) {
  return (
    <div className="absolute pointer-events-none" style={{ top, left, animation: `spark ${du}s ease-in-out ${d}s infinite` }}>
      <svg width={s} height={s} viewBox="0 0 24 24">
        <path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z" fill="#C9A227" opacity="0.65" />
      </svg>
    </div>
  );
}

const features = [
  'Faturas & Orçamentos profissionais',
  'Controle financeiro em tempo real',
  'Gestão de clientes e equipes',
  'Relatórios e análises completas',
];

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Preencha email e senha'); return; }
    setLoading(true);
    try {
      await login(email, password);
      import('@/lib/auditLog').then(({ logActivity }) => logActivity(`Login realizado`, `Usuário ${email} fez login`, 'login')).catch(() => {});
      navigate('/');
    }
    catch (err: any) { toast.error(err.message || 'Erro ao fazer login'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <style>{`
        @keyframes spark {
          0%,100%{ opacity:0; transform:scale(.3) rotate(0deg); }
          40%{ opacity:1; transform:scale(1.2) rotate(25deg); }
          70%{ opacity:.5; transform:scale(.7) rotate(-12deg); }
        }
        @keyframes floatY {
          0%,100%{ transform:translateY(0); }
          50%{ transform:translateY(-10px); }
        }
        @keyframes shimmerText {
          0%{ background-position:-200% center; }
          100%{ background-position:200% center; }
        }
        @keyframes gradientMove {
          0%{ background-position:0% 50%; }
          50%{ background-position:100% 50%; }
          100%{ background-position:0% 50%; }
        }
        @keyframes fadeSlideIn {
          from{ opacity:0; transform:translateX(-18px); }
          to{ opacity:1; transform:translateX(0); }
        }
        @keyframes fadeSlideInRight {
          from{ opacity:0; transform:translateX(18px); }
          to{ opacity:1; transform:translateX(0); }
        }
      `}</style>

      <div className="min-h-screen flex bg-white">

        {/* ── LEFT PANEL ── */}
        <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden p-14"
          style={{ background: 'linear-gradient(145deg, #fffdf5 0%, #fff8e8 40%, #fffef8 100%)' }}>

          {/* Soft radial blob */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 48%, rgba(201,162,39,0.10) 0%, transparent 70%)' }} />

          {/* Animated grid lines */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage:'linear-gradient(#C9A227 1px,transparent 1px),linear-gradient(90deg,#C9A227 1px,transparent 1px)', backgroundSize:'48px 48px' }} />

          {/* Sparks */}
          {SPARKS.map((s,i) => <Spark key={i} {...s} />)}

          {/* Content */}
          <div className="relative z-10 text-center" style={{ animation:'fadeSlideIn .7s ease both' }}>

            {/* Brand name */}
            <div className="mb-6" style={{ animation:'floatY 4s ease-in-out infinite' }}>
              <h1 className="text-8xl font-black tracking-tight"
                style={{
                  background:'linear-gradient(90deg,#9A7B1A,#C9A227,#F0D060,#C9A227,#9A7B1A)',
                  backgroundSize:'200% auto',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                  animation:'shimmerText 3.5s linear infinite',
                  lineHeight:1.05,
                }}>
                BBVIC
              </h1>
              <p className="text-gray-400 text-sm font-semibold tracking-[0.28em] uppercase mt-2">Gestão Premium</p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6 justify-center">
              <div className="h-px flex-1 max-w-[60px]" style={{ background:'linear-gradient(to right,transparent,#C9A227)' }} />
              <span className="text-[#C9A227] text-xs">✦</span>
              <div className="h-px flex-1 max-w-[60px]" style={{ background:'linear-gradient(to left,transparent,#C9A227)' }} />
            </div>

            {/* Tagline */}
            <p className="text-gray-500 text-base leading-relaxed font-medium mb-8 max-w-xs mx-auto">
              Sistema de gestão profissional de vendas.<br/>
              <span className="text-gray-700 font-semibold">Controle total</span> de finanças, clientes, vendas e equipes.
            </p>

            {/* Feature list */}
            <div className="flex flex-col gap-2.5 items-start max-w-xs mx-auto">
              {features.map((f,i) => (
                <div key={f} className="flex items-center gap-3"
                  style={{ animation:`fadeSlideIn .5s ease ${0.3 + i*0.1}s both` }}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color:'#C9A227' }} />
                  <span className="text-gray-600 text-sm">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom badge */}
          <div className="absolute bottom-7 left-0 right-0 flex justify-center">
            <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-medium"
              style={{ borderColor:'rgba(201,162,39,0.3)', color:'#B89120', background:'rgba(201,162,39,0.06)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
              Sistema Online
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex items-center justify-center bg-white p-6 lg:p-12 relative overflow-hidden"
          style={{ animation:'fadeSlideInRight .7s ease both' }}>

          {/* Faint top-right decoration */}
          <div className="absolute top-0 right-0 w-80 h-80 pointer-events-none opacity-40"
            style={{ background:'radial-gradient(circle at 100% 0%, rgba(201,162,39,0.08) 0%, transparent 65%)' }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 pointer-events-none opacity-30"
            style={{ background:'radial-gradient(circle at 0% 100%, rgba(201,162,39,0.07) 0%, transparent 65%)' }} />

          <div className="w-full max-w-sm relative z-10">

            {/* Mobile logo */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <h1 className="text-5xl font-black"
                style={{ background:'linear-gradient(90deg,#9A7B1A,#C9A227,#E8C14A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'floatY 4s ease-in-out infinite' }}>
                BBVIC
              </h1>
              <p className="text-gray-400 text-xs font-semibold tracking-[0.25em] uppercase mt-1">Gestão Premium</p>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-3xl font-black text-gray-900 mb-1">Bem-vindo</h2>
              <p className="text-gray-400">Entre para acessar seu painel</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-sm placeholder-gray-300 outline-none transition-all duration-200 focus:bg-white focus:border-[#C9A227]"
                  style={{ boxShadow:'inset 0 1px 3px rgba(0,0,0,0.04)' }}
                  placeholder="seu@email.com" autoComplete="email" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Senha</label>
                <div className="relative">
                  <input type={showPass?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 pr-12 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-sm placeholder-gray-300 outline-none transition-all duration-200 focus:bg-white focus:border-[#C9A227]"
                    style={{ boxShadow:'inset 0 1px 3px rgba(0,0,0,0.04)' }}
                    placeholder="••••••••" autoComplete="current-password" />
                  <button type="button" onClick={()=>setShowPass(p=>!p)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 mt-1"
                style={{
                  background: loading
                    ? '#b8941f'
                    : 'linear-gradient(135deg,#C9A227 0%,#E8C14A 45%,#9A7B1A 100%)',
                  boxShadow: loading ? 'none' : '0 6px 28px rgba(201,162,39,0.45)',
                  transform: loading ? 'none' : undefined,
                }}
                onMouseEnter={e=>{if(!loading)(e.currentTarget as HTMLButtonElement).style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform='none'}}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Entrando...</> : 'Entrar no Sistema'}
              </button>
            </form>

            <div className="flex items-center gap-3 mt-6">
              <div className="flex-1 h-px bg-gray-100"/>
              <span className="text-gray-200 text-xs">✦</span>
              <div className="flex-1 h-px bg-gray-100"/>
            </div>
            <p className="text-center text-gray-300 text-xs mt-4">Acesso exclusivo para usuários autorizados</p>

            <p className="text-center text-gray-200 text-xs mt-5">BBVIC Gestão Premium v2.0 · {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>
    </>
  );
}
