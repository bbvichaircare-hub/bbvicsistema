import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}
function fmtDate(v: any): string {
  if (!v) return ''
  try {
    let d: Date
    if (v?.toDate) {
      d = v.toDate()
    } else if (v?.seconds) {
      d = new Date(v.seconds * 1000)
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      // YYYY-MM-DD strings — parse as LOCAL date to avoid UTC timezone shift
      const [y, m, day] = v.split('-').map(Number)
      d = new Date(y, m - 1, day)
    } else {
      d = new Date(v)
    }
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  } catch { return '' }
}
function clean(s?: string): string {
  if (!s) return ''
  return s.replace(/[^\x20-\x7E]/g, '')
}

export interface EmpresaConfig {
  nome?: string
  endereco?: string
  cidade_estado?: string
  telefone?: string
  email?: string
  website?: string
  footer?: string
  logo_url?: string
}

interface PDFItem {
  produto_nome: string; descricao?: string; quantidade: number
  preco_unitario: number; subtotal: number
}
interface PDFDoc {
  numero: string; cliente_nome: string; cliente_email?: string
  cliente_telefone?: string; cliente_endereco?: string
  cliente_cidade?: string; cliente_estado?: string; cliente_cep?: string
  data_emissao: any; data_vencimento?: any; data_validade?: any; created_at?: any; createdAt?: any; data_criacao?: any
  items: PDFItem[]; subtotal: number; desconto?: number
  taxa?: number; total: number; observacoes?: string
  termos_condicoes?: string; deposit?: number; vendedor_nome?: string
  taxa_envio?: number; status?: string
  parcelas_ativo?: boolean; parcelas?: {numero: number; valor: number; data: string; status: string}[]
  valor_pago?: number
}

