// ============================================
// BBVIC GESTÃO - SERVIÇO DE COMISSÕES
// ============================================

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ComissaoVendedor, Invoice } from '@/types';

// Calcular início e fim da semana atual
export const getSemanaAtual = () => {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0 = Domingo, 1 = Segunda, etc.

  // Início da semana (Segunda-feira)
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - diaSemana + 1);
  inicioSemana.setHours(0, 0, 0, 0);

  // Fim da semana (Domingo)
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);
  fimSemana.setHours(23, 59, 59, 999);

  return { inicioSemana, fimSemana };
};

// Calcular comissão da semana para um vendedor
export const calcularComissaoSemana = async (
  vendedorId: string,
  comissaoPercentual: number,
  dataInicio?: Date,
  dataFim?: Date
) => {
  try {
    const { inicioSemana, fimSemana } = getSemanaAtual();
    const inicio = dataInicio || inicioSemana;
    const fim = dataFim || fimSemana;

    // Buscar faturas pagas do vendedor no período
    const q = query(
      collection(db, 'invoices'),
      where('vendedor_id', '==', vendedorId),
      where('status', 'in', ['pago', 'parcial'])
    );

    const snapshot = await getDocs(q);
    const invoices: Invoice[] = [];
    let totalVendas = 0;

    snapshot.docs.forEach(docSnap => {
      const invoice = { id: docSnap.id, ...docSnap.data() } as Invoice;
      const dataPagamento = invoice.data_pagamento 
        ? new Date((invoice.data_pagamento as any).toDate?.() || invoice.data_pagamento)
        : null;
      
      // Verificar se a fatura foi paga no período
      if (dataPagamento && dataPagamento >= inicio && dataPagamento <= fim) {
        invoices.push(invoice);
        totalVendas += invoice.valor_pago || invoice.total;
      }
    });

    const valorComissao = totalVendas * (comissaoPercentual / 100);

    return {
      totalVendas,
      valorComissao,
      invoices,
      quantidadeFaturas: invoices.length
    };
  } catch (error) {
    console.error('Erro ao calcular comissão:', error);
    throw error;
  }
};

// Buscar comissões de um vendedor
export const getComissoesVendedor = async (vendedorId: string) => {
  try {
    const q = query(
      collection(db, 'comissoes'),
      where('vendedor_id', '==', vendedorId),
      orderBy('data_inicio', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ComissaoVendedor[];
  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    return [];
  }
};

// Buscar comissão da semana atual
export const getComissaoSemanaAtual = async (vendedorId: string) => {
  try {
    const { inicioSemana, fimSemana } = getSemanaAtual();

    // Buscar todas as comissões do vendedor (sem filtros de data para evitar índice composto)
    const q = query(
      collection(db, 'comissoes'),
      where('vendedor_id', '==', vendedorId)
    );

    const snapshot = await getDocs(q);

    // Filtrar no cliente a comissão da semana atual
    const comissaoSemana = snapshot.docs.find(doc => {
      const data = doc.data();
      const dataInicio = data.data_inicio?.toDate?.() || new Date(data.data_inicio);
      const dataFim = data.data_fim?.toDate?.() || new Date(data.data_fim);
      return dataInicio <= fimSemana && dataFim >= inicioSemana;
    });

    if (comissaoSemana) {
      return { id: comissaoSemana.id, ...comissaoSemana.data() } as ComissaoVendedor;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar comissão da semana:', error);
    return null;
  }
};

// Criar ou atualizar comissão da semana
export const criarComissaoSemana = async (
  vendedorId: string,
  vendedorNome: string,
  comissaoPercentual: number
) => {
  try {
    const { inicioSemana, fimSemana } = getSemanaAtual();

    // Verificar se já existe comissão para esta semana
    const comissaoExistente = await getComissaoSemanaAtual(vendedorId);

    if (comissaoExistente) {
      return comissaoExistente;
    }

    // Calcular valores
    const { totalVendas, valorComissao, invoices } = await calcularComissaoSemana(
      vendedorId, 
      comissaoPercentual,
      inicioSemana,
      fimSemana
    );

    // Criar registro de comissão
    const comissaoData = {
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
      comissao_percentual: comissaoPercentual,
      data_inicio: Timestamp.fromDate(inicioSemana),
      data_fim: Timestamp.fromDate(fimSemana),
      total_vendas: totalVendas,
      valor_comissao: valorComissao,
      status: 'pendente' as const,
      invoices_ids: invoices.map(i => i.id!),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, 'comissoes'), comissaoData);

    return { 
      id: docRef.id, 
      ...comissaoData,
      data_inicio: inicioSemana,
      data_fim: fimSemana,
      created_at: new Date(),
      updated_at: new Date()
    } as ComissaoVendedor;
  } catch (error) {
    console.error('Erro ao criar comissão:', error);
    throw error;
  }
};

// Marcar comissão como paga e criar despesa
export const pagarComissao = async (
  comissaoId: string,
  adminId: string,
  adminNome: string,
  observacoes?: string
) => {
  try {
    // Buscar dados da comissão
    const comissaoDoc = await getDoc(doc(db, 'comissoes', comissaoId));
    if (!comissaoDoc.exists()) {
      throw new Error('Comissão não encontrada');
    }
    const comissaoData = comissaoDoc.data();

    // Atualizar status da comissão
    await updateDoc(doc(db, 'comissoes', comissaoId), {
      status: 'pago',
      data_pagamento: Timestamp.now(),
      pago_por: adminId,
      pago_por_nome: adminNome,
      observacoes: observacoes || '',
      updated_at: Timestamp.now()
    });

    // Criar despesa automaticamente
    const despesaData = {
      descricao: `Comissão - ${comissaoData.vendedor_nome}`,
      valor: comissaoData.valor_comissao,
      categoria: 'comissao',
      categoria_nome: 'Comissão de Vendedor',
      data: Timestamp.now(),
      vendedor_id: comissaoData.vendedor_id,
      vendedor_nome: comissaoData.vendedor_nome,
      comissao_id: comissaoId,
      periodo_inicio: comissaoData.data_inicio,
      periodo_fim: comissaoData.data_fim,
      observacoes: observacoes || `Pagamento de comissão referente ao período ${formatarPeriodoComissao(
        new Date((comissaoData.data_inicio as any).toDate?.() || comissaoData.data_inicio),
        new Date((comissaoData.data_fim as any).toDate?.() || comissaoData.data_fim)
      )}`,
      aprovado: true,
      aprovado_por: adminId,
      aprovado_por_nome: adminNome,
      data_aprovacao: Timestamp.now(),
      created_at: Timestamp.now(),
      created_by: adminId
    };

    await addDoc(collection(db, 'despesas'), despesaData);

    return true;
  } catch (error) {
    console.error('Erro ao pagar comissão:', error);
    throw error;
  }
};

// Buscar todas as comissões pendentes (para admin)
export const getComissoesPendentes = async () => {
  try {
    const q = query(
      collection(db, 'comissoes'),
      where('status', '==', 'pendente'),
      orderBy('data_inicio', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ComissaoVendedor[];
  } catch (error) {
    console.error('Erro ao buscar comissões pendentes:', error);
    return [];
  }
};

// Buscar todas as comissões (para admin)
export const getTodasComissoes = async () => {
  try {
    const q = query(
      collection(db, 'comissoes'),
      orderBy('data_inicio', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ComissaoVendedor[];
  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    return [];
  }
};

// Formatar período da comissão
export const formatarPeriodoComissao = (dataInicio: Date, dataFim: Date) => {
  const inicio = new Date(dataInicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const fim = new Date(dataFim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${inicio} - ${fim}`;
};
