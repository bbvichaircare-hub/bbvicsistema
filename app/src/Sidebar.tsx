import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, Receipt, Settings, UserCircle,
  LogOut, Shield, ClipboardList, X, BarChart3,
  Calculator, Percent, TrendingDown,
  TrendingUp, ShoppingCart, Calendar
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export function Sidebar({ isOpen, onClose, isMobile }: SidebarProps) {
  const { user, logout, isAdmin, temPermissao } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  };

  const Item = ({ path, icon: Icon, label }: { path: string; icon: any; label: string }) => {
    const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
    return (
      <NavLink
        to={path}
        onClick={() => isMobile && onClose()}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
          active
            ? 'bg-[#C9A227]/12 text-[#9A7B1A] font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-[#C9A227]' : 'text-gray-400')} />
        <span className="truncate">{label}</span>
      </NavLink>
    );
  };

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300',
      isMobile ? 'w-64' : 'w-56',
      isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'
    )}>

      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center justify-center flex-1">
          <img src="/logo-bbvic.jpg" alt="BBVIC" className="h-14 w-auto object-contain" />
        </div>
        {isMobile && (
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {/* Items visible to all authenticated users based on permissions */}
        {(isAdmin || temPermissao('dashboard')) && (
          <Item path="/" icon={LayoutDashboard} label="Dashboard" />
        )}
        {(isAdmin || temPermissao('clientes')) && (
          <Item path="/clientes" icon={Users} label="Clientes" />
        )}
        {(isAdmin || temPermissao('orcamentos')) && (
          <Item path="/estimates" icon={ClipboardList} label="Orçamentos" />
        )}
        {(isAdmin || temPermissao('faturas')) && (
          <Item path="/invoices" icon={Receipt} label="Faturas" />
        )}
        {(isAdmin || temPermissao('agenda')) && (
          <Item path="/agenda" icon={Calendar} label="Agenda" />
        )}
        {/* Produtos always visible to authenticated users */}
        <Item path="/produtos" icon={Package} label="Produtos" />

        {/* Admin/permission-gated items */}
        {(isAdmin || temPermissao('contas_receber') || temPermissao('despesas') || temPermissao('estoque') || temPermissao('compras') || temPermissao('vendedores') || temPermissao('comissoes') || temPermissao('relatorios')) && (
          <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Administração</p>
        )}
        {(isAdmin || temPermissao('contas_receber')) && (
          <Item path="/contas-receber" icon={TrendingUp} label="Contas a Receber" />
        )}
        {(isAdmin || temPermissao('despesas')) && (
          <Item path="/despesas" icon={TrendingDown} label="Despesas" />
        )}
        {(isAdmin || temPermissao('estoque')) && (
          <Item path="/estoque" icon={Package} label="Estoque" />
        )}
        {(isAdmin || temPermissao('compras')) && (
          <Item path="/compras" icon={ShoppingCart} label="Compras" />
        )}
        {(isAdmin || temPermissao('vendedores')) && (
          <Item path="/vendedores" icon={Shield} label="Vendedores" />
        )}
        {(isAdmin || temPermissao('comissoes')) && (
          <Item path="/comissoes" icon={Percent} label="Comissões" />
        )}
        {(isAdmin || temPermissao('relatorios')) && (
          <Item path="/relatorios" icon={BarChart3} label="Relatórios" />
        )}
        {isAdmin && (
          <Item path="/relatorios/impostos" icon={Calculator} label="Impostos" />
        )}
        {isAdmin && (
          <Item path="/backup" icon={Shield} label="Backup" />
        )}
      </nav>

      {/* Rodapé */}
      <div className="border-t border-gray-100 px-2 py-3 space-y-0.5">
        <Item path="/perfil" icon={UserCircle} label="Meu Perfil" />
        {(isAdmin || temPermissao('configuracoes')) && (
          <Item path="/configuracoes" icon={Settings} label="Configurações" />
        )}

        {user && (
          <div className="flex items-center gap-2 px-3 py-2 mt-1">
            {(user as any).foto_url ? (
              <img src={(user as any).foto_url} alt={user.nome} className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-200" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C9A227] to-[#9A7B1A] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-bold">
                  {user.nome?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{user.nome}</p>
              {isAdmin
                ? <span className="text-[9px] text-[#C9A227] font-bold">ADMIN</span>
                : <span className="text-[9px] text-blue-500 font-bold">VENDEDOR</span>
              }
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>{loggingOut ? 'Saindo...' : 'Sair'}</span>
        </button>
      </div>

    </aside>
  );
}
