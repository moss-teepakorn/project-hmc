import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getLogoUrl } from '../../../lib/assets'

function safeText(value) {
	if (value === null || value === undefined) return '-'
	return String(value)
}

function coerceNumeric(value) {
	if (value === null || value === undefined) return value
	if (typeof value === 'number') return value
	const s = String(value).trim()
	// Accept strings like "1,234", "1234.56" or "1,234.56"
	if (/^-?[0-9,]+(?:\.[0-9]+)?$/.test(s)) {
		const cleaned = s.replace(/,/g, '')
		const n = Number(cleaned)
		return Number.isFinite(n) ? n : value
	}
	return value
}

export function exportReportExcel({ fileName, columns, rows }) {
	const normalizedRows = rows.map((row) => {
		const output = {}
		columns.forEach((column) => {
			// Prefer raw numeric field if available (e.g. 'outstandingRaw')
			const rawKey = `${column.key}Raw`
			if (Object.prototype.hasOwnProperty.call(row, rawKey) && row[rawKey] !== undefined) {
				output[column.label] = coerceNumeric(row[rawKey])
				return
			}

			const val = row[column.key]
			const coerced = coerceNumeric(val)
			output[column.label] = coerced === val ? val : coerced
		})
		return output
	})

	const worksheet = XLSX.utils.json_to_sheet(normalizedRows)
	const workbook = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
	XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

export async function exportReportPdf({ title, fileName, columns, rows, filter, sumAmount }) {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(18)

	// Logo
	let y = 18
	try {
		const logoUrl = await getLogoUrl()
		if (logoUrl) {
			const img = new window.Image()
			img.src = logoUrl
			await new Promise((res) => { img.onload = res })
			doc.addImage(img, 'PNG', 12, y, 22, 22)
		}
	} catch {}

	// Header
	doc.text(title || '', 38, y + 8)
	doc.setFontSize(12)
	if (filter) {
		try {
			doc.text(`ช่วงเดือน: ${filter.startMonthLabel} ถึง ${filter.endMonthLabel} ปี ${filter.year + 543}`, 38, y + 18)
		} catch {}
	}
	doc.text(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, 38, y + 26)

	// Table
	autoTable(doc, {
		startY: y + 32,
		head: [columns.map((col) => col.label)],
		body: rows.map((row) => columns.map((col) => row[col.key])),
		styles: { font: 'helvetica', fontSize: 12 },
		headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
		bodyStyles: { textColor: 20 },
		margin: { left: 12, right: 12 },
		theme: 'grid',
		didDrawPage: (data) => {
			if (typeof sumAmount === 'number') {
				doc.setFont('helvetica', 'bold')
				doc.setFontSize(13)
				doc.text(
					`รวมยอดเงินที่ชำระ: ${sumAmount.toLocaleString()}`,
					data.settings.margin.left,
					doc.lastAutoTable.finalY + 8
				)
				doc.setFont('helvetica', 'normal')
			}
		}
	})
	doc.save(`${fileName}.pdf`)
}
