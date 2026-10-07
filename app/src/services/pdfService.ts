// ============================================
// BBVIC GESTÃO - SERVIÇO UNIFICADO DE PDF
// ============================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Estimate, Invoice } from '@/types';

// Cores BBVIC
const COLORS = {
  gold: [111, 39, 56] as [number, number, number],
  goldDark: [154, 123, 26] as [number, number, number],
  black: [26, 26, 26] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  lightGray: [243, 244, 246] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
};

// Nome padrão do admin
const ADMIN_DEFAULT_NAME = 'Julieth Batista Gomes';

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

// Format date
const formatDate = (date: any) => {
  if (!date) return 'N/A';
  const d = new Date((date as any).toDate?.() || date);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ============================================
// GERAR PDF DE ORÇAMENTO
// ============================================
export function generateEstimatePDF(estimate: Estimate, _isPublic: boolean = false, vendedorNome?: string, isAdmin: boolean = false) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Determinar nome do vendedor (admin usa nome padrão)
  const nomeVendedor = isAdmin ? ADMIN_DEFAULT_NAME : (vendedorNome || estimate.vendedor_nome || 'Vendedor');

  // ===== CABEÇALHO SIMPLES COM FUNDO BRANCO =====
  // Logo/Nome da empresa (sem fundo colorido)
  doc.setTextColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('BBVIC', 15, 25);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Hair Care', 15, 32);

  // Nome de quem gerou o documento (abaixo da logo) - SOMENTE O NOME
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.setFontSize(9);
  doc.text(nomeVendedor, 15, 40);

  // Título e número do documento (direita)
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ORÇAMENTO', pageWidth - 15, 22, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(estimate.numero, pageWidth - 15, 30, { align: 'right' });

  // Linha divisória
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 48, pageWidth - 15, 48);

  // ===== SEÇÃO CLIENTE E DETALHES =====
  let yPos = 60;

  // Cliente (esquerda) - DADOS COMPLETOS
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.text('CLIENTE:', 15, yPos);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  // Nome do cliente
  let clienteY = yPos + 7;
  doc.text(estimate.cliente_nome, 15, clienteY);

  // Telefone do cliente
  if (estimate.cliente_telefone) {
    clienteY += 6;
    doc.text(`Tel: ${estimate.cliente_telefone}`, 15, clienteY);
  }

  // Email do cliente
  if (estimate.cliente_email) {
    clienteY += 6;
    doc.text(`Email: ${estimate.cliente_email}`, 15, clienteY);
  }

  // Endereço do cliente
  if (estimate.cliente_endereco) {
    clienteY += 6;
    doc.text(`End: ${estimate.cliente_endereco}`, 15, clienteY);
  }

  // Detalhes (direita)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHES:', pageWidth - 80, yPos);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data Emissão: ${formatDate(estimate.data_emissao)}`, pageWidth - 80, yPos + 7);
  doc.text(`Válido até: ${formatDate(estimate.data_validade)}`, pageWidth - 80, yPos + 14);

  // Status
  const statusLabels: Record<string, string> = {
    'rascunho': 'Rascunho',
    'enviado': 'Enviado',
    'visualizado': 'Visualizado',
    'aprovado': 'Aprovado',
    'recusado': 'Recusado',
    'convertido': 'Convertido',
    'expirado': 'Expirado',
  };
  doc.text(`Status: ${statusLabels[estimate.status] || estimate.status}`, pageWidth - 80, yPos + 21);

  // ===== TABELA DE ITENS =====
  const tableData = estimate.items.map(item => [
    item.produto_nome,
    item.quantidade.toString(),
    formatCurrency(item.preco_unitario),
    formatCurrency(item.subtotal),
  ]);

  autoTable(doc, {
    startY: 100,
    head: [['Descrição', 'Qtd', 'Preço Unit.', 'Subtotal']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.gold,
      textColor: COLORS.black,
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left',
    },
    styles: {
      fontSize: 9,
      cellPadding: 5,
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 45, halign: 'right' },
      3: { cellWidth: 45, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray,
    },
  });

  // ===== TOTAIS =====
  const finalY = (doc as any).lastAutoTable.finalY + 15;

  // Linha separadora
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 110, finalY - 10, pageWidth - 15, finalY - 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // Subtotal
  doc.text('Subtotal:', pageWidth - 110, finalY);
  doc.text(formatCurrency(estimate.subtotal), pageWidth - 15, finalY, { align: 'right' });

  // Desconto
  if (estimate.desconto > 0) {
    doc.text('Desconto:', pageWidth - 110, finalY + 7);
    doc.setTextColor(COLORS.red[0], COLORS.red[1], COLORS.red[2]);
    doc.text(`-${formatCurrency(estimate.desconto)}`, pageWidth - 15, finalY + 7, { align: 'right' });
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  }

  // Taxa
  if (estimate.taxa && estimate.taxa > 0) {
    doc.text('Taxa:', pageWidth - 110, finalY + 14);
    doc.text(formatCurrency(estimate.taxa), pageWidth - 15, finalY + 14, { align: 'right' });
  }

  // Total destacado
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', pageWidth - 110, finalY + 28);
  doc.setTextColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.text(formatCurrency(estimate.total), pageWidth - 15, finalY + 28, { align: 'right' });
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // ===== TERMOS E CONDIÇÕES =====
  if (estimate.termos_condicoes || estimate.observacoes) {
    const yTermos = finalY + 50;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', 15, yTermos);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    const text = estimate.termos_condicoes || estimate.observacoes || '';
    const splitTerms = doc.splitTextToSize(text, pageWidth - 30);
    doc.text(splitTerms, 15, yTermos + 7);
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  }

  // ===== ÁREA DE ASSINATURA =====
  const yAssinatura = pageHeight - 40;

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(15, yAssinatura, 80, yAssinatura);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text('Assinatura do Cliente', 15, yAssinatura + 5);
  doc.text('Data: ____/____/________', 15, yAssinatura + 12);

  // ===== RODAPÉ =====
  doc.setFontSize(9);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text('Obrigado pela preferência!', pageWidth / 2, pageHeight - 15, { align: 'center' });

  // Salvar
  doc.save(`BBVIC_Orcamento_${estimate.numero}.pdf`);
}

