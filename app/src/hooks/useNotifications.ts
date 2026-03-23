import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  usuario_id?: string;
  created_at: any;
}

export function useNotifications() {
  const { user, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<Notificacao[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    // Para admin: busca todas. Para vendedor: busca todas e filtra client-side
    // (evita erro de índice composto no Firebase)
    const q = query(collection(db, 'notificacoes'), orderBy('created_at', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Notificacao[];

      if (!isAdmin) {
        // Mostra notificações destinadas ao vendedor OU sem usuario_id (globais)
        data = data.filter(n =>
          !n.usuario_id || n.usuario_id === user.uid
        );
      }

      setNotifications(data);
      setUnreadCount(data.filter(n => !n.lida).length);
      setLoading(false);
    }, () => { setLoading(false); });

    return () => unsubscribe();
  }, [user?.uid, isAdmin]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notificacoes', id), { lida: true });
    } catch { console.error('Erro ao marcar como lida') }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.lida).forEach(n => {
        batch.update(doc(db, 'notificacoes', n.id), { lida: true });
      });
      await batch.commit();
    } catch { console.error('Erro ao marcar todas como lidas') }
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead };
}
