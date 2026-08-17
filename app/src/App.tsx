import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import type { ReactNode } from "react"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { Toaster } from "sonner"
import { Layout } from "@/components/layout/Layout"
import type { Permissao } from "@/types"

import { Login } from "@/pages/Login"
import { InvoicePublic } from "@/pages/InvoicePublic"
import EstimatePublic from "@/pages/EstimatePublic"

import { Dashboard } from "@/pages/Dashboard"
import { Clientes } from "@/pages/Clientes"
import { ClienteForm } from "@/pages/ClienteForm"
import { ClienteDetail } from "@/pages/ClienteDetail"
import { Produtos } from "@/pages/Produtos"
import { ProdutoForm } from "@/pages/ProdutoForm"
import { Invoices } from "@/pages/Invoices"
import { Agenda } from "@/pages/Agenda"
import { InvoiceForm } from "@/pages/InvoiceForm"
import { Estimates } from "@/pages/Estimates"
import { EstimateForm } from "@/pages/EstimateForm"
import { Despesas } from "@/pages/Despesas"
import { Relatorios } from "@/pages/Relatorios"
import { RelatorioImpostos } from "@/pages/RelatorioImpostos"
import { PortalLogin } from "@/pages/PortalLogin"
import { PortalDashboard } from "@/pages/PortalDashboard"
import { Backup } from "@/pages/Backup"
import { EstoqueAvancado } from "@/pages/EstoqueAvancado"
import { Comissoes } from "@/pages/Comissoes"
import { Vendedores } from "@/pages/Vendedores"
import { EstimateView } from "@/pages/EstimateView"
import { ContasPagar } from "@/pages/ContasPagar"
import { ContasReceber } from "@/pages/ContasReceber"
import { Compras } from "@/pages/Compras"
import { Configuracoes } from "@/pages/Configuracoes"
import { Perfil } from "@/pages/Perfil"

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
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

function RequirePermissao({ permissao, children }: { permissao: Permissao; children: ReactNode }) {
  const { user, isAdmin, temPermissao, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (isAdmin || temPermissao(permissao)) return <>{children}</>
  return <Navigate to="/sem-acesso" replace />
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
        <a href="/" className="inline-block mt-2 px-4 py-2 rounded-xl bg-[#C9A227] text-white text-sm font-medium hover:bg-[#9A7B1A]">
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
            <Route path="/estoque" element={<RequirePermissao permissao="estoque"><EstoqueAvancado /></RequirePermissao>} />

            {/* Invoices */}
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/novo" element={<InvoiceForm />} />
            <Route path="/invoices/:id/editar" element={<InvoiceForm />} />

            {/* Agenda */}
            <Route path="/agenda" element={<Agenda />} />

            {/* Estimates */}
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/estimates/novo" element={<EstimateForm />} />
            <Route path="/estimates/:id/editar" element={<EstimateForm />} />
            <Route path="/estimates/:id" element={<EstimateView />} />

            {/* Finance */}
            <Route path="/despesas" element={<RequirePermissao permissao="despesas"><Despesas /></RequirePermissao>} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<RequirePermissao permissao="contas_receber"><ContasReceber /></RequirePermissao>} />
            <Route path="/compras" element={<RequirePermissao permissao="compras"><Compras /></RequirePermissao>} />

            {/* Reports */}
            <Route path="/relatorios" element={<RequirePermissao permissao="relatorios"><Relatorios /></RequirePermissao>} />
            <Route path="/relatorios/impostos" element={<RequireAdmin><RelatorioImpostos /></RequireAdmin>} />

            {/* Other */}
            <Route path="/comissoes" element={<RequirePermissao permissao="comissoes"><Comissoes /></RequirePermissao>} />
            <Route path="/vendedores" element={<RequirePermissao permissao="vendedores"><Vendedores /></RequirePermissao>} />

            <Route path="/configuracoes" element={<RequirePermissao permissao="configuracoes"><Configuracoes /></RequirePermissao>} />
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
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}

export default App
