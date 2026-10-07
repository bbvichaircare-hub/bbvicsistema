# BBVIC Gestão Premium

Sistema de gestão completo para salões de beleza e clínicas estéticas.

## 🚀 Stack Tecnológica

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5
- **Estilização:** Tailwind CSS 3 + shadcn/ui
- **Backend:** Firebase (Firestore + Authentication)
- **UI Components:** Radix UI + Lucide Icons
- **Formulários:** React Hook Form + Zod
- **Notificações:** Sonner (Toast)

## 📋 Pré-requisitos

- Node.js 18+ (recomendado: 20.x)
- npm ou yarn
- Conta Firebase

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd bbvic-gestao
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```
Edite o arquivo `.env` com suas credenciais do Firebase.

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

5. Acesse: http://localhost:5173

## 📦 Build para Produção

```bash
npm run build
```

Os arquivos compilados estarão na pasta `dist/`.

## 🔥 Configuração do Firebase

### 1. Criar projeto no Firebase Console
- Acesse: https://console.firebase.google.com
- Crie um novo projeto
- Ative Authentication e Firestore Database

### 2. Configurar Authentication
- Ative o provedor "Email/Password"
- Crie o primeiro usuário admin manualmente

### 3. Configurar Firestore Rules
Copie as regras do arquivo `firestore.rules` para o console do Firebase.

### 4. Criar índices necessários
Execute as queries abaixo no console do Firestore para criar índices automáticos:

```javascript
// Índice para invoices por vendedor
invoices: vendedor_id (Ascending) + created_at (Descending)

// Índice para estimates por vendedor
estimates: vendedor_id (Ascending) + created_at (Descending)

// Índice para comissões
comissoes: vendedor_id (Ascending) + data_venda (Descending)
```

## 📁 Estrutura do Projeto

```
src/
├── components/          # Componentes reutilizáveis
│   ├── ui/             # Componentes shadcn/ui
│   └── layout/         # Layout (Sidebar, etc)
├── contexts/           # Contextos React (Auth)
├── hooks/              # Custom hooks
├── lib/                # Utilitários e Firebase config
├── pages/              # Páginas da aplicação
├── services/           # Serviços de negócio
├── types/              # Tipos TypeScript
├── App.tsx             # Componente principal
├── index.css           # Estilos globais
└── main.tsx            # Entry point
```

## 👥 Controle de Acesso

### Administrador
- Acesso total ao sistema
- Gerencia vendedores
- Visualiza todos os relatórios
- Configura comissões

### Vendedor
- Vê apenas seus próprios clientes
- Cria faturas e orçamentos
- Visualiza suas comissões
- Acesso limitado ao dashboard

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` na raiz:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=seu_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Admin Default
VITE_ADMIN_EMAIL=admin@bbvic.com
VITE_ADMIN_NAME="Administrador BBVIC"
```

## 📱 PWA (Progressive Web App)

O aplicativo está configurado como PWA:
- Ícones em `/public/logo-bbvic-*.png`
- Manifest em `/public/manifest.json`
- Service Worker em `/public/sw.js`

Para instalar no celular:
1. Acesse o site no Chrome/Safari
2. Clique em "Adicionar à tela inicial"

## 🚀 Deploy

### Vercel (Recomendado)
```bash
npm i -g vercel
vercel
```

### Netlify
```bash
npm run build
netlify deploy --prod --dir=dist
```

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

## 📝 Funcionalidades

- ✅ Autenticação (Admin/Vendedor)
- ✅ Gestão de Clientes
- ✅ Gestão de Produtos e Estoque
- ✅ Faturas e Orçamentos
- ✅ Comissões Automáticas
- ✅ Relatórios (Vendas, Impostos, Comissões)
- ✅ Controle de Despesas
- ✅ Quilometragem
- ✅ Agenda
- ✅ Ponto Eletrônico
- ✅ Lembretes Automáticos
- ✅ Faturas Recorrentes
- ✅ Links Públicos para Clientes

## 🐛 Solução de Problemas

### Erro de índice no Firestore
Se aparecer erro de índice composto, acesse o link fornecido no erro e crie o índice no console do Firebase.

### Build falhando
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📞 Suporte

Para suporte, entre em contato via WhatsApp: +1 (508) 902-8293

---

Desenvolvido por Kings para BBVIC Hair Care
