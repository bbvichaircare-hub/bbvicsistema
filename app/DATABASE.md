# Estrutura do Banco de Dados (Firestore)

## Collections

### 1. users (Usuários)
```typescript
{
  uid: string,           // ID do Firebase Auth
  email: string,
  nome: string,
  role: 'admin' | 'vendedor',
  ativo: boolean,
  comissao_padrao: number,  // % de comissão
  telefone: string,
  created_at: Timestamp
}
```

### 2. clientes
```typescript
{
  id: string,
  nome: string,
  email: string,
  telefone: string,
  endereco: string,
  cidade: string,
  estado: string,
  cep: string,
  notas: string,
  vendedor_id: string,   // ID do vendedor responsável
  status: 'ativo' | 'inativo',
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### 3. produtos
```typescript
{
  id: string,
  nome: string,
  descricao: string,
  preco_venda: number,
  preco_custo: number,
  quantidade_estoque: number,
  estoque_minimo: number,
  categoria: string,
  comissao_percentual: number,  // % específica do produto
  ativo: boolean,
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### 4. invoices (Faturas)
```typescript
{
  id: string,
  numero: string,        // Ex: FAT-20240226-001
  cliente_id: string,
  cliente_nome: string,
  cliente_email: string,
  cliente_telefone: string,
  cliente_endereco: string,
  items: [{
    produto_id: string,
    produto_nome: string,
    descricao: string,
    quantidade: number,
    preco_unitario: number,
    desconto: number,
    subtotal: number
  }],
  subtotal: number,
  desconto: number,
  taxa: number,
  total: number,
  status: 'rascunho' | 'enviado' | 'pago' | 'atrasado' | 'cancelado',
  observacoes: string,
  data_emissao: Timestamp,
  data_vencimento: Timestamp,
  data_pagamento: Timestamp,
  metodo_pagamento: string,
  vendedor_id: string,
  vendedor_nome: string,
  public_token: string,  // Para links públicos
  visualizado: boolean,
  visualizado_count: number,
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### 5. estimates (Orçamentos)
```typescript
{
  id: string,
  numero: string,        // Ex: ORC-20240226-001
  cliente_id: string,
  cliente_nome: string,
  items: [...],          // Mesma estrutura de invoices
  subtotal: number,
  desconto: number,
  taxa: number,
  total: number,
  status: 'rascunho' | 'enviado' | 'aprovado' | 'rejeitado' | 'convertido',
  observacoes: string,
  data_emissao: Timestamp,
  data_validade: Timestamp,
  validade_dias: number,
  invoice_id: string,    // ID da fatura convertida
  vendedor_id: string,
  vendedor_nome: string,
  public_token: string,
  visualizado: boolean,
  created_at: Timestamp
}
```

### 6. comissoes
```typescript
{
  id: string,
  vendedor_id: string,
  vendedor_nome: string,
  invoice_id: string,
  invoice_numero: string,
  cliente_nome: string,
  valor_venda: number,
  percentual_comissao: number,
  valor_comissao: number,
  data_venda: Timestamp,
  status: 'pendente' | 'pago',
  data_pagamento: Timestamp,
  semana_referencia: string,  // Ex: "2024-W09"
  created_at: Timestamp
}
```

### 7. expenses (Despesas)
```typescript
{
  id: string,
  descricao: string,
  categoria: string,     // 'material', 'servico', 'outros'
  valor: number,
  data: Timestamp,
  comprovante_url: string,
  notas: string,
  vendedor_id: string,
  created_at: Timestamp
}
```

### 8. estoque_movimentacao
```typescript
{
  id: string,
  produto_id: string,
  produto_nome: string,
  tipo: 'entrada' | 'saida' | 'ajuste',
  quantidade: number,
  quantidade_anterior: number,
  quantidade_nova: number,
  motivo: string,
  referencia_id: string,  // ID da fatura/orçamento
  referencia_tipo: string,
  created_by: string,
  created_at: Timestamp
}
```

### 9. quilometragem
```typescript
{
  id: string,
  vendedor_id: string,
  vendedor_nome: string,
  data: Timestamp,
  origem: string,
  destino: string,
  distancia_km: number,
  proposito: string,
  valor_reembolso: number,
  created_at: Timestamp
}
```

### 10. agendamentos
```typescript
{
  id: string,
  cliente_nome: string,
  cliente_telefone: string,
  servico: string,
  data: Timestamp,
  hora: string,          // Formato: "14:30"
  observacoes: string,
  status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido',
  vendedor_id: string,
  created_at: Timestamp
}
```

### 11. configuracoes
```typescript
{
  id: string,
  taxa_padrao: number,           // 6.25
  comissao_padrao: number,       // 10
  validade_orcamento: number,    // 30 dias
  valor_km: number,              // 0.75
  horario_lembrete: string,      // "09:00"
  dias_aviso_vencimento: number, // 3
  updated_at: Timestamp
}
```

## Relacionamentos

```
users (1) ----< (N) clientes
users (1) ----< (N) invoices
users (1) ----< (N) estimates
users (1) ----< (N) comissoes
users (1) ----< (N) expenses
users (1) ----< (N) quilometragem

invoices (1) ----< (N) comissoes
invoices (1) ----< (N) estoque_movimentacao

estimates (1) ---- (1) invoices (quando convertido)

produtos (1) ----< (N) estoque_movimentacao
```

## Segurança

- Vendedor só acessa seus próprios dados
- Admin acessa todos os dados
- Links públicos funcionam via token único
- Regras de segurança em `firestore.rules`
