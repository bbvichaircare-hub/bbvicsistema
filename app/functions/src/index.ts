/**
 * ============================================
 * BBVIC GESTÃO - CLOUD FUNCTIONS
 * ============================================
 *
 * Funções de backend para validações críticas:
 * - Cálculo automático de comissões
 * - Atualização de estoque
 * - Validação de permissões
 * - Controle de consignado
 * - Backup automático do Firestore
 * - Logs de auditoria internos
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ============================================
// TIPOS E INTERFACES
// ============================================

interface InvoiceItem {
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

interface InvoiceData {
  id?: string;
  numero: string;
  cliente_id: string;
  cliente_nome: string;
  items: InvoiceItem[];
  subtotal: number;
  desconto: number;
  taxa: number;
  total: number;
  vendedor_id: string;
  vendedor_nome: string;
  status: string;
  data_emissao: admin.firestore.Timestamp;
  created_at: admin.firestore.Timestamp;
  updated_at?: admin.firestore.Timestamp;
}

interface ProdutoData {
  id?: string;
  nome: string;
  preco_venda: number;
  preco_custo: number;
  quantidade_estoque: number;
  comissao_percentual?: number;
}

interface UserData {
  id?: string;
  nome: string;
  email: string;
  role: 'admin' | 'vendedor';
  comissao_padrao?: number;
  ativo: boolean;
}

// ============================================
// 0) BACKUP AUTOMÁTICO DO FIRESTORE
// ============================================

/**
 * Scheduled Function: Backup automático diário do Firestore
 * Executa todos os dias às 2:00 AM
 * Mantém histórico de 30 dias no Google Cloud Storage
 */
export const backupFirestoreDiario = functions.pubsub
  .schedule('0 2 * * *') // 2:00 AM todos os dias
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    const projectId = process.env.GCLOUD_PROJECT;
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const bucketName = `${projectId}-firestore-backups`;

    try {
      // Criar cliente Firestore Admin
      const firestoreAdmin = admin.firestore();

      // Nome do arquivo de backup
      const backupPath = `backups/${timestamp}`;

      console.log(`Iniciando backup do Firestore: ${backupPath}`);

      // Usar a API de export do Firestore
      const { Firestore } = require('@google-cloud/firestore');
      const firestore = new Firestore({
        projectId: projectId,
      });

      // Exportar para o bucket
      const [operation] = await firestore.exportDocuments({
        collectionIds: [], // Exporta todas as coleções
        outputUriPrefix: `gs://${bucketName}/${backupPath}`,
      });

      console.log(`Backup iniciado: ${operation.name}`);

      // Registrar log do backup
      await db.collection('backup_logs').add({
        tipo: 'exportacao',
        data: timestamp,
        bucket: bucketName,
        path: backupPath,
        status: 'iniciado',
        operation_name: operation.name,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Limpar backups antigos (manter 30 dias)
      await limparBackupsAntigos(bucketName, 30);

      return {
        sucesso: true,
        mensagem: 'Backup iniciado com sucesso',
        path: backupPath,
      };

    } catch (error) {
      console.error('Erro ao fazer backup:', error);

      // Registrar erro
      await db.collection('backup_logs').add({
        tipo: 'exportacao',
        data: timestamp,
        status: 'erro',
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw error;
    }
  });

/**
 * Função auxiliar para limpar backups antigos
 * Mantém apenas os últimos N dias
 */
async function limparBackupsAntigos(bucketName: string, diasManter: number): Promise<void> {
  try {
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    const [files] = await bucket.getFiles({ prefix: 'backups/' });

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasManter);

    let excluidos = 0;

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const dataArquivo = new Date(metadata.timeCreated || '');

      if (dataArquivo < dataLimite) {
        await file.delete();
        excluidos++;
        console.log(`Backup antigo excluído: ${file.name}`);
      }
    }

    console.log(`Limpeza de backups concluída. ${excluidos} arquivos excluídos.`);

  } catch (error) {
    console.error('Erro ao limpar backups antigos:', error);
  }
}

