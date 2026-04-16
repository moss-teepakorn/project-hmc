import React, { useMemo } from 'react'
import { exportReportExcel, exportReportPdf } from './reportExport.mjs'
import '../AdminDashboard.css'

export default function ReportMockPage({ columns, rows, loading, error, sumAmount }) {
  const totalRows = rows.length
  const preview = useMemo(() => rows.slice(0, 12), [rows])
  const numberColumn = columns.find((column) => column.type === 'number')

  return (
    <div className="card houses-main-card">
      <div className="ch houses-list-head houses-main-head">
        <div className="ct">รายการข้อมูลรายงาน</div>
      </div>
      <div className="cb houses-table-card-body houses-main-body" style={{ overflow: 'hidden' }}>
        {error && <div style={{ color: 'red', padding: 12 }}>{error}</div>}
        <div className="houses-table-wrap houses-desktop-only" style={{ overflow: 'auto' }}>
          <table className="tw houses-table houses-main-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ textAlign: column.type === 'number' ? 'right' : undefined }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={`${row.id || index}-${index}`}>
                  {columns.map((column) => {
                    if (column.type === 'number') {
                      const rawKey = `${column.key}Raw`
                      const raw = Object.prototype.hasOwnProperty.call(row, rawKey) ? row[rawKey] : row[column.key]
                      const num = Number(raw)
                      const formatted = Number.isFinite(num)
                        ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '-'
                      return <td key={column.key} style={{ textAlign: 'right' }}>{formatted}</td>
                    }
                    return <td key={column.key}>{row[column.key] ?? '-'}</td>
                  })}
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--mu)' }}>ไม่พบข้อมูล</td>
                </tr>
              )}
            </tbody>
            {typeof sumAmount === 'number' && (
              <tfoot>
                <tr>
                  <td colSpan={Math.max(1, columns.length - 1)} style={{ textAlign: 'right', fontWeight: 'bold' }}>รวมยอด</td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right' }}>{sumAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="houses-mobile-only" style={{ gap: 10, padding: '10px 0' }}>
          {loading ? (
            <div className="mcard-empty">กำลังโหลดข้อมูล...</div>
          ) : preview.length === 0 ? (
            <div className="mcard-empty">ไม่พบข้อมูล</div>
          ) : preview.map((row, index) => {
            const titleValue = row[columns[0]?.key] ?? '-'
            const amountRaw = numberColumn
              ? (Object.prototype.hasOwnProperty.call(row, `${numberColumn.key}Raw`) ? row[`${numberColumn.key}Raw`] : row[numberColumn.key])
              : null
            const amountNumber = Number(amountRaw)
            const amountText = Number.isFinite(amountNumber)
              ? amountNumber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '-'

            return (
              <div key={`m-${row.id || index}-${index}`} className="mcard">
                <div className="mcard-top">
                  <div className="mcard-title">{titleValue}</div>
                  {numberColumn && <span className="bd b-pr mcard-badge">฿{amountText}</span>}
                </div>
                <div className="mcard-meta" style={{ marginTop: 4 }}>
                  {columns.slice(1).map((column) => {
                    let display = row[column.key] ?? '-'
                    if (column.type === 'number') {
                      const rawKey = `${column.key}Raw`
                      const raw = Object.prototype.hasOwnProperty.call(row, rawKey) ? row[rawKey] : row[column.key]
                      const num = Number(raw)
                      display = Number.isFinite(num)
                        ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '-'
                    }
                    return <span key={`${row.id || index}-${column.key}`}><span className="mcard-label">{column.label}</span> {display}</span>
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
