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
  created_at?: any
  parcelas_ativo?: boolean
  parcelas?: Array<{ numero: number; valor: number; data?: any; data_vencimento?: any; status: string }>
  [key: string]: any
}

export function toDateSafe(v: any): Date {
  try {
    if (!v) return new Date(0)
    // Firestore Timestamp (classe com .toDate())
    if (typeof v?.toDate === 'function') return v.toDate()
    // Objeto Firestore raw {seconds, nanoseconds} sem .toDate()
    if (typeof v === 'object' && typeof v.seconds === 'number') {
      return new Date(v.seconds * 1000)
    }
    if (v instanceof Date) return isNaN(v.getTime()) ? new Date(0) : v
    const s = String(v).trim()
    // Formato DD/MM/YYYY ou DD/MM/YYYY HH:MM
    const dmatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (dmatch) {
      const d = new Date(`${dmatch[3]}-${dmatch[2]}-${dmatch[1]}T12:00:00`)
      return isNaN(d.getTime()) ? new Date(0) : d
    }
    // Formato YYYY-MM-DD
    const ymatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (ymatch) {
      const d = new Date(`${ymatch[1]}-${ymatch[2]}-${ymatch[3]}T12:00:00`)
      return isNaN(d.getTime()) ? new Date(0) : d
    }
    // ISO ou outros
    const d = new Date(s)
    return isNaN(d.getTime()) ? new Date(0) : d
  } catch { return new Date(0) }
}

// Tenta extrair a data de vencimento de um invoice usando todos os nomes de campo conhecidos
function getVencimentoRaw(inv: InvoiceKPI): any {
  return inv.data
    ?? inv.data_vencimento
    ?? inv.vencimento
    ?? inv.due_date
    ?? inv.dataVencimento
    ?? inv.data_venc
    ?? inv.dueDate
    ?? null
}

// Verifica se o invoice é parcelado (via parcelas_ativo OU metodo_pagamento)
function isParcelado(inv: InvoiceKPI): boolean {
  if (inv.parcelas_ativo === true) return true
  const mp = String(inv.metodo_pagamento || '').toLowerCase()
  return mp.includes('parcel')
}

// Para faturas parceladas: retorna a data de vencimento da MENOR parcela pendente (não paga)
// Para faturas normais: retorna data_vencimento (qualquer campo)
// Se nenhuma data encontrada, usa criação + 30 dias como fallback
export function getVencimentoEfetivo(inv: InvoiceKPI): Date | null {
  if (isParcelado(inv) && Array.isArray(inv.parcelas) && inv.parcelas.length > 0) {
    // Procura entre todas as parcelas não pagas a mais antiga
    const pendentes = inv.parcelas
      .filter(p => p.status !== 'pago')
      .map(p => {
        // Tenta todos os campos de data da parcela
        const rawDate = (p as any).data_vencimento
          ?? (p as any).data
          ?? (p as any).vencimento
          ?? (p as any).due_date
          ?? null
        return { dateObj: toDateSafe(rawDate) }
      })
      .filter(p => p.dateObj.getTime() > 0)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())

    if (pendentes.length > 0) return pendentes[0].dateObj

    // Parcelas sem datas válidas? Tenta a data do invoice mesmo
    const rawInv = getVencimentoRaw(inv)
    if (rawInv) {
      const d = toDateSafe(rawInv)
      if (d.getTime() > 0) return d
    }

    return null // todas pagas (ou sem datas) → não está atrasada
  }

  // Fatura normal: tenta os campos de vencimento do invoice
  const raw = getVencimentoRaw(inv)
  if (raw) {
    const d = toDateSafe(raw)
    if (d.getTime() > 0) return d
  }

  // Sem data de vencimento: usa data de criação + 30 dias como fallback
  const criado = inv.data_emissao ?? inv.created_at ?? inv.createdAt ?? null
  if (criado) {
    const dc = toDateSafe(criado)
    if (dc.getTime() > 0) {
      const fallback = new Date(dc)
      fallback.setDate(fallback.getDate() + 30)
      return fallback
    }
  }

  return null
}

