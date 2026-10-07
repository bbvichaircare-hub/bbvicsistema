import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import type { ReactNode } from "react"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { Toaster } from "sonner"
import { Layout } from "@/components/layout/Layout"

// Login carrega direto (primeira tela vista pelo usuário)
import { Login } from "@/pages/Login"

// Demais páginas carregam sob demanda (code-splitting) para reduzir
// drasticamente o tamanho do pacote inicial e acelerar o carregamento,
// especialmente em conexões móveis/iPhone.
const InvoicePublic = lazy(() => import("@/pages/InvoicePublic").then(m => ({ default: m.InvoicePublic })))
const EstimatePublic = lazy(() => import("@/pages/EstimatePublic").then(m => ({ default: m.EstimatePublic })))

const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })))
const Clientes = lazy(() => import("@/pages/Clientes").then(m => ({ default: m.Clientes })))
const ClienteForm = lazy(() => import("@/pages/ClienteForm").then(m => ({ default: m.ClienteForm })))
const ClienteDetail = lazy(() => import("@/pages/ClienteDetail").then(m => ({ default: m.ClienteDetail })))
const Produtos = lazy(() => import("@/pages/Produtos").then(m => ({ default: m.Produtos })))
const ProdutoForm = lazy(() => import("@/pages/ProdutoForm").then(m => ({ default: m.ProdutoForm })))
const Invoices = lazy(() => import("@/pages/Invoices").then(m => ({ default: m.Invoices })))
const Agenda = lazy(() => import("@/pages/Agenda").then(m => ({ default: m.Agenda })))
const InvoiceForm = lazy(() => import("@/pages/InvoiceForm").then(m => ({ default: m.InvoiceForm })))
const Estimates = lazy(() => import("@/pages/Estimates").then(m => ({ default: m.Estimates })))
const EstimateForm = lazy(() => import("@/pages/EstimateForm").then(m => ({ default: m.EstimateForm })))
const Despesas = lazy(() => import("@/pages/Despesas").then(m => ({ default: m.Despesas })))
const Relatorios = lazy(() => import("@/pages/Relatorios").then(m => ({ default: m.Relatorios })))
const RelatorioImpostos = lazy(() => import("@/pages/RelatorioImpostos").then(m => ({ default: m.RelatorioImpostos })))
const PortalLogin = lazy(() => import("@/pages/PortalLogin").then(m => ({ default: m.PortalLogin })))
const PortalDashboard = lazy(() => import("@/pages/PortalDashboard").then(m => ({ default: m.PortalDashboard })))
const Backup = lazy(() => import("@/pages/Backup").then(m => ({ default: m.Backup })))
const EstoqueAvancado = lazy(() => import("@/pages/EstoqueAvancado").then(m => ({ default: m.EstoqueAvancado })))
const Comissoes = lazy(() => import("@/pages/Comissoes").then(m => ({ default: m.Comissoes })))
const Vendedores = lazy(() => import("@/pages/Vendedores").then(m => ({ default: m.Vendedores })))
const EstimateView = lazy(() => import("@/pages/EstimateView").then(m => ({ default: m.EstimateView })))
const ContasPagar = lazy(() => import("@/pages/ContasPagar").then(m => ({ default: m.ContasPagar })))
const ContasReceber = lazy(() => import("@/pages/ContasReceber").then(m => ({ default: m.ContasReceber })))
const Compras = lazy(() => import("@/pages/Compras").then(m => ({ default: m.Compras })))
const Configuracoes = lazy(() => import("@/pages/Configuracoes").then(m => ({ default: m.Configuracoes })))
const Perfil = lazy(() => import("@/pages/Perfil").then(m => ({ default: m.Perfil })))

// Páginas adicionais já existentes localmente (preservadas)
const Ponto = lazy(() => import("@/pages/Ponto").then(m => ({ default: m.Ponto })))
const AdminPonto = lazy(() => import("@/pages/AdminPonto").then(m => ({ default: m.AdminPonto })))
const FaturasRecorrentes = lazy(() => import("@/pages/FaturasRecorrentes").then(m => ({ default: m.FaturasRecorrentes })))
const FaturaRecorrenteForm = lazy(() => import("@/pages/FaturaRecorrenteForm").then(m => ({ default: m.FaturaRecorrenteForm })))
const ConfiguracoesLembretes = lazy(() => import("@/pages/ConfiguracoesLembretes").then(m => ({ default: m.ConfiguracoesLembretes })))
const Quilometragem = lazy(() => import("@/pages/Quilometragem").then(m => ({ default: m.Quilometragem })))
const Caixa = lazy(() => import("@/pages/Caixa").then(m => ({ default: m.Caixa })))
const Projetos = lazy(() => import("@/pages/Projetos").then(m => ({ default: m.Projetos })))
const ProjetoForm = lazy(() => import("@/pages/ProjetoForm").then(m => ({ default: m.ProjetoForm })))
const ProjetoDetail = lazy(() => import("@/pages/ProjetoDetail").then(m => ({ default: m.ProjetoDetail })))
const Crm = lazy(() => import("@/pages/Crm").then(m => ({ default: m.Crm })))
const Consignacao = lazy(() => import("@/pages/Consignacao").then(m => ({ default: m.Consignacao })))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#6F2738] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Carregando...</p>
      </div>
    </div>
  )
}

