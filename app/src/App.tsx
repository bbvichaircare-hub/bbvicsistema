import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { Toaster } from "sonner"
import { Layout } from "@/components/layout/Layout"

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

function PrivateRoute({ children, requireAdmin = false }: any) {
  const { isAuthenticated, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" />
  if (requireAdmin && !isAdmin) return <Navigate to="/" />
  return children
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to="/" />
  return <>{children}</>
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
            <Route path="/estoque" element={<RequireAdmin><EstoqueAvancado /></RequireAdmin>} />

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
            <Route path="/despesas" element={<RequireAdmin><Despesas /></RequireAdmin>} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<RequireAdmin><ContasReceber /></RequireAdmin>} />
            <Route path="/compras" element={<RequireAdmin><Compras /></RequireAdmin>} />

            {/* Reports */}
            <Route path="/relatorios" element={<RequireAdmin><Relatorios /></RequireAdmin>} />
            <Route path="/relatorios/impostos" element={<RequireAdmin><RelatorioImpostos /></RequireAdmin>} />

            {/* Other */}
            <Route path="/comissoes" element={<RequireAdmin><Comissoes /></RequireAdmin>} />
            <Route path="/vendedores" element={<RequireAdmin><Vendedores /></RequireAdmin>} />

            <Route path="/configuracoes" element={<RequireAdmin><Configuracoes /></RequireAdmin>} />
            <Route path="/backup" element={<RequireAdmin><Backup /></RequireAdmin>} />

            {/* Profile */}
            <Route path="/perfil" element={<Perfil />} />

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
