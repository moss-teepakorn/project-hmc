// PaymentReportExportHtml.js
// สร้าง HTML สำหรับ export PDF แบบเดียวกับหน้า fees (ใช้ Sarabun, layout เดียวกัน)

export function buildPaymentReportHtml({ title, columns, rows, filter, sumAmount, logoUrl, footerLabel }) {
  const today = new Date();
  const printDate = today.toLocaleDateString('th-TH');
  const fmtNumber = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '-'
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const tableHead = `<tr>${columns.map(col => `<th style="text-align:${col.type === 'number' ? 'right' : 'left'}">${col.label}</th>`).join('')}</tr>`;
  const tableBody = rows.map((row, idx) =>
    `<tr>${columns.map(col => {
      if (col.type === 'number') {
        const rawKey = `${col.key}Raw`
        const val = Object.prototype.hasOwnProperty.call(row, rawKey) ? row[rawKey] : row[col.key]
        return `<td style="text-align:right">${fmtNumber(val)}</td>`
      }
      return `<td>${row[col.key] ?? '-'}</td>`
    }).join('')}</tr>`
  ).join('');
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          html, body { font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; margin: 0; padding: 0; color: #111827; background: #fff; }
          .report-wrap {
            width: 1122px; /* A4 landscape at 96dpi */
            min-height: 793px;
            margin: 0 auto;
            padding: 16px 24px 16px 24px;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 2px 8px #0001;
            box-sizing: border-box;
          }
          .report-header {
            display: flex;
            align-items: center;
            gap: 24px;
            margin-bottom: 12px;
          }
          .brand { display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0; }
          .logo-wrap { width: 64px; height: 64px; border-radius: 12px; background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 6px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
          .logo-wrap img { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 8px; }
          .report-title-block {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
          }
          .report-title {
            font-size: 26px; font-weight: 700; color: #0d9488; margin-bottom: 0; line-height: 1.15;
            /* allow wrapping so long titles show like fees page */
            white-space: normal; overflow: visible; text-overflow: unset;
          }
          .report-meta {
            font-size: 14px; color: #64748b; margin-bottom: 0; font-weight: 500;
          }
          .report-table-wrap { margin-top: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { border: 1.2px solid #cbd5e1; padding: 7px 8px; font-size: 14px; }
          th { background: #f1f5f9; font-weight: 600; }
          tfoot td { background: #f1f5f9; font-weight: 600; }
          .sum-row td { font-weight: 700; color: #2563eb; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="report-wrap">
          <div class="report-header">
            <div class="brand">
              <div class="logo-wrap"><img src="${logoUrl || '/assets/village-logo.svg'}" alt="village-logo" /></div>
              <div class="report-title-block">
                <div class="report-title">${title}</div>
                <div class="report-meta">
                  ${filter ? `ช่วงเดือน: ${filter.startMonthLabel} ถึง ${filter.endMonthLabel} ปี ${filter.year + 543}` : ''}
                  <br/>วันที่พิมพ์: ${printDate}
                </div>
              </div>
            </div>
          </div>
          <div class="report-table-wrap">
            <table>
              <thead>${tableHead}</thead>
              <tbody>${tableBody}</tbody>
              <tfoot><tr class="sum-row"><td colspan="${columns.length - 1}" style="text-align:right;">${footerLabel || 'รวมยอดเงินที่ชำระ'}</td><td style="text-align:right">${(typeof sumAmount === 'number') ? sumAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (sumAmount ?? '-')}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
}