async function loadLogoBase64(url?: string): Promise<string | null> {
  try {
    const src = url || '/logo-bbvic.jpg'
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

async function buildPDF(doc: PDFDoc, tipo: 'FATURA' | 'ORCAMENTO', empresa?: EmpresaConfig): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const L = 15
  const R = 195

  // — Empresa defaults
  const empEndereco   = clean(empresa?.endereco   || '10 Howe St')
  const empCidEst     = clean(empresa?.cidade_estado || 'Framingham MA')
  const empTelefone   = clean(empresa?.telefone   || '617 768 7191')
  const empNome       = clean(empresa?.nome       || 'BBVIC Hair Care')
  const empEmail      = clean(empresa?.email      || '')
  const empWebsite    = clean(empresa?.website    || '')
  const empFooter     = clean(empresa?.footer     || 'Thank you for your business!')

  const logoBase64 = await loadLogoBase64(empresa?.logo_url)
  const vendedor = clean(doc.vendedor_nome) || 'Julieth Batista Gomes'
  const tipoLabel = tipo === 'FATURA' ? 'INVOICE' : 'ESTIMATE'

  // ── HEADER: Logo left, address below logo, invoice info far right
  const logoW = 55; const logoH = 35
  if (logoBase64) {
    try { pdf.addImage(logoBase64, 'JPEG', L, 8, logoW, logoH) } catch { /* skip */ }
  }

  // Address — below logo, left aligned
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(70, 70, 70)
  let addrY = 47
  pdf.text(empEndereco, L, addrY); addrY += 6
  pdf.text(empCidEst, L, addrY); addrY += 6
  pdf.text(empTelefone, L, addrY); addrY += 6
  if (empEmail) { pdf.text(empEmail, L, addrY); addrY += 6 }
  if (empWebsite) { pdf.text(empWebsite, L, addrY); addrY += 6 }

  // Invoice info — far right
  const rightX = 120

  // Issue date — try all possible field names
  const rawIssue = doc.data_emissao || doc.created_at || (doc as any).createdAt || (doc as any).data_criacao
  const issueDate = rawIssue ? fmtDate(rawIssue) : fmtDate(new Date())

  // Due date — for installments use next pending installment date
  let dueDate = 'Due on Receipt'
  if (doc.parcelas_ativo && doc.parcelas && doc.parcelas.length > 0) {
    const pendentes = (doc.parcelas as any[])
      .filter((p: any) => p.status === 'pendente')
      .sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime())
    if (pendentes.length > 0) dueDate = fmtDate(pendentes[0].data)
  } else if (doc.data_vencimento) {
    dueDate = fmtDate(doc.data_vencimento)
  } else if (doc.data_validade) {
    dueDate = fmtDate(doc.data_validade)
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(20, 20, 20)
  pdf.text(tipoLabel, rightX, 16)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(60, 60, 60)
  pdf.text(` : ${doc.numero}`, rightX + 18, 16)

  // Issue date line
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Issue Date : ', rightX, 23)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(20, 20, 20)
  pdf.text(issueDate, rightX + 26, 23)

  // Due date line
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Due Date : ', rightX, 30)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(20, 20, 20)
  pdf.text(dueDate, rightX + 22, 30)

  // Bill To — shift down a bit to accommodate extra line
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(80, 80, 80)
  pdf.text('Bill To', rightX, 39)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(10, 10, 10)
  pdf.text(clean(doc.cliente_nome).toUpperCase(), rightX, 46)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(50, 50, 50)
  let cy = 47
  if (doc.cliente_endereco) {
    const addr = clean(doc.cliente_endereco)
    if (addr) {
      const addrLines = pdf.splitTextToSize(addr, 70)
      addrLines.forEach((line: string) => { pdf.text(line, rightX, cy); cy += 5 })
    }
  }
  if (doc.cliente_cidade || doc.cliente_estado || doc.cliente_cep) {
    const cityLine = [clean(doc.cliente_cidade), clean(doc.cliente_estado), clean(doc.cliente_cep)].filter(Boolean).join(', ')
    if (cityLine) { pdf.text(cityLine, rightX, cy); cy += 5 }
  }
  if (doc.cliente_telefone) { pdf.text(clean(doc.cliente_telefone), rightX, cy); cy += 5 }
  if (doc.cliente_email) { pdf.text(clean(doc.cliente_email), rightX, cy); cy += 5 }

  // ── SEPARATOR LINE
  const sepY = Math.max(cy + 6, Math.max(addrY + 4, 55))
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.3)
  pdf.line(L, sepY, R, sepY)

  // ── ITEMS TABLE
  autoTable(pdf, {
    startY: sepY + 5,
    margin: { left: L, right: W - R },
    head: [['Item & Description', 'Qty', 'Rate', 'Amount']],
    body: doc.items.map((it) => {
      const desc = it.descricao ? `${clean(it.produto_nome)}\n${clean(it.descricao)}` : clean(it.produto_nome)
      return [desc, String(it.quantidade), fmt(it.preco_unitario), fmt(it.subtotal)]
    }),
    headStyles: {
      fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, lineColor: [180, 180, 180], lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' }, 1: { cellWidth: 16, halign: 'right' },
      2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
  })

  const afterTableY = (pdf as any).lastAutoTable.finalY + 6

  // ── TOTALS right side
  const totX = 130
  let ty = afterTableY

  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.3)
  pdf.line(totX, ty, R, ty)
  ty += 5

  const totals: [string, string][] = [
    ['Subtotal', fmt(doc.subtotal || doc.total)],
    ...(doc.desconto ? [['Discount', `-${fmt(doc.desconto)}`] as [string, string]] : []),
    ...(doc.taxa ? [['Tax (6.25%)', fmt(doc.taxa)] as [string, string]] : []),
    ...(doc.taxa_envio && doc.taxa_envio > 0 ? [['Shipping', fmt(doc.taxa_envio)] as [string, string]] : []),
    ...(doc.deposit ? [['Deposit Received', `-${fmt(doc.deposit)}`] as [string, string]] : []),
  ]

  totals.forEach(([lbl, val]) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(80, 80, 80)
    pdf.text(lbl, totX, ty)
    pdf.setTextColor(20, 20, 20)
    pdf.text(val, R, ty, { align: 'right' })
    ty += 6
  })

  pdf.setDrawColor(20, 20, 20); pdf.setLineWidth(0.5); pdf.line(totX, ty, R, ty); ty += 5

  const balanceDue = doc.deposit ? doc.total - doc.deposit : doc.total
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(20, 20, 20)
  pdf.text('Total', totX, ty)
  pdf.text(fmt(balanceDue), R, ty, { align: 'right' })

  if (doc.valor_pago && doc.valor_pago > 0) {
    ty += 6
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(34, 139, 34)
    pdf.text('Already Paid', totX, ty)
    pdf.text(fmt(doc.valor_pago), R, ty, { align: 'right' })
    ty += 6
    pdf.setTextColor(200, 50, 50)
    pdf.text('Balance Due', totX, ty)
    pdf.text(fmt(Math.max(0, doc.total - doc.valor_pago)), R, ty, { align: 'right' })
    pdf.setTextColor(40, 40, 40)
  }

  // ── INSTALLMENT SCHEDULE
  if (doc.parcelas_ativo && doc.parcelas && doc.parcelas.length > 0) {
    ty += 8
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(40, 40, 40)
    pdf.text('Payment Schedule', totX, ty); ty += 5
    doc.parcelas.forEach((p) => {
      const dateStr = (() => { try { return new Date(p.data + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) } catch { return p.data } })()
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(60, 60, 60)
      pdf.text(`Installment ${p.numero}  ${dateStr}`, totX, ty)
      pdf.setTextColor(p.status === 'pago' ? 34 : 20, p.status === 'pago' ? 139 : 20, p.status === 'pago' ? 34 : 20)
      pdf.text(fmt(p.valor), R, ty, { align: 'right' }); ty += 5
    })
  }

  // ── NOTES left side
  if (doc.observacoes || doc.termos_condicoes) {
    let ny = afterTableY
    const noteW = totX - L - 6
    if (doc.observacoes) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(40, 40, 40)
      pdf.text('Notes', L, ny); ny += 5
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(80, 80, 80)
      const lines = pdf.splitTextToSize(clean(doc.observacoes), noteW)
      pdf.text(lines, L, ny); ny += lines.length * 4.5 + 4
    }
    if (doc.termos_condicoes) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(40, 40, 40)
      pdf.text('Terms & Conditions', L, ny); ny += 5
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(80, 80, 80)
      const tLines = pdf.splitTextToSize(clean(doc.termos_condicoes), noteW)
      pdf.text(tLines, L, ny)
    }
  }

  // ── FOOTER
  const H = 297
  pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.3); pdf.line(L, H - 22, R, H - 22)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(20, 20, 20)
  pdf.text('Consultor: ' + clean(vendedor).toUpperCase(), L, H - 15)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(150, 150, 150)
  const footerParts = [empNome, empEndereco + ', ' + empCidEst, empTelefone, empFooter].filter(Boolean)
  pdf.text(footerParts.join('  |  '), W / 2, H - 8, { align: 'center' })

  return pdf
}

