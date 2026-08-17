// ============================================
// BBVIC GESTÃO - TIPOS
// ============================================

// ----------------------------------------
// PERMISSÕES
// ----------------------------------------

export type Permissao = 
  | 'dashboard' | 'clientes' | 'faturas' | 'orcamentos' 
  | 'agenda' | 'estoque' | 'compras' | 'despesas' 
  | 'contas_pagar' | 'contas_receber' | 'relatorios' 
  | 'comissoes' | 'vendedores' | 'configuracoes' | 'caixa'
  | 'quilometragem' | 'projetos'

export const TODAS_PERMISSOES: Permissao[] = [
  'dashboard', 'clientes', 'faturas', 'orcamentos',
  'agenda', 'estoque', 'compras', 'despesas',
  'contas_pagar', 'contas_receber', 'relatorios',
  'comissoes', 'vendedores', 'configuracoes', 'caixa',
  'quilometragem', 'projetos'
]

export const LABEL_PERMISSOES: Record<Permissao, string> = {
  dashboard: 'Dashboard',
  clientes: 'Clientes',
  faturas: 'Faturas',
  orcamentos: 'Orçamentos',
  agenda: 'Agenda',
  estoque: 'Estoque',
  compras: 'Compras',
  despesas: 'Despesas',
  contas_pagar: 'Contas a Pagar',
  contas_receber: 'Contas a Receber',
  relatorios: 'Relatórios',
  comissoes: 'Comissões',
  vendedores: 'Usuários',
  configuracoes: 'Configurações',
  caixa: 'Caixa',
  quilometragem: 'Quilometragem',
  projetos: 'Projetos'
}

// ----------------------------------------
// USUÁRIO
// ----------------------------------------

export interface User {
  uid: string;
  email: string;
  nome: string;
  role: 'admin' | 'vendedor' | 'personalizado';
  ativo: boolean;
  telefone?: string;
  foto_url?: string;
  avatar_url?: string;
  comissao_percentual?: number;
  ver_todos_clientes?: boolean;
  permissoes?: Permissao[];
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
  last_login?: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  nome: string;
  telefone?: string;
  comissao_percentual?: number;
  role?: 'vendedor' | 'personalizado';
  permissoes?: Permissao[];
}

// ----------------------------------------
// CLIENTE
// ----------------------------------------

export interface Cliente {
  id?: string;
  nome: string;
  email?: string;
  telefone: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  tipo?: 'pessoa' | 'empresa';
  documento?: string;
  observacoes?: string;
  notas?: string;
  status: 'ativo' | 'inativo';
  vendedor_id: string;
  vendedor_nome?: string;
  total_gasto?: number;
  ultima_compra?: Date;
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
  data_nascimento?: string;
}

// ----------------------------------------
// PRODUTO/SERVIÇO
// ----------------------------------------

export interface Produto {
  id?: string;
  nome: string;
  descricao?: string;
  marca?: string;
  preco_custo: number;
  preco_venda: number;
  quantidade?: number;
  quantidade_minima?: number;
  estoque?: number;
  estoque_minimo?: number;
  eh_kit?: boolean;
  kit_itens?: { produto_id: string; produto_nome: string; quantidade: number }[];
  unidade?: 'un' | 'kg' | 'g' | 'ml' | 'l' | 'hr' | 'session' | 'pacote';
  categoria?: 'produto' | 'servico' | 'pacote' | string;
  foto_url?: string;
  ativo: boolean;
  // Comissão personalizada (null = usar comissão padrão do vendedor)
  comissao_percentual?: number | null;
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
}

// ----------------------------------------
// ITEM DE DOCUMENTO (Invoice/Estimate)
// ----------------------------------------

export interface DocumentItem {
  id?: string;
  produto_id: string;
  produto_nome: string;
  descricao?: string;
  quantidade: number;
  preco_unitario: number;
  preco_original?: number;
  desconto?: number;
  subtotal: number;
  // Comissão aplicada neste item (para controle)
  comissao_percentual?: number;
  comissao_valor?: number;
}

// ----------------------------------------
// FATURA (INVOICE)
// ----------------------------------------

