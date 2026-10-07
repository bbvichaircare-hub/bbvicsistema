import { collection, query, where, getDocs, Timestamp, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice, InvoiceItem } from '@/types';

// Configuração de fatura recorrente
export interface FaturaRecorrente {
  id?: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  items: InvoiceItem[];
  subtotal: number;
  desconto: number;
  taxa_percentual: number;
  taxa: number;
  total: number;

  // Configuração de recorrência
  frequencia: 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
  dia_cobranca: number; // Dia do mês (1-31)

  // Datas
  data_inicio: Date;
  data_termino?: Date; // Opcional - se não tiver, é indefinido

  // Status
  ativa: boolean;
  proxima_cobranca: Date;

  // Contadores
  total_gerado: number;
  ultima_geracao?: Date;

  // Metadados
  created_at: Date;
  updated_at: Date;
  vendedor_id?: string;
  vendedor_nome?: string;
  observacoes?: string;
}

// Gerar próxima data de cobrança baseada na frequência
export function calcularProximaCobranca(
  dataBase: Date,
  frequencia: FaturaRecorrente['frequencia'],
  diaCobranca?: number
): Date {
  const proxima = new Date(dataBase);

  switch (frequencia) {
    case 'semanal':
      proxima.setDate(proxima.getDate() + 7);
      break;
    case 'quinzenal':
      proxima.setDate(proxima.getDate() + 15);
      break;
    case 'mensal':
      proxima.setMonth(proxima.getMonth() + 1);
      break;
    case 'bimestral':
      proxima.setMonth(proxima.getMonth() + 2);
      break;
    case 'trimestral':
      proxima.setMonth(proxima.getMonth() + 3);
      break;
    case 'semestral':
      proxima.setMonth(proxima.getMonth() + 6);
      break;
    case 'anual':
      proxima.setFullYear(proxima.getFullYear() + 1);
      break;
  }

  // Ajustar para o dia de cobrança específico se fornecido
  if (diaCobranca && diaCobranca >= 1 && diaCobranca <= 31) {
    const ultimoDiaMes = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate();
    proxima.setDate(Math.min(diaCobranca, ultimoDiaMes));
  }

  return proxima;
}

// Gerar número da fatura
async function gerarNumeroFatura(): Promise<string> {
  const agora = new Date();
  const ano = agora.getFullYear().toString().slice(-2);
  const mes = String(agora.getMonth() + 1).padStart(2, '0');

  // Buscar última fatura do mês
  const q = query(
    collection(db, 'invoices'),
    where('numero', '>=', `INV-${ano}${mes}`),
    where('numero', '<', `INV-${ano}${mes}Z`)
  );

  const snapshot = await getDocs(q);
  const sequencia = String(snapshot.docs.length + 1).padStart(4, '0');

  return `INV-${ano}${mes}-${sequencia}`;
}

