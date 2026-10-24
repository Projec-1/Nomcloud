export interface ReceiptPdfContent {
  title: string
  schoolName: string
  supportContact?: string
  receiptNumberLabel: string
  receiptNumber: string
  payerLabel?: string
  payerName?: string
  subjectLabel: string
  subjectName: string
  registrationNumberLabel: string
  registrationNumber?: string
  descriptionLabel: string
  description: string
  billingPeriodLabel: string
  billingPeriod?: string
  totalFeeLabel: string
  totalFee?: string
  previouslyPaidLabel: string
  previouslyPaid?: string
  amountLabel: string
  amount: string
  methodLabel: string
  method: string
  transactionReferenceLabel: string
  transactionReference?: string
  dateLabel: string
  date: string
  statusLabel: string
  status: string
  remainingBalanceLabel: string
  remainingBalance?: string
  demoNotice?: string
}

const INK = '0.08 0.12 0.18'
const MUTED = '0.36 0.41 0.48'
const RED = '0.79 0.28 0.11'
const LINE = '0.86 0.88 0.90'

function pdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1')
}

function wrapText(value: string, maxChars: number) {
  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line)
      line = ''
      for (let offset = 0; offset < word.length; offset += maxChars) {
        const part = word.slice(offset, offset + maxChars)
        if (part.length === maxChars) lines.push(part)
        else line = part
      }
      continue
    }
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function textCommand(
  text: string,
  x: number,
  y: number,
  size: number,
  bold = false,
  color = INK,
  align: 'left' | 'right' = 'left',
) {
  const escaped = pdfText(text)
  const approximateWidth = escaped.length * size * 0.52
  const textX = align === 'right' ? x - approximateWidth : x
  return `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${textX.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET`
}

function ruleCommand(y: number, x1 = 50, x2 = 545) {
  return `${LINE} RG ${x1} ${y} m ${x2} ${y} l S`
}

export function createReceiptPdf(content: ReceiptPdfContent): Blob {
  const pages: string[][] = []
  let commands: string[] = []
  let y = 0

  const startPage = (continued = false) => {
    commands = []
    pages.push(commands)
    if (continued) {
      commands.push(`${RED} rg 50 802 495 4 re f`)
      commands.push(textCommand(`${content.title} — continued`, 50, 782, 11, true))
      commands.push(textCommand(`${content.receiptNumberLabel}: ${content.receiptNumber}`, 545, 782, 9, true, INK, 'right'))
      y = 752
      return
    }

    commands.push(`${RED} rg 50 802 495 4 re f`)
    commands.push(textCommand('NOM CLOUD', 50, 779, 16, true, RED))
    commands.push(textCommand(content.schoolName, 50, 760, 11, true))
    commands.push(textCommand(content.title, 545, 779, 9, true, MUTED, 'right'))
    commands.push(textCommand(`${content.receiptNumberLabel}: ${content.receiptNumber}`, 545, 760, 9, true, INK, 'right'))
    commands.push(textCommand(`${content.dateLabel}: ${content.date}`, 50, 740, 9, false, MUTED))
    commands.push(ruleCommand(725))
    y = 704
  }

  const ensureSpace = (height: number) => {
    if (y - height < 48) startPage(true)
  }

  const addFieldPair = (left?: [string, string], right?: [string, string]) => {
    if (!left && !right) return
    const leftLines = left ? wrapText(left[1], 38) : ['']
    const rightLines = right ? wrapText(right[1], 38) : ['']
    const maxLinesPerSegment = 44
    const segmentCount = Math.ceil(Math.max(leftLines.length, rightLines.length) / maxLinesPerSegment)

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const start = segment * maxLinesPerSegment
      const leftSegment = leftLines.slice(start, start + maxLinesPerSegment)
      const rightSegment = rightLines.slice(start, start + maxLinesPerSegment)
      const lineCount = Math.max(leftSegment.length, rightSegment.length)
      const height = 23 + (lineCount - 1) * 11
      ensureSpace(height)
      if (left) {
        commands.push(textCommand(segment ? `${left[0]} (continued)` : left[0], 50, y, 8, false, MUTED))
        leftSegment.forEach((line, index) => commands.push(textCommand(line, 50, y - 12 - index * 11, 9, true)))
      }
      if (right) {
        commands.push(textCommand(segment ? `${right[0]} (continued)` : right[0], 310, y, 8, false, MUTED))
        rightSegment.forEach((line, index) => commands.push(textCommand(line, 310, y - 12 - index * 11, 9, true)))
      }
      y -= height + 8
    }
  }

  startPage()
  commands.push(textCommand(content.descriptionLabel, 50, y, 8, true, MUTED))
  y -= 14
  const descriptionLines = wrapText(content.description, 78)
  descriptionLines.forEach((line) => {
    ensureSpace(13)
    commands.push(textCommand(line, 50, y, 10, true))
    y -= 13
  })
  y -= 7
  commands.push(ruleCommand(y))
  y -= 21

  const amountLabel = `${content.amountLabel}: ${content.amount}`
  const statusText = `${content.statusLabel}: ${content.status}`
  ensureSpace(36)
  commands.push(textCommand(amountLabel, 50, y, 12, true))
  commands.push(textCommand(statusText, 545, y, 8, true, MUTED, 'right'))
  y -= 25

  const amountRows = [
    content.totalFee ? [content.totalFeeLabel, content.totalFee] : null,
    content.previouslyPaid ? [content.previouslyPaidLabel, content.previouslyPaid] : null,
    content.remainingBalance ? [content.remainingBalanceLabel, content.remainingBalance] : null,
  ].filter((row): row is [string, string] => row !== null)

  if (amountRows.length) {
    for (const [label, value] of amountRows) {
      ensureSpace(18)
      commands.push(textCommand(label, 50, y, 9, false, MUTED))
      commands.push(textCommand(value, 545, y, 9, true, INK, 'right'))
      y -= 18
    }
    y -= 3
  }

  commands.push(ruleCommand(y))
  y -= 20
  const fields: Array<[string, string] | undefined> = [
    content.payerName ? [content.payerLabel ?? '', content.payerName] : undefined,
    [content.subjectLabel, content.subjectName],
    content.registrationNumber ? [content.registrationNumberLabel, content.registrationNumber] : undefined,
    [content.methodLabel, content.method],
    content.billingPeriod ? [content.billingPeriodLabel, content.billingPeriod] : undefined,
    content.transactionReference ? [content.transactionReferenceLabel, content.transactionReference] : undefined,
  ].filter((field): field is [string, string] => Boolean(field))

  for (let index = 0; index < fields.length; index += 2) {
    const left = fields[index]
    const right = fields[index + 1]
    addFieldPair(left, right)
  }

  const footerLines = [content.demoNotice, content.supportContact].filter(Boolean) as string[]
  if (footerLines.length) {
    ensureSpace(26)
    commands.push(ruleCommand(y))
    y -= 16
    footerLines.forEach((line) => {
      wrapText(line, 88).forEach((wrapped) => {
        ensureSpace(12)
        commands.push(textCommand(wrapped, 50, y, 8, false, MUTED))
        y -= 11
      })
    })
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...pages.flatMap((page, index) => {
      const pageObject = 3 + index * 2
      const contentObject = pageObject + 1
      const stream = page.join('\n')
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${contentObject} 0 R >>`,
        `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
      ]
    }),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

export function downloadReceiptPdf(content: ReceiptPdfContent) {
  const blob = createReceiptPdf(content)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `nom-cloud-receipt-${content.receiptNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
