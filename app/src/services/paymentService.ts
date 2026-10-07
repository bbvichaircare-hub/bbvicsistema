import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/types';

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'canceled';
}

export interface PaymentRecord {
  id?: string;
  invoice_id: string;
  invoice_numero: string;
  cliente_id: string;
  cliente_nome: string;
  valor: number;
  taxa_stripe: number;
  valor_liquido: number;
  metodo_pagamento: 'card' | 'bank_transfer' | 'other';
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;

  // Dados do cartão (mascarados)
  card_last4?: string;
  card_brand?: string;

  // Metadados
  created_at: Date;
  updated_at: Date;
}

// Criar Payment Intent no Stripe
export async function criarPaymentIntent(
  _invoice: Invoice,
  amount: number
): Promise<PaymentIntent | null> {
  try {
    // Em produção, fazer chamada para o backend que cria o Payment Intent no Stripe
    // Aqui simulamos a resposta

    // Simular chamada à API
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      id: `pi_${Math.random().toString(36).substring(2, 15)}`,
      client_secret: `pi_${Math.random().toString(36).substring(2, 15)}_secret_${Math.random().toString(36).substring(2, 15)}`,
      amount: Math.round(amount * 100), // Stripe trabalha em centavos
      currency: 'usd',
      status: 'requires_payment_method',
    };
  } catch (error) {
    console.error('Erro ao criar Payment Intent:', error);
    return null;
  }
}

// Confirmar pagamento
export async function confirmarPagamento(
  paymentIntentId: string,
  invoice: Invoice
): Promise<{ sucesso: boolean; paymentRecord?: PaymentRecord; erro?: string }> {
  try {
    // Em produção, confirmar o pagamento no Stripe via backend
    // Aqui simulamos o sucesso

    await new Promise(resolve => setTimeout(resolve, 1500));

    const valor = invoice.valor_restante || invoice.total;
    const taxaStripe = valor * 0.029 + 0.30; // 2.9% + $0.30
    const valorLiquido = valor - taxaStripe;

    const paymentRecord: PaymentRecord = {
      invoice_id: invoice.id!,
      invoice_numero: invoice.numero,
      cliente_id: invoice.cliente_id,
      cliente_nome: invoice.cliente_nome,
      valor,
      taxa_stripe: taxaStripe,
      valor_liquido: valorLiquido,
      metodo_pagamento: 'card',
      status: 'succeeded',
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: `ch_${Math.random().toString(36).substring(2, 15)}`,
      card_last4: '4242',
      card_brand: 'visa',
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Salvar registro de pagamento
    const docRef = await addDoc(collection(db, 'pagamentos'), {
      ...paymentRecord,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // Atualizar fatura
    await updateDoc(doc(db, 'invoices', invoice.id!), {
      status: 'pago',
      valor_pago: valor,
      valor_restante: 0,
      data_pagamento: Timestamp.now(),
      metodo_pagamento: 'cartao_online',
      updated_at: Timestamp.now(),
    });

    return { sucesso: true, paymentRecord: { ...paymentRecord, id: docRef.id } };
  } catch (error) {
    console.error('Erro ao confirmar pagamento:', error);
    return { sucesso: false, erro: 'Erro ao processar pagamento' };
  }
}

// Registrar pagamento manual (para pagamentos fora do sistema)
export async function registrarPagamentoManual(
  invoice: Invoice,
  dados: {
    valor: number;
    metodo: 'dinheiro' | 'cheque' | 'transferencia' | 'deposito' | 'outro';
    data: Date;
    observacoes?: string;
  }
): Promise<boolean> {
  try {
    const novoValorPago = (invoice.valor_pago || 0) + dados.valor;
    const novoValorRestante = invoice.total - novoValorPago;

    let novoStatus: Invoice['status'] = 'parcial';
    if (novoValorRestante <= 0) {
      novoStatus = 'pago';
    }

    // Criar registro de pagamento
    await addDoc(collection(db, 'pagamentos'), {
      invoice_id: invoice.id,
      invoice_numero: invoice.numero,
      cliente_id: invoice.cliente_id,
      cliente_nome: invoice.cliente_nome,
      valor: dados.valor,
      taxa_stripe: 0,
      valor_liquido: dados.valor,
      metodo_pagamento: dados.metodo,
      status: 'succeeded',
      observacoes: dados.observacoes,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // Atualizar fatura
    await updateDoc(doc(db, 'invoices', invoice.id!), {
      status: novoStatus,
      valor_pago: novoValorPago,
      valor_restante: Math.max(0, novoValorRestante),
      data_pagamento: Timestamp.fromDate(dados.data),
      metodo_pagamento: dados.metodo,
      updated_at: Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Erro ao registrar pagamento manual:', error);
    return false;
  }
}

// Buscar pagamentos
export async function buscarPagamentos(filtros?: {
  invoiceId?: string;
  clienteId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  status?: PaymentRecord['status'];
}): Promise<PaymentRecord[]> {
  try {
    let q = query(collection(db, 'pagamentos'), orderBy('created_at', 'desc'));

    if (filtros?.invoiceId) {
      q = query(q, where('invoice_id', '==', filtros.invoiceId));
    }
    if (filtros?.clienteId) {
      q = query(q, where('cliente_id', '==', filtros.clienteId));
    }
    if (filtros?.dataInicio) {
      q = query(q, where('created_at', '>=', Timestamp.fromDate(filtros.dataInicio)));
    }
    if (filtros?.dataFim) {
      q = query(q, where('created_at', '<=', Timestamp.fromDate(filtros.dataFim)));
    }
    if (filtros?.status) {
      q = query(q, where('status', '==', filtros.status));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
      updated_at: (doc.data().updated_at as any)?.toDate?.() || doc.data().updated_at,
    })) as PaymentRecord[];
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return [];
  }
}

// Gerar relatório de recebimentos
export async function gerarRelatorioRecebimentos(
  dataInicio: Date,
  dataFim: Date
): Promise<{
  totalRecebido: number;
  totalTaxas: number;
  totalLiquido: number;
  porMetodo: Record<string, { total: number; quantidade: number }>;
  pagamentos: PaymentRecord[];
}> {
  const pagamentos = await buscarPagamentos({
    dataInicio,
    dataFim,
    status: 'succeeded',
  });

  const totalRecebido = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const totalTaxas = pagamentos.reduce((acc, p) => acc + p.taxa_stripe, 0);
  const totalLiquido = totalRecebido - totalTaxas;

  const porMetodo: Record<string, { total: number; quantidade: number }> = {};

  for (const pagamento of pagamentos) {
    const metodo = pagamento.metodo_pagamento;
    if (!porMetodo[metodo]) {
      porMetodo[metodo] = { total: 0, quantidade: 0 };
    }
    porMetodo[metodo].total += pagamento.valor;
    porMetodo[metodo].quantidade++;
  }

  return { totalRecebido, totalTaxas, totalLiquido, porMetodo, pagamentos };
}