/**
 * HTTPS Function: Listar backups disponíveis (Admin apenas)
 */
export const listarBackups = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  // Verificar se é admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  if (user.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Apenas admin');
  }

  try {
    const projectId = process.env.GCLOUD_PROJECT;
    const bucketName = `${projectId}-firestore-backups`;

    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    const [files] = await bucket.getFiles({ prefix: 'backups/' });

    const backups = files
      .filter((file: any) => file.name.includes('overall_export.metadata'))
      .map((file: any) => {
        const pathParts = file.name.split('/');
        return {
          data: pathParts[1],
          path: `gs://${bucketName}/backups/${pathParts[1]}`,
        };
      })
      .sort((a: any, b: any) => b.data.localeCompare(a.data));

    return {
      sucesso: true,
      backups: backups,
      total: backups.length,
    };

  } catch (error) {
    console.error('Erro ao listar backups:', error);
    throw new functions.https.HttpsError('internal', 'Erro ao listar backups');
  }
});

// ============================================
// 0.5) LOGS DE AUDITORIA INTERNOS
// ============================================

/**
 * Interface para entrada de log de auditoria
 */
interface AuditLogEntry {
  acao: 'criar' | 'editar' | 'excluir' | 'ajustar_estoque';
  colecao: string;
  documento_id: string;
  usuario_id: string;
  usuario_nome?: string;
  usuario_role?: string;
  dados_anteriores?: any;
  dados_novos?: any;
  campos_alterados?: string[];
  ip?: string;
  user_agent?: string;
  created_at: admin.firestore.FieldValue;
}

/**
 * Função auxiliar para registrar log de auditoria
 */