// ── Helper para carregar config da empresa do Firestore (import dinâmico p/ evitar circular)
export async function getEmpresaConfig(): Promise<EmpresaConfig> {
  try {
    const { db } = await import('@/lib/firebase')
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'configuracoes', 'empresa'))
    if (snap.exists()) return snap.data() as EmpresaConfig
  } catch { /* usa defaults */ }
  return {}
}

export async function gerarPDFFatura(doc: PDFDoc, empresaConfig?: EmpresaConfig) {
  const config = empresaConfig ?? await getEmpresaConfig()
  const pdf = await buildPDF(doc, 'FATURA', config)
  pdf.save(`Invoice-${doc.numero}.pdf`)
}

export async function gerarPDFOrcamento(doc: PDFDoc, empresaConfig?: EmpresaConfig) {
  const config = empresaConfig ?? await getEmpresaConfig()
  const pdf = await buildPDF(doc, 'ORCAMENTO', config)
  pdf.save(`Estimate-${doc.numero}.pdf`)
}

export async function gerarPDFBlob(doc: PDFDoc, tipo: 'FATURA' | 'ORCAMENTO', empresaConfig?: EmpresaConfig): Promise<Blob> {
  const config = empresaConfig ?? await getEmpresaConfig()
  const pdf = await buildPDF(doc, tipo, config)
  return pdf.output('blob')
}

export type { PDFDoc, PDFItem }
