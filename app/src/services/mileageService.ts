import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface RegistroQuilometragem {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  data: Date;
  origem: string;
  destino: string;
  motivo: string;
  quilometragem_inicial: number;
  quilometragem_final: number;
  distancia: number;

  // Rate de reembolso (IRS 2024: $0.67 por milha)
  rate_reembolso: number;
  valor_reembolso: number;

  // Metadados
  aprovado: boolean;
  aprovado_por?: string;
  aprovado_em?: Date;
  created_at: Date;
  updated_at: Date;
}

// Taxa de reembolso do IRS para 2024
export const IRS_MILEAGE_RATE_2024 = 0.67; // $0.67 por milha

// Criar registro de quilometragem
export async function criarRegistroQuilometragem(
  data: Omit<RegistroQuilometragem, 'id' | 'created_at' | 'updated_at'>
): Promise<string | null> {
  try {
    const distancia = data.quilometragem_final - data.quilometragem_inicial;
    const valorReembolso = distancia * data.rate_reembolso;

    const docRef = await addDoc(collection(db, 'quilometragem'), {
      ...data,
      distancia,
      valor_reembolso: valorReembolso,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    return docRef.id;

  } catch (error) {
    console.error('Erro ao criar registro:', error);
    return null;
  }
}

// Atualizar registro
export async function atualizarRegistroQuilometragem(
  id: string,
  data: Partial<RegistroQuilometragem>
): Promise<boolean> {
  try {
    const updateData: any = { ...data, updated_at: Timestamp.now() };

    // Recalcular distância e reembolso se necessário
    if (data.quilometragem_inicial !== undefined || data.quilometragem_final !== undefined) {
      const docSnap = await getDoc(doc(db, 'quilometragem', id));
      if (docSnap.exists()) {
        const atual = docSnap.data();
        const inicial = data.quilometragem_inicial ?? atual.quilometragem_inicial;
        const final = data.quilometragem_final ?? atual.quilometragem_final;
        const rate = data.rate_reembolso ?? atual.rate_reembolso;

        updateData.distancia = final - inicial;
        updateData.valor_reembolso = updateData.distancia * rate;
      }
    }

    await updateDoc(doc(db, 'quilometragem', id), updateData);
    return true;

  } catch (error) {
    console.error('Erro ao atualizar registro:', error);
    return false;
  }
}

// Buscar registros
export async function buscarRegistrosQuilometragem(
  filtros?: {
    vendedorId?: string;
    dataInicio?: Date;
    dataFim?: Date;
    aprovado?: boolean;
  }
): Promise<RegistroQuilometragem[]> {
  try {
    let q = query(collection(db, 'quilometragem'), orderBy('data', 'desc'));

    if (filtros?.vendedorId) {
      q = query(q, where('vendedor_id', '==', filtros.vendedorId));
    }
    if (filtros?.dataInicio) {
      q = query(q, where('data', '>=', Timestamp.fromDate(filtros.dataInicio)));
    }
    if (filtros?.dataFim) {
      q = query(q, where('data', '<=', Timestamp.fromDate(filtros.dataFim)));
    }
    if (filtros?.aprovado !== undefined) {
      q = query(q, where('aprovado', '==', filtros.aprovado));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      data: (doc.data().data as any)?.toDate?.() || doc.data().data,
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
      updated_at: (doc.data().updated_at as any)?.toDate?.() || doc.data().updated_at,
      aprovado_em: doc.data().aprovado_em ? (doc.data().aprovado_em as any).toDate() : undefined,
    })) as RegistroQuilometragem[];

  } catch (error) {
    console.error('Erro ao buscar registros:', error);
    return [];
  }
}

// Aprovar registro
export async function aprovarRegistroQuilometragem(
  id: string,
  adminId: string
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'quilometragem', id), {
      aprovado: true,
      aprovado_por: adminId,
      aprovado_em: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao aprovar registro:', error);
    return false;
  }
}

// Gerar relatório de reembolso
export async function gerarRelatorioReembolso(
  vendedorId?: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<{
  totalMilhas: number;
  totalReembolso: number;
  quantidadeViagens: number;
  registros: RegistroQuilometragem[];
}> {
  const registros = await buscarRegistrosQuilometragem({
    vendedorId,
    dataInicio,
    dataFim,
    aprovado: true,
  });

  const totalMilhas = registros.reduce((acc, r) => acc + r.distancia, 0);
  const totalReembolso = registros.reduce((acc, r) => acc + r.valor_reembolso, 0);

  return {
    totalMilhas: Math.round(totalMilhas * 100) / 100,
    totalReembolso: Math.round(totalReembolso * 100) / 100,
    quantidadeViagens: registros.length,
    registros,
  };
}
