// Regras únicas de vencimento e parcelas de faturas.
// Usado pela página de Faturas e pelo Dashboard para que os números batam.

const arred = (v: number) => Math.round((v || 0) * 100) / 100

// Datas escolhidas no calendário eram gravadas como meia-noite UTC
// (ex.: 24/11 00:00 UTC = 23/11 20:00 nos EUA) e venciam um dia antes.
// Se o horário é exatamente meia-noite UTC, usa o dia UTC (o dia escolhido).
function corrigirDataSoDia(d: Date): Date {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)
  }
  return d
}

export function parseDataFlex(v: any): Date | null {
  if (!v) return null
  try {
    let d0: Date | null = null
    if (typeof v?.toDate === 'function') d0 = v.toDate()
    else if (typeof v === 'object' && typeof v.seconds === 'number') d0 = new Date(v.seconds * 1000)
    else if (v instanceof Date) d0 = isNaN(v.getTime()) ? null : v
    if (d0) return corrigirDataSoDia(d0)
    const s = String(v).trim()
    const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (dm) { const d = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00`); return isNaN(d.getTime()) ? null : d }
    const ym = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (ym) { const d = new Date(`${ym[1]}-${ym[2]}-${ym[3]}T12:00:00`); return isNaN(d.getTime()) ? null : d }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}

// Vencida = o dia do vencimento já terminou (vence hoje ainda NÃO está vencida)
function venceuAntesDeHoje(d: Date | null, hoje: Date): boolean {
  if (!d) return false
  const fimDoDia = new Date(d); fimDoDia.setHours(23, 59, 59, 999)
  return fimDoDia < hoje
}

function inicioDeHoje(): Date {
  const h = new Date(); h.setHours(0, 0, 0, 0); return h
}

// Valor que o cliente precisa pagar pela fatura: total menos o adiantamento/depósito
export function totalDevido(inv: any): number {
  return Math.max(0, arred((inv.total || 0) - (inv.deposit || 0)))
}

export function saldoFatura(inv: any): number {
  return Math.max(0, arred(totalDevido(inv) - (inv.valor_pago || 0)))
}

/**
 * Realinha as datas das parcelas em aberto para a nova data de vencimento:
 * a primeira parcela em aberto vence na data escolhida e as seguintes mês a mês.
 * Parcelas já pagas não mudam.
 */
export function realinharDatasParcelas(parcelas: any[], novaData: string): any[] {
  if (!novaData || !Array.isArray(parcelas)) return parcelas
  const base = new Date(novaData + 'T12:00:00')
  if (isNaN(base.getTime())) return parcelas
  let k = 0
  return parcelas.map(p => {
    if (p.status === 'pago') return p
    const d = new Date(base); d.setMonth(d.getMonth() + k++)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { ...p, data: iso }
  })
}

export function ehParcelada(inv: any): boolean {
  return Array.isArray(inv.parcelas) && inv.parcelas.length > 0 && inv.parcelas_ativo !== false
}

function dataParcela(p: any): Date | null {
  return parseDataFlex(p.data_vencimento ?? p.data ?? p.vencimento ?? p.due_date)
}

// Quanto falta pagar de uma parcela
export function faltaNaParcela(p: any): number {
  if (p.status === 'pago') return 0
  return Math.max(0, arred((p.valor || 0) - (p.valor_pago || 0)))
}

/**
 * Valor REALMENTE em atraso de uma fatura.
 * - Parcelada: soma só o que falta das parcelas cujo vencimento já passou
 *   (nunca mais do que o saldo da fatura).
 * - Sem parcelas: o saldo (total - pago), se a data de vencimento já passou.
 * - Paga, cancelada, rascunho ou sem saldo: 0.
 */
export function valorEmAtraso(inv: any, hoje: Date = inicioDeHoje()): number {
  if (['pago', 'cancelado', 'rascunho'].includes(inv.status)) return 0
  const saldo = saldoFatura(inv)
  if (saldo <= 0.01) return 0

  if (ehParcelada(inv)) {
    const vencido = inv.parcelas
      .filter((p: any) => p.status !== 'pago' && venceuAntesDeHoje(dataParcela(p), hoje))
      .reduce((s: number, p: any) => s + faltaNaParcela(p), 0)
    return Math.min(saldo, arred(vencido))
  }

  const venc = parseDataFlex(inv.data_vencimento ?? inv.vencimento ?? inv.due_date ?? inv.dataVencimento ?? inv.data_venc ?? inv.dueDate)
  if (venc) return venceuAntesDeHoje(venc, hoje) ? saldo : 0

  // Fatura antiga sem data de vencimento: considera emissão + 30 dias (Net 30)
  const emissao = parseDataFlex(inv.data_emissao ?? inv.created_at ?? inv.createdAt)
  if (emissao) {
    const limite = new Date(emissao); limite.setDate(limite.getDate() + 30)
    return venceuAntesDeHoje(limite, hoje) ? saldo : 0
  }
  return inv.status === 'atrasado' ? saldo : 0
}

export function faturaEstaAtrasada(inv: any, hoje?: Date): boolean {
  return valorEmAtraso(inv, hoje) > 0.01
}

/**
 * Registra um pagamento em uma parcela e reajusta as parcelas que faltam
 * para que a soma delas seja exatamente o que o cliente ainda deve.
 *
 * - Pagou o valor certo: parcela fica paga.
 * - Pagou a menos: a parcela fecha com o valor pago e a diferença é somada
 *   nas parcelas que faltam. Se for a última, ela fica "parcialmente paga".
 * - Pagou a mais: a parcela fica paga e o excedente é descontado das que faltam.
 */
export function aplicarPagamentoEmParcela(
  parcelas: any[],
  idx: number,
  valorPago: number,
  totalFatura: number,
  totalPagoFaturaDepois: number,
  info: { data_pagamento?: string; forma_pagamento?: string } = {},
): any[] {
  const novas = parcelas.map(p => ({ ...p }))
  const atual = novas[idx]
  if (!atual) return novas

  const jaPagoNela = atual.valor_pago || 0
  const devidoNela = arred((atual.valor || 0) - jaPagoNela)
  const outrasPendentes = novas
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i !== idx && p.status !== 'pago')
    .map(({ i }) => i)

  const pagouTudo = valorPago >= devidoNela - 0.01
  if (pagouTudo) {
    // valor da parcela = o que realmente entrou nela (se pagou a mais, fica maior)
    const recebido = Math.max(atual.valor || 0, arred(jaPagoNela + valorPago))
    novas[idx] = {
      ...atual,
      ...(recebido !== (atual.valor || 0) ? { valor_original: atual.valor_original ?? atual.valor } : {}),
      status: 'pago', valor: recebido, valor_pago: recebido, ...info,
    }
  } else if (outrasPendentes.length > 0) {
    // fecha a parcela com o que foi pago; a diferença vai para as próximas
    const pagoTotalNela = arred(jaPagoNela + valorPago)
    novas[idx] = { ...atual, status: 'pago', valor_original: atual.valor_original ?? atual.valor, valor: pagoTotalNela, valor_pago: pagoTotalNela, ...info }
  } else {
    // última parcela: continua aberta com o que falta
    novas[idx] = { ...atual, status: 'parcialmente_pago', valor_pago: arred(jaPagoNela + valorPago), ...info }
  }

  return reajustarParcelasPendentes(novas, totalFatura, totalPagoFaturaDepois)
}

/**
 * Reparte o saldo da fatura entre as parcelas ainda não pagas
 * (mantendo as datas). A soma das parcelas fica igual ao saldo real.
 */
export function reajustarParcelasPendentes(parcelas: any[], totalFatura: number, totalPagoFatura: number): any[] {
  const novas = parcelas.map(p => ({ ...p }))
  const saldo = Math.max(0, arred(totalFatura - totalPagoFatura))
  const pendentes = novas.map((p, i) => ({ p, i })).filter(({ p }) => p.status !== 'pago').map(({ i }) => i)
  if (pendentes.length === 0) return novas

  if (saldo <= 0.01) {
    for (const i of pendentes) {
      const p = novas[i]
      novas[i] = { ...p, status: 'pago', valor_original: p.valor_original ?? p.valor, valor: p.valor_pago || 0, valor_pago: p.valor_pago || 0, quitada_antecipadamente: true }
    }
    return novas
  }

  // Cada parcela pendente fica com: o que já foi pago nela + sua parte do saldo
  const base = Math.floor((saldo / pendentes.length) * 100) / 100
  pendentes.forEach((i, k) => {
    const p = novas[i]
    const parte = k === pendentes.length - 1 ? arred(saldo - base * (pendentes.length - 1)) : base
    const novoValor = arred((p.valor_pago || 0) + parte)
    if (Math.abs(novoValor - (p.valor || 0)) > 0.009) {
      novas[i] = { ...p, valor_original: p.valor_original ?? p.valor, valor: novoValor }
    }
  })
  return novas
}

/**
 * Quanto a fatura RECEBEU dentro do período [inicio, fim].
 * - Parcelas com data de pagamento: conta cada parcela paga no período.
 * - Fatura paga sem parcelas: conta o total na data de pagamento
 *   (menos o que já tinha entrado antes em pagamentos parciais, se houver registro).
 * - Pagamento parcial sem parcelas: conta o valor pago pela data da última atualização
 *   (o sistema não guarda a data de cada parcial nesse caso).
 */
export function recebidoNoPeriodo(inv: any, inicio: Date, fim: Date): number {
  if (inv.status === 'cancelado') return 0
  const dentro = (d: Date | null) => !!d && d >= inicio && d <= fim

  if (Array.isArray(inv.parcelas) && inv.parcelas.some((p: any) => p.data_pagamento)) {
    return arred(inv.parcelas
      .filter((p: any) => (p.status === 'pago' || p.valor_pago > 0) && dentro(parseDataFlex(p.data_pagamento)))
      .reduce((s: number, p: any) => s + (p.valor_pago || (p.status === 'pago' ? p.valor : 0) || 0), 0))
  }
  if (inv.status === 'pago') {
    return dentro(parseDataFlex(inv.data_pagamento) ?? parseDataFlex(inv.updated_at)) ? arred(inv.total || 0) : 0
  }
  if ((inv.valor_pago || 0) > 0) {
    return dentro(parseDataFlex(inv.data_pagamento) ?? parseDataFlex(inv.updated_at)) ? arred(inv.valor_pago) : 0
  }
  return 0
}