export interface Invoice {
  id?: string;
  numero: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_endereco?: string;
  items: DocumentItem[];
  subtotal: number;
  desconto: number;
  taxa: number;
  total: number;
  status: 'rascunho' | 'enviado' | 'pago' | 'parcial' | 'atrasado' | 'cancelado';
  data_emissao: any;
  data_vencimento: any;
  data_pagamento?: any;
  valor_pago?: number;
  observacoes?: string;
  vendedor_id?: string;
  vendedor_nome?: string;
  vendedor_comissao_percentual?: number;
  comissao_total?: number;
  public_token?: string;
  visualizado?: boolean;
  visualizado_count?: number;
  notificacao_enviada?: boolean;
  lembretes_enviados?: number;
  tipo_pagamento?: 'avista' | 'parcelado';
  numero_parcelas?: number;
  parcelas?: Parcela[];
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
}

export interface Parcela {
  numero: number;
  valor: number;
  data_vencimento: Date;
  pago: boolean;
  data_pagamento?: Date;
}

// ----------------------------------------
// ORÇAMENTO (ESTIMATE)
// ----------------------------------------

export interface Estimate {
  id?: string;
  numero: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_endereco?: string;
  items: DocumentItem[];
  subtotal: number;
  desconto: number;
  taxa: number;
  total: number;
  status: 'rascunho' | 'enviado' | 'visualizado' | 'aprovado' | 'recusado' | 'rejeitado' | 'convertido' | 'expirado';
  validade_dias: number;
  data_emissao: any;
  data_validade: any;
  data_aprovacao?: any;
  observacoes?: string;
  termos_condicoes?: string;
  vendedor_id: string;
  vendedor_nome: string;
  vendedor_comissao_percentual?: number;
  comissao_total?: number;
  public_token?: string;
  visualizado?: boolean;
  visualizado_em?: Date;
  visualizado_count?: number;
  invoice_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

// ----------------------------------------
// DESPESA
// ----------------------------------------

export interface Despesa {
  id?: string;
  descricao: string;
  valor: number;
  categoria: string;
  categoria_nome?: string;
  data: any;
  vendedor_id?: string;
  vendedor_nome?: string;
  comissao_id?: string;
  periodo_inicio?: Date;
  periodo_fim?: Date;
  observacoes?: string;
  comprovante_url?: string;
  aprovado?: boolean;
  aprovado_por?: string;
  aprovado_por_nome?: string;
  data_aprovacao?: Date;
  created_at?: Date;
  created_by?: string;
}

// Alias for compatibility
export type Expense = Despesa;

// ----------------------------------------
// NOTIFICAÇÃO
// ----------------------------------------

export interface Notificacao {
  id?: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  usuario_id: string;
  documento_id?: string;
  documento_tipo?: 'invoice' | 'estimate';
  documento_numero?: string;
  cliente_nome?: string;
  valor?: number;
  lida: boolean;
  created_at?: any;
}

// ----------------------------------------
// COMISSÃO DE VENDEDOR
// ----------------------------------------

export interface ComissaoVendedor {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  comissao_percentual: number;
  // Período
  data_inicio: Date;
  data_fim: Date;
  // Valores
  total_vendas: number;
  valor_comissao: number;
  // Status
  status: 'pendente' | 'pago';
  data_pagamento?: Date;
  pago_por?: string;
  pago_por_nome?: string;
  observacoes?: string;
  // Faturas incluídas
  invoices_ids: string[];
  created_at?: any;
  updated_at?: any;
}

// ----------------------------------------
// PONTO (TIME TRACKING)
// ----------------------------------------

export interface PontoRegistro {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  tipo: 'entrada' | 'saida' | 'almoco_inicio' | 'almoco_fim';
  timestamp: Date;
  localizacao?: {
    latitude: number;
    longitude: number;
  };
  observacao?: string;
  created_at?: Date;
}

// ----------------------------------------
// QUILOMETRAGEM
// ----------------------------------------

export interface Quilometragem {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  data: Date;
  km_inicial: number;
  km_final: number;
  km_total: number;
  origem: string;
  destino: string;
  motivo: string;
  valor_reembolso?: number;
  created_at?: Date;
}

// ----------------------------------------
// AGENDA/COMPROMISSO
// ----------------------------------------

export interface Compromisso {
  id?: string;
  titulo: string;
  descricao?: string;
  cliente_id?: string;
  cliente_nome?: string;
  data_inicio: Date;
  data_fim: Date;
  tipo: 'visita' | 'ligacao' | 'reuniao' | 'outro';
  status: 'pendente' | 'confirmado' | 'cancelado' | 'concluido';
  vendedor_id: string;
  vendedor_nome: string;
  created_at?: Date;
  updated_at?: Date;
}