export function isAtrasada(inv: InvoiceKPI): boolean {
  if (inv.status === 'pago') return false
  if (inv.status === 'cancelado') return false
  if (inv.status === 'atrasado') return true

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

  // --- 1. Verifica parcelas (mesmo sem parcelas_ativo definido) ---
  if (Array.isArray(inv.parcelas) && inv.parcelas.length > 0) {
    const pendentes = inv.parcelas.filter(p => p.status !== 'pago')
    if (pendentes.length === 0) return false // todas as parcelas pagas

    let encontrouData = false
    for (const p of pendentes) {
      const rawDate = (p as any).data_vencimento
        ?? (p as any).data
        ?? (p as any).vencimento
        ?? (p as any).due_date
        ?? null
      const d = toDateSafe(rawDate)
      if (d.getTime() > 0) {
        encontrouData = true
        const venc = new Date(d); venc.setHours(23, 59, 59, 999)
        if (venc < hoje) return true
      }
    }
    if (encontrouData) {
      // tem datas mas nenhuma vencida ainda — tenta data do invoice como fallback
      const rawInv = getVencimentoRaw(inv)
      if (rawInv) {
        const d = toDateSafe(rawInv)
        if (d.getTime() > 0) {
          const venc = new Date(d); venc.setHours(23, 59, 59, 999)
          return venc < hoje
        }
      }
      return false
    }
    // Sem datas nas parcelas: cai para verificação do invoice abaixo
  }

  // --- 2. Verifica todos os campos de vencimento do invoice ---
  const campos = ['data', 'data_vencimento', 'vencimento', 'due_date', 'dataVencimento', 'data_venc', 'dueDate']
  for (const c of campos) {
    if (inv[c]) {
      const d = toDateSafe(inv[c])
      if (d.getTime() > 0) {
        const venc = new Date(d); venc.setHours(23, 59, 59, 999)
        return venc < hoje
      }
    }
  }

  // --- 3. Fallback: usa data de criação + 15 dias ---
  const camposCriacao = ['data_emissao', 'created_at', 'createdAt', 'data_criacao']
  for (const c of camposCriacao) {
    if (inv[c]) {
      const dc = toDateSafe(inv[c])
      if (dc.getTime() > 0) {
        const limite = new Date(dc)
        limite.setDate(limite.getDate() + 15)
        return limite < hoje
      }
    }
  }

  // --- 4. Sem nenhuma data: se status indica não pago, considera atrasado ---
  return ['enviado', 'parcial', 'visualizado', 'aguardando_confirmacao', 'pendente'].includes(inv.status)
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
  const STATUS_NAO_PAGO = ['enviado', 'visualizado', 'aguardando_confirmacao', 'parcial', 'pendente', 'aberto', 'ativo']
  return invoices
    .filter(i => STATUS_NAO_PAGO.includes(i.status))
    .reduce((s, i) => {
      if (i.status === 'parcial') return s + Math.max(0, (i.total || 0) - (i.valor_pago || 0))
      return s + (i.total || 0)
    }, 0)
}

export function calcularAReceberQtd(invoices: InvoiceKPI[]): number {
  const STATUS_NAO_PAGO = ['enviado', 'visualizado', 'aguardando_confirmacao', 'parcial', 'pendente', 'aberto', 'ativo']
  return invoices.filter(i => STATUS_NAO_PAGO.includes(i.status)).length
}

export function calcularAtrasadas(invoices: InvoiceKPI[]): { valor: number; qtd: number } {
  const atrasadas = invoices.filter(isAtrasada)
  return {
    qtd: atrasadas.length,
    valor: atrasadas.reduce((s, i) => {
      if (i.parcelas_ativo && Array.isArray(i.parcelas)) {
        // Para parceladas: soma apenas as parcelas não pagas e atrasadas
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
        return s + i.parcelas
          .filter(p => p.status !== 'pago')
          .reduce((sp, p) => {
            const rawDate = (p as any).data_vencimento ?? (p as any).data ?? null
            const d = toDateSafe(rawDate)
            const venc = new Date(d); venc.setHours(23, 59, 59, 999)
            return (d.getTime() > 0 && venc < hoje) ? sp + (p.valor || 0) : sp
          }, 0)
      }
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
