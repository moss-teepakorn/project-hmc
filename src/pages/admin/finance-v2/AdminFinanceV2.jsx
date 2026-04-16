import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../../components/StyledSelect'
import { useLocation, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import { useAuth } from '../../../contexts/AuthContext'
import {
  approvePayment,
  calculateOverdueFeesByIds,
  listFees,
  listPaymentTotalsByFeeIds,
  listPayments,
  processHalfYearFeesAllHouses,
  rejectPayment,
  summarizeFees,
} from '../../../lib/fees'
import { getSystemConfig } from '../../../lib/systemConfig'
import './AdminFinanceV2.css'

const V2_ROUTES = [
  { key: 'hub', label: 'ศูนย์การเงิน', path: '/admin/finance-v2' },
  { key: 'billing', label: 'ออกใบแจ้งหนี้ V2', path: '/admin/finance-v2/billing' },
  { key: 'collections', label: 'ติดตามหนี้ V2', path: '/admin/finance-v2/collections' },
  { key: 'receive', label: 'รับชำระ V2', path: '/admin/finance-v2/receive' },
  { key: 'print', label: 'ศูนย์งานพิมพ์ V2', path: '/admin/finance-v2/print-center' },
  { key: 'archive', label: 'ข้อมูลย้อนหลัง V2', path: '/admin/finance-v2/archive' },
]

function toBE(yearValue) {
  const y = Number(yearValue || 0)
  if (!y) return '-'
  return y > 2400 ? y : y + 543
}

function periodLabel(period) {
  if (period === 'first_half') return 'ครึ่งปีแรก'
  if (period === 'second_half') return 'ครึ่งปีหลัง'
  if (period === 'full_year') return 'เต็มปี'
  return period || '-'
}

function feeStatusLabel(status) {
  if (status === 'paid') return 'ชำระแล้ว'
  if (status === 'cancelled') return 'ยกเลิก'
  if (status === 'pending') return 'รอชำระ'
  if (status === 'overdue') return 'เกินกำหนด'
  return status || '-'
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isRejectedPayment(payment) {
  return String(payment?.note || '').startsWith('[REJECT] ')
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function Header({ title, subtitle }) {
  return (
    <div className="ph report-head">
      <div className="ph-in report-head-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ph-ico">🧭</div>
          <div>
            <div className="ph-h1">{title}</div>
            <div className="ph-sub">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HubPage({ navigate, summary, pendingPayments, recentOutstanding }) {
  return (
    <div className="finance-v2-grid one-col">
      <section className="finance-v2-card">
        <div className="finance-v2-head">ศูนย์การเงิน (หน้าหลักใหม่สำหรับงานประจำวัน)</div>
        <div className="finance-v2-body">
          <div className="finance-v2-kpi">
            <div className="finance-v2-kpi-item"><label>ยอดออกใบแจ้งหนี้</label><strong>{formatMoney(summary.totalInvoiced)}</strong></div>
            <div className="finance-v2-kpi-item"><label>ยอดชำระแล้ว</label><strong>{formatMoney(summary.totalCollected)}</strong></div>
            <div className="finance-v2-kpi-item"><label>ยอดค้างชำระ</label><strong>{formatMoney(summary.totalOutstanding)}</strong></div>
            <div className="finance-v2-kpi-item"><label>รอตรวจสอบชำระ</label><strong>{pendingPayments} รายการ</strong></div>
          </div>
          <div className="finance-v2-note">หน้าจอชุดนี้ผูกฐานข้อมูลจริงแล้ว และใช้รูปแบบ Hybrid สำหรับงานประจำวัน</div>
          <div className="finance-v2-actions">
            <button className="btn btn-p btn-sm" onClick={() => navigate('/admin/finance-v2/billing')}>ไปหน้าออกใบแจ้งหนี้</button>
            <button className="btn btn-o btn-sm" onClick={() => navigate('/admin/finance-v2/collections')}>ไปหน้าติดตามหนี้</button>
            <button className="btn btn-a btn-sm" onClick={() => navigate('/admin/finance-v2/receive')}>ไปหน้ารับชำระ</button>
            <button className="btn btn-g btn-sm" onClick={() => navigate('/admin/finance-v2/print-center')}>ไปหน้าศูนย์งานพิมพ์</button>
            <button className="btn btn-g btn-sm" onClick={() => navigate('/admin/finance-v2/archive')}>ไปหน้าข้อมูลย้อนหลัง</button>
            <button className="btn btn-o btn-sm" onClick={() => navigate('/admin/finance-v2/reports')}>ไปหน้าศูนย์รายงาน</button>
          </div>

          <div className="finance-v2-list">
            {recentOutstanding.length === 0 ? (
              <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ไม่มีรายการค้างชำระ</strong><span>ข้อมูลจากฐานข้อมูลล่าสุด</span></div></div>
            ) : recentOutstanding.map((row) => (
              <div key={row.id} className="finance-v2-row">
                <div className="finance-v2-row-main">
                  <strong>บ้าน {row.houses?.house_no || '-'} · ซอย {row.houses?.soi || '-'}</strong>
                  <span>{periodLabel(row.period)} ปี {toBE(row.year)} · ครบกำหนด {row.due_date || '-'}</span>
                </div>
                <span className="finance-v2-chip orange">ค้าง {formatMoney(row.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function BillingPage({ billingYearBE, billingPeriod, setBillingYearBE, setBillingPeriod, billingRows, billingBusy, billingOverwrite, setBillingOverwrite, onRunBilling }) {
  return (
    <div className="finance-v2-grid">
      <section className="finance-v2-card">
        <div className="finance-v2-head">ออกใบแจ้งหนี้ V2 (แบบขั้นตอน)</div>
        <div className="finance-v2-body">
          <div className="finance-v2-actions">
            <label className="finance-v2-inline-field">
              ปี (พ.ศ.)
              <input value={billingYearBE} onChange={(e) => setBillingYearBE(e.target.value)} />
            </label>
            <label className="finance-v2-inline-field">
              งวด
              <StyledSelect value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)}>
                <option value="first_half">ครึ่งปีแรก</option>
                <option value="second_half">ครึ่งปีหลัง</option>
              </StyledSelect>
            </label>
            <label className="finance-v2-inline-check">
              <input type="checkbox" checked={billingOverwrite} onChange={(e) => setBillingOverwrite(e.target.checked)} />
              ทับรายการที่รอชำระ
            </label>
          </div>
          <div className="finance-v2-step"><h4>ขั้นตอน 1</h4><p>เลือกปีและงวดที่ต้องการออกบิล</p></div>
          <div className="finance-v2-step"><h4>ขั้นตอน 2</h4><p>เลือกกลุ่มบ้านและเงื่อนไขการข้าม</p></div>
          <div className="finance-v2-step"><h4>ขั้นตอน 3</h4><p>ตรวจสอบยอดรวมและจำนวนบิล</p></div>
          <div className="finance-v2-step"><h4>ขั้นตอน 4</h4><p>ยืนยันสร้างและบันทึกประวัติรอบงาน</p></div>
          <div className="finance-v2-actions">
            <button className="btn btn-a btn-sm" onClick={onRunBilling} disabled={billingBusy}>{billingBusy ? 'กำลังสร้าง...' : 'สร้างใบแจ้งหนี้จริง'}</button>
          </div>
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">รายการปี {billingYearBE} ({billingRows.length})</div>
        <div className="finance-v2-body finance-v2-list">
          {billingRows.length === 0 ? (
            <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ยังไม่มีข้อมูลในปี/งวดนี้</strong><span>ลองเปลี่ยนปีหรือสร้างรอบใหม่</span></div></div>
          ) : billingRows.slice(0, 10).map((row) => (
            <div className="finance-v2-row" key={row.id}>
              <div className="finance-v2-row-main">
                <strong>บ้าน {row.houses?.house_no || '-'} · ซอย {row.houses?.soi || '-'}</strong>
                <span>{periodLabel(row.period)} ปี {toBE(row.year)} · ครบกำหนด {row.due_date || '-'}</span>
              </div>
              <span className={`finance-v2-chip ${row.status === 'paid' ? 'green' : row.status === 'cancelled' ? 'gray' : 'blue'}`}>
                {formatMoney(row.total_amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CollectionsPage({ collectionRows, selectedCollectionIds, onToggleCollection, onToggleAllCollections, onCalcOverdue, collectionsBusy }) {
  return (
    <div className="finance-v2-grid">
      <section className="finance-v2-card">
        <div className="finance-v2-head">คิวลูกหนี้ V2</div>
        <div className="finance-v2-body finance-v2-list">
          {collectionRows.length === 0 ? (
            <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ไม่พบลูกหนี้ค้างชำระ</strong><span>ข้อมูลล่าสุดจากฐานข้อมูล</span></div></div>
          ) : collectionRows.map((row) => (
            <div key={row.id} className="finance-v2-row">
              <div className="finance-v2-row-main">
                <strong>บ้าน {row.house} · ซอย {row.soi}</strong>
                <span>{periodLabel(row.period)} ปี {toBE(row.year)} · ครบกำหนด {row.dueDate || '-'}</span>
              </div>
              <div className="finance-v2-actions">
                <label className="finance-v2-inline-check">
                  <input
                    type="checkbox"
                    checked={selectedCollectionIds.includes(row.id)}
                    onChange={(e) => onToggleCollection(row.id, e.target.checked)}
                  />
                  เลือก
                </label>
                <span className="finance-v2-chip orange">ค้าง {formatMoney(row.outstanding)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">งานชุด V2</div>
        <div className="finance-v2-body">
          <div className="finance-v2-actions">
            <button className="btn btn-g btn-sm" onClick={onToggleAllCollections}>เลือกทั้งหมด/ล้างเลือก</button>
            <button className="btn btn-o btn-sm" onClick={onCalcOverdue} disabled={collectionsBusy}>{collectionsBusy ? 'กำลังคำนวณ...' : 'คำนวณค่าปรับ (รายการที่เลือก)'}</button>
          </div>
          <div className="finance-v2-note">หน้านี้โฟกัส “ลูกหนี้ + ติดตามหนี้” เท่านั้น ไม่รวมงานรับชำระหรือพิมพ์เอกสารทั่วไป</div>
        </div>
      </section>
    </div>
  )
}

function ReceivePage({ receiveRows, receiveFilter, setReceiveFilter, onApprove, onReject, onOpenSlip, receiveBusy }) {
  return (
    <div className="finance-v2-grid">
      <section className="finance-v2-card">
        <div className="finance-v2-head">คิวรับชำระ V2</div>
        <div className="finance-v2-body">
          <div className="finance-v2-actions">
            <button className={`finance-v2-nav-btn ${receiveFilter === 'pending' ? 'on' : ''}`} onClick={() => setReceiveFilter('pending')}>รอตรวจสอบ</button>
            <button className={`finance-v2-nav-btn ${receiveFilter === 'approved' ? 'on' : ''}`} onClick={() => setReceiveFilter('approved')}>อนุมัติแล้ว</button>
            <button className={`finance-v2-nav-btn ${receiveFilter === 'rejected' ? 'on' : ''}`} onClick={() => setReceiveFilter('rejected')}>ตีกลับ</button>
            <button className={`finance-v2-nav-btn ${receiveFilter === 'all' ? 'on' : ''}`} onClick={() => setReceiveFilter('all')}>ทั้งหมด</button>
          </div>
        </div>
        <div className="finance-v2-body finance-v2-list">
          {receiveRows.length === 0 ? (
            <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ไม่พบรายการ</strong><span>ไม่มีข้อมูลตามตัวกรองที่เลือก</span></div></div>
          ) : receiveRows.map((row) => {
            const isRejected = isRejectedPayment(row)
            const status = row.verified_at ? 'approved' : (isRejected ? 'rejected' : 'pending')
            return (
              <div className="finance-v2-row" key={row.id}>
                <div className="finance-v2-row-main">
                  <strong>{row.receipt_no || row.id.slice(0, 8).toUpperCase()} · บ้าน {row.houses?.house_no || '-'}</strong>
                  <span>{periodLabel(row.fees?.period)} ปี {toBE(row.fees?.year)} · {formatMoney(row.amount)} · {row.payment_method || '-'}</span>
                </div>
                <div className="finance-v2-actions finance-v2-row-actions">
                  <span className={`finance-v2-chip ${status === 'approved' ? 'green' : status === 'rejected' ? 'orange' : 'blue'}`}>
                    {status === 'approved' ? 'อนุมัติแล้ว' : status === 'rejected' ? 'ตีกลับ' : 'รอตรวจสอบ'}
                  </span>
                  {row.slip_url && (
                    <button className="btn btn-o btn-sm" onClick={() => onOpenSlip(row.slip_url)}>
                      ดูสลิป
                    </button>
                  )}
                  {!row.verified_at && !isRejected && (
                    <>
                      <button className="btn btn-ok btn-sm" onClick={() => onApprove(row.id)} disabled={receiveBusy}>อนุมัติ</button>
                      <button className="btn btn-dg btn-sm" onClick={() => onReject(row.id)} disabled={receiveBusy}>ตีกลับ</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">แผงปฏิบัติการ V2</div>
        <div className="finance-v2-body">
          <div className="finance-v2-note">หน้ารับชำระแยกเดี่ยวสำหรับงานรายวัน ลดความเสี่ยงกดผิดจากปุ่มงานชุดขนาดใหญ่</div>
        </div>
      </section>
    </div>
  )
}

function PrintCenterPage({ printFees, printPayments, onPrintInvoices, onPrintNotices, onPrintReceipts, navigate }) {
  return (
    <div className="finance-v2-grid">
      <section className="finance-v2-card">
        <div className="finance-v2-head">งานพิมพ์ V2</div>
        <div className="finance-v2-body finance-v2-list">
          <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ชุดใบแจ้งหนี้</strong><span>ใบแจ้งหนี้ทั้งหมดในปีที่เลือก</span></div><span className="finance-v2-chip blue">{printFees.length} ฉบับ</span></div>
          <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ชุดใบเตือน</strong><span>ใบเตือนค้างชำระ</span></div><span className="finance-v2-chip orange">{printFees.filter((r) => r.status !== 'paid' && r.status !== 'cancelled').length} ฉบับ</span></div>
          <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ชุดใบเสร็จ</strong><span>ใบเสร็จที่อนุมัติแล้ว</span></div><span className="finance-v2-chip green">{printPayments.filter((r) => r.verified_at).length} ฉบับ</span></div>
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">ตัวควบคุมงานพิมพ์</div>
        <div className="finance-v2-body">
          <div className="finance-v2-actions">
            <button className="btn btn-p btn-sm" onClick={onPrintInvoices}>พิมพ์ใบแจ้งหนี้</button>
            <button className="btn btn-o btn-sm" onClick={onPrintNotices}>พิมพ์ใบเตือน</button>
            <button className="btn btn-a btn-sm" onClick={onPrintReceipts}>พิมพ์ใบเสร็จ</button>
          </div>
          <div className="finance-v2-note">รวมงานพิมพ์ไว้จุดเดียว ไม่กระจายปุ่มพิมพ์ไปหลายตาราง</div>
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">รายงานมาตรฐาน (Hybrid)</div>
        <div className="finance-v2-body">
          <div className="finance-v2-note">หากต้องการรายงานมาตรฐานพร้อมปุ่มส่งออก PDF/Excel ให้ใช้งานจากปุ่มด้านล่างได้ทันที</div>
          <div className="finance-v2-actions">
            <button className="btn btn-p btn-sm" onClick={() => navigate('/admin/finance-v2/reports')}>หน้ารวมรายงาน</button>
            <button className="btn btn-p btn-sm" onClick={() => navigate('/admin/finance-v2/reports/payments')}>รายงานจ่ายค่าส่วนกลาง</button>
            <button className="btn btn-o btn-sm" onClick={() => navigate('/admin/finance-v2/reports/outstanding')}>รายงานค้างชำระ</button>
            <button className="btn btn-g btn-sm" onClick={() => navigate('/admin/finance-v2/reports/expense-payments')}>รายงานรายจ่าย</button>
            <button className="btn btn-a btn-sm" onClick={() => navigate('/admin/finance-v2/reports/violations-summary')}>รายงานค่าปรับ</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ArchivePage({ archiveRows, archiveKeyword, setArchiveKeyword }) {
  return (
    <div className="finance-v2-grid">
      <section className="finance-v2-card">
        <div className="finance-v2-head">ค้นข้อมูลย้อนหลัง V2</div>
        <div className="finance-v2-body">
          <div className="finance-v2-actions">
            <label className="finance-v2-inline-field" style={{ minWidth: 260 }}>
              ค้นหา (บ้าน / เจ้าของ / ซอย)
              <input value={archiveKeyword} onChange={(e) => setArchiveKeyword(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="finance-v2-body finance-v2-list">
          {archiveRows.length === 0 ? (
            <div className="finance-v2-row"><div className="finance-v2-row-main"><strong>ไม่พบประวัติ</strong><span>ลองเปลี่ยนคำค้นหรือปี</span></div></div>
          ) : archiveRows.slice(0, 30).map((row) => (
            <div className="finance-v2-row" key={row.id}>
              <div className="finance-v2-row-main">
                <strong>บ้าน {row.houses?.house_no || '-'} · ซอย {row.houses?.soi || '-'}</strong>
                <span>{periodLabel(row.period)} ปี {toBE(row.year)} · {formatMoney(row.total_amount)}</span>
              </div>
              <span className={`finance-v2-chip ${row.status === 'paid' ? 'green' : 'gray'}`}>{feeStatusLabel(row.status)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="finance-v2-card">
        <div className="finance-v2-head">บันทึกการตรวจสอบ V2</div>
        <div className="finance-v2-body finance-v2-list">
          {archiveRows.slice(0, 10).map((row) => (
            <div className="finance-v2-row" key={`audit-${row.id}`}>
              <div className="finance-v2-row-main">
                <strong>INV-{String(row.year || '').slice(-2)}-{String(row.id || '').slice(0, 6).toUpperCase()}</strong>
                <span>สถานะ {feeStatusLabel(row.status)} · สร้างเมื่อ {row.created_at ? new Date(row.created_at).toLocaleString('th-TH') : '-'}</span>
              </div>
              <span className="finance-v2-chip blue">บันทึก</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function AdminFinanceV2() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const activeKey = V2_ROUTES.find((item) => item.path === location.pathname)?.key || 'hub'

  const currentBE = new Date().getFullYear() + 543
  const currentCE = new Date().getFullYear()

  const [setup, setSetup] = useState(null)
  const [screenLoading, setScreenLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [hubSummary, setHubSummary] = useState({ totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0 })
  const [hubPendingPayments, setHubPendingPayments] = useState(0)
  const [hubRecentOutstanding, setHubRecentOutstanding] = useState([])

  const [billingYearBE, setBillingYearBE] = useState(String(currentBE))
  const [billingPeriod, setBillingPeriod] = useState('first_half')
  const [billingOverwrite, setBillingOverwrite] = useState(false)
  const [billingRows, setBillingRows] = useState([])

  const [collectionRows, setCollectionRows] = useState([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([])

  const [receiveFilter, setReceiveFilter] = useState('pending')
  const [receiveRowsRaw, setReceiveRowsRaw] = useState([])

  const [printFees, setPrintFees] = useState([])
  const [printPayments, setPrintPayments] = useState([])

  const [archiveKeyword, setArchiveKeyword] = useState('')
  const [archiveRowsRaw, setArchiveRowsRaw] = useState([])

  useEffect(() => {
    const loadSetup = async () => {
      try {
        const cfg = await getSystemConfig()
        setSetup(cfg)
      } catch {
        setSetup(null)
      }
    }
    loadSetup()
  }, [])

  useEffect(() => {
    const loadByScreen = async () => {
      setErrorMessage('')
      setScreenLoading(true)
      try {
        if (activeKey === 'hub') {
          const [fees, payments] = await Promise.all([
            listFees({ status: 'all', year: currentCE }),
            listPayments({ feeOnly: true, limit: 400 }),
          ])
          setHubSummary(summarizeFees(fees, payments))
          setHubPendingPayments(payments.filter((row) => !row.verified_at && !isRejectedPayment(row)).length)
          setHubRecentOutstanding(
            fees
              .filter((row) => row.status !== 'paid' && row.status !== 'cancelled')
              .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
              .slice(0, 8),
          )
        }

        if (activeKey === 'billing') {
          const yearCE = Number(billingYearBE) > 2400 ? Number(billingYearBE) - 543 : Number(billingYearBE)
          const rows = await listFees({ status: 'all', year: yearCE, period: billingPeriod })
          setBillingRows(rows)
        }

        if (activeKey === 'collections') {
          const fees = await listFees({ status: 'all', year: currentCE })
          const ids = fees.map((row) => row.id)
          const totals = await listPaymentTotalsByFeeIds(ids)
          const rows = fees
            .map((row) => {
              const submitted = Number((totals.submitted || {})[row.id] || 0)
              const total = Number(row.total_amount || 0)
              return {
                id: row.id,
                house: row.houses?.house_no || '-',
                soi: row.houses?.soi || '-',
                period: row.period,
                year: row.year,
                dueDate: row.due_date,
                total,
                outstanding: Math.max(0, total - submitted),
                status: row.status,
              }
            })
            .filter((row) => row.status !== 'cancelled' && row.outstanding > 0)
            .sort((a, b) => b.outstanding - a.outstanding)
          setCollectionRows(rows)
          setSelectedCollectionIds([])
        }

        if (activeKey === 'receive') {
          const rows = await listPayments({ feeOnly: true, limit: 500 })
          setReceiveRowsRaw(rows)
        }

        if (activeKey === 'print') {
          const [fees, payments] = await Promise.all([
            listFees({ status: 'all', year: currentCE }),
            listPayments({ feeOnly: true, limit: 500 }),
          ])
          setPrintFees(fees)
          setPrintPayments(payments)
        }

        if (activeKey === 'archive') {
          const rows = await listFees({ status: 'all', year: currentCE })
          setArchiveRowsRaw(rows.filter((row) => row.status === 'paid' || row.status === 'cancelled'))
        }
      } catch (error) {
        setErrorMessage(error?.message || 'โหลดข้อมูลไม่สำเร็จ')
      } finally {
        setScreenLoading(false)
      }
    }

    loadByScreen()
  }, [activeKey, billingYearBE, billingPeriod, currentCE])

  const receiveRows = useMemo(() => {
    return receiveRowsRaw.filter((row) => {
      const rejected = isRejectedPayment(row)
      if (receiveFilter === 'approved') return Boolean(row.verified_at)
      if (receiveFilter === 'rejected') return rejected
      if (receiveFilter === 'pending') return !row.verified_at && !rejected
      return true
    })
  }, [receiveRowsRaw, receiveFilter])

  const archiveRows = useMemo(() => {
    const kw = archiveKeyword.trim().toLowerCase()
    if (!kw) return archiveRowsRaw
    return archiveRowsRaw.filter((row) => {
      const houseNo = String(row.houses?.house_no || '').toLowerCase()
      const owner = String(row.houses?.owner_name || '').toLowerCase()
      const soi = String(row.houses?.soi || '').toLowerCase()
      return houseNo.includes(kw) || owner.includes(kw) || soi.includes(kw)
    })
  }, [archiveRowsRaw, archiveKeyword])

  const openPrintHtml = (title, headers, rows) => {
    const headerHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
    const rowHtml = rows
      .map((r) => `<tr>${r.map((cell, idx) => `<td data-label="${escapeHtml(headers[idx] || '')}">${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>
      body{font-family:Sarabun,Arial,sans-serif;padding:18px;color:#0f172a}
      h1{font-size:20px;margin:0 0 10px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;text-align:left}
      th{background:#e2e8f0}
      @media (max-width: 720px){
        body{padding:10px}
        h1{font-size:16px;margin-bottom:8px}
        table,thead,tbody,tr,th,td{display:block}
        thead{display:none}
        tr{border:1px solid #cbd5e1;border-radius:10px;padding:8px;margin-bottom:8px;background:#fff}
        td{border:none;padding:2px 0;display:grid;grid-template-columns:100px 1fr;gap:8px;line-height:1.4}
        td::before{content:attr(data-label);font-weight:700;color:#334155}
      }
    </style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`
    const popup = window.open('', '_blank', 'width=1100,height=860')
    if (!popup) return
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
  }

  const handleRunBilling = async () => {
    if (!setup) {
      await Swal.fire({ icon: 'warning', title: 'ยังโหลดค่าระบบไม่ครบ' })
      return
    }
    try {
      setActionLoading(true)
      const result = await processHalfYearFeesAllHouses({
        yearBE: Number(billingYearBE),
        period: billingPeriod,
        setup,
        overwritePending: billingOverwrite,
      })
      await Swal.fire({
        icon: 'success',
        title: 'สร้างใบแจ้งหนี้เรียบร้อย',
        html: `สร้าง ${result.created} รายการ<br/>อัปเดต ${result.updated} รายการ`,
      })
      const yearCE = Number(billingYearBE) > 2400 ? Number(billingYearBE) - 543 : Number(billingYearBE)
      setBillingRows(await listFees({ status: 'all', year: yearCE, period: billingPeriod }))
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'สร้างใบแจ้งหนี้ไม่สำเร็จ', text: error?.message || '-' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleCollection = (id, checked) => {
    setSelectedCollectionIds((prev) => checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id))
  }

  const handleToggleAllCollections = () => {
    setSelectedCollectionIds((prev) => prev.length === collectionRows.length ? [] : collectionRows.map((row) => row.id))
  }

  const handleCalcOverdue = async () => {
    if (!setup) {
      await Swal.fire({ icon: 'warning', title: 'ยังโหลดค่าระบบไม่ครบ' })
      return
    }
    const targetIds = selectedCollectionIds.length > 0 ? selectedCollectionIds : collectionRows.map((row) => row.id)
    if (targetIds.length === 0) {
      await Swal.fire({ icon: 'info', title: 'ไม่มีรายการให้คำนวณ' })
      return
    }
    try {
      setActionLoading(true)
      const result = await calculateOverdueFeesByIds({ feeIds: targetIds, setup })
      await Swal.fire({ icon: 'success', title: 'คำนวณค่าปรับเรียบร้อย', html: `อัปเดต ${result.updated} รายการ` })
      const fees = await listFees({ status: 'all', year: currentCE })
      const ids = fees.map((row) => row.id)
      const totals = await listPaymentTotalsByFeeIds(ids)
      const rows = fees
        .map((row) => {
          const submitted = Number((totals.submitted || {})[row.id] || 0)
          const total = Number(row.total_amount || 0)
          return {
            id: row.id,
            house: row.houses?.house_no || '-',
            soi: row.houses?.soi || '-',
            period: row.period,
            year: row.year,
            dueDate: row.due_date,
            total,
            outstanding: Math.max(0, total - submitted),
            status: row.status,
          }
        })
        .filter((row) => row.status !== 'cancelled' && row.outstanding > 0)
      setCollectionRows(rows)
      setSelectedCollectionIds([])
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'คำนวณค่าปรับไม่สำเร็จ', text: error?.message || '-' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = async (paymentId) => {
    try {
      setActionLoading(true)
      await approvePayment(paymentId, profile?.id || null)
      setReceiveRowsRaw(await listPayments({ feeOnly: true, limit: 500 }))
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'อนุมัติไม่สำเร็จ', text: error?.message || '-' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (paymentId) => {
    const { value: reason } = await Swal.fire({
      title: 'เหตุผลการตีกลับ',
      input: 'text',
      inputPlaceholder: 'ระบุเหตุผล',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    })
    if (!reason) return
    try {
      setActionLoading(true)
      await rejectPayment(paymentId, reason, profile?.id || null)
      setReceiveRowsRaw(await listPayments({ feeOnly: true, limit: 500 }))
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ตีกลับไม่สำเร็จ', text: error?.message || '-' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenSlip = (slipUrl) => {
    if (!slipUrl) return
    window.open(slipUrl, '_blank', 'noopener,noreferrer')
  }

  const handlePrintInvoices = () => {
    const rows = printFees.map((row) => [row.houses?.house_no || '-', row.houses?.soi || '-', periodLabel(row.period), toBE(row.year), formatMoney(row.total_amount), feeStatusLabel(row.status)])
    openPrintHtml('ใบแจ้งหนี้ทั้งหมด (การเงิน V2)', ['บ้าน', 'ซอย', 'งวด', 'ปี', 'ยอดรวม', 'สถานะ'], rows)
  }

  const handlePrintNotices = () => {
    const rows = printFees
      .filter((row) => row.status !== 'paid' && row.status !== 'cancelled')
      .map((row) => [row.houses?.house_no || '-', row.houses?.soi || '-', periodLabel(row.period), toBE(row.year), formatMoney(row.total_amount), row.due_date || '-'])
    openPrintHtml('ใบแจ้งเตือนค้างชำระ (การเงิน V2)', ['บ้าน', 'ซอย', 'งวด', 'ปี', 'ยอดค้าง', 'ครบกำหนด'], rows)
  }

  const handlePrintReceipts = () => {
    const rows = printPayments
      .filter((row) => row.verified_at)
      .map((row) => [row.receipt_no || row.id.slice(0, 8), row.houses?.house_no || '-', periodLabel(row.fees?.period), toBE(row.fees?.year), formatMoney(row.amount), row.payment_method || '-'])
    openPrintHtml('ใบเสร็จที่อนุมัติแล้ว (การเงิน V2)', ['เลขที่', 'บ้าน', 'งวด', 'ปี', 'ยอดชำระ', 'วิธี'], rows)
  }

  let title = 'การเงิน V2 (Hybrid)'
  let subtitle = 'หน้าจอ Hybrid สำหรับงานการเงินแบบรวมศูนย์'
  let content = (
    <HubPage
      navigate={navigate}
      summary={hubSummary}
      pendingPayments={hubPendingPayments}
      recentOutstanding={hubRecentOutstanding}
    />
  )

  if (activeKey === 'billing') {
    title = 'ออกใบแจ้งหนี้ V2'
    subtitle = 'ย้ายขั้นตอนสร้างใบแจ้งหนี้ไปหน้าจอเฉพาะทาง'
    content = (
      <BillingPage
        billingYearBE={billingYearBE}
        billingPeriod={billingPeriod}
        setBillingYearBE={setBillingYearBE}
        setBillingPeriod={setBillingPeriod}
        billingRows={billingRows}
        billingBusy={actionLoading}
        billingOverwrite={billingOverwrite}
        setBillingOverwrite={setBillingOverwrite}
        onRunBilling={handleRunBilling}
      />
    )
  } else if (activeKey === 'collections') {
    title = 'ติดตามหนี้และค่าปรับ V2'
    subtitle = 'รวมงานลูกหนี้และค่าปรับแบบรวมศูนย์'
    content = (
      <CollectionsPage
        collectionRows={collectionRows}
        selectedCollectionIds={selectedCollectionIds}
        onToggleCollection={handleToggleCollection}
        onToggleAllCollections={handleToggleAllCollections}
        onCalcOverdue={handleCalcOverdue}
        collectionsBusy={actionLoading}
      />
    )
  } else if (activeKey === 'receive') {
    title = 'รับชำระเงิน V2'
    subtitle = 'คิวรับเงินรายวัน แยกจากงานออกบิล'
    content = (
      <ReceivePage
        receiveRows={receiveRows}
        receiveFilter={receiveFilter}
        setReceiveFilter={setReceiveFilter}
        onApprove={handleApprove}
        onReject={handleReject}
        onOpenSlip={handleOpenSlip}
        receiveBusy={actionLoading}
      />
    )
  } else if (activeKey === 'print') {
    title = 'ศูนย์งานพิมพ์ V2'
    subtitle = 'จัดการงานพิมพ์เอกสารทั้งหมดในหน้าเดียว'
    content = (
      <PrintCenterPage
        printFees={printFees}
        printPayments={printPayments}
        onPrintInvoices={handlePrintInvoices}
        onPrintNotices={handlePrintNotices}
        onPrintReceipts={handlePrintReceipts}
        navigate={navigate}
      />
    )
  } else if (activeKey === 'archive') {
    title = 'ข้อมูลย้อนหลัง V2'
    subtitle = 'ค้นประวัติย้อนหลัง พร้อมบันทึกการตรวจสอบ'
    content = (
      <ArchivePage
        archiveRows={archiveRows}
        archiveKeyword={archiveKeyword}
        setArchiveKeyword={setArchiveKeyword}
      />
    )
  }

  return (
    <div className="pane on houses-compact fees-compact">
      <Header title={title} subtitle={subtitle} />

      {(screenLoading || errorMessage) && (
        <div className="card">
          <div className="cb" style={{ color: errorMessage ? '#b91c1c' : 'var(--mu)', textAlign: 'center' }}>
            {errorMessage || 'กำลังโหลดข้อมูล...'}
          </div>
        </div>
      )}

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb">
          <div className="finance-v2-nav">
            {V2_ROUTES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`finance-v2-nav-btn ${activeKey === item.key ? 'on' : ''}`}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="finance-v2">{content}</div>
    </div>
  )
}