async function registrarLogAuditoria(entry: Omit<AuditLogEntry, 'created_at'>): Promise<void> {
  try {
    await db.collection('audit_logs').add({
      ...entry,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Erro ao registrar log de auditoria:', error);
  }
}

/**
 * Trigger: Log de auditoria - Criação de Fatura (Venda)
 */
export const auditLogInvoiceCreate = functions.firestore
  .document('invoices/{invoiceId}')
  .onCreate(async (snap, context) => {
    const invoice = snap.data() as InvoiceData;

    await registrarLogAuditoria({
      acao: 'criar',
      colecao: 'invoices',
      documento_id: context.params.invoiceId,
      usuario_id: invoice.vendedor_id,
      usuario_nome: invoice.vendedor_nome,
      dados_novos: {
        numero: invoice.numero,
        cliente_nome: invoice.cliente_nome,
        total: invoice.total,
        status: invoice.status,
        items_count: invoice.items?.length || 0,
      },
    });

    console.log(`Audit Log: Fatura ${invoice.numero} criada por ${invoice.vendedor_nome}`);
  });

/**
 * Trigger: Log de auditoria - Edição de Fatura (Venda)
 */
export const auditLogInvoiceUpdate = functions.firestore
  .document('invoices/{invoiceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as InvoiceData;
    const after = change.after.data() as InvoiceData;

    // Identificar campos alterados
    const camposAlterados: string[] = [];
    if (before.status !== after.status) camposAlterados.push('status');
    if (before.total !== after.total) camposAlterados.push('total');
    if (before.desconto !== after.desconto) camposAlterados.push('desconto');
    if (before.cliente_id !== after.cliente_id) camposAlterados.push('cliente');
    if (JSON.stringify(before.items) !== JSON.stringify(after.items)) camposAlterados.push('items');

    // Só registra se houver mudanças significativas
    if (camposAlterados.length === 0) return;

    await registrarLogAuditoria({
      acao: 'editar',
      colecao: 'invoices',
      documento_id: context.params.invoiceId,
      usuario_id: after.vendedor_id,
      usuario_nome: after.vendedor_nome,
      dados_anteriores: {
        status: before.status,
        total: before.total,
        desconto: before.desconto,
      },
      dados_novos: {
        status: after.status,
        total: after.total,
        desconto: after.desconto,
      },
      campos_alterados: camposAlterados,
    });

    console.log(`Audit Log: Fatura ${after.numero} editada. Campos: ${camposAlterados.join(', ')}`);
  });

/**
 * Trigger: Log de auditoria - Ajuste de Estoque (via movimentação)
 */
export const auditLogEstoqueMovimentacao = functions.firestore
  .document('estoque_movimentacao/{movId}')
  .onCreate(async (snap, context) => {
    const mov = snap.data();

    await registrarLogAuditoria({
      acao: 'ajustar_estoque',
      colecao: 'produtos',
      documento_id: mov.produto_id,
      usuario_id: mov.created_by,
      dados_anteriores: {
        quantidade_anterior: mov.quantidade_anterior,
      },
      dados_novos: {
        quantidade_nova: mov.quantidade_nova,
        tipo: mov.tipo,
        quantidade: mov.quantidade,
        motivo: mov.motivo,
        produto_nome: mov.produto_nome,
      },
    });

    console.log(`Audit Log: Estoque ajustado - ${mov.produto_nome} (${mov.tipo}: ${mov.quantidade})`);
  });

/**
 * Trigger: Log de auditoria - Exclusão de Cliente
 */
export const auditLogClienteDelete = functions.firestore
  .document('clientes/{clienteId}')
  .onDelete(async (snap, context) => {
    const cliente = snap.data();

    await registrarLogAuditoria({
      acao: 'excluir',
      colecao: 'clientes',
      documento_id: context.params.clienteId,
      usuario_id: cliente.vendedor_id || 'sistema',
      usuario_nome: cliente.vendedor_nome || 'Sistema',
      dados_anteriores: {
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        vendedor_id: cliente.vendedor_id,
      },
    });

    console.log(`Audit Log: Cliente ${cliente.nome} excluído`);
  });

/**
 * HTTPS Function: Consultar logs de auditoria (Admin apenas)
 */
export const consultarLogsAuditoria = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  // Verificar se é admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  if (user.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Apenas admin pode consultar logs');
  }

  const { acao, colecao, usuario_id, data_inicio, data_fim, limite = 100 } = data;

  try {
    let query: admin.firestore.Query = db.collection('audit_logs')
      .orderBy('created_at', 'desc')
      .limit(limite);

    if (acao) query = query.where('acao', '==', acao);
    if (colecao) query = query.where('colecao', '==', colecao);
    if (usuario_id) query = query.where('usuario_id', '==', usuario_id);

    const snapshot = await query.get();

    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      sucesso: true,
      logs: logs,
      total: logs.length,
    };

  } catch (error) {
    console.error('Erro ao consultar logs:', error);
    throw new functions.https.HttpsError('internal', 'Erro ao consultar logs');
  }
});

// ============================================
// 1) CÁLCULO AUTOMÁTICO DE COMISSÃO
// ============================================

/**
 * Trigger: Ao criar uma fatura com status 'pago'
 * Calcula e cria o registro de comissão automaticamente
 */
