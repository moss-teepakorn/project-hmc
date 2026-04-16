import React, { useContext, useState, useEffect, useMemo } from 'react'
import { ModalContext } from './AdminLayout'
import { getAuditLogs, deleteAuditLogs, deleteAllAuditLogs } from '../../lib/auditLogs'
import { getSetupConfig } from '../../lib/setup'
import villageLogo from '../../assets/village-logo.svg'
import Swal from 'sweetalert2'

function fmtDatetime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const AdminLogs = () => {
  const { openModal } = useContext(ModalContext)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [setup, setSetup] = useState({ villageName: 'The Greenfield', loginCircleLogoUrl: '' })

  useEffect(() => {
    getSetupConfig().then(setSetup).catch(() => {})
    loadLogs()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const data = await getAuditLogs(1000)
      setLogs(data)
    } catch (error) {
      console.error('Error loading logs:', error)
    } finally {
      setLoading(false)
    }
  }

  // client-side filter
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return logs
    return logs.filter(
      (r) =>
        (r.action || '').toLowerCase().includes(kw) ||
        (r.target_table || '').toLowerCase().includes(kw) ||
        (r.profiles?.full_name || '').toLowerCase().includes(kw),
    )
  }, [logs, search])

  // ─── Checkbox logic ────────────────────────────────────────────────
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const someChecked = !allChecked && filtered.some((r) => selected.has(r.id))

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((r) => r.id)))
    }
  }

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Delete selected ───────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const result = await Swal.fire({
      icon: 'warning',
      title: `ลบ ${selected.size} รายการ?`,
      text: 'ไม่สามารถกู้คืนได้',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e53e3e',
    })
    if (!result.isConfirmed) return
    try {
      await deleteAuditLogs([...selected])
      await Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false })
      loadLogs()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message })
    }
  }

  // ─── Delete all ────────────────────────────────────────────────────
  const handleDeleteAll = async () => {
    if (logs.length === 0) return
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ลบ Log ทั้งหมด?',
      text: `จะลบทั้งหมด ${logs.length} รายการ ไม่สามารถกู้คืนได้`,
      showCancelButton: true,
      confirmButtonText: 'ลบทั้งหมด',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e53e3e',
    })
    if (!result.isConfirmed) return
    try {
      await deleteAllAuditLogs()
      await Swal.fire({ icon: 'success', title: 'ลบทั้งหมดสำเร็จ', timer: 1200, showConfirmButton: false })
      loadLogs()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message })
    }
  }

  const handleViewLog = (log) => {
    openModal('รายละเอียด Log: ' + log.action, {
      timestamp: { label: 'เวลา', type: 'text', value: fmtDatetime(log.acted_at), disabled: true },
      user: { label: 'ผู้ใช้', type: 'text', value: log.profiles?.full_name || 'System', disabled: true },
      action: { label: 'การดำเนินการ', type: 'text', value: log.action, disabled: true },
      table: { label: 'ตารางข้อมูล', type: 'text', value: log.target_table, disabled: true },
    }, null)
  }

  return (
    <div className="pane on houses-compact">
      <div className="ph houses-ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">
              <img className="ph-ico-img" src={setup.loginCircleLogoUrl || villageLogo} alt="system-logo" />
            </div>
            <div>
              <div className="ph-h1">ข้อมูล Log</div>
              <div className="ph-sub">บันทึกกิจกรรมของระบบ · {setup.villageName}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา action / ตาราง / ผู้ใช้..."
            className="houses-filter-input"
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
          <button
            className="btn btn-a btn-sm"
            onClick={loadLogs}
            disabled={loading}
            style={{ flex: '0 0 auto', height: '34px' }}
          >
            ค้นหา
          </button>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">
            รายการทั้งหมด {logs.length} รายการ
            {selected.size > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--pr)', fontWeight: 600 }}>
                · เลือก {selected.size}
              </span>
            )}
          </div>
          <div className="houses-list-actions">
            <button
              className="btn btn-dg btn-sm"
              onClick={handleDeleteSelected}
              disabled={selected.size === 0}
            >
              🗑 ลบที่เลือก ({selected.size})
            </button>
            <button
              className="btn btn-dg btn-sm"
              onClick={handleDeleteAll}
              disabled={logs.length === 0}
            >
              🗑 ลบทั้งหมด
            </button>
            <button className="btn btn-g btn-sm" onClick={loadLogs} disabled={loading}>
              🔄 รีเฟรช
            </button>
          </div>
        </div>

        <div className="cb houses-table-card-body houses-main-body">
          <div className="houses-table-wrap houses-desktop-only">
            <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '720px' }}>
              <thead><tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll}
                  />
                </th>
                <th style={{ width: 40 }}>#</th>
                <th>วันที่ / เวลา</th>
                <th>ผู้ใช้</th>
                <th>การดำเนินการ</th>
                <th>ตารางข้อมูล</th>
                <th/>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px' }}>กำลังโหลด...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px' }}>ไม่มีข้อมูล Log</td></tr>
                ) : filtered.map((log, idx) => {
                  const actionBg = log.action === 'INSERT' ? 'b-pr' : log.action === 'UPDATE' ? 'b-a' : 'b-mu'
                  return (
                    <tr
                      key={log.id}
                      style={{ background: selected.has(log.id) ? 'var(--pr-bg, #f0f7ff)' : undefined, cursor: 'pointer' }}
                      onClick={() => toggleRow(log.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(log.id)} onChange={() => toggleRow(log.id)} />
                      </td>
                      <td style={{ color: 'var(--mu)', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDatetime(log.acted_at)}</td>
                      <td>{log.profiles?.full_name || 'System'}</td>
                      <td><span className={`bd ${actionBg}`}>{log.action}</span></td>
                      <td>{log.target_table}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-xs btn-o" onClick={() => handleViewLog(log)}>ดู</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="houses-mobile-only" style={{ gap: 10, padding: '4px 0' }}>
            {loading ? (
              <div className="mcard-empty">กำลังโหลด...</div>
            ) : filtered.length === 0 ? (
              <div className="mcard-empty">ไม่มีข้อมูล Log</div>
            ) : (
              <>
                <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} />
                  <span style={{ fontSize: 12, color: 'var(--mu)' }}>เลือกทั้งหมด</span>
                </div>
                {filtered.map((log) => {
                  const actionBg = log.action === 'INSERT' ? 'b-pr' : log.action === 'UPDATE' ? 'b-a' : 'b-mu'
                  return (
                    <div
                      key={log.id}
                      className="houses-mcard"
                      style={{ background: selected.has(log.id) ? 'var(--pr-bg, #f0f7ff)' : undefined }}
                      onClick={() => toggleRow(log.id)}
                    >
                      <div className="houses-mcard-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selected.has(log.id)}
                            onChange={() => toggleRow(log.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="houses-mcard-no">{log.target_table}</div>
                        </div>
                        <span className={`bd ${actionBg} houses-mcard-badge`}>{log.action}</span>
                      </div>
                      <div className="mcard-meta" style={{ marginTop: 4 }}>
                        <span><span className="mcard-label">เวลา</span> {fmtDatetime(log.acted_at)}</span>
                        <span><span className="mcard-label">ผู้ใช้</span> {log.profiles?.full_name || 'System'}</span>
                      </div>
                      <div className="mcard-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-xs btn-o" onClick={() => handleViewLog(log)}>ดู</button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminLogs
