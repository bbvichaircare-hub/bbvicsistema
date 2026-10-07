// ============================================
// BBVIC GESTÃO - CONSIGNAÇÃO
// ============================================
// Controla produtos deixados em consignação nos salões dos clientes:
// - Entrega/Reposição: baixa o estoque geral e soma saldo do cliente.
// - Registrar Venda: reduz o saldo e gera uma Fatura real cobrando só o vendido.
// - Devolução: produto não vendido volta ao estoque geral.

import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConsignacaoItem, ConsignacaoMovimento, Produto, Invoice, DocumentItem } from '@/types'

// ----------------------------------------
// ESTOQUE GERAL (mesmo padrão usado na baixa de estoque das faturas)
// ----------------------------------------
async function movimentarEstoqueGeral(produtoId: string, delta: number, tipo: string, observacao: string): Promise<void> {
  const prodRef = doc(db, 'produtos', produtoId)
  const prodSnap = await getDoc(prodRef)
  if (!prodSnap.exists()) throw new Error('Produto não encontrado')
  const prod = prodSnap.data()
  const estoque_antes = prod.estoque || 0
  const estoque_depois = estoque_antes + delta
  await updateDoc(prodRef, { estoque: estoque_depois })
  await addDoc(collection(db, 'movimentos_estoque'), {
    produto_id: produtoId,
    produto_nome: prod.nome,
    tipo,
    quantidade: Math.abs(delta),
    estoque_antes,
    estoque_depois,
    observacao,
    created_at: Timestamp.now(),
  })
}

// Gerar número da fatura (mesmo padrão usado nas faturas recorrentes)
async function gerarNumeroFatura(): Promise<string> {
  const agora = new Date()
  const ano = agora.getFullYear().toString().slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const q = query(
    collection(db, 'invoices'),
    where('numero', '>=', `INV-${ano}${mes}`),
    where('numero', '<', `INV-${ano}${mes}Z`)
  )
  const snapshot = await getDocs(q)
  const sequencia = String(snapshot.docs.length + 1).padStart(4, '0')
  return `INV-${ano}${mes}-${sequencia}`
}

// ----------------------------------------
// CONSULTAS
// ----------------------------------------

export async function buscarConsignacoes(opts: { vendedorId?: string; isAdmin?: boolean }): Promise<ConsignacaoItem[]> {
  const base = collection(db, 'consignacoes')
  const q = (!opts.isAdmin && opts.vendedorId) ? query(base, where('vendedor_id', '==', opts.vendedorId)) : query(base)
  const snap = await getDocs(q)
  const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ConsignacaoItem[]
  return lista.sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome))
}

export async function buscarConsignacoesPorCliente(clienteId: string): Promise<ConsignacaoItem[]> {
  const q = query(collection(db, 'consignacoes'), where('cliente_id', '==', clienteId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as ConsignacaoItem[]
}

export async function buscarMovimentosConsignacao(consignacaoId: string): Promise<ConsignacaoMovimento[]> {
  const q = query(collection(db, 'consignacao_movimentos'), where('consignacao_id', '==', consignacaoId))
  const snap = await getDocs(q)
  const lista = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    created_at: (d.data().created_at as any)?.toDate?.() || d.data().created_at,
  })) as ConsignacaoMovimento[]
  return lista.sort((a, b) => (new Date(b.created_at as any).getTime()) - (new Date(a.created_at as any).getTime()))
}

// Soma o saldo em consignação de cada produto (uso: card do produto no Estoque, admin apenas)
export async function buscarTotalEmConsignacaoPorProduto(): Promise<Record<string, number>> {
  const snap = await getDocs(collection(db, 'consignacoes'))
  const totals: Record<string, number> = {}
  snap.docs.forEach(d => {
    const data = d.data()
    totals[data.produto_id] = (totals[data.produto_id] || 0) + (data.quantidade_em_consignacao || 0)
  })
  return totals
}

// ----------------------------------------
// ENTREGA / REPOSIÇÃO
// ----------------------------------------

