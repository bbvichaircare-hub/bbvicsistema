import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}
function fmtDate(v: any) {
  if (!v) return ''
  try {
    const d = v?.toDate ? v.toDate() : new Date(v)
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
  } catch { return '' }
}
function clean(s?: string): string {
  if (!s) return ''
  return s.replace(/[^\x20-\x7E]/g, '')
}

interface PDFItem {
  produto_nome: string; descricao?: string; quantidade: number
  preco_unitario: number; subtotal: number
}
interface PDFDoc {
  numero: string; cliente_nome: string; cliente_email?: string
  cliente_telefone?: string; cliente_endereco?: string
  data_emissao: any; data_vencimento?: any; data_validade?: any
  items: PDFItem[]; subtotal: number; desconto?: number
  taxa?: number; total: number; observacoes?: string
  termos_condicoes?: string; deposit?: number; vendedor_nome?: string
  status?: string
}

async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch('/logo-bbvic.jpg')
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

async function buildPDF(doc: PDFDoc, tipo: 'FATURA' | 'ORCAMENTO'): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const L = 15
  const R = 195
  const logoBase64 = await loadLogoBase64()

  // ── HEADER: left = logo + company address, right = invoice info + client
  const logoW = 44; const logoH = 28
  if (logoBase64) {
    try { pdf.addImage(logoBase64, 'JPEG', L, 10, logoW, logoH) } catch { /* skip */ }
  }

  // Company address below logo
  const vendedor = clean(doc.vendedor_nome) || 'Julieth Batista Gomes'
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(70, 70, 70)
  pdf.text('10 Howe St', L, 42)
  pdf.text('Framingham MA', L, 47)
  pdf.text('617 768 7191', L, 52)

  // Right column header info
  const rightX = 120
  const tipoLabel = tipo === 'FATURA' ? 'INVOICE' : 'ESTIMATE'

  // Document number
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)
  pdf.text(`: ${doc.numero}`, rightX + 22, 16)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(20, 20, 20)
  pdf.text(tipoLabel, rightX, 16)

  // Due date
  const dueDate = doc.data_vencimento
    ? fmtDate(doc.data_vencimento)
    : doc.data_validade
      ? fmtDate(doc.data_validade)
      : 'Due on Receipt'
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Due on Receipt : ', rightX, 22)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(20, 20, 20)
  pdf.text(dueDate, rightX + 34, 22)

  // Bill To label
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(80, 80, 80)
  pdf.text('Bill To', rightX, 30)

  // Client info
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(10, 10, 10)
  pdf.text(clean(doc.cliente_nome).toUpperCase(), rightX, 36)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(50, 50, 50)
  let cy = 41
  if (doc.cliente_endereco) {
    const addr = clean(doc.cliente_endereco)
    if (addr) { pdf.text(addr.substring(0, 60), rightX, cy); cy += 5 }
  }
  if (doc.cliente_telefone) { pdf.text(doc.cliente_telefone, rightX, cy); cy += 5 }
  if (doc.cliente_email) { pdf.text(clean(doc.cliente_email), rightX, cy); cy += 5 }

  // ── SEPARATOR LINE
  const sepY = Math.max(cy + 4, 60)
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.3)
  pdf.line(L, sepY, R, sepY)

  // ── ITEMS TABLE
  const tableStartY = sepY + 4

  autoTable(pdf, {
    startY: tableStartY,
    margin: { left: L, right: W - R },
    head: [['Item & Description', 'Qty', 'Rate', 'Amount']],
    body: doc.items.map((it) => {
      const desc = it.descricao ? `${clean(it.produto_nome)}\n${clean(it.descricao)}` : clean(it.produto_nome)
      return [
        desc,
        String(it.quantidade),
        fmt(it.preco_unitario),
        fmt(it.subtotal),
      ]
    }),
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [20, 20, 20],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: [30, 30, 30],
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'right' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
  })

  const afterTableY = (pdf as any).lastAutoTable.finalY + 4

  // ── TOTALS right side
  const totX = 130
  let ty = afterTableY

  // Separator above totals
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.3)
  pdf.line(totX, ty, R, ty)
  ty += 5

  const totals: [string, string][] = [
    ['Subtotal', fmt(doc.subtotal || doc.total)],
    ...(doc.desconto ? [['Discount', `-${fmt(doc.desconto)}`] as [string, string]] : []),
    ...(doc.taxa ? [['Tax (6.25%)', fmt(doc.taxa)] as [string, string]] : []),
    ...(doc.deposit ? [['Deposit Received', `-${fmt(doc.deposit)}`] as [string, string]] : []),
  ]

  totals.forEach(([lbl, val]) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(80, 80, 80)
    pdf.text(lbl, totX, ty)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(20, 20, 20)
    pdf.text(val, R, ty, { align: 'right' })
    ty += 6
  })

  // Final total line
  pdf.setDrawColor(30, 30, 30)
  pdf.setLineWidth(0.5)
  pdf.line(totX, ty, R, ty)
  ty += 5

  const balanceDue = doc.deposit ? doc.total - doc.deposit : doc.total
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(20, 20, 20)
  pdf.text('Total', totX, ty)
  pdf.setFontSize(10)
  pdf.text(fmt(balanceDue), R, ty, { align: 'right' })

  // ── NOTES / TERMS
  if (doc.observacoes || doc.termos_condicoes) {
    let ny = afterTableY
    const noteW = totX - L - 8

    if (doc.observacoes) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(40, 40, 40)
      pdf.text('Notes', L, ny)
      ny += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(80, 80, 80)
      const lines = pdf.splitTextToSize(clean(doc.observacoes), noteW)
      pdf.text(lines, L, ny)
      ny += lines.length * 4.5 + 3
    }
    if (doc.termos_condicoes) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(40, 40, 40)
      pdf.text('Terms & Conditions', L, ny)
      ny += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(80, 80, 80)
      const tLines = pdf.splitTextToSize(clean(doc.termos_condicoes), noteW)
      pdf.text(tLines, L, ny)
    }
  }

  // ── FOOTER
  const H = 297
  // Vendor / consultant name at bottom
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(100, 100, 100)
  pdf.text('Prepared by:', L, H - 24)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(20, 20, 20)
  pdf.text(vendedor, L + 28, H - 24)
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.line(L, H - 16, R, H - 16)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  pdf.text('BBVIC Hair Care  |  10 Howe St, Framingham MA  |  617 768 7191  |  Thank you for your business!', W / 2, H - 9, { align: 'center' })

  return pdf
}

export async function gerarPDFFatura(doc: PDFDoc) {
  const pdf = await buildPDF(doc, 'FATURA')
  pdf.save(`Invoice-${doc.numero}.pdf`)
}

export async function gerarPDFOrcamento(doc: PDFDoc) {
  const pdf = await buildPDF(doc, 'ORCAMENTO')
  pdf.save(`Estimate-${doc.numero}.pdf`)
}

export async function gerarPDFBlob(doc: PDFDoc, tipo: 'FATURA' | 'ORCAMENTO'): Promise<Blob> {
  const pdf = await buildPDF(doc, tipo)
  return pdf.output('blob')
}

export type { PDFDoc, PDFItem }
