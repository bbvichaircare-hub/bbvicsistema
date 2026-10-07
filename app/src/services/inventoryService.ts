import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Produto } from '@/types';

export interface MovimentacaoEstoque {
  id?: string;
  produto_id: string;
  produto_nome: string;
  tipo: 'entrada' | 'saida' | 'ajuste' | 'venda';
  quantidade: number;
  quantidade_anterior: number;
  quantidade_nova: number;
  motivo?: string;

  // Relacionamentos
  invoice_id?: string;
  invoice_numero?: string;

  // Metadados
  vendedor_id: string;
  vendedor_nome: string;
  created_at: Date;
}

export interface AlertaEstoque {
  id?: string;
  produto_id: string;
  produto_nome: string;
  tipo: 'baixo' | 'esgotado' | 'excesso';
  quantidade_atual: number;
  quantidade_minima?: number;
  quantidade_maxima?: number;
  lido: boolean;
  created_at: Date;
}

// Buscar movimentações de estoque
export async function buscarMovimentacoes(
  filtros?: {
    produtoId?: string;
    tipo?: MovimentacaoEstoque['tipo'];
    dataInicio?: Date;
    dataFim?: Date;
  }
): Promise<MovimentacaoEstoque[]> {
  try {
    let q = query(collection(db, 'movimentacoes_estoque'), orderBy('created_at', 'desc'));

    if (filtros?.produtoId) {
      q = query(q, where('produto_id', '==', filtros.produtoId));
    }
    if (filtros?.tipo) {
      q = query(q, where('tipo', '==', filtros.tipo));
    }
    if (filtros?.dataInicio) {
      q = query(q, where('created_at', '>=', Timestamp.fromDate(filtros.dataInicio)));
    }
    if (filtros?.dataFim) {
      q = query(q, where('created_at', '<=', Timestamp.fromDate(filtros.dataFim)));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
    })) as MovimentacaoEstoque[];

  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    return [];
  }
}

// Registrar movimentação de estoque
export async function registrarMovimentacao(
  data: Omit<MovimentacaoEstoque, 'id' | 'created_at'>
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'movimentacoes_estoque'), {
      ...data,
      created_at: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Erro ao registrar movimentação:', error);
    return null;
  }
}

// Ajustar estoque
export async function ajustarEstoque(
  produto: Produto,
  novaQuantidade: number,
  motivo: string,
  vendedorId: string,
  vendedorNome: string
): Promise<boolean> {
  try {
    const quantidadeAnterior = produto.quantidade ?? 0;

    // Registrar movimentação
    await registrarMovimentacao({
      produto_id: produto.id!,
      produto_nome: produto.nome,
      tipo: 'ajuste',
      quantidade: novaQuantidade - quantidadeAnterior,
      quantidade_anterior: quantidadeAnterior,
      quantidade_nova: novaQuantidade,
      motivo,
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
    });

    // Atualizar produto
    await updateDoc(doc(db, 'produtos', produto.id!), {
      quantidade: novaQuantidade,
      updated_at: Timestamp.now(),
    });

    // Verificar alertas
    await verificarAlertasEstoque({ ...produto, quantidade: novaQuantidade });

    return true;

  } catch (error) {
    console.error('Erro ao ajustar estoque:', error);
    return false;
  }
}

// Registrar venda (saída de estoque)
export async function registrarVenda(
  produto: Produto,
  quantidade: number,
  invoiceId: string,
  invoiceNumero: string,
  vendedorId: string,
  vendedorNome: string
): Promise<boolean> {
  try {
    const quantidadeAnterior = produto.quantidade ?? 0;
    const novaQuantidade = quantidadeAnterior - quantidade;

    // Registrar movimentação
    await registrarMovimentacao({
      produto_id: produto.id!,
      produto_nome: produto.nome,
      tipo: 'venda',
      quantidade: -quantidade,
      quantidade_anterior: quantidadeAnterior,
      quantidade_nova: novaQuantidade,
      invoice_id: invoiceId,
      invoice_numero: invoiceNumero,
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
    });

    // Atualizar produto
    await updateDoc(doc(db, 'produtos', produto.id!), {
      quantidade: novaQuantidade,
      updated_at: Timestamp.now(),
    });

    // Verificar alertas
    await verificarAlertasEstoque({ ...produto, quantidade: novaQuantidade });

    return true;

  } catch (error) {
    console.error('Erro ao registrar venda:', error);
    return false;
  }
}