export async function entregarOuReporConsignacao(params: {
  cliente_id: string
  cliente_nome: string
  produto: Produto
  quantidade: number
  tipo: 'entrega' | 'reposicao'
  vendedor_id: string
  vendedor_nome?: string
  observacao?: string
}): Promise<ConsignacaoItem> {
  const { cliente_id, cliente_nome, produto, quantidade, tipo, vendedor_id, vendedor_nome, observacao } = params
  if (quantidade <= 0) throw new Error('Quantidade inválida')
  if (!produto.id) throw new Error('Produto inválido')

  await movimentarEstoqueGeral(
    produto.id,
    -quantidade,
    tipo === 'entrega' ? 'consignacao_entrega' : 'consignacao_reposicao',
    `${tipo === 'entrega' ? 'Entrega' : 'Reposição'} em consignação - ${cliente_nome}`
  )

  const q = query(collection(db, 'consignacoes'), where('cliente_id', '==', cliente_id), where('produto_id', '==', produto.id))
  const snap = await getDocs(q)

  let consignacaoId: string
  let novoSaldo: number

  if (!snap.empty) {
    const docSnap = snap.docs[0]
    const atual = (docSnap.data().quantidade_em_consignacao || 0) as number
    novoSaldo = atual + quantidade
    await updateDoc(doc(db, 'consignacoes', docSnap.id), {
      quantidade_em_consignacao: novoSaldo,
      preco_unitario: produto.preco_venda,
      atualizado_em: Timestamp.now(),
    })
    consignacaoId = docSnap.id
  } else {
    novoSaldo = quantidade
    const novoDoc = await addDoc(collection(db, 'consignacoes'), {
      cliente_id, cliente_nome,
      produto_id: produto.id, produto_nome: produto.nome,
      preco_unitario: produto.preco_venda,
      quantidade_em_consignacao: novoSaldo,
      vendedor_id, vendedor_nome: vendedor_nome || '',
      created_at: Timestamp.now(),
      atualizado_em: Timestamp.now(),
    })
    consignacaoId = novoDoc.id
  }

  await addDoc(collection(db, 'consignacao_movimentos'), {
    consignacao_id: consignacaoId,
    cliente_id, cliente_nome,
    produto_id: produto.id, produto_nome: produto.nome,
    tipo,
    quantidade,
    observacao: observacao || '',
    vendedor_id, vendedor_nome: vendedor_nome || '',
    created_at: Timestamp.now(),
  })

  return {
    id: consignacaoId,
    cliente_id, cliente_nome,
    produto_id: produto.id, produto_nome: produto.nome,
    preco_unitario: produto.preco_venda,
    quantidade_em_consignacao: novoSaldo,
    vendedor_id, vendedor_nome,
  }
}

// ----------------------------------------
// REGISTRAR VENDA (gera Fatura real só do vendido)
// ----------------------------------------

export async function registrarVendaConsignacao(params: {
  consignacao: ConsignacaoItem
  quantidadeVendida: number
  vendedor_id: string
  vendedor_nome?: string
  cliente_email?: string
  cliente_telefone?: string
  cliente_endereco?: string
}): Promise<{ invoiceId: string; invoiceNumero: string }> {
  const { consignacao, quantidadeVendida, vendedor_id, vendedor_nome, cliente_email, cliente_telefone, cliente_endereco } = params
  if (!consignacao.id) throw new Error('Consignação inválida')
  if (quantidadeVendida <= 0) throw new Error('Informe uma quantidade vendida válida')
  if (quantidadeVendida > consignacao.quantidade_em_consignacao) throw new Error('Quantidade vendida maior que o saldo em consignação')

  const subtotal = Math.round(quantidadeVendida * consignacao.preco_unitario * 100) / 100
  const taxaPct = 6.25
  const taxa = Math.round(subtotal * taxaPct / 100 * 100) / 100
  const total = Math.round((subtotal + taxa) * 100) / 100

  const numero = await gerarNumeroFatura()
  const hoje = new Date()
  const vencimento = new Date(hoje)
  vencimento.setDate(vencimento.getDate() + 7)

  const item: DocumentItem = {
    produto_id: consignacao.produto_id,
    produto_nome: consignacao.produto_nome,
    descricao: `${consignacao.produto_nome} (consignação)`,
    quantidade: quantidadeVendida,
    preco_unitario: consignacao.preco_unitario,
    subtotal,
  }

  const invoiceData: Record<string, any> = {
    numero,
    cliente_id: consignacao.cliente_id,
    cliente_nome: consignacao.cliente_nome,
    cliente_email: cliente_email || '',
    cliente_telefone: cliente_telefone || '',
    cliente_endereco: cliente_endereco || '',
    items: [item],
    subtotal,
    desconto: 0,
    taxa,
    taxa_pct: taxaPct,
    total,
    status: 'enviado' as Invoice['status'],
    data_emissao: Timestamp.now(),
    data_vencimento: Timestamp.fromDate(vencimento),
    observacoes: `Venda de produto em consignação (${consignacao.produto_nome})`,
    vendedor_id,
    vendedor_nome: vendedor_nome || '',
    public_token: Math.random().toString(36).substring(2, 15),
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    valor_pago: 0,
    valor_restante: total,
    visualizado: false,
    visualizado_count: 0,
  }

  const invoiceRef = await addDoc(collection(db, 'invoices'), {
    ...invoiceData,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  })

  const novoSaldo = consignacao.quantidade_em_consignacao - quantidadeVendida
  await updateDoc(doc(db, 'consignacoes', consignacao.id), {
    quantidade_em_consignacao: novoSaldo,
    atualizado_em: Timestamp.now(),
  })

  await addDoc(collection(db, 'consignacao_movimentos'), {
    consignacao_id: consignacao.id,
    cliente_id: consignacao.cliente_id,
    cliente_nome: consignacao.cliente_nome,
    produto_id: consignacao.produto_id,
    produto_nome: consignacao.produto_nome,
    tipo: 'venda',
    quantidade: quantidadeVendida,
    observacao: `Fatura ${numero} gerada`,
    fatura_gerada_id: invoiceRef.id,
    fatura_gerada_numero: numero,
    vendedor_id,
    vendedor_nome: vendedor_nome || '',
    created_at: Timestamp.now(),
  })

  return { invoiceId: invoiceRef.id, invoiceNumero: numero }
}

