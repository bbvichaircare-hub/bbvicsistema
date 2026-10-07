import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Despesa {
  id?: string;
  descricao: string;
  valor: number;
  data: Date;
  categoria: string;
  fornecedor?: string;
  metodo_pagamento: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'transferencia' | 'cheque' | 'outro';

  // Campos de recibo/OCR
  recibo_url?: string;
  recibo_processado: boolean;
  ocr_data?: {
    texto_extraido: string;
    confianca: number;
    campos_detectados: {
      valor?: number;
      data?: Date;
      fornecedor?: string;
      categoria?: string;
    };
  };

  // Metadados
  vendedor_id: string;
  vendedor_nome: string;
  aprovado: boolean;
  aprovado_por?: string;
  aprovado_em?: Date;
  observacoes?: string;
  created_at: Date;
  updated_at: Date;
}

// Categorias de despesa
export const categoriasDespesa = [
  { id: 'produtos', nome: 'Produtos/Insumos', cor: '#3B82F6' },
  { id: 'marketing', nome: 'Marketing/Publicidade', cor: '#8B5CF6' },
  { id: 'aluguel', nome: 'Aluguel/Condomínio', cor: '#EF4444' },
  { id: 'utilities', nome: 'Contas (Luz, Água, Internet)', cor: '#F59E0B' },
  { id: 'equipamentos', nome: 'Equipamentos', cor: '#10B981' },
  { id: 'manutencao', nome: 'Manutenção', cor: '#6B7280' },
  { id: 'viagem', nome: 'Viagem/Transporte', cor: '#EC4899' },
  { id: 'refeicao', nome: 'Refeição', cor: '#F97316' },
  { id: 'impostos', nome: 'Impostos/Taxas', cor: '#6366F1' },
  { id: 'outros', nome: 'Outros', cor: '#9CA3AF' },
];

// Criar nova despesa
export async function criarDespesa(
  data: Omit<Despesa, 'id' | 'created_at' | 'updated_at'>
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'despesas'), {
      ...data,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Erro ao criar despesa:', error);
    return null;
  }
}

// Atualizar despesa
export async function atualizarDespesa(
  id: string,
  data: Partial<Despesa>
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'despesas', id), {
      ...data,
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao atualizar despesa:', error);
    return false;
  }
}

// Excluir despesa
export async function excluirDespesa(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'despesas', id));
    return true;
  } catch (error) {
    console.error('Erro ao excluir despesa:', error);
    return false;
  }
}

// Aprovar despesa
export async function aprovarDespesa(
  id: string,
  adminId: string
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'despesas', id), {
      aprovado: true,
      aprovado_por: adminId,
      aprovado_em: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao aprovar despesa:', error);
    return false;
  }
}

// Buscar despesas
export async function buscarDespesas(filtros?: {
  vendedorId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  categoria?: string;
  aprovado?: boolean;
}): Promise<Despesa[]> {
  try {
    let q = query(collection(db, 'despesas'));

    if (filtros?.vendedorId) {
      q = query(q, where('vendedor_id', '==', filtros.vendedorId));
    }
    if (filtros?.dataInicio) {
      q = query(q, where('data', '>=', Timestamp.fromDate(filtros.dataInicio)));
    }
    if (filtros?.dataFim) {
      q = query(q, where('data', '<=', Timestamp.fromDate(filtros.dataFim)));
    }
    if (filtros?.categoria) {
      q = query(q, where('categoria', '==', filtros.categoria));
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
    })) as Despesa[];
  } catch (error) {
    console.error('Erro ao buscar despesas:', error);
    return [];
  }
}

// Simular OCR (em produção, usar Google Vision API ou similar)
export async function processarOCR(_imagemBase64: string): Promise<{
  sucesso: boolean;
  dados?: {
    valor?: number;
    data?: Date;
    fornecedor?: string;
    categoria?: string;
    texto: string;
  };
  erro?: string;
}> {
  // Simulação de OCR - em produção, integrar com API real
  // Exemplo: Google Cloud Vision, AWS Textract, Azure Computer Vision

  try {
    // Simular processamento
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Extrair texto simulado (em produção, virá da API)
    const textoExtraido = 'RECIBO\nLoja ABC\nData: 26/02/2024\nTotal: $125.50\nProdutos de beleza';

    // Tentar extrair valores
    const valorMatch = textoExtraido.match(/[\$\€\£]\s*(\d+[.,]?\d*)/);
    const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : undefined;

    const dataMatch = textoExtraido.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    const data = dataMatch ? new Date(dataMatch[1].split('/').reverse().join('-')) : new Date();

    const fornecedorMatch = textoExtraido.match(/Loja\s+([A-Za-z\s]+)/);
    const fornecedor = fornecedorMatch ? fornecedorMatch[1].trim() : undefined;

    // Detectar categoria baseada no texto
    let categoria = 'outros';
    if (textoExtraido.toLowerCase().includes('produto') || textoExtraido.toLowerCase().includes('beleza')) {
      categoria = 'produtos';
    } else if (textoExtraido.toLowerCase().includes('marketing') || textoExtraido.toLowerCase().includes('ads')) {
      categoria = 'marketing';
    }

    return {
      sucesso: true,
      dados: {
        valor,
        data,
        fornecedor,
        categoria,
        texto: textoExtraido,
      },
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: 'Erro ao processar imagem',
    };
  }
}

// Gerar relatório de despesas
export async function gerarRelatorioDespesas(
  dataInicio: Date,
  dataFim: Date,
  vendedorId?: string
): Promise<{
  total: number;
  porCategoria: Record<string, { total: number; quantidade: number }>;
  despesas: Despesa[];
}> {
  const despesas = await buscarDespesas({
    vendedorId,
    dataInicio,
    dataFim,
    aprovado: true,
  });

  const total = despesas.reduce((acc, d) => acc + d.valor, 0);

  const porCategoria: Record<string, { total: number; quantidade: number }> = {};

  for (const despesa of despesas) {
    if (!porCategoria[despesa.categoria]) {
      porCategoria[despesa.categoria] = { total: 0, quantidade: 0 };
    }
    porCategoria[despesa.categoria].total += despesa.valor;
    porCategoria[despesa.categoria].quantidade++;
  }

  return { total, porCategoria, despesas };
}
