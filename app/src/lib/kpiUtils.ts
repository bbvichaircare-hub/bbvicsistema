// Fonte única de verdade para cálculos de KPI
// Usado pelo Dashboard e Faturas para garantir valores consistentes

export interface InvoiceKPI {
  id: string
  status: string
  total: number
  valor_pago?: number
  data_emissao?: any
  data_vencimento?: any
  data_pagamento?: any
  updated_at?: any
}

export function toDateSafe(v: any): Date {
  try {
    if (!v) return new Date(0)
    if (v?.toDate) return v.toDate()
    const d = new Date(v)
    return isNaN(d.getTime()) ? new Date(0) : d
  } catch { return new Date(0) }
}

export function calcularReceita(invoices: InvoiceKPI[]): number {
  return invoices
    .filter(i => ['pago', 'parcial'].includes(i.status))
    .reduce((s, i) => {
      if (i.status === 'parcial') return s + (i.valor_pago || 0)
      return s + (i.total || 0)
    }, 0)
}

export function calcularReceitaMes(invoices: InvoiceKPI[], mes: number, ano: number): number {
  return invoices
    .filter(i => {
      if (!['pago', 'parcial'].includes(i.status)) return false
      // Usa data_pagamento se disponível, senão updated_at, senão data_emissao
      const dataPag = i.data_pagamento || i.updated_at || i.data_emissao
      const d = toDateSafe(dataPag)
      return d.getMonth() + 1 === mes && d.getFullYear() === ano
    })
    .reduce((s, i) => {
      if (i.status === 'parcial') return s + (i.valor_pago || 0)
      return s + (i.total || 0)
    }, 0)
}

export function calcularAReceber(invoices: InvoiceKPI[]): number {
  const STATUS_NAO_PAGO = ['enviado', 'visualizado', 'aguardando_confirmacao', 'parcial']
  return invoices
    .filter(i => STATUS_NAO_PAGO.includes(i.status))
    .reduce((s, i) => {
      if (i.status === 'parcial') return s + Math.max(0, (i.total || 0) - (i.valor_pago || 0))
      return s + (i.total || 0)
    }, 0)
}

export function calcularAReceberQtd(invoices: InvoiceKPI[]): number {
  const STATUS_NAO_PAGO = ['enviado', 'visualizado', 'aguardando_confirmacao', 'parcial']
  return invoices.filter(i => STATUS_NAO_PAGO.includes(i.status)).length
}

export function isAtrasada(inv: InvoiceKPI): boolean {
  if (['pago', 'cancelado', 'rascunho'].includes(inv.status)) return false
  if (!inv.data_vencimento) return false
  try {
    const venc = toDateSafe(inv.data_vencimento)
    venc.setHours(23, 59, 59, 999)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return venc < hoje
  } catch { return false }
}

export function calcularAtrasadas(invoices: InvoiceKPI[]): { valor: number; qtd: number } {
  const atrasadas = invoices.filter(isAtrasada)
  return {
    qtd: atrasadas.length,
    valor: atrasadas.reduce((s, i) => {
      if (i.status === 'parcial') return s + Math.max(0, (i.total || 0) - (i.valor_pago || 0))
      return s + (i.total || 0)
    }, 0),
  }
}

export function calcularPagas(invoices: InvoiceKPI[]): number {
  return invoices
    .filter(i => i.status === 'pago')
    .reduce((s, i) => s + (i.total || 0), 0)
}

export function calcularPagasMes(invoices: InvoiceKPI[], mes: number, ano: number): number {
  return invoices
    .filter(i => {
      if (i.status !== 'pago') return false
      const dataPag = i.data_pagamento || i.updated_at || i.data_emissao
      const d = toDateSafe(dataPag)
      return d.getMonth() + 1 === mes && d.getFullYear() === ano
    })
    .reduce((s, i) => s + (i.total || 0), 0)
}

export function calcularParcial(invoices: InvoiceKPI[]): { valor: number; qtd: number } {
  const parciais = invoices.filter(i => i.status === 'parcial')
  return {
    qtd: parciais.length,
    valor: parciais.reduce((s, i) => s + (i.total || 0), 0),
  }
}