// ----------------------------------------
// DEVOLUÇÃO (produto não vendido volta ao estoque)
// ----------------------------------------

export async function devolverConsignacao(params: {
  consignacao: ConsignacaoItem
  quantidade: number
  vendedor_id: string
  vendedor_nome?: string
}): Promise<void> {
  const { consignacao, quantidade, vendedor_id, vendedor_nome } = params
  if (!consignacao.id) throw new Error('Consignação inválida')
  if (quantidade <= 0) throw new Error('Quantidade inválida')
  if (quantidade > consignacao.quantidade_em_consignacao) throw new Error('Quantidade maior que o saldo em consignação')

  await movimentarEstoqueGeral(
    consignacao.produto_id,
    quantidade,
    'consignacao_devolucao',
    `Devolução de consignação - ${consignacao.cliente_nome}`
  )

  const novoSaldo = consignacao.quantidade_em_consignacao - quantidade
  await updateDoc(doc(db, 'consignacoes', consignacao.id), {
    quantidade_em_consignacao: novoSaldo,
    atualizado_em: Timestamp.now(),
  })

  await addDoc(collection(db, 'consignacao_movimentos'), {
    consignacao_id: consignacao.id,
    cliente_id: consignacao.cliente_id,
    cliente_nome: consignacao.cliente_nome,
    produto_id: consignacao.produto_id,
    produto_nome: consignacao.produto_nome,
    tipo: 'devolucao',
    quantidade,
    observacao: 'Devolução de produto não vendido',
    vendedor_id,
    vendedor_nome: vendedor_nome || '',
    created_at: Timestamp.now(),
  })
}

// ----------------------------------------
// EXCLUIR CONSIGNAÇÃO (corrigir erro/teste)
// ----------------------------------------
// Remove por completo o registro de consignação e seu histórico de movimentos.
// O saldo atual (o que ainda não foi vendido) é devolvido ao estoque geral automaticamente,
// para não deixar o estoque "preso" em um registro de consignação que foi cadastrado errado.

export async function excluirConsignacao(params: {
  consignacao: ConsignacaoItem
}): Promise<void> {
  const { consignacao } = params
  if (!consignacao.id) throw new Error('Consignação inválida')

  if (consignacao.quantidade_em_consignacao > 0) {
    await movimentarEstoqueGeral(
      consignacao.produto_id,
      consignacao.quantidade_em_consignacao,
      'consignacao_exclusao',
      `Exclusão de registro de consignação - ${consignacao.cliente_nome} (saldo devolvido ao estoque)`
    )
  }

  const movQ = query(collection(db, 'consignacao_movimentos'), where('consignacao_id', '==', consignacao.id))
  const movSnap = await getDocs(movQ)
  await Promise.all(movSnap.docs.map(d => deleteDoc(doc(db, 'consignacao_movimentos', d.id))))

  await deleteDoc(doc(db, 'consignacoes', consignacao.id))
}
