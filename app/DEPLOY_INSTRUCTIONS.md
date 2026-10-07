# BBVIC Gestão - Instruções de Deploy

## Melhorias Estruturais de Segurança

Este documento contém as instruções para deploy das melhorias de segurança implementadas.

---

## 1. Pré-requisitos

- Node.js 20+ instalado
- Firebase CLI instalado globalmente:
  ```bash
  npm install -g firebase-tools
  ```
- Login no Firebase:
  ```bash
  firebase login
  ```

---

## 2. Estrutura de Arquivos Criados

```
bbvic-gestao-source/
├── firestore.rules              ← Regras de segurança atualizadas
├── firebase.json                ← Configuração do Firebase
├── DEPLOY_INSTRUCTIONS.md       ← Este arquivo
└── functions/                   ← Cloud Functions
    ├── package.json
    ├── tsconfig.json
    ├── .gitignore
    └── src/
        └── index.ts             ← Todas as funções de backend
```

---

## 3. Deploy das Firestore Rules

```bash
firebase deploy --only firestore:rules
```

**O que isso faz:**
- Aplica as regras de segurança com separação estrita entre Admin e Vendedor
- Impede que vendedores acessem dados de outros vendedores
- Valida campos críticos antes de permitir writes

---

## 4. Deploy das Cloud Functions

### 4.1 Instalar dependências

```bash
cd functions
npm install
```

### 4.2 Deploy das funções

```bash
firebase deploy --only functions
```

**Funções que serão deployadas:**

| Função | Tipo | Descrição |
|--------|------|-----------|
| `calcularComissaoOnInvoicePaid` | Firestore Trigger | Calcula comissão automaticamente quando fatura é paga |
| `atualizarEstoqueOnInvoiceCreate` | Firestore Trigger | Decrementa estoque ao criar fatura |
| `restaurarEstoqueOnInvoiceCancel` | Firestore Trigger | Restaura estoque ao cancelar fatura |
| `validarCriacaoVenda` | HTTPS Callable | Valida permissão para criar venda |
| `validarEdicaoVenda` | HTTPS Callable | Valida permissão para editar venda |
| `criarControleConsignado` | Firestore Trigger | Cria controle de consignado para novo cliente |
| `atualizarConsignadoOnVenda` | Firestore Trigger | Atualiza saldo devedor do consignado |
| `registrarPagamentoConsignado` | HTTPS Callable | Registra pagamento de consignado |
| `verificarIntegridade` | HTTPS Callable | Verifica integridade dos dados (admin) |
| `gerarRelatorioVendas` | HTTPS Callable | Gera relatório de vendas no backend |

---

## 5. Verificação Pós-Deploy

### 5.1 Verificar se as regras foram aplicadas

```bash
firebase firestore:rules:get
```

### 5.2 Verificar se as funções estão ativas

```bash
firebase functions:list
```

### 5.3 Testar integridade (como admin)

Chamar a função `verificarIntegridade` pelo console do Firebase ou pelo aplicativo.

---

## 6. Resumo das Melhorias de Segurança

### 6.1 Firestore Rules - Separação de Permissões

**Admin:**
- Acesso total a todos os documentos
- Pode criar/editar para qualquer vendedor
- Pode modificar configurações

**Vendedor:**
- Só acessa seus próprios dados
- Só cria vendas para si mesmo
- Não pode editar vendas já pagas
- Não acessa dados de outros vendedores

### 6.2 Backend Validations - Cálculos no Servidor

**Comissões:**
- Calculadas automaticamente no backend quando fatura é paga
- Baseadas no percentual do vendedor ou do produto
- Registro imutável na coleção `comissoes`

**Estoque:**
- Atualizado automaticamente pelo backend
- Movimentações registradas com audit trail
- Restaurado automaticamente em cancelamentos

**Consignado:**
- Controle de limite de crédito
- Saldo devedor atualizado automaticamente
- Registro de pagamentos

---

## 7. Comportamento do Aplicativo

**IMPORTANTE:** Nenhuma mudança visual ou de fluxo foi feita.

O aplicativo continua funcionando exatamente como antes. As melhorias são:
- **Transparentes** para o usuário final
- **Seguras** contra manipulação no frontend
- **Automáticas** - não requerem ação do usuário

---

## 8. Troubleshooting

### Erro: "Permission denied" ao criar venda
- Verificar se o `vendedor_id` no documento corresponde ao UID do usuário autenticado

### Erro: Função não encontrada
- Verificar se o deploy foi concluído com sucesso
- Aguardar 1-2 minutos após o deploy para propagação

### Erro: Regras muito restritivas
- Verificar se o usuário tem o campo `role` correto no documento `users`
- Verificar se o vendedor está marcado como `ativo: true`

---

## 9. Contato

Em caso de problemas, verificar os logs no Firebase Console:
https://console.firebase.google.com/project/YOUR_PROJECT_ID/functions/logs
