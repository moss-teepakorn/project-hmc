import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Chart from 'chart.js/auto'
import { getDashboardData } from '../../lib/dashboard'
import { getSetupConfig } from '../../lib/setup'
import villageLogo from '../../assets/village-logo.svg'
import './AdminDashboard.css'

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [themeKey, setThemeKey] = useState(() => document.body.getAttribute('data-theme') || 'normal')
  const [setup, setSetup] = useState({
    villageName: 'The Greenfield',
    loginCircleLogoUrl: '',
  })
  const paymentChartRef = useRef(null)
  const houseStatusChartRef = useRef(null)
  const quarterlyChartRef = useRef(null)
  const issuesChartRef = useRef(null)
  const chartInstancesRef = useRef([])

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true)
        setLoadError('')
        setDashboard(await getDashboardData())
      } catch (error) {
        setLoadError(error?.message || 'ไม่สามารถโหลดข้อมูล dashboard ได้')
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    const loadSetup = async () => {
      try {
        const next = await getSetupConfig()
        setSetup(next)
      } catch (error) {
        console.error('Error loading setup config:', error)
      }
    }

    loadSetup()
    loadDashboard()
  }, [])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeKey(document.body.getAttribute('data-theme') || 'normal')
    })

    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!dashboard) return

    const styles = getComputedStyle(document.body)
    const getVar = (name, fallback) => {
      const value = styles.getPropertyValue(name).trim()
      return value || fallback
    }

    const palette = {
      primary: getVar('--pr', '#1B4F72'),
      primaryLight: getVar('--prl', '#E8F4F8'),
      accent: getVar('--ac', '#28B463'),
      warning: getVar('--wn', '#E67E22'),
      danger: getVar('--dg', '#C0392B'),
      border: getVar('--bo', '#D1D5DB'),
      text: getVar('--tx', '#334155'),
      muted: getVar('--mu', '#6B7280'),
      card: getVar('--card', '#FFFFFF'),
      bg2: getVar('--bg2', '#F1F5F9'),
    }

    const pastel = {
      mint: '#A8E6CF',
      peach: '#FFD3B6',
      rose: '#FFAAA5',
      lavender: '#D8C4F0',
      sky: '#BDE0FE',
      lemon: '#FFF1B6',
      teal: '#9ADBCB',
      coral: '#F8B4B4',
      periwinkle: '#C7CEEA',
      violet: '#CDB4DB',
    }

    chartInstancesRef.current.forEach((chart) => chart.destroy())
    chartInstancesRef.current = []

    Chart.defaults.font.family = 'Sarabun, sans-serif'
    Chart.defaults.color = palette.text
    Chart.defaults.borderColor = palette.border

    if (paymentChartRef.current) {
      const paymentChart = new Chart(paymentChartRef.current, {
        type: 'bar',
        data: {
          labels: data.paymentTrend.map((item) => item.label),
          datasets: [
            {
              label: 'ยอดเก็บได้',
              data: data.paymentTrend.map((item) => item.collected),
              backgroundColor: pastel.mint,
              borderRadius: 6,
              maxBarThickness: 26,
            },
            {
              label: 'ยอดค้าง',
              data: data.paymentTrend.map((item) => item.outstanding),
              backgroundColor: pastel.rose,
              borderRadius: 6,
              maxBarThickness: 26,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => `${Number(value).toLocaleString('th-TH')}`,
              },
            },
          },
        },
      })
      chartInstancesRef.current.push(paymentChart)
    }

    if (houseStatusChartRef.current) {
      const houseStatusChart = new Chart(houseStatusChartRef.current, {
        type: 'doughnut',
        data: {
          labels: ['ปกติ', 'ค้างชำระ', 'ระงับสิทธิ์', 'ฟ้องร้อง'],
          datasets: [
            {
              data: [
                data.houseStatus.normal,
                data.houseStatus.overdue,
                data.houseStatus.suspended,
                data.houseStatus.lawsuit,
              ],
              backgroundColor: [pastel.mint, pastel.peach, pastel.coral, pastel.violet],
              borderColor: palette.card,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          animation: { duration: 950, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
          },
        },
      })
      chartInstancesRef.current.push(houseStatusChart)
    }

    if (quarterlyChartRef.current) {
      const quarterlyChart = new Chart(quarterlyChartRef.current, {
        type: 'line',
        data: {
          labels: data.quarterlyTrend.map((item) => item.key),
          datasets: [
            {
              label: 'ยอดเก็บได้',
              data: data.quarterlyTrend.map((item) => item.paid),
              borderColor: pastel.sky,
              backgroundColor: pastel.sky,
              pointBackgroundColor: pastel.sky,
              fill: true,
              tension: 0.28,
            },
            {
              label: 'ยอดค้าง',
              data: data.quarterlyTrend.map((item) => item.outstanding),
              borderColor: pastel.peach,
              backgroundColor: pastel.peach,
              pointBackgroundColor: pastel.peach,
              fill: true,
              tension: 0.28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1000, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
          },
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        },
      })
      chartInstancesRef.current.push(quarterlyChart)
    }

    if (issuesChartRef.current) {
      const issueData = data.issueCategories.slice(0, 6)
      const issuesChart = new Chart(issuesChartRef.current, {
        type: 'pie',
        data: {
          labels: issueData.map((item) => item.category),
          datasets: [
            {
              data: issueData.map((item) => item.count),
              backgroundColor: [
                pastel.peach,
                pastel.rose,
                pastel.sky,
                pastel.violet,
                pastel.teal,
                pastel.periwinkle,
              ],
              borderColor: palette.card,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
          },
        },
      })
      chartInstancesRef.current.push(issuesChart)
    }

    return () => {
      chartInstancesRef.current.forEach((chart) => chart.destroy())
      chartInstancesRef.current = []
    }
  }, [dashboard, themeKey])

  if (loading && !dashboard) {
    return <div className="pane on"><div className="card"><div className="cb" style={{ padding: '24px', textAlign: 'center', color: 'var(--mu)' }}>กำลังโหลดข้อมูล dashboard...</div></div></div>
  }

  if (!loading && !dashboard) {
    return (
      <div className="pane on">
        <div className="card">
          <div className="cb" style={{ padding: '24px', textAlign: 'center', color: 'var(--mu)' }}>
            {loadError || 'ไม่พบข้อมูลจริงสำหรับแสดงผล Dashboard'}
          </div>
        </div>
      </div>
    )
  }

  const todayLabel = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  const data = dashboard
  const quickApprovals = data.quickApprovals || { slips: [], requests: [] }
  const goToRequests = () => navigate('/admin/requests')
  const goToPayments = () => navigate('/admin/payments')
  const goToViolations = () => navigate('/admin/violations')
  const getStatusBadgeClass = (tone) => {
    if (tone === 'ok') return 'bd b-ok'
    if (tone === 'wn') return 'bd b-wn'
    if (tone === 'dg') return 'bd b-dg'
    return 'bd b-pr'
  }

  return (
    <div className="pane on dashboard dashboard-v1" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">
              <img className="ph-ico-img" src={setup.loginCircleLogoUrl || villageLogo} alt="system-logo" />
            </div>
            <div>
              <div className="ph-h1">Dashboard ภาพรวม</div>
              <div className="ph-sub" id="dash-sub">{setup.villageName} · {todayLabel}</div>
            </div>
          </div>
          <div className="ph-acts">
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{data.header.totalHouses}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.85)', marginTop: '6px', fontWeight: 500 }}>บ้านทั้งหมด</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>⭐{data.header.averageRating.toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.85)', marginTop: '6px', fontWeight: 500 }}>คะแนนบริการ</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>฿{Math.round(data.header.totalOutstanding / 1000)}K</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.85)', marginTop: '6px', fontWeight: 500 }}>ค้างชำระรวม</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats">
        <div className="sc">
          <div className="sc-ico p">🏠</div>
          <div>
            <div className="sc-v" style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1 }}>{data.kpis.totalHouses}</div>
            <div className="sc-l">บ้านทั้งหมด</div>
            <div className="sc-s"><span className="up" style={{ fontSize: '13px', fontWeight: 700, color: '#18a765' }}>↑ {data.kpis.newHousesThisMonth}</span> หลังใหม่เดือนนี้</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-ico d">💰</div>
          <div>
            <div className="sc-v" style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1, color: '#d32f2f' }}>{data.kpis.overdueCount}</div>
            <div className="sc-l">ค้างชำระ</div>
            <div className="sc-s" style={{ color: '#d32f2f', fontWeight: 600 }}>฿{data.kpis.overdueAmount.toLocaleString('th-TH')}</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-ico w">📝</div>
          <div>
            <div className="sc-v" style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1 }}>{data.kpis.pendingApprovals}</div>
            <div className="sc-l">รออนุมัติ</div>
            <div className="sc-s">รถ, ชำระเงิน, ตลาด, ช่าง</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-ico a">🔧</div>
          <div>
            <div className="sc-v" style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1 }}>{data.kpis.openIssues}</div>
            <div className="sc-l">ปัญหาค้างอยู่</div>
            <div className="sc-s"><span style={{ fontSize: '13px', fontWeight: 700, color: '#e67e22' }}>⭐ {data.kpis.averageRating.toFixed(1)}</span> คะแนน</div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="g2">
        <div className="chart-box">
          <div className="ch">
            <h3>💰 ยอดชำระ vs ค้าง — 6 เดือน</h3>
          </div>
          <div className="chart-wrap">
            <canvas ref={paymentChartRef} />
          </div>
        </div>
        <div className="chart-box house-status-card">
          <div className="ch">
            <h3>🏠 สถานะบ้านทั้งหมด ({data.header.totalHouses} หลัง)</h3>
          </div>
          <div className="chart-wrap house-status-wrap">
            <canvas ref={houseStatusChartRef} />
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="g2">
        <div className="chart-box">
          <div className="ch">
            <h3>📈 ยอดเก็บ vs ค้างรายไตรมาส</h3>
          </div>
          <div className="chart-wrap">
            <canvas ref={quarterlyChartRef} />
          </div>
        </div>
        <div className="chart-box">
          <div className="ch">
            <h3>🔧 ปัญหาตามประเภท</h3>
          </div>
          <div className="chart-wrap">
            <canvas ref={issuesChartRef} />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="g2">
        <div className="chart-box">
          <div className="ch">
            <h3>⚡ รายการด่วน — รออนุมัติ</h3>
          </div>
          <div className="cb">
            <div className="qa-split">
              <div className="qa-group">
                <div className="qa-group-head" style={{ cursor: 'pointer' }} onClick={goToPayments}>สลิปโอนรอตรวจสอบ</div>
                {quickApprovals.slips.length === 0 ? (
                  <div className="qa-empty">ไม่มีสลิปรออนุมัติ</div>
                ) : quickApprovals.slips.map((item, index) => (
                  <div key={`slip-${index}`} className="qa-item">
                    <span className="bd b-wn">{item.type}</span>
                    <span className="qa-name">บ้าน {item.source}</span>
                    <span className="qa-status">{item.detail}</span>
                    <div className="qa-act">
                      <button className="btn btn-xs btn-a" onClick={goToPayments}>ตรวจสอบ</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="qa-group">
                <div className="qa-group-head" style={{ cursor: 'pointer' }} onClick={goToRequests}>คำขออื่นรออนุมัติ</div>
                {quickApprovals.requests.length === 0 ? (
                  <div className="qa-empty">ไม่มีคำขอรออนุมัติ</div>
                ) : quickApprovals.requests.map((item, index) => (
                  <div key={`req-${index}`} className="qa-item">
                    <span className={`bd ${item.type === 'ตลาด' ? 'b-pr' : 'b-wn'}`}>{item.type}</span>
                    <span className="qa-name">บ้าน {item.source}</span>
                    <span className="qa-status">{item.detail}</span>
                    <div className="qa-act">
                      <button className="btn btn-xs btn-a" onClick={goToRequests}>ดูคำขอ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="chart-box">
          <div className="ch">
            <h3 style={{ cursor: 'pointer' }} onClick={goToViolations}>⚠️ แจ้งเตือนล่าสุด</h3>
          </div>
          <div className="cb">
            {data.alerts.length === 0 ? (
              <div style={{ color: 'var(--mu)', fontSize: '13px' }}>ยังไม่มีแจ้งเตือนจากฐานข้อมูล</div>
            ) : data.alerts.map((item, index) => item.kind === 'violation' ? (
              <div key={`alert-${index}`} className="vio" style={{ cursor: 'pointer' }} onClick={goToViolations}>
                <div className="vio-t">{item.title}</div>
                <div style={{ fontSize: '12px', marginTop: '3px' }}>{item.meta}</div>
                <div style={{ marginTop: '6px' }}><span className={getStatusBadgeClass(item.statusTone)}>{item.statusLabel}</span></div>
              </div>
            ) : (
              <div key={`alert-${index}`} className="iss" style={{ cursor: 'pointer' }} onClick={goToViolations}>
                <div className="iss-h">
                  <div className="iss-t">{item.title}</div>
                  <span className={getStatusBadgeClass(item.statusTone)}>{item.statusLabel}</span>
                </div>
                <div className="iss-m">{item.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