function PrivateRoute({ children, requireAdmin = false }: any) {
  const { isAuthenticated, isAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" />
  if (requireAdmin && !isAdmin) return <Navigate to="/" />
  return children
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!isAdmin) return <Navigate to="/" />
  return <>{children}</>
}

function SemAcesso() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Sem permissão</h2>
        <p className="text-gray-500 text-sm">Você não tem acesso a esta página.<br/>Contate o administrador para solicitar acesso.</p>
        <a href="/" className="inline-block mt-2 px-4 py-2 rounded-xl bg-[#6F2738] text-white text-sm font-medium hover:bg-[#4A1A26]">
          Voltar ao início
        </a>
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
        <Routes>

          {/* PUBLIC */}
          <Route path="/login" element={<Login />} />
          <Route path="/invoice/:token" element={<InvoicePublic />} />
          <Route path="/estimate/:token" element={<EstimatePublic />} />

          {/* PROTECTED */}
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>

            <Route path="/" element={<Dashboard />} />

            {/* Clients */}
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/novo" element={<ClienteForm />} />
            <Route path="/clientes/:id" element={<ClienteDetail />} />
            <Route path="/clientes/:id/editar" element={<ClienteForm />} />

            {/* Products */}
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/produtos/novo" element={<ProdutoForm />} />
            <Route path="/produtos/:id/editar" element={<ProdutoForm />} />
            <Route path="/estoque" element={<EstoqueAvancado />} />

            {/* Invoices */}
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/novo" element={<InvoiceForm />} />
            <Route path="/invoices/:id/editar" element={<InvoiceForm />} />

            {/* Faturas Recorrentes */}
            <Route path="/faturas-recorrentes" element={<FaturasRecorrentes />} />
            <Route path="/faturas-recorrentes/novo" element={<FaturaRecorrenteForm />} />
            <Route path="/faturas-recorrentes/:id/editar" element={<FaturaRecorrenteForm />} />

            {/* Agenda */}
            <Route path="/agenda" element={<Agenda />} />

            {/* CRM - Visitas a Salões */}
            <Route path="/crm" element={<Crm />} />

            {/* Consignação */}
            <Route path="/consignacao" element={<Consignacao />} />

            {/* Estimates */}
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/estimates/novo" element={<EstimateForm />} />
            <Route path="/estimates/:id/editar" element={<EstimateForm />} />
            <Route path="/estimates/:id" element={<EstimateView />} />

            {/* Finance */}
            <Route path="/despesas" element={<Despesas />} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<ContasReceber />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/caixa" element={<Caixa />} />

            {/* Projetos */}
            <Route path="/projetos" element={<Projetos />} />
            <Route path="/projetos/novo" element={<ProjetoForm />} />
            <Route path="/projetos/:id" element={<ProjetoDetail />} />
            <Route path="/projetos/:id/editar" element={<ProjetoForm />} />

            {/* Ponto */}
            <Route path="/ponto" element={<Ponto />} />
            <Route path="/admin-ponto" element={<RequireAdmin><AdminPonto /></RequireAdmin>} />
            <Route path="/quilometragem" element={<Quilometragem />} />

            {/* Reports */}
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/relatorios/impostos" element={<RequireAdmin><RelatorioImpostos /></RequireAdmin>} />

            {/* Other */}
            <Route path="/comissoes" element={<Comissoes />} />
            <Route path="/vendedores" element={<RequireAdmin><Vendedores /></RequireAdmin>} />

            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/configuracoes/lembretes" element={<ConfiguracoesLembretes />} />
            <Route path="/backup" element={<RequireAdmin><Backup /></RequireAdmin>} />

            {/* Profile */}
            <Route path="/perfil" element={<Perfil />} />

            {/* No permission */}
            <Route path="/sem-acesso" element={<SemAcesso />} />

          </Route>

          {/* Public Portal Routes */}
          <Route path="/portal" element={<PortalLogin />} />
          <Route path="/portal/dashboard" element={<PortalDashboard />} />

        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}

export default App
