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

// Items visible to ALL authenticated users (admin + vendor)
const vendorItems = [
  { path: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/clientes',   icon: Users,           label: 'Clientes' },
  { path: '/estimates',  icon: ClipboardList,   label: 'Orçamentos' },
  { path: '/invoices',   icon: Receipt,         label: 'Faturas' },
  { path: '/agenda',     icon: Calendar,        label: 'Agenda' },
  { path: '/produtos',   icon: Package,         label: 'Produtos' },
];

// Items visible only to admin
const adminOnlyItems = [
  { path: '/contas-receber',  icon: TrendingUp,      label: 'Contas a Receber' },
  { path: '/despesas',        icon: TrendingDown,    label: 'Despesas' },
  { path: '/estoque',         icon: Package,         label: 'Estoque' },
  { path: '/compras',         icon: ShoppingCart,    label: 'Compras' },
  { path: '/vendedores',      icon: Shield,          label: 'Vendedores' },
  { path: '/comissoes',       icon: Percent,         label: 'Comissões' },
  { path: '/relatorios',      icon: BarChart3,       label: 'Relatórios' },
  { path: '/relatorios/impostos', icon: Calculator,  label: 'Impostos' },
  { path: '/backup',          icon: Shield,          label: 'Backup' },
];

export function Sidebar({ isOpen, onClose, isMobile }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  };

  const Item = ({ path, icon: Icon, label }: typeof vendorItems[0]) => {
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
        {/* Vendor items (visible to all) */}
        {vendorItems.map(item => <Item key={item.path} {...item} />)}

        {/* Admin-only items */}
        {isAdmin && (
          <>
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Administração</p>
            {adminOnlyItems.map(item => <Item key={item.path} {...item} />)}
          </>
        )}
      </nav>

      {/* Rodapé */}
      <div className="border-t border-gray-100 px-2 py-3 space-y-0.5">
        <Item path="/perfil" icon={UserCircle} label="Meu Perfil" />
        {isAdmin && <Item path="/configuracoes" icon={Settings} label="Configurações" />}

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
