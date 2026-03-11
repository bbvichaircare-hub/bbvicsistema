import { useState, useRef, useEffect } from 'react';
import { Bell, Check, Eye, CheckCircle, XCircle, FileText, DollarSign } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// Função para formatar data relativa
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Agora';
  if (diffMins < 60) return `${diffMins} min atrás`;
  if (diffHours < 24) return `${diffHours} h atrás`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  return date.toLocaleDateString('pt-BR');
}

export function NotificationsDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (tipo: string) => {
    switch (tipo) {
      case 'estimate_visualizado':
        return <Eye className="w-4 h-4 text-purple-500" />;
      case 'estimate_aprovado':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'estimate_recusado':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'invoice_visualizado':
        return <Eye className="w-4 h-4 text-blue-500" />;
      case 'invoice_pago':
        return <DollarSign className="w-4 h-4 text-green-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const handleNotificationClick = async (notification: any) => {
    await markAsRead(notification.id);
    
    // Navigate based on notification type
    if (notification.documento_tipo === 'estimate') {
      navigate('/estimates');
    } else if (notification.documento_tipo === 'invoice') {
      navigate('/invoices');
    }
    
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-[#C9A227] hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Marcar todas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                    !notification.lida && "bg-yellow-50/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      !notification.lida ? "bg-yellow-100" : "bg-gray-100"
                    )}>
                      {getNotificationIcon(notification.tipo)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-medium",
                        !notification.lida ? "text-gray-900" : "text-gray-600"
                      )}>
                        {notification.titulo}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {notification.mensagem}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {notification.created_at?.toDate
                          ? formatRelativeTime(notification.created_at.toDate())
                          : 'Agora'}
                      </p>
                    </div>
                    {!notification.lida && (
                      <span className="w-2 h-2 bg-[#C9A227] rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
