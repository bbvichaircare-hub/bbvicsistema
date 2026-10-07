// ============================================
// BBVIC GESTAO PREMIUM - DADOS MOCKADOS
// ============================================

import type { User, Cliente, Produto, Invoice, Estimate, DocumentItem, Atividade, MetricasDashboard } from '@/types';

// -----------------------------
// HELPERS
// -----------------------------

export const generatePublicToken = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const generateInvoiceNumber = (): string => {
  const prefix = 'INV';
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}-${random}`;
};

export const generateEstimateNumber = (): string => {
  const prefix = 'EST';
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}-${random}`;
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

export const isInvoiceOverdue = (invoice: Invoice): boolean => {
  if (invoice.status === 'pago' || invoice.status === 'cancelado') return false;
  const hoje = new Date();
  const vencimento = new Date(invoice.data_vencimento);
  return vencimento < hoje;
};

export const isEstimateExpired = (estimate: Estimate): boolean => {
  if (estimate.status === 'convertido' || estimate.status === 'aprovado' || estimate.status === 'recusado') return false;
  const hoje = new Date();
  const validade = new Date(estimate.data_validade);
  return validade < hoje;
};

export const getDaysOverdue = (invoice: Invoice): number => {
  if (!isInvoiceOverdue(invoice)) return 0;
  const hoje = new Date();
  const vencimento = new Date(invoice.data_vencimento);
  const diff = hoje.getTime() - vencimento.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const getDaysUntilExpiry = (estimate: Estimate): number => {
  const hoje = new Date();
  const validade = new Date(estimate.data_validade);
  const diff = validade.getTime() - hoje.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// -----------------------------
// USUARIOS
// -----------------------------

export const mockUsers: User[] = [
  {
    uid: 'admin-001',
    email: 'admin@bbvic.com',
    nome: 'Administrador BBVIC',
    role: 'admin',
    ativo: true,
    telefone: '(305) 555-0000',
    avatar_url: 'https://ui-avatars.com/api/?name=Admin+BBVIC&background=c9a227&color=fff',
    created_at: new Date('2024-01-01'),
    last_login: new Date(),
  },
  {
    uid: 'vendedor-001',
    email: 'maria@bbvic.com',
    nome: 'Maria Santos',
    role: 'vendedor',
    ativo: true,
    telefone: '(305) 555-1111',
    comissao_percentual: 10,
    avatar_url: 'https://ui-avatars.com/api/?name=Maria+Santos&background=22c55e&color=fff',
    created_at: new Date('2024-01-15'),
    created_by: 'admin-001',
    last_login: new Date(),
  },
  {
    uid: 'vendedor-002',
    email: 'joao@bbvic.com',
    nome: 'João Silva',
    role: 'vendedor',
    ativo: true,
    telefone: '(305) 555-2222',
    comissao_percentual: 8,
    avatar_url: 'https://ui-avatars.com/api/?name=Joao+Silva&background=3b82f6&color=fff',
    created_at: new Date('2024-02-01'),
    created_by: 'admin-001',
    last_login: new Date('2024-02-20'),
  },
  {
    uid: 'vendedor-003',
    email: 'ana@bbvic.com',
    nome: 'Ana Oliveira',
    role: 'vendedor',
    ativo: false,
    telefone: '(305) 555-3333',
    comissao_percentual: 12,
    avatar_url: 'https://ui-avatars.com/api/?name=Ana+Oliveira&background=ef4444&color=fff',
    created_at: new Date('2024-01-20'),
    created_by: 'admin-001',
    last_login: new Date('2024-02-10'),
  },
];

// Senhas mockadas (em produção usar Firebase Auth)
export const mockUserPasswords: Record<string, string> = {
  'admin@bbvic.com': 'admin123',
  'maria@bbvic.com': 'maria123',
  'joao@bbvic.com': 'joao123',
  'ana@bbvic.com': 'ana123',
};

// -----------------------------
// CLIENTES
// -----------------------------

export const mockClientes: Cliente[] = [
  {
    id: 'cliente-001',
    nome: 'Sarah Johnson',
    telefone: '(305) 555-1001',
    email: 'sarah.j@email.com',
    empresa: 'Johnson Beauty',
    endereco: '123 Ocean Drive',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33139',
    status: 'ativo',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    total_gasto: 2450.00,
    ultima_compra: new Date('2024-02-15'),
    created_at: new Date('2024-01-10'),
  },
  {
    id: 'cliente-002',
    nome: 'Emily Davis',
    telefone: '(305) 555-1002',
    email: 'emily.davis@email.com',
    endereco: '456 Collins Ave',
    cidade: 'Miami Beach',
    estado: 'FL',
    cep: '33140',
    status: 'ativo',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    total_gasto: 1890.50,
    ultima_compra: new Date('2024-02-10'),
    created_at: new Date('2024-01-15'),
  },
  {
    id: 'cliente-003',
    nome: 'Jessica Williams',
    telefone: '(305) 555-1003',
    email: 'jessica.w@email.com',
    endereco: '789 Lincoln Road',
    cidade: 'Miami Beach',
    estado: 'FL',
    cep: '33139',
    status: 'ativo',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    total_gasto: 3200.00,
    ultima_compra: new Date('2024-02-18'),
    created_at: new Date('2024-01-20'),
  },
  {
    id: 'cliente-004',
    nome: 'Amanda Brown',
    telefone: '(305) 555-1004',
    email: 'amanda.brown@email.com',
    endereco: '321 Biscayne Blvd',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33131',
    status: 'ativo',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    total_gasto: 1500.00,
    ultima_compra: new Date('2024-02-12'),
    created_at: new Date('2024-02-01'),
  },
  {
    id: 'cliente-005',
    nome: 'Michelle Taylor',
    telefone: '(305) 555-1005',
    email: 'michelle.t@email.com',
    endereco: '654 Brickell Ave',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33131',
    status: 'inativo',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    total_gasto: 800.00,
    ultima_compra: new Date('2024-01-25'),
    created_at: new Date('2024-02-05'),
  },
  {
    id: 'cliente-006',
    nome: 'Rachel Martinez',
    telefone: '(305) 555-1006',
    email: 'rachel.m@email.com',
    endereco: '987 Wynwood Blvd',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33127',
    status: 'ativo',
    vendedor_id: 'admin-001',
    vendedor_nome: 'Administrador BBVIC',
    total_gasto: 4500.00,
    ultima_compra: new Date('2024-02-20'),
    created_at: new Date('2024-01-05'),
  },
  {
    id: 'cliente-007',
    nome: 'Laura Garcia',
    telefone: '(305) 555-1007',
    email: 'laura.g@email.com',
    endereco: '147 Coral Way',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33145',
    status: 'ativo',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    total_gasto: 2100.00,
    ultima_compra: new Date('2024-02-14'),
    created_at: new Date('2024-01-25'),
  },
  {
    id: 'cliente-008',
    nome: 'Stephanie Lee',
    telefone: '(305) 555-1008',
    email: 'stephanie.l@email.com',
    endereco: '258 Design District',
    cidade: 'Miami',
    estado: 'FL',
    cep: '33137',
    status: 'ativo',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    total_gasto: 1750.00,
    ultima_compra: new Date('2024-02-16'),
    created_at: new Date('2024-02-10'),
  },
];

// -----------------------------
// PRODUTOS E SERVICOS
// -----------------------------

export const mockProdutos: Produto[] = [
  {
    id: 'produto-001',
    nome: 'Keratin Treatment',
    descricao: 'Professional keratin hair smoothing treatment',
    marca: 'BBVIC Pro',
    preco_custo: 80.00,
    preco_venda: 150.00,
    quantidade: 50,
    quantidade_minima: 10,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'produto-002',
    nome: 'Hair Botox',
    descricao: 'Deep conditioning hair botox treatment',
    marca: 'BBVIC Pro',
    preco_custo: 60.00,
    preco_venda: 120.00,
    quantidade: 40,
    quantidade_minima: 8,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'produto-003',
    nome: 'Hair Color - Full',
    descricao: 'Complete hair coloring service',
    marca: 'BBVIC Pro',
    preco_custo: 40.00,
    preco_venda: 85.00,
    quantidade: 100,
    quantidade_minima: 20,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'produto-004',
    nome: 'Highlights',
    descricao: 'Partial or full highlights',
    marca: 'BBVIC Pro',
    preco_custo: 35.00,
    preco_venda: 75.00,
    quantidade: 80,
    quantidade_minima: 15,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'produto-005',
    nome: 'Haircut & Style',
    descricao: 'Professional haircut and styling',
    marca: 'BBVIC Pro',
    preco_custo: 15.00,
    preco_venda: 45.00,
    quantidade: 200,
    quantidade_minima: 0,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'produto-006',
    nome: 'Deep Conditioning Mask',
    descricao: 'Professional hair mask treatment',
    marca: 'BBVIC Care',
    preco_custo: 25.00,
    preco_venda: 55.00,
    quantidade: 30,
    quantidade_minima: 5,
    unidade: 'session',
    categoria: 'servico',
    ativo: true,
    created_at: new Date('2024-01-15'),
  },
  {
    id: 'produto-007',
    nome: 'Shampoo Professional',
    descricao: 'Sulfate-free professional shampoo 500ml',
    marca: 'BBVIC Care',
    preco_custo: 18.00,
    preco_venda: 35.00,
    quantidade: 25,
    quantidade_minima: 10,
    unidade: 'un',
    categoria: 'produto',
    ativo: true,
    created_at: new Date('2024-01-10'),
  },
  {
    id: 'produto-008',
    nome: 'Conditioner Professional',
    descricao: 'Professional conditioner 500ml',
    marca: 'BBVIC Care',
    preco_custo: 16.00,
    preco_venda: 32.00,
    quantidade: 20,
    quantidade_minima: 8,
    unidade: 'un',
    categoria: 'produto',
    ativo: true,
    created_at: new Date('2024-01-10'),
  },
  {
    id: 'produto-009',
    nome: 'Hair Oil Serum',
    descricao: 'Argan oil hair serum 100ml',
    marca: 'BBVIC Care',
    preco_custo: 22.00,
    preco_venda: 45.00,
    quantidade: 15,
    quantidade_minima: 5,
    unidade: 'un',
    categoria: 'produto',
    ativo: true,
    created_at: new Date('2024-01-20'),
  },
  {
    id: 'produto-010',
    nome: 'Hair Repair Package',
    descricao: 'Complete hair repair treatment package',
    marca: 'BBVIC Pro',
    preco_custo: 120.00,
    preco_venda: 250.00,
    quantidade: 20,
    quantidade_minima: 5,
    unidade: 'pacote',
    categoria: 'pacote',
    ativo: true,
    created_at: new Date('2024-02-01'),
  },
];

// -----------------------------
// ITENS DE DOCUMENTOS
// -----------------------------

const createItems = (items: { produto_id: string; nome: string; qtd: number; preco: number; desc?: string }[]): DocumentItem[] => {
  return items.map((item, index) => ({
    id: `item-${index}`,
    produto_id: item.produto_id,
    produto_nome: item.nome,
    descricao: item.desc,
    quantidade: item.qtd,
    preco_unitario: item.preco,
    desconto: 0,
    subtotal: item.qtd * item.preco,
  }));
};

// -----------------------------
// ORCAMENTOS (ESTIMATES)
// -----------------------------

export const mockEstimates: Estimate[] = [
  {
    id: 'estimate-001',
    numero: 'EST-2024-0001',
    cliente_id: 'cliente-001',
    cliente_nome: 'Sarah Johnson',
    cliente_email: 'sarah.j@email.com',
    cliente_telefone: '(305) 555-1001',
    cliente_endereco: '123 Ocean Drive, Miami, FL 33139',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-001', nome: 'Keratin Treatment', qtd: 1, preco: 150.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
    ]),
    subtotal: 195.00,
    desconto: 0,
    taxa: 0,
    total: 195.00,
    status: 'aprovado',
    validade_dias: 30,
    data_emissao: new Date('2024-02-01'),
    data_validade: new Date('2024-03-02'),
    data_aprovacao: new Date('2024-02-05'),
    observacoes: 'Client approved after consultation',
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-02'),
    visualizado_count: 5,
    convertido_em: new Date('2024-02-05'),
    invoice_id: 'invoice-001',
    created_at: new Date('2024-02-01'),
  },
  {
    id: 'estimate-002',
    numero: 'EST-2024-0002',
    cliente_id: 'cliente-002',
    cliente_nome: 'Emily Davis',
    cliente_email: 'emily.davis@email.com',
    cliente_telefone: '(305) 555-1002',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-003', nome: 'Hair Color - Full', qtd: 1, preco: 85.00 },
      { produto_id: 'produto-004', nome: 'Highlights', qtd: 1, preco: 75.00 },
    ]),
    subtotal: 160.00,
    desconto: 10.00,
    taxa: 0,
    total: 150.00,
    status: 'convertido',
    validade_dias: 30,
    data_emissao: new Date('2024-02-05'),
    data_validade: new Date('2024-03-06'),
    data_aprovacao: new Date('2024-02-08'),
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-06'),
    visualizado_count: 3,
    convertido_em: new Date('2024-02-08'),
    invoice_id: 'invoice-002',
    created_at: new Date('2024-02-05'),
  },
  {
    id: 'estimate-003',
    numero: 'EST-2024-0003',
    cliente_id: 'cliente-004',
    cliente_nome: 'Amanda Brown',
    cliente_email: 'amanda.brown@email.com',
    cliente_telefone: '(305) 555-1004',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    items: createItems([
      { produto_id: 'produto-002', nome: 'Hair Botox', qtd: 1, preco: 120.00 },
      { produto_id: 'produto-006', nome: 'Deep Conditioning Mask', qtd: 1, preco: 55.00 },
    ]),
    subtotal: 175.00,
    desconto: 0,
    taxa: 0,
    total: 175.00,
    status: 'enviado',
    validade_dias: 30,
    data_emissao: new Date('2024-02-18'),
    data_validade: new Date('2024-03-19'),
    observacoes: 'Waiting for client approval',
    public_token: generatePublicToken(),
    visualizado: false,
    visualizado_count: 0,
    created_at: new Date('2024-02-18'),
  },
  {
    id: 'estimate-004',
    numero: 'EST-2024-0004',
    cliente_id: 'cliente-006',
    cliente_nome: 'Rachel Martinez',
    cliente_email: 'rachel.m@email.com',
    cliente_telefone: '(305) 555-1006',
    vendedor_id: 'admin-001',
    vendedor_nome: 'Administrador BBVIC',
    items: createItems([
      { produto_id: 'produto-010', nome: 'Hair Repair Package', qtd: 1, preco: 250.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 2, preco: 45.00 },
    ]),
    subtotal: 340.00,
    desconto: 20.00,
    taxa: 0,
    total: 320.00,
    status: 'visualizado',
    validade_dias: 30,
    data_emissao: new Date('2024-02-15'),
    data_validade: new Date('2024-03-16'),
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-16'),
    visualizado_count: 2,
    created_at: new Date('2024-02-15'),
  },
  {
    id: 'estimate-005',
    numero: 'EST-2024-0005',
    cliente_id: 'cliente-007',
    cliente_nome: 'Laura Garcia',
    cliente_email: 'laura.g@email.com',
    cliente_telefone: '(305) 555-1007',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-001', nome: 'Keratin Treatment', qtd: 1, preco: 150.00 },
    ]),
    subtotal: 150.00,
    desconto: 0,
    taxa: 0,
    total: 150.00,
    status: 'recusado',
    validade_dias: 30,
    data_emissao: new Date('2024-02-10'),
    data_validade: new Date('2024-03-11'),
    observacoes: 'Client chose different service',
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-11'),
    visualizado_count: 1,
    created_at: new Date('2024-02-10'),
  },
  {
    id: 'estimate-006',
    numero: 'EST-2024-0006',
    cliente_id: 'cliente-008',
    cliente_nome: 'Stephanie Lee',
    cliente_email: 'stephanie.l@email.com',
    cliente_telefone: '(305) 555-1008',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    items: createItems([
      { produto_id: 'produto-003', nome: 'Hair Color - Full', qtd: 1, preco: 85.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
      { produto_id: 'produto-009', nome: 'Hair Oil Serum', qtd: 1, preco: 45.00, desc: 'Take home product' },
    ]),
    subtotal: 175.00,
    desconto: 0,
    taxa: 0,
    total: 175.00,
    status: 'rascunho',
    validade_dias: 30,
    data_emissao: new Date('2024-02-20'),
    data_validade: new Date('2024-03-21'),
    public_token: generatePublicToken(),
    visualizado: false,
    visualizado_count: 0,
    created_at: new Date('2024-02-20'),
  },
];

