// ============================================
// BBVIC GESTÃO - PDF GENERATOR (LEGACY - USA pdfService.ts)
// ============================================

import { generateEstimatePDF, generateInvoicePDF } from './pdfService';
import type { Estimate, Invoice } from '@/types';

interface VendedorInfo {
  nome: string;
  email: string;
  telefone?: string;
}

// Exportar funções para manter compatibilidade
export { generateEstimatePDF, generateInvoicePDF };

// Funções legadas para compatibilidade (mantidas para não quebrar código existente)
export const generateEstimatePDFOld = (
  estimate: Estimate,
  _vendedorInfo?: VendedorInfo,
  _isAdmin: boolean = false
) => {
  generateEstimatePDF(estimate);
};

export const generateInvoicePDFOld = (
  invoice: Invoice,
  _vendedorInfo?: VendedorInfo,
  _isAdmin: boolean = false
) => {
  generateInvoicePDF(invoice);
};

export default {
  generateEstimatePDF,
  generateInvoicePDF,
};