// ============================================
// GERAR PDF DE FATURA
// ============================================
export function generateInvoicePDF(invoice: Invoice, _isPublic: boolean = false, vendedorNome?: string, isAdmin: boolean = false) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Determinar nome do vendedor (admin usa nome padrão)
  const nomeVendedor = isAdmin ? ADMIN_DEFAULT_NAME : (vendedorNome || invoice.vendedor_nome || 'Vendedor');

  // ===== CABEÇALHO SIMPLES COM FUNDO BRANCO =====
  // Logo/Nome da empresa (sem fundo colorido)
  doc.setTextColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('BBVIC', 15, 25);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Hair Care', 15, 32);

  // Nome de quem gerou o documento (abaixo da logo) - SOMENTE O NOME
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.setFontSize(9);
  doc.text(nomeVendedor, 15, 40);

  // Título e número do documento (direita)
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FATURA', pageWidth - 15, 22, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.numero, pageWidth - 15, 30, { align: 'right' });

  // Linha divisória
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 48, pageWidth - 15, 48);

  // ===== SEÇÃO CLIENTE E DETALHES =====
  let yPos = 60;

  // Cliente (esquerda) - DADOS COMPLETOS
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.text('CLIENTE:', 15, yPos);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  // Nome do cliente
  let clienteY = yPos + 7;
  doc.text(invoice.cliente_nome, 15, clienteY);

  // Telefone do cliente
  if (invoice.cliente_telefone) {
    clienteY += 6;
    doc.text(`Tel: ${invoice.cliente_telefone}`, 15, clienteY);
  }

  // Email do cliente
  if (invoice.cliente_email) {
    clienteY += 6;
    doc.text(`Email: ${invoice.cliente_email}`, 15, clienteY);
  }

  // Endereço do cliente
  if (invoice.cliente_endereco) {
    clienteY += 6;
    doc.text(`End: ${invoice.cliente_endereco}`, 15, clienteY);
  }

  // Detalhes (direita)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHES:', pageWidth - 80, yPos);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data Emissão: ${formatDate(invoice.data_emissao)}`, pageWidth - 80, yPos + 7);
  doc.text(`Vencimento: ${formatDate(invoice.data_vencimento)}`, pageWidth - 80, yPos + 14);

  // Status
  const statusLabels: Record<string, string> = {
    'rascunho': 'Rascunho',
    'enviado': 'Enviado',
    'visualizado': 'Visualizado',
    'pago': 'Pago',
    'parcial': 'Parcial',
    'atrasado': 'Atrasado',
    'cancelado': 'Cancelado',
  };
  doc.text(`Status: ${statusLabels[invoice.status] || invoice.status}`, pageWidth - 80, yPos + 21);

  // ===== TABELA DE ITENS =====
  const tableData = invoice.items.map(item => [
    item.produto_nome,
    item.quantidade.toString(),
    formatCurrency(item.preco_unitario),
    formatCurrency(item.subtotal),
  ]);

  autoTable(doc, {
    startY: 100,
    head: [['Descrição', 'Qtd', 'Preço Unit.', 'Subtotal']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.gold,
      textColor: COLORS.black,
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left',
    },
    styles: {
      fontSize: 9,
      cellPadding: 5,
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 45, halign: 'right' },
      3: { cellWidth: 45, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray,
    },
  });

  // ===== TOTAIS =====
  const finalY = (doc as any).lastAutoTable.finalY + 15;

  // Linha separadora
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 110, finalY - 10, pageWidth - 15, finalY - 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // Subtotal
  doc.text('Subtotal:', pageWidth - 110, finalY);
  doc.text(formatCurrency(invoice.subtotal), pageWidth - 15, finalY, { align: 'right' });

  // Desconto
  if (invoice.desconto > 0) {
    doc.text('Desconto:', pageWidth - 110, finalY + 7);
    doc.setTextColor(COLORS.red[0], COLORS.red[1], COLORS.red[2]);
    doc.text(`-${formatCurrency(invoice.desconto)}`, pageWidth - 15, finalY + 7, { align: 'right' });
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  }

  // Taxa
  if (invoice.taxa && invoice.taxa > 0) {
    doc.text('Taxa:', pageWidth - 110, finalY + 14);
    doc.text(formatCurrency(invoice.taxa), pageWidth - 15, finalY + 14, { align: 'right' });
  }

  // Total destacado
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', pageWidth - 110, finalY + 28);
  doc.setTextColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.text(formatCurrency(invoice.total), pageWidth - 15, finalY + 28, { align: 'right' });
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // ===== OBSERVAÇÕES =====
  if (invoice.observacoes) {
    const yObs = finalY + 50;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', 15, yObs);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    const splitObs = doc.splitTextToSize(invoice.observacoes, pageWidth - 30);
    doc.text(splitObs, 15, yObs + 7);
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  }

  // ===== INFORMAÇÕES DE PAGAMENTO =====
  const yPagamento = finalY + (invoice.observacoes ? 80 : 50);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações de Pagamento:', 15, yPagamento);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text('Pagamento deve ser feito até a data de vencimento.', 15, yPagamento + 7);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // ===== RODAPÉ =====
  doc.setFontSize(9);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text('Obrigado pela preferência!', pageWidth / 2, pageHeight - 15, { align: 'center' });

  // Salvar
  doc.save(`BBVIC_Fatura_${invoice.numero}.pdf`);
}
