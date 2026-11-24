// Disegna il report (report.ts) su un PDF A4 e lo scarica (RF-19). Si carica solo quando il
// formatore preme il pulsante (import dinamico), così le altre pagine restano leggere.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Report } from './report'
import logoUrl from '../assets/questzero-orizzontale-blu.svg'

type Doc = jsPDF & { lastAutoTable?: { finalY: number } }

const INK: [number, number, number] = [11, 16, 38]
const MUTED: [number, number, number] = [97, 102, 119]
const LINE: [number, number, number] = [214, 217, 225]
const MARGIN = 18

/** Il logo è un SVG: lo si disegna su un canvas e diventa PNG, il formato che jsPDF accetta. */
async function logoPng(): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = new Image()
    img.src = logoUrl
    await img.decode()
    const ratio = img.naturalWidth / img.naturalHeight
    const canvas = document.createElement('canvas')
    canvas.height = 160
    canvas.width = Math.round(160 * ratio)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/png'), ratio }
  } catch {
    return null
  }
}

function y(doc: Doc, fallback: number): number {
  return doc.lastAutoTable?.finalY ?? fallback
}

export async function downloadReportPdf(report: Report): Promise<void> {
  const doc: Doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2

  // Intestazione: logo a sinistra, tipo di documento a destra.
  const logo = await logoPng()
  if (logo) doc.addImage(logo.data, 'PNG', MARGIN, 14, 7 * logo.ratio, 7, 'logo', 'FAST')
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text('Report della sessione', pageWidth - MARGIN, 19, { align: 'right' })
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(MARGIN, 26, pageWidth - MARGIN, 26)

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK)
  doc.text(report.title, MARGIN, 40)

  const plain = {
    theme: 'plain' as const,
    margin: { left: MARGIN, right: MARGIN, bottom: 24 },
    styles: { font: 'helvetica', fontSize: 10, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 0, right: 4 } },
    columnStyles: { 0: { textColor: MUTED, cellWidth: 48 } },
  }

  autoTable(doc, { ...plain, startY: 46, body: report.details })

  if (report.attempts.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED)
    doc.text('Nessun tentativo registrato in questa sessione.', MARGIN, y(doc, 46) + 10)
  }

  for (const attempt of report.attempts) {
    let top = y(doc, 46) + 12
    if (top > pageHeight - 70) {
      doc.addPage()
      top = 24
    }
    doc.setDrawColor(...LINE).line(MARGIN, top - 6, pageWidth - MARGIN, top - 6)
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
    doc.text(`${attempt.title}: ${attempt.outcome}`, MARGIN, top)

    autoTable(doc, { ...plain, startY: top + 4, body: attempt.indicators })

    const errorsTop = y(doc, top) + 6
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK)
    doc.text(attempt.errors.length ? 'Errori' : 'Errori: nessuno', MARGIN, errorsTop)

    if (attempt.errors.length) {
      autoTable(doc, {
        theme: 'plain',
        startY: errorsTop + 2,
        margin: { left: MARGIN, right: MARGIN, bottom: 24 },
        tableWidth: contentWidth,
        head: [['Ora', 'Tipo', 'Errore']],
        body: attempt.errors.map((e) => [e.time, e.kind, e.text]),
        styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 4 } },
        headStyles: { textColor: MUTED, fontStyle: 'normal', lineWidth: { bottom: 0.3 }, lineColor: LINE },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 36 } },
      })
    }
  }

  // Piede di ogni pagina: nota sull'esito e numero di pagina.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    const lines = doc.splitTextToSize(report.footer, contentWidth - 30)
    doc.text(lines, MARGIN, pageHeight - 14)
    doc.text(`Pagina ${i} di ${pages}`, pageWidth - MARGIN, pageHeight - 14, { align: 'right' })
  }

  doc.save(report.fileName)
}