// Registrar entrada de estoque
export async function registrarEntrada(
  produto: Produto,
  quantidade: number,
  motivo: string,
  vendedorId: string,
  vendedorNome: string
): Promise<boolean> {
  try {
    const quantidadeAnterior = produto.quantidade ?? 0;
    const novaQuantidade = quantidadeAnterior + quantidade;

    // Registrar movimentação
    await registrarMovimentacao({
      produto_id: produto.id!,
      produto_nome: produto.nome,
      tipo: 'entrada',
      quantidade,
      quantidade_anterior: quantidadeAnterior,
      quantidade_nova: novaQuantidade,
      motivo,
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
    });

    // Atualizar produto
    await updateDoc(doc(db, 'produtos', produto.id!), {
      quantidade: novaQuantidade,
      updated_at: Timestamp.now(),
    });

    return true;

  } catch (error) {
    console.error('Erro ao registrar entrada:', error);
    return false;
  }
}

// Verificar e criar alertas de estoque
export async function verificarAlertasEstoque(produto: Produto): Promise<void> {
  try {
    // Verificar estoque baixo
    if ((produto.quantidade ?? 0) <= 0) {
      await criarAlerta({
        produto_id: produto.id!,
        produto_nome: produto.nome,
        tipo: 'esgotado',
        quantidade_atual: produto.quantidade ?? 0,
        quantidade_minima: produto.quantidade_minima,
        lido: false,
        created_at: new Date(),
      });
    } else if (produto.quantidade_minima && (produto.quantidade ?? 0) <= produto.quantidade_minima) {
      await criarAlerta({
        produto_id: produto.id!,
        produto_nome: produto.nome,
        tipo: 'baixo',
        quantidade_atual: produto.quantidade ?? 0,
        quantidade_minima: produto.quantidade_minima,
        lido: false,
        created_at: new Date(),
      });
    }
  } catch (error) {
    console.error('Erro ao verificar alertas:', error);
  }
}

// Criar alerta
async function criarAlerta(data: Omit<AlertaEstoque, 'id'>): Promise<void> {
  try {
    // Verificar se já existe alerta não lido para este produto
    const q = query(
      collection(db, 'alertas_estoque'),
      where('produto_id', '==', data.produto_id),
      where('tipo', '==', data.tipo),
      where('lido', '==', false)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      // Já existe alerta, atualizar
      await updateDoc(doc(db, 'alertas_estoque', snapshot.docs[0].id), {
        quantidade_atual: data.quantidade_atual,
        created_at: Timestamp.now(),
      });
    } else {
      // Criar novo alerta
      await addDoc(collection(db, 'alertas_estoque'), {
        ...data,
        created_at: Timestamp.now(),
      });
    }

  } catch (error) {
    console.error('Erro ao criar alerta:', error);
  }
}

// Buscar alertas
export async function buscarAlertas(lidos: boolean = false): Promise<AlertaEstoque[]> {
  try {
    const q = query(
      collection(db, 'alertas_estoque'),
      where('lido', '==', lidos),
      orderBy('created_at', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
    })) as AlertaEstoque[];

  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    return [];
  }
}

// Marcar alerta como lido
export async function marcarAlertaLido(alertaId: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'alertas_estoque', alertaId), {
      lido: true,
    });
    return true;
  } catch (error) {
    console.error('Erro ao marcar alerta:', error);
    return false;
  }
}

// Gerar relatório de estoque
export async function gerarRelatorioEstoque(): Promise<{
  totalProdutos: number;
  valorTotalEstoque: number;
  produtosBaixoEstoque: number;
  produtosEsgotados: number;
  movimentacoesRecentes: MovimentacaoEstoque[];
}> {
  try {
    // Buscar todos os produtos
    const produtosSnap = await getDocs(query(collection(db, 'produtos'), where('ativo', '==', true)));
    const produtos = produtosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Produto[];

    const totalProdutos = produtos.length;
    const valorTotalEstoque = produtos.reduce((acc, p) => acc + ((p.quantidade ?? 0) * p.preco_custo), 0);
    const produtosBaixoEstoque = produtos.filter(p =>
      p.quantidade_minima && (p.quantidade ?? 0) > 0 && (p.quantidade ?? 0) <= p.quantidade_minima
    ).length;
    const produtosEsgotados = produtos.filter(p => (p.quantidade ?? 0) <= 0).length;

    // Buscar movimentações recentes
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 30);
    const movimentacoes = await buscarMovimentacoes({ dataInicio });

    return {
      totalProdutos,
      valorTotalEstoque,
      produtosBaixoEstoque,
      produtosEsgotados,
      movimentacoesRecentes: movimentacoes.slice(0, 20),
    };

  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return {
      totalProdutos: 0,
      valorTotalEstoque: 0,
      produtosBaixoEstoque: 0,
      produtosEsgotados: 0,
      movimentacoesRecentes: [],
    };
  }
}