// -----------------------------
// INVOICES (FATURAS)
// -----------------------------

export const mockInvoices: Invoice[] = [
  {
    id: 'invoice-001',
    numero: 'INV-2024-0001',
    cliente_id: 'cliente-001',
    cliente_nome: 'Sarah Johnson',
    cliente_email: 'sarah.j@email.com',
    cliente_telefone: '(305) 555-1001',
    cliente_endereco: '123 Ocean Drive, Miami, FL 33139',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-001', nome: 'Keratin Treatment', qtd: 1, preco: 150.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
    ]),
    subtotal: 195.00,
    desconto: 0,
    taxa: 0,
    total: 195.00,
    valor_pago: 195.00,
    valor_restante: 0,
    status: 'pago',
    data_emissao: new Date('2024-02-05'),
    data_vencimento: new Date('2024-03-05'),
    data_pagamento: new Date('2024-02-10'),
    observacoes: 'Paid in full - Credit Card',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-06'),
    visualizado_count: 3,
    notificacao_enviada: false,
    lembretes_enviados: 0,
    estimate_id: 'estimate-001',
    created_at: new Date('2024-02-05'),
  },
  {
    id: 'invoice-002',
    numero: 'INV-2024-0002',
    cliente_id: 'cliente-002',
    cliente_nome: 'Emily Davis',
    cliente_email: 'emily.davis@email.com',
    cliente_telefone: '(305) 555-1002',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-003', nome: 'Hair Color - Full', qtd: 1, preco: 85.00 },
      { produto_id: 'produto-004', nome: 'Highlights', qtd: 1, preco: 75.00 },
    ]),
    subtotal: 160.00,
    desconto: 10.00,
    taxa: 0,
    total: 150.00,
    valor_pago: 150.00,
    valor_restante: 0,
    status: 'pago',
    data_emissao: new Date('2024-02-08'),
    data_vencimento: new Date('2024-03-08'),
    data_pagamento: new Date('2024-02-15'),
    observacoes: 'Paid - Cash',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-09'),
    visualizado_count: 2,
    notificacao_enviada: false,
    lembretes_enviados: 0,
    estimate_id: 'estimate-002',
    created_at: new Date('2024-02-08'),
  },
  {
    id: 'invoice-003',
    numero: 'INV-2024-0003',
    cliente_id: 'cliente-003',
    cliente_nome: 'Jessica Williams',
    cliente_email: 'jessica.w@email.com',
    cliente_telefone: '(305) 555-1003',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-010', nome: 'Hair Repair Package', qtd: 1, preco: 250.00 },
      { produto_id: 'produto-006', nome: 'Deep Conditioning Mask', qtd: 1, preco: 55.00 },
    ]),
    subtotal: 305.00,
    desconto: 0,
    taxa: 0,
    total: 305.00,
    valor_pago: 0,
    valor_restante: 305.00,
    status: 'atrasado',
    data_emissao: new Date('2024-01-15'),
    data_vencimento: new Date('2024-02-15'),
    observacoes: 'OVERDUE - Payment reminder sent',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-01-20'),
    visualizado_count: 8,
    notificacao_enviada: true,
    notificacao_enviada_em: new Date('2024-02-16'),
    lembretes_enviados: 2,
    created_at: new Date('2024-01-15'),
  },
  {
    id: 'invoice-004',
    numero: 'INV-2024-0004',
    cliente_id: 'cliente-006',
    cliente_nome: 'Rachel Martinez',
    cliente_email: 'rachel.m@email.com',
    cliente_telefone: '(305) 555-1006',
    vendedor_id: 'admin-001',
    vendedor_nome: 'Administrador BBVIC',
    items: createItems([
      { produto_id: 'produto-001', nome: 'Keratin Treatment', qtd: 2, preco: 150.00 },
      { produto_id: 'produto-002', nome: 'Hair Botox', qtd: 1, preco: 120.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
    ]),
    subtotal: 465.00,
    desconto: 15.00,
    taxa: 0,
    total: 450.00,
    valor_pago: 200.00,
    valor_restante: 250.00,
    status: 'parcial',
    data_emissao: new Date('2024-02-10'),
    data_vencimento: new Date('2024-03-10'),
    observacoes: 'Partial payment received',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-02-11'),
    visualizado_count: 4,
    notificacao_enviada: false,
    lembretes_enviados: 0,
    created_at: new Date('2024-02-10'),
  },
  {
    id: 'invoice-005',
    numero: 'INV-2024-0005',
    cliente_id: 'cliente-007',
    cliente_nome: 'Laura Garcia',
    cliente_email: 'laura.g@email.com',
    cliente_telefone: '(305) 555-1007',
    vendedor_id: 'vendedor-001',
    vendedor_nome: 'Maria Santos',
    items: createItems([
      { produto_id: 'produto-004', nome: 'Highlights', qtd: 1, preco: 75.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
    ]),
    subtotal: 120.00,
    desconto: 0,
    taxa: 0,
    total: 120.00,
    valor_pago: 0,
    valor_restante: 120.00,
    status: 'enviado',
    data_emissao: new Date('2024-02-18'),
    data_vencimento: new Date('2024-03-18'),
    observacoes: 'Sent to client',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: false,
    visualizado_count: 0,
    notificacao_enviada: false,
    lembretes_enviados: 0,
    created_at: new Date('2024-02-18'),
  },
  {
    id: 'invoice-006',
    numero: 'INV-2024-0006',
    cliente_id: 'cliente-004',
    cliente_nome: 'Amanda Brown',
    cliente_email: 'amanda.brown@email.com',
    cliente_telefone: '(305) 555-1004',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    items: createItems([
      { produto_id: 'produto-003', nome: 'Hair Color - Full', qtd: 1, preco: 85.00 },
    ]),
    subtotal: 85.00,
    desconto: 0,
    taxa: 0,
    total: 85.00,
    valor_pago: 0,
    valor_restante: 85.00,
    status: 'atrasado',
    data_emissao: new Date('2024-01-20'),
    data_vencimento: new Date('2024-02-20'),
    observacoes: 'OVERDUE - Multiple reminders sent',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: true,
    visualizado_em: new Date('2024-01-25'),
    visualizado_count: 6,
    notificacao_enviada: true,
    notificacao_enviada_em: new Date('2024-02-21'),
    lembretes_enviados: 3,
    created_at: new Date('2024-01-20'),
  },
  {
    id: 'invoice-007',
    numero: 'INV-2024-0007',
    cliente_id: 'cliente-008',
    cliente_nome: 'Stephanie Lee',
    cliente_email: 'stephanie.l@email.com',
    cliente_telefone: '(305) 555-1008',
    vendedor_id: 'vendedor-002',
    vendedor_nome: 'João Silva',
    items: createItems([
      { produto_id: 'produto-002', nome: 'Hair Botox', qtd: 1, preco: 120.00 },
      { produto_id: 'produto-005', nome: 'Haircut & Style', qtd: 1, preco: 45.00 },
    ]),
    subtotal: 165.00,
    desconto: 0,
    taxa: 0,
    total: 165.00,
    valor_pago: 0,
    valor_restante: 165.00,
    status: 'rascunho',
    data_emissao: new Date('2024-02-20'),
    data_vencimento: new Date('2024-03-20'),
    observacoes: 'Draft - not sent yet',
    tipo_pagamento: 'avista',
    numero_parcelas: 1,
    public_token: generatePublicToken(),
    visualizado: false,
    visualizado_count: 0,
    notificacao_enviada: false,
    lembretes_enviados: 0,
    created_at: new Date('2024-02-20'),
  },
];

// -----------------------------
// ATIVIDADES RECENTES
// -----------------------------

export const mockAtividades: Atividade[] = [
  {
    id: 'act-001',
    tipo: 'invoice_pago',
    descricao: 'Invoice INV-2024-0001 was paid',
    usuario_id: 'vendedor-001',
    usuario_nome: 'Maria Santos',
    documento_id: 'invoice-001',
    documento_tipo: 'invoice',
    documento_numero: 'INV-2024-0001',
    cliente_id: 'cliente-001',
    cliente_nome: 'Sarah Johnson',
    valor: 195.00,
    created_at: new Date('2024-02-10T14:30:00'),
  },
  {
    id: 'act-002',
    tipo: 'estimate_aprovado',
    descricao: 'Estimate EST-2024-0001 was approved',
    usuario_id: 'cliente-001',
    usuario_nome: 'Sarah Johnson',
    documento_id: 'estimate-001',
    documento_tipo: 'estimate',
    documento_numero: 'EST-2024-0001',
    cliente_id: 'cliente-001',
    cliente_nome: 'Sarah Johnson',
    valor: 195.00,
    created_at: new Date('2024-02-05T10:15:00'),
  },
  {
    id: 'act-003',
    tipo: 'documento_visualizado',
    descricao: 'Invoice INV-2024-0003 was viewed by client',
    usuario_id: 'cliente-003',
    usuario_nome: 'Jessica Williams',
    documento_id: 'invoice-003',
    documento_tipo: 'invoice',
    documento_numero: 'INV-2024-0003',
    cliente_id: 'cliente-003',
    cliente_nome: 'Jessica Williams',
    created_at: new Date('2024-02-19T09:45:00'),
  },
  {
    id: 'act-004',
    tipo: 'cliente_criado',
    descricao: 'New client Stephanie Lee was added',
    usuario_id: 'vendedor-002',
    usuario_nome: 'João Silva',
    cliente_id: 'cliente-008',
    cliente_nome: 'Stephanie Lee',
    created_at: new Date('2024-02-10T16:00:00'),
  },
  {
    id: 'act-005',
    tipo: 'notificacao_enviada',
    descricao: 'Payment reminder sent for INV-2024-0003',
    usuario_id: 'admin-001',
    usuario_nome: 'Administrador BBVIC',
    documento_id: 'invoice-003',
    documento_tipo: 'invoice',
    documento_numero: 'INV-2024-0003',
    cliente_id: 'cliente-003',
    cliente_nome: 'Jessica Williams',
    created_at: new Date('2024-02-16T11:30:00'),
  },
];

// -----------------------------
// METRICAS DO DASHBOARD
// -----------------------------

export const mockMetricas: MetricasDashboard = {
  // Vendas
  vendasHoje: 450.00,
  vendasSemana: 1890.00,
  vendasMes: 12450.00,
  vendasAno: 45230.00,

  // Invoices
  invoicesTotal: 7,
  invoicesRascunho: 1,
  invoicesEnviados: 1,
  invoicesPagos: 2,
  invoicesAtrasados: 2,
  valorPendente: 1040.00,
  valorAtrasado: 425.00,

  // Estimates
  estimatesTotal: 6,
  estimatesRascunho: 1,
  estimatesEnviados: 1,
  estimatesAprovados: 2,
  estimatesConvertidos: 2,
  taxaConversao: 33.33,

  // Clientes
  totalClientes: 8,
  clientesNovosMes: 3,
  clientesAtivos: 7,

  // Produtos
  totalProdutos: 10,
  produtosEstoqueBaixo: 2,

  // Comissões
  comissoesPendentes: 450.00,
  comissoesPagas: 1200.00,
};

// -----------------------------
// CONFIGURACOES DA EMPRESA
// -----------------------------

export const mockEmpresaConfig = {
  nome: 'BBVIC Hair Care',
  slogan: 'Premium Hair Care Services',
  endereco: '123 Beauty Avenue',
  cidade: 'Miami',
  estado: 'FL',
  cep: '33139',
  telefone: '(305) 555-BBVI',
  email: 'contact@bbvic.com',
  website: 'www.bbvic.com',
  logo_url: '',
  cor_primaria: '#6f2738',
  cor_secundaria: '#000000',
};
