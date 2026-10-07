import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Search, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { AgendaAlertChecker } from '@/components/AgendaAlertChecker'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);

      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex">

      {/* SIDEBAR */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />

      {/* MAIN */}
      <div
        className={cn(
          "flex flex-col flex-1 transition-all duration-300",
          isMobile ? "ml-0" : sidebarOpen ? "ml-64" : "ml-20"
        )}
      >

        {/* MOBILE HEADER */}
        <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="font-bold text-gray-900 text-lg">
              BBVIC
            </span>
          </div>

          <NotificationsDropdown />
        </header>

        {/* DESKTOP HEADER */}
        <header className="hidden lg:flex h-16 bg-white border-b border-gray-200 items-center justify-between px-6 sticky top-0 z-40 shadow-sm">

          {/* SEARCH */}
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

              <input
                type="text"
                placeholder="Buscar clientes, faturas..."
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-gray-100 border border-gray-200
                text-gray-900 text-sm placeholder:text-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#6F2738]/30"
              />
            </div>
          </div>

          {/* USER */}
          <div className="flex items-center gap-4">

            <NotificationsDropdown />

            {user && (
              <div className="flex items-center gap-3">

                {(user as any).foto_url ? (
                  <img
                    src={(user as any).foto_url}
                    alt={user.nome}
                    className="w-9 h-9 rounded-full object-cover border-2 border-[#6F2738]/30 shadow"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6F2738] to-[#4A1A26] flex items-center justify-center shadow">
                    <span className="text-white text-xs font-bold">
                      {user.nome?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="hidden xl:block leading-tight">
                  <p className="text-sm font-semibold text-gray-900">
                    {user.nome}
                  </p>

                  <p className="text-xs text-gray-500">
                    {user.role === 'admin'
                      ? 'Administrador'
                      : 'Vendedor'}
                  </p>
                </div>

              </div>
            )}
          </div>

        </header>

        {/* PAGE CONTENT */}
        <div className="flex-1 pt-20 px-3 pb-6 lg:pt-6 lg:px-6">

          <div className="max-w-[1400px] mx-auto">

            <Outlet />

          </div>

        </div>

      </div>

      {/* OVERLAY MOBILE */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <AgendaAlertChecker />

    </div>
  );
}