export const calcularComissaoOnInvoicePaid = functions.firestore
  .document('invoices/{invoiceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as InvoiceData;
    const after = change.after.data() as InvoiceData;

    // Só calcula comissão se mudou para status 'pago'
    if (before.status !== 'pago' && after.status === 'pago') {
      try {
        // Buscar dados do vendedor
        const vendedorDoc = await db.collection('users').doc(after.vendedor_id).get();
        if (!vendedorDoc.exists) {
          console.error('Vendedor não encontrado:', after.vendedor_id);
          return;
        }

        const vendedor = vendedorDoc.data() as UserData;

        // Calcular comissão total (soma das comissões de cada item)
        let comissaoTotal = 0;

        for (const item of after.items) {
          // Buscar produto para pegar comissão específica
          const produtoDoc = await db.collection('produtos').doc(item.produto_id).get();
          let percentualComissao = vendedor.comissao_padrao || 10; // Padrão 10%

          if (produtoDoc.exists) {
            const produto = produtoDoc.data() as ProdutoData;
            // Se produto tem comissão específica, usa ela
            if (produto.comissao_percentual !== undefined) {
              percentualComissao = produto.comissao_percentual;
            }
          }

          // Calcular comissão do item
          const comissaoItem = (item.subtotal * percentualComissao) / 100;
          comissaoTotal += comissaoItem;
        }

        // Criar registro de comissão
        const semanaReferencia = getSemanaReferencia(after.data_emissao.toDate());

        await db.collection('comissoes').add({
          vendedor_id: after.vendedor_id,
          vendedor_nome: after.vendedor_nome,
          invoice_id: context.params.invoiceId,
          invoice_numero: after.numero,
          cliente_nome: after.cliente_nome,
          valor_venda: after.total,
          percentual_comissao: vendedor.comissao_padrao || 10,
          valor_comissao: comissaoTotal,
          data_venda: after.data_emissao,
          status: 'pendente',
          semana_referencia: semanaReferencia,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log('Comissão calculada:', comissaoTotal, 'para fatura:', after.numero);

      } catch (error) {
        console.error('Erro ao calcular comissão:', error);
      }
    }
  });

/**
 * Função auxiliar para obter semana de referência (formato: YYYY-WXX)
 */
function getSemanaReferencia(data: Date): string {
  const ano = data.getFullYear();

  // Calcular número da semana
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${ano}-W${String(weekNo).padStart(2, '0')}`;
}

// ============================================
// 2) ATUALIZAÇÃO AUTOMÁTICA DE ESTOQUE
// ============================================

/**
 * Trigger: Ao criar uma fatura
 * Decrementa o estoque dos produtos vendidos
 */
export const atualizarEstoqueOnInvoiceCreate = functions.firestore
  .document('invoices/{invoiceId}')
  .onCreate(async (snap, context) => {
    const invoice = snap.data() as InvoiceData;

    // Só atualiza estoque se não for rascunho
    if (invoice.status === 'rascunho') {
      return;
    }

    const batch = db.batch();

    for (const item of invoice.items) {
      const produtoRef = db.collection('produtos').doc(item.produto_id);
      const produtoDoc = await produtoRef.get();

      if (produtoDoc.exists) {
        const produto = produtoDoc.data() as ProdutoData;
        const estoqueAnterior = produto.quantidade_estoque || 0;
        const estoqueNovo = Math.max(0, estoqueAnterior - item.quantidade);

        // Atualizar estoque do produto
        batch.update(produtoRef, {
          quantidade_estoque: estoqueNovo,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Registrar movimentação de estoque
        const movRef = db.collection('estoque_movimentacao').doc();
        batch.set(movRef, {
          produto_id: item.produto_id,
          produto_nome: item.produto_nome,
          tipo: 'saida',
          quantidade: item.quantidade,
          quantidade_anterior: estoqueAnterior,
          quantidade_nova: estoqueNovo,
          motivo: 'Venda',
          referencia_id: context.params.invoiceId,
          referencia_tipo: 'invoice',
          created_by: invoice.vendedor_id,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    console.log('Estoque atualizado para fatura:', invoice.numero);
  });

/**
 * Trigger: Ao atualizar status da fatura para 'cancelado'
 * Restaura o estoque dos produtos
 */
export const restaurarEstoqueOnInvoiceCancel = functions.firestore
  .document('invoices/{invoiceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as InvoiceData;
    const after = change.after.data() as InvoiceData;

    // Só restaura se mudou para cancelado
    if (before.status !== 'cancelado' && after.status === 'cancelado') {
      const batch = db.batch();

      for (const item of after.items) {
        const produtoRef = db.collection('produtos').doc(item.produto_id);
        const produtoDoc = await produtoRef.get();

        if (produtoDoc.exists) {
          const produto = produtoDoc.data() as ProdutoData;
          const estoqueAnterior = produto.quantidade_estoque || 0;
          const estoqueNovo = estoqueAnterior + item.quantidade;

          // Restaurar estoque
          batch.update(produtoRef, {
            quantidade_estoque: estoqueNovo,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Registrar movimentação de entrada
          const movRef = db.collection('estoque_movimentacao').doc();
          batch.set(movRef, {
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            tipo: 'entrada',
            quantidade: item.quantidade,
            quantidade_anterior: estoqueAnterior,
            quantidade_nova: estoqueNovo,
            motivo: 'Cancelamento de venda',
            referencia_id: context.params.invoiceId,
            referencia_tipo: 'invoice',
            created_by: after.vendedor_id,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      await batch.commit();
      console.log('Estoque restaurado para fatura cancelada:', after.numero);
    }
  });

// ============================================
// 3) VALIDAÇÃO DE PERMISSÕES - HTTPS FUNCTIONS
// ============================================

/**
 * Valida se usuário pode criar/editar venda
 * Retorna erro se vendedor tentar criar para outro vendedor
 */
export const validarCriacaoVenda = functions.https.onCall(async (data, context) => {
  // Verificar autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  const { vendedor_id, tipo } = data; // tipo: 'invoice' | 'estimate'

  // Buscar dados do usuário autenticado
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Usuário não encontrado');
  }

  const user = userDoc.data() as UserData;

  // Admin pode criar para qualquer vendedor
  if (user.role === 'admin') {
    return { permitido: true, mensagem: 'Admin autorizado' };
  }

  // Vendedor só pode criar para si mesmo
  if (user.role === 'vendedor') {
    if (vendedor_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Vendedor só pode criar vendas para si mesmo'
      );
    }

    // Verificar se vendedor está ativo
    if (!user.ativo) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Vendedor inativo não pode criar vendas'
      );
    }

    return { permitido: true, mensagem: 'Vendedor autorizado' };
  }

  throw new functions.https.HttpsError('permission-denied', 'Permissão negada');
});

/**
 * Valida se usuário pode editar venda existente
 */
export const validarEdicaoVenda = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  const { documento_id, tipo, colecao } = data;

  // Buscar documento
  const docRef = db.collection(colecao).doc(documento_id);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Documento não encontrado');
  }

  const documento = docSnap.data() as InvoiceData;

  // Buscar usuário
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  // Admin pode editar qualquer documento
  if (user.role === 'admin') {
    return { permitido: true, mensagem: 'Admin autorizado' };
  }

  // Vendedor só pode editar seus próprios documentos
  if (user.role === 'vendedor') {
    if (documento.vendedor_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Vendedor só pode editar suas próprias vendas'
      );
    }

    // Não pode editar se já foi pago (apenas admin pode)
    if (documento.status === 'pago') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Venda paga só pode ser editada por admin'
      );
    }

    return { permitido: true, mensagem: 'Vendedor autorizado' };
  }

  throw new functions.https.HttpsError('permission-denied', 'Permissão negada');
});

// ============================================
// 4) CONTROLE DE CONSIGNADO
// ============================================

/**
 * Trigger: Ao criar cliente marcado como consignado
 * Cria registro de controle de estoque consignado
 */
export const criarControleConsignado = functions.firestore
  .document('clientes/{clienteId}')
  .onCreate(async (snap, context) => {
    const cliente = snap.data();

    // Se cliente é consignado, criar coleção de controle
    if (cliente.tipo === 'consignado' || cliente.consignado === true) {
      await db.collection('clientes_consignado').doc(context.params.clienteId).set({
        cliente_id: context.params.clienteId,
        cliente_nome: cliente.nome,
        limite_credito: cliente.limite_credito || 0,
        saldo_devedor: 0,
        produtos_consignados: [],
        status: 'ativo',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Controle de consignado criado para:', cliente.nome);
    }
  });

/**
 * Trigger: Ao criar fatura para cliente consignado
 * Atualiza saldo devedor e registra produtos consignados
 */
export const atualizarConsignadoOnVenda = functions.firestore
  .document('invoices/{invoiceId}')
  .onCreate(async (snap, context) => {
    const invoice = snap.data() as InvoiceData;

    // Verificar se cliente é consignado
    const clienteConsignadoRef = db.collection('clientes_consignado').doc(invoice.cliente_id);
    const clienteConsignadoDoc = await clienteConsignadoRef.get();

    if (clienteConsignadoDoc.exists) {
      const clienteConsignado = clienteConsignadoDoc.data()!;

      // Calcular novo saldo devedor
      const novoSaldo = (clienteConsignado.saldo_devedor || 0) + invoice.total;

      // Verificar limite de crédito
      if (novoSaldo > (clienteConsignado.limite_credito || 0)) {
        // Log de alerta (não bloqueia a venda, apenas registra)
        console.warn('Cliente consignado excedeu limite:', invoice.cliente_nome, 'Saldo:', novoSaldo);
      }

      // Atualizar saldo e adicionar produtos
      const produtosConsignados = invoice.items.map((item: InvoiceItem) => ({
        produto_id: item.produto_id,
        produto_nome: item.produto_nome,
        quantidade: item.quantidade,
        valor: item.subtotal,
        data_venda: invoice.data_emissao,
        invoice_id: context.params.invoiceId,
        pago: false,
      }));

      await clienteConsignadoRef.update({
        saldo_devedor: novoSaldo,
        produtos_consignados: admin.firestore.FieldValue.arrayUnion(...produtosConsignados),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Consignado atualizado:', invoice.cliente_nome, 'Novo saldo:', novoSaldo);
    }
  });

/**
 * HTTPS Function: Registrar pagamento de consignado
 */
export const registrarPagamentoConsignado = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  const { cliente_id, valor_pago, produtos_pagos } = data;

  // Buscar controle de consignado
  const consignadoRef = db.collection('clientes_consignado').doc(cliente_id);
  const consignadoDoc = await consignadoRef.get();

  if (!consignadoDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente consignado não encontrado');
  }

  const consignado = consignadoDoc.data()!;

  // Verificar permissão (admin ou vendedor dono)
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  if (user.role !== 'admin') {
    // Buscar cliente para verificar vendedor
    const clienteDoc = await db.collection('clientes').doc(cliente_id).get();
    const cliente = clienteDoc.data()!;

    if (cliente.vendedor_id !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Sem permissão');
    }
  }

  // Calcular novo saldo
  const novoSaldo = Math.max(0, (consignado.saldo_devedor || 0) - valor_pago);

  // Atualizar produtos como pagos
  const produtosAtualizados = (consignado.produtos_consignados || []).map((p: any) => {
    if (produtos_pagos.includes(p.invoice_id)) {
      return { ...p, pago: true, data_pagamento: admin.firestore.FieldValue.serverTimestamp() };
    }
    return p;
  });

  await consignadoRef.update({
    saldo_devedor: novoSaldo,
    produtos_consignados: produtosAtualizados,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Registrar pagamento
  await db.collection('consignado_pagamentos').add({
    cliente_id,
    valor_pago,
    produtos_pagos,
    saldo_anterior: consignado.saldo_devedor,
    saldo_novo: novoSaldo,
    registrado_por: context.auth.uid,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    sucesso: true,
    mensagem: 'Pagamento registrado',
    saldo_anterior: consignado.saldo_devedor,
    saldo_novo: novoSaldo,
  };
});

// ============================================
// 5) FUNÇÕES DE MANUTENÇÃO E SEGURANÇA
// ============================================

/**
 * HTTPS Function: Verificar integridade dos dados
 * Admin apenas - verifica se há vendas sem comissão, estoque negativo, etc.
 */
export const verificarIntegridade = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  // Verificar se é admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  if (user.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Apenas admin');
  }

  const problemas: string[] = [];

  // 1. Verificar faturas pagas sem comissão
  const faturasPagas = await db.collection('invoices')
    .where('status', '==', 'pago')
    .get();

  for (const doc of faturasPagas.docs) {
    const comissao = await db.collection('comissoes')
      .where('invoice_id', '==', doc.id)
      .get();

    if (comissao.empty) {
      problemas.push(`Fatura ${doc.data().numero} paga sem comissão`);
    }
  }

  // 2. Verificar produtos com estoque negativo
  const produtos = await db.collection('produtos').get();
  for (const doc of produtos.docs) {
    const produto = doc.data() as ProdutoData;
    if (produto.quantidade_estoque < 0) {
      problemas.push(`Produto ${produto.nome} com estoque negativo: ${produto.quantidade_estoque}`);
    }
  }

  // 3. Verificar clientes consignado com saldo negativo
  const consignados = await db.collection('clientes_consignado').get();
  for (const doc of consignados.docs) {
    const consignado = doc.data();
    if (consignado.saldo_devedor < 0) {
      problemas.push(`Cliente consignado ${consignado.cliente_nome} com saldo negativo`);
    }
  }

  return {
    verificado: true,
    total_problemas: problemas.length,
    problemas: problemas,
  };
});

/**
 * Scheduled Function: Limpar logs de auditoria antigos
 * Executa mensalmente para manter apenas 6 meses de logs
 */
export const limparLogsAuditoriaAntigos = functions.pubsub
  .schedule('0 4 1 * *') // 4:00 AM no primeiro dia de cada mês
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    const dataLimite = new Date();
    dataLimite.setMonth(dataLimite.getMonth() - 6); // 6 meses atrás

    try {
      const logsAntigos = await db.collection('audit_logs')
        .where('created_at', '<', admin.firestore.Timestamp.fromDate(dataLimite))
        .get();

      const batch = db.batch();
      let excluidos = 0;

      for (const doc of logsAntigos.docs) {
        batch.delete(doc.ref);
        excluidos++;

        // Commit a cada 500 operações
        if (excluidos % 500 === 0) {
          await batch.commit();
        }
      }

      await batch.commit();
      console.log(`Limpeza de logs concluída. ${excluidos} logs excluídos.`);

      return { excluidos };

    } catch (error) {
      console.error('Erro ao limpar logs antigos:', error);
      return { erro: error };
    }
  });

// ============================================
// 6) FUNÇÕES DE RELATÓRIO (BACKEND)
// ============================================

/**
 * HTTPS Function: Gerar relatório de vendas
 * Calcula totais no backend para evitar manipulação no frontend
 */
export const gerarRelatorioVendas = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  const { data_inicio, data_fim, vendedor_id } = data;

  // Verificar permissão
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const user = userDoc.data() as UserData;

  // Se não for admin, só pode ver próprios dados
  let query = db.collection('invoices')
    .where('data_emissao', '>=', admin.firestore.Timestamp.fromDate(new Date(data_inicio)))
    .where('data_emissao', '<=', admin.firestore.Timestamp.fromDate(new Date(data_fim)));

  if (user.role !== 'admin') {
    query = query.where('vendedor_id', '==', context.auth.uid);
  } else if (vendedor_id) {
    query = query.where('vendedor_id', '==', vendedor_id);
  }

  const snapshot = await query.get();

  // Calcular totais no backend
  let totalVendas = 0;
  let totalDescontos = 0;
  let totalTaxas = 0;
  let quantidadeFaturas = 0;
  const vendasPorStatus: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const invoice = doc.data() as InvoiceData;
    totalVendas += invoice.total || 0;
    totalDescontos += invoice.desconto || 0;
    totalTaxas += invoice.taxa || 0;
    quantidadeFaturas++;

    const status = invoice.status || 'desconhecido';
    vendasPorStatus[status] = (vendasPorStatus[status] || 0) + invoice.total;
  });

  return {
    periodo: { inicio: data_inicio, fim: data_fim },
    totais: {
      vendas: totalVendas,
      descontos: totalDescontos,
      taxas: totalTaxas,
      quantidade: quantidadeFaturas,
    },
    por_status: vendasPorStatus,
    calculado_no_backend: true, // Confirma que cálculo foi feito no servidor
  };
});

console.log('BBVIC Cloud Functions inicializadas');