// Gerar fatura a partir de recorrência
export async function gerarFaturaRecorrente(
  recorrente: FaturaRecorrente
): Promise<Invoice | null> {
  try {
    const numero = await gerarNumeroFatura();
    const hoje = new Date();
    const vencimento = new Date(hoje);
    vencimento.setDate(vencimento.getDate() + 7); // 7 dias para pagar

    // Converter InvoiceItem para DocumentItem
    const documentItems = recorrente.items.map(item => ({
      produto_id: item.produto_id,
      produto_nome: item.descricao,
      descricao: item.descricao,
      quantidade: item.quantidade,
      preco_unitario: item.preco,
      subtotal: item.total,
    }));

    const invoiceData: Omit<Invoice, 'id'> = {
      numero,
      cliente_id: recorrente.cliente_id,
      cliente_nome: recorrente.cliente_nome,
      cliente_email: recorrente.cliente_email || '',
      cliente_telefone: recorrente.cliente_telefone || '',
      items: documentItems,
      subtotal: recorrente.subtotal,
      desconto: recorrente.desconto,
      taxa: recorrente.taxa,
      total: recorrente.total,
      status: 'enviado',
      data_emissao: Timestamp.now() as any,
      data_vencimento: Timestamp.fromDate(vencimento) as any,
      observacoes: recorrente.observacoes || `Fatura recorrente gerada automaticamente`,
      vendedor_id: recorrente.vendedor_id || '',
      vendedor_nome: recorrente.vendedor_nome || '',
      public_token: Math.random().toString(36).substring(2, 15),
      
      // Campos de recorrência
      recorrente_id: recorrente.id,
      eh_recorrente: true,
      
      // Campos de pagamento
      tipo_pagamento: 'avista',
      numero_parcelas: 1,
      valor_pago: 0,
      valor_restante: recorrente.total,
      
      // Campos de tracking
      visualizado: false,
      visualizado_count: 0,
    };

    const docRef = await addDoc(collection(db, 'invoices'), {
      ...invoiceData,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // Atualizar a recorrência
    if (recorrente.id) {
      const novaProximaCobranca = calcularProximaCobranca(
        recorrente.proxima_cobranca,
        recorrente.frequencia,
        recorrente.dia_cobranca
      );
      
      await updateDoc(doc(db, 'faturas_recorrentes', recorrente.id), {
        proxima_cobranca: Timestamp.fromDate(novaProximaCobranca),
        ultima_geracao: Timestamp.now(),
        total_gerado: (recorrente.total_gerado || 0) + 1,
        updated_at: Timestamp.now(),
      });
    }

    return { id: docRef.id, ...invoiceData } as Invoice;

  } catch (error) {
    console.error('Erro ao gerar fatura recorrente:', error);
    return null;
  }
}

// Verificar e gerar faturas recorrentes do dia
export async function processarFaturasRecorrentes(
  vendedorId?: string
): Promise<{ processadas: number; geradas: number; erros: number; }> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  let q = query(
    collection(db, 'faturas_recorrentes'),
    where('ativa', '==', true),
    where('proxima_cobranca', '>=', Timestamp.fromDate(hoje)),
    where('proxima_cobranca', '<', Timestamp.fromDate(amanha))
  );

  if (vendedorId) {
    q = query(q, where('vendedor_id', '==', vendedorId));
  }

  const snapshot = await getDocs(q);
  const recorrentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FaturaRecorrente[];

  let processadas = 0;
  let geradas = 0;
  let erros = 0;

  for (const recorrente of recorrentes) {
    processadas++;

    // Verificar se não atingiu data de término
    if (recorrente.data_termino) {
      const termino = new Date((recorrente.data_termino as any)?.toDate?.() || recorrente.data_termino);
      if (hoje > termino) {
        // Desativar recorrência
        await updateDoc(doc(db, 'faturas_recorrentes', recorrente.id!), {
          ativa: false,
          updated_at: Timestamp.now(),
        });
        continue;
      }
    }

    const fatura = await gerarFaturaRecorrente(recorrente);
    if (fatura) {
      geradas++;
    } else {
      erros++;
    }

  }

  return { processadas, geradas, erros };
}

// Buscar faturas recorrentes
export async function buscarFaturasRecorrentes(
  vendedorId?: string
): Promise<FaturaRecorrente[]> {
  let q = query(
    collection(db, 'faturas_recorrentes'),
    where('ativa', '==', true)
  );

  if (vendedorId) {
    q = query(q, where('vendedor_id', '==', vendedorId));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    data_inicio: (doc.data().data_inicio as any)?.toDate?.() || doc.data().data_inicio,
    data_termino: (doc.data().data_termino as any)?.toDate?.() || doc.data().data_termino,
    proxima_cobranca: (doc.data().proxima_cobranca as any)?.toDate?.() || doc.data().proxima_cobranca,
    ultima_geracao: (doc.data().ultima_geracao as any)?.toDate?.() || doc.data().ultima_geracao,
    created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
    updated_at: (doc.data().updated_at as any)?.toDate?.() || doc.data().updated_at,
  })) as FaturaRecorrente[];
}

// Criar nova fatura recorrente
export async function criarFaturaRecorrente(
  data: Omit<FaturaRecorrente, 'id' | 'created_at' | 'updated_at' | 'total_gerado'>
): Promise<string | null> {
  try {
    const proximaCobranca = calcularProximaCobranca(
      data.data_inicio,
      data.frequencia,
      data.dia_cobranca
    );

    const docRef = await addDoc(collection(db, 'faturas_recorrentes'), {
      ...data,
      proxima_cobranca: Timestamp.fromDate(proximaCobranca),
      total_gerado: 0,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    return docRef.id;

  } catch (error) {
    console.error('Erro ao criar fatura recorrente:', error);
    return null;
  }
}

// Atualizar fatura recorrente
export async function atualizarFaturaRecorrente(
  id: string,
  data: Partial<FaturaRecorrente>
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'faturas_recorrentes', id), {
      ...data,
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao atualizar fatura recorrente:', error);
    return false;
  }
}

// Desativar fatura recorrente
export async function desativarFaturaRecorrente(id: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'faturas_recorrentes', id), {
      ativa: false,
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao desativar fatura recorrente:', error);
    return false;
  }
}

// Excluir fatura recorrente
export async function excluirFaturaRecorrente(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'faturas_recorrentes', id));
    return true;
  } catch (error) {
    console.error('Erro ao excluir fatura recorrente:', error);
    return false;
  }
}

// Labels para frequência
export const frequenciaLabels: Record<FaturaRecorrente['frequencia'], string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};
