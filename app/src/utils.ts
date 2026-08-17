// ============================================
// BBVIC GESTÃO - AUTH CONTEXT
// ============================================

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  type User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import type { User, CreateUserData } from '@/types';
import { toast } from 'sonner';

// ----------------------------------------
// TIPOS
// ----------------------------------------

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVendedor: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  criarVendedor: (data: CreateUserData) => Promise<User>;
  atualizarVendedor: (uid: string, data: Partial<User>) => Promise<void>;
  ativarDesativarUsuario: (uid: string, ativo: boolean) => Promise<void>;
  excluirUsuario: (uid: string) => Promise<void>;
  resetarSenha: (uid: string, novaSenha: string) => Promise<void>;
  getAllUsers: () => Promise<User[]>;
  getVendedores: () => Promise<User[]>;
  getUserById: (uid: string) => Promise<User | null>;
  refreshUser: () => Promise<void>;
}

// ----------------------------------------
// CONTEXT
// ----------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Converter Firebase User para nosso tipo User
const convertToUser = (firebaseUser: FirebaseUser, userData: any): User => {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    nome: userData.nome || '',
    role: userData.role || 'vendedor',
    ativo: userData.ativo !== false,
    telefone: userData.telefone || '',
    foto_url: userData.foto_url || '',
    avatar_url: userData.foto_url || userData.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.nome || '')}&background=random`,
    comissao_percentual: userData.comissao_percentual || 10,
    created_at: userData.created_at?.toDate() || new Date(),
    updated_at: userData.updated_at?.toDate(),
    created_by: userData.created_by,
    last_login: userData.last_login?.toDate(),
  };
};

// Secondary Firebase app — used to create/manage users without signing out the admin
const SECONDARY_APP_NAME = 'bbvic-secondary'
const firebaseConfigSecondary = {
  apiKey: "AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0",
  authDomain: "bbvic-gestao-premium.firebaseapp.com",
  projectId: "bbvic-gestao-premium",
  storageBucket: "bbvic-gestao-premium.firebasestorage.app",
  messagingSenderId: "214158661970",
  appId: "1:214158661970:web:b7b9746296f5c35159c28b"
}
const getSecondaryAuth = () => {
  const app = getApps().find(a => a.name === SECONDARY_APP_NAME) || initializeApp(firebaseConfigSecondary, SECONDARY_APP_NAME)
  return getAuth(app)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Verificar sessão ao iniciar
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Buscar dados do usuário no Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUser(convertToUser(firebaseUser, userData));
          } else {
            setUser(null);
          }
        } catch (error) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ----------------------------------------
  // AUTENTICAÇÃO
  // ----------------------------------------

  const login = async (email: string, password: string): Promise<void> => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      // Buscar dados do usuário
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error('Usuário não encontrado no banco de dados');
      }
      
      const userData = userDoc.data();
      
      if (!userData.ativo) {
        await signOut(auth);
        throw new Error('Conta desativada. Contate o administrador.');
      }
      
      // Atualizar last_login
      await updateDoc(doc(db, 'users', result.user.uid), {
        last_login: Timestamp.now()
      });
      
      setUser(convertToUser(result.user, userData));
      toast.success(`Bem-vindo, ${userData.nome}!`);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        throw new Error('Email ou senha incorretos');
      } else if (error.code === 'auth/user-not-found') {
        throw new Error('Usuário não encontrado');
      }
      throw new Error(error.message || 'Erro ao fazer login');
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setUser(null);
      toast.success('Logout realizado com sucesso');
    } catch (error: any) {
      toast.error('Erro ao fazer logout');
      throw error;
    }
  };

  // ----------------------------------------
  // GERENCIAMENTO DE USUÁRIOS (ADMIN)
  // ----------------------------------------

  const criarVendedor = async (data: CreateUserData): Promise<User> => {
    if (user?.role !== 'admin') {
      throw new Error('Apenas administradores podem criar usuários');
    }

    const secondaryAuth = getSecondaryAuth()

    // Helper to build and save the Firestore user doc
    const saveUserDoc = async (uid: string): Promise<User> => {
      // Check if Firestore doc already exists
      const existing = await getDoc(doc(db, 'users', uid));
      if (existing.exists()) {
        throw new Error('Este email já está cadastrado como vendedor no sistema');
      }
      const newUser: User = {
        uid,
        email: data.email,
        nome: data.nome,
        role: 'vendedor',
        ativo: true,
        telefone: data.telefone,
        comissao_percentual: data.comissao_percentual || 10,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nome)}&background=22c55e&color=fff`,
        created_at: new Date(),
        created_by: user!.uid,
      };
      await setDoc(doc(db, 'users', uid), {
        ...newUser,
        created_at: Timestamp.now()
      });
      return newUser;
    };

    try {
      // Try to create a new Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
      await signOut(secondaryAuth);
      const newUser = await saveUserDoc(userCredential.user.uid);
      toast.success(`Vendedor ${data.nome} criado com sucesso!`);
      return newUser;

    } catch (error: any) {
      // If email already exists in Firebase Auth but NOT in Firestore (orphaned auth user),
      // recover by signing in with the provided credentials and creating the Firestore doc
      if (error.code === 'auth/email-already-in-use') {
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const recovered = await signInWithEmailAndPassword(secondaryAuth, data.email, data.password);
          await signOut(secondaryAuth);
          const newUser = await saveUserDoc(recovered.user.uid);
          toast.success(`Vendedor ${data.nome} criado com sucesso!`);
          return newUser;
        } catch (recoverError: any) {
          await signOut(secondaryAuth).catch(() => {});
          // If sign-in also failed, the email truly belongs to someone else
          throw new Error('Este email já está em uso por outra conta. Use um email diferente.');
        }
      }
      await signOut(secondaryAuth).catch(() => {});
      throw new Error(error.message || 'Erro ao criar vendedor');
    }
  };

  const atualizarVendedor = async (uid: string, data: Partial<User>): Promise<void> => {
    if (user?.role !== 'admin') {
      throw new Error('Apenas administradores podem atualizar usuários');
    }

    try {
      await updateDoc(doc(db, 'users', uid), {
        ...data,
        updated_at: Timestamp.now()
      });
      toast.success('Vendedor atualizado com sucesso!');
    } catch (error: any) {
      throw new Error(error.message || 'Erro ao atualizar vendedor');
    }
  };

  const ativarDesativarUsuario = async (uid: string, ativo: boolean): Promise<void> => {
    if (user?.role !== 'admin') {
      throw new Error('Apenas administradores podem alterar status');
    }

    if (uid === user?.uid && !ativo) {
      throw new Error('Você não pode desativar sua própria conta');
    }

    try {
      await updateDoc(doc(db, 'users', uid), {
        ativo,
        updated_at: Timestamp.now()
      });
      toast.success(`Vendedor ${ativo ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (error: any) {
      throw new Error(error.message || 'Erro ao alterar status');
    }
  };

  const excluirUsuario = async (uid: string): Promise<void> => {
    if (user?.role !== 'admin') {
      throw new Error('Apenas administradores podem excluir usuários');
    }

    if (uid === user?.uid) {
      throw new Error('Você não pode excluir sua própria conta');
    }

    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success('Vendedor excluído com sucesso!');
    } catch (error: any) {
      throw new Error(error.message || 'Erro ao excluir vendedor');
    }
  };

  const resetarSenha = async (uid: string, _novaSenha: string): Promise<void> => {
    if (user?.role !== 'admin') {
      throw new Error('Apenas administradores podem redefinir senhas');
    }
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      if (!snap.exists()) throw new Error('Vendedor não encontrado')
      const vendorEmail = snap.data().email
      await sendPasswordResetEmail(auth, vendorEmail)
      toast.success(`Link de redefinição de senha enviado para ${vendorEmail}. O vendedor deve verificar o email.`)
    } catch (error: any) {
      throw new Error(error.message || 'Erro ao enviar link de redefinição')
    }
  };

  const refreshUser = async (): Promise<void> => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        setUser(convertToUser(firebaseUser, userDoc.data()));
      }
    } catch (e) { console.error('refreshUser error', e); }
  };

  // ----------------------------------------
  // CONSULTAS
  // ----------------------------------------

  const getAllUsers = async (): Promise<User[]> => {
    const q = query(collection(db, 'users'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate(),
      updated_at: doc.data().updated_at?.toDate(),
      last_login: doc.data().last_login?.toDate(),
    })) as User[];
  };

  const getVendedores = async (): Promise<User[]> => {
    const q = query(collection(db, 'users'), where('role', '==', 'vendedor'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate(),
      updated_at: doc.data().updated_at?.toDate(),
      last_login: doc.data().last_login?.toDate(),
    })) as User[];
  };

  const getUserById = async (uid: string): Promise<User | null> => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return {
        uid: userDoc.id,
        ...userDoc.data(),
        created_at: userDoc.data().created_at?.toDate(),
        updated_at: userDoc.data().updated_at?.toDate(),
        last_login: userDoc.data().last_login?.toDate(),
      } as User;
    }
    return null;
  };

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isVendedor: user?.role === 'vendedor',
    login,
    logout,
    criarVendedor,
    atualizarVendedor,
    ativarDesativarUsuario,
    excluirUsuario,
    resetarSenha,
    getAllUsers,
    getVendedores,
    getUserById,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ----------------------------------------
// HOOK
// ----------------------------------------

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
