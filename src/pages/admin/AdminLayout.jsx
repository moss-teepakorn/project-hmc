import React, { useState, useEffect } from 'react'
import StyledSelect from '../../components/StyledSelect'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { insertPageViewLog } from '../../lib/loginLogs'
import { applyDocumentTitle, getSetupConfig } from '../../lib/setup'
import { updateUser, getHouseDetail } from '../../lib/users'
import { listVehicleRequests } from '../../lib/vehicleRequests'
import { listVehicles } from '../../lib/vehicles'
import { listAccountRequests } from '../../lib/accountRequests'
import { listIssues } from '../../lib/issues'
import { listPayments } from '../../lib/fees'
import Swal from 'sweetalert2'
import villageLogo from '../../assets/village-logo.svg'
import './AdminLayout.css'

// Create a global modal context for easy access
export const ModalContext = React.createContext()

const BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'local'
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '-'
const APP_VERSION = '1.0.0'

function roleLabel(role) {
  return role === 'admin' ? 'ผู้ดูแลระบบ' : 'ลูกบ้าน'
}

const AdminLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState(localStorage.getItem('vms-theme') || 'normal')
  const [setupOpen, setSetupOpen] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyCounts, setNotifyCounts] = useState({ requests: 0, issues: 0, payments: 0 })
  const [sectionOpen, setSectionOpen] = useState({
    ข้อมูล: false,
    การเงิน: false,
    การจัดการ: false,
    รายงาน: false,
    ตั้งค่า: false,
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [houseNo, setHouseNo] = useState('-')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [setup, setSetup] = useState({
    villageName: 'The Greenfield',
    appLineMain: 'Village Management',
    appLineTail: 'System',
    version: '1.0.0',
  })
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalContent, setModalContent] = useState('')
  const [modalFields, setModalFields] = useState({})
  const [modalCallback, setModalCallback] = useState(null)

  useEffect(() => {
    if (!profile?.id || !location?.pathname) return
    insertPageViewLog({
      user_id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
      page_path: location.pathname,
    })
  }, [location.pathname, profile?.id, profile?.username, profile?.full_name, profile?.role])

  // Apply theme to document
  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('vms-theme', theme)
  }, [theme])

  useEffect(() => {
    const loadSetup = async () => {
      const next = await getSetupConfig()
      setSetup(next)
      applyDocumentTitle(next.villageName)
    }
    loadSetup()
  }, [])

  useEffect(() => {
    const loadNotifies = async () => {
      const [vehicleRes, accountRes, issuesRes, paymentsRes] = await Promise.allSettled([
        listVehicleRequests({ status: 'pending' }),
        listAccountRequests({ status: 'pending' }),
        listIssues({ status: 'pending' }),
        listPayments({ feeOnly: true }),
      ])

      const pendingVehiclesRes = await Promise.allSettled([
        listVehicles({ status: 'pending' }),
      ])

      const vehicleReqs = vehicleRes.status === 'fulfilled' ? (vehicleRes.value || []) : []
      const accountReqs = accountRes.status === 'fulfilled' ? (accountRes.value || []) : []
      const issues = issuesRes.status === 'fulfilled' ? (issuesRes.value || []) : []
      const feePayments = paymentsRes.status === 'fulfilled' ? (paymentsRes.value || []) : []
      const pendingVehicles = pendingVehiclesRes[0].status === 'fulfilled' ? (pendingVehiclesRes[0].value || []) : []
      const pendingFeePayments = feePayments.filter((row) => !row.verified_at && !String(row.note || '').startsWith('[REJECT] ')).length

      const vehicleRequestKeySet = new Set(
        vehicleReqs
          .filter((row) => row.status === 'pending')
          .map((row) => [
            String(row.house_id || ''),
            String(row.license_plate || '').trim().toLowerCase(),
            String(row.province || '').trim().toLowerCase(),
            String(row.vehicle_type || '').trim().toLowerCase(),
          ].join('|')),
      )

      const fallbackPendingVehicleCount = pendingVehicles.filter((row) => {
        const key = [
          String(row.house_id || ''),
          String(row.license_plate || '').trim().toLowerCase(),
          String(row.province || '').trim().toLowerCase(),
          String(row.vehicle_type || '').trim().toLowerCase(),
        ].join('|')
        return !vehicleRequestKeySet.has(key)
      }).length

      setNotifyCounts({
        requests: vehicleReqs.length + fallbackPendingVehicleCount + accountReqs.length,
        issues: issues.length,
        payments: pendingFeePayments,
      })
    }
    loadNotifies()
  }, [location.pathname])

  useEffect(() => {
    if (!notifyOpen) return
    const handleOutside = (event) => {
      const menu = document.getElementById('admin-notify-menu')
      const btn = document.getElementById('admin-notify-btn')
      if (menu && !menu.contains(event.target) && btn && !btn.contains(event.target)) {
        setNotifyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [notifyOpen])

  // Close sidebar on larger screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Load house_no for current user
  useEffect(() => {
    if (!profile?.house_id) { setHouseNo('-'); return }
    getHouseDetail(profile.house_id)
      .then((detail) => setHouseNo(detail?.house_no || '-'))
      .catch(() => setHouseNo('-'))
  }, [profile?.house_id])

  // Navigation menu items (from concept.html)
  const navItems = [
    { section: 'หน้าหลัก', tone: 'core', sectionIcon: '🏠', skipToggle: true, dashboardLink: '/admin/dashboard' },
    { section: 'ข้อมูล', tone: 'core', sectionIcon: '📋', items: [
      { id: 'houses', label: 'ข้อมูลบ้าน', icon: '🏠', path: '/admin/houses' },
      { id: 'vehicles', label: 'ข้อมูลรถ', icon: '🚗', path: '/admin/vehicles' },
    ]},
    { section: 'การเงิน', tone: 'operation', sectionIcon: '💰', items: [
      { id: 'fees-billing-penalty', label: 'สร้างใบแจ้งหนี้/ค่าปรับ', icon: '🧾', path: '/admin/fees/billing-penalty' },
      { id: 'fees-print', label: 'พิมพ์ใบแจ้งหนี้', icon: '🖨️', path: '/admin/fees/print' },
      { id: 'fees-print-notice', label: 'พิมพ์ใบแจ้งเตือน', icon: '🔔', path: '/admin/fees/print-notice' },
      { id: 'fees', label: 'ค่าส่วนกลาง', icon: '💵', path: '/admin/fees' },
      { id: 'payments', label: 'ชำระค่าส่วนกลาง', icon: '💳', path: '/admin/payments' },
      { id: 'receive-payments', label: 'รับชำระเงิน', icon: '💳', path: '/admin/receive-payments' },
      { id: 'disbursements', label: 'การจ่ายเงิน', icon: '📤', path: '/admin/disbursements' },
    ]},
    { section: 'การจัดการ', tone: 'operation', sectionIcon: '📋', items: [
      { id: 'req', label: 'คำขอแก้ไข', icon: '📝', path: '/admin/requests' },
      { id: 'issues', label: 'จัดการปัญหา', icon: '🔧', path: '/admin/issues' },
      { id: 'vio', label: 'แจ้งกระทำผิด', icon: '⚠️', path: '/admin/violations' },
      { id: 'rules', label: 'กฎระเบียบ', icon: '📘', path: '/admin/rules' },
      { id: 'ann', label: 'ประกาศ', icon: '📢', path: '/admin/announcements' },
      { id: 'rep', label: 'ผลงาน', icon: '🏆', path: '/admin/work-reports' },
      { id: 'tech', label: 'ทำเนียบช่าง', icon: '🔨', path: '/admin/technicians' },
      { id: 'market', label: 'ตลาดชุมชน', icon: '🛒', path: '/admin/marketplace' },
    ]},
    { section: 'รายงาน', tone: 'insight', sectionIcon: '📊', items: [
      { id: 'rpt-payments', label: 'รายงานจ่ายค่าส่วนกลาง', icon: '📄', path: '/admin/reports/payments' },
      { id: 'rpt-overdue', label: 'รายงานค้างชำระ', icon: '📄', path: '/admin/reports/outstanding' },
      { id: 'rpt-expense', label: 'รายงานการจ่ายเงินออก', icon: '📄', path: '/admin/reports/expense-payments' },
      { id: 'rpt-violations', label: 'รายงานการรับชำระเงิน', icon: '📄', path: '/admin/reports/violations-summary' },
    ]},
    { section: 'ตั้งค่า', tone: 'system', sectionIcon: '⚙️', items: [
      { id: 'cfg', label: 'ตั้งค่าระบบ', icon: '⚙️', path: '/admin/config' },
      { id: 'payment-cycles', label: 'กำหนดรอบการชำระ', icon: '🗓️', path: '/admin/config/payment-cycles' },
      { id: 'payments-setup', label: 'ตั้งค่ารายการรับชำระ', icon: '⚙️', path: '/admin/payments/setup' },
      { id: 'board-sets', label: 'ทะเบียนกรรมการ', icon: '👥', path: '/admin/board-sets' },
      { id: 'usr', label: 'ผู้ใช้งาน', icon: '👥', path: '/admin/users' },
      { id: 'login-logs', label: 'ประวัติการใช้ระบบ', icon: '🔐', path: '/admin/login-logs' },
    ]},
  ]

  const getActiveSectionName = (pathname) => {
    const currentPath = String(pathname || '')
    for (const section of navItems) {
      if (section.skipToggle && section.dashboardLink === currentPath) {
        return section.section
      }
      if (section.items?.some((item) => item.path === currentPath)) {
        return section.section
      }
    }
    return ''
  }

  const isSectionCurrent = (section) => {
    if (!section) return false
    if (section.skipToggle) {
      return section.dashboardLink === location.pathname
    }
    return Boolean(section.items?.some((item) => item.path === location.pathname))
  }

  useEffect(() => {
    const activeSection = getActiveSectionName(location.pathname)

    setSectionOpen(() => {
      const next = navItems
        .filter((item) => item.section && item.items)
        .reduce((acc, item) => {
          acc[item.section] = item.section === activeSection
          return acc
        }, {})
      return next
    })

    const timer = window.setTimeout(() => {
      const activeItem = document.querySelector('.sb-nav .sb-item.act')
      activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 40)

    return () => window.clearTimeout(timer)
  }, [location.pathname])

  const handleNavClick = (path) => {
    navigate(path)
    setSidebarOpen(false)
  }

  const toggleSection = (sectionName) => {
    // Check if this is หน้าหลัก and has dashboardLink
    const section = navItems.find(item => item.section === sectionName)
    if (section?.skipToggle && section?.dashboardLink) {
      navigate(section.dashboardLink)
      setSidebarOpen(false)
      return
    }

    setSectionOpen((prev) => {
      const allSections = navItems.filter(item => item.section && item.items)
      const next = allSections.reduce((acc, item) => {
        acc[item.section] = false
        return acc
      }, {})

      if (!prev[sectionName]) {
        next[sectionName] = true
      }

      return next
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleChangeMyPassword = async () => {
    if (!profile?.id) return
    if (!newPassword || !confirmPassword) {
      await Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกรหัสผ่านใหม่ให้ครบ' })
      return
    }
    if (newPassword.length < 6) {
      await Swal.fire({ icon: 'warning', title: 'รหัสผ่านสั้นเกินไป', text: 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร' })
      return
    }
    if (newPassword !== confirmPassword) {
      await Swal.fire({ icon: 'warning', title: 'รหัสผ่านไม่ตรงกัน', text: 'ยืนยันรหัสผ่านไม่ตรงกัน' })
      return
    }
    try {
      await updateUser(profile.id, { password: newPassword })
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordModal(false)
      await Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'เปลี่ยนรหัสผ่านเรียบร้อย' })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: `เปลี่ยนรหัสผ่านไม่สำเร็จ: ${error.message}` })
    }
  }

  const isNavItemActive = (path) => {
    return location.pathname === path
  }

  const getTopbarTitle = () => {
    for (const section of navItems) {
      if (section.skipToggle && section.dashboardLink === location.pathname) {
        return { main: 'Dashboard', sub: 'ภาพรวม' }
      }
      if (section.items) {
        const found = section.items.find((item) => item.path === location.pathname)
        if (found) return { main: found.label, sub: section.section }
      }
    }
    return { main: 'Dashboard', sub: 'ภาพรวม' }
  }
  const topbarTitle = getTopbarTitle()

  const searchKeyword = menuSearch.trim().toLowerCase()
  const visibleNavSections = navItems
    .map((section) => {
      if (!searchKeyword) return section
      // Skip sections without items (like หน้าหลัก)
      if (!section.items) return section
      const matchedItems = section.items.filter((item) => (
        String(item.label || '').toLowerCase().includes(searchKeyword)
        || String(item.path || '').toLowerCase().includes(searchKeyword)
      ))
      const sectionMatch = String(section.section || '').toLowerCase().includes(searchKeyword)
      if (sectionMatch) return section
      return {
        ...section,
        items: matchedItems,
      }
    })
    .filter((section) => !section.items || section.items.length > 0)

  // Modal functions
  const openModal = (title, fields = {}, callback = null) => {
    setModalTitle(title)
    setModalFields(fields)
    setModalCallback(() => callback)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setTimeout(() => {
      setModalTitle('')
      setModalContent('')
      setModalFields({})
      setModalCallback(null)
    }, 300)
  }

  const handleModalSubmit = () => {
    if (modalCallback) {
      modalCallback(modalFields)
    }
    closeModal()
  }

  return (
    <div className="app">
      {/* Sidebar Overlay */}
      <div 
        className={`sb-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        id="sb-ov"
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`} id="sidebar">
        {/* Logo */}
        <div className="sb-logo">
          <div className="sb-logo-ico sb-logo-ico-img">
            <img src={setup.loginCircleLogoUrl || villageLogo} alt="Village Logo" className="sb-logo-image" />
          </div>
          <div>
            <div className="sb-logo-name">{setup.villageName}</div>
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div className="sb-search-wrap">
            <div className="sb-search-input-wrap">
              <span className="sb-search-icon">🔍</span>
              <input
                className="sb-search-input"
                type="text"
                placeholder="ค้นหาเมนู"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Menu Sections */}
          <nav className="sb-nav">
            {visibleNavSections.map((section) => (
              <div key={section.section} className={`sb-major-group tone-${section.tone || 'default'}`}>
                {(() => {
                  const expanded = sidebarCollapsed || Boolean(searchKeyword) || Boolean(sectionOpen[section.section])
                  return (
                <>
                <button
                  type="button"
                  className={`sb-sec sb-sec-btn tone-${section.tone || 'default'} ${isSectionCurrent(section) ? 'sec-act' : ''}`}
                  onClick={() => toggleSection(section.section)}
                  aria-expanded={expanded}
                  title={section.section}
                  data-section={section.section}
                >
                  <span className="sb-sec-left">
                    <span className="sb-sec-ico">{section.sectionIcon || '>'}</span>
                    <span className="sb-sec-title">{section.section}</span>
                  </span>
                  {!section.skipToggle && <span className={`sb-sec-arrow ${expanded ? 'open' : ''}`}>▾</span>}
                </button>
                {expanded && section.items && (
                  <div className="sb-submenu-wrap">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className={`sb-item ${isNavItemActive(item.path) ? 'act' : ''} ${section.tone === 'core' ? 'core-item' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                    title={item.label}
                  >
                    <span className="sb-ico">{item.icon}</span>
                    <span className="sb-label">{item.label}</span>
                    {item.badge && <span className="sb-badge">{item.badge}</span>}
                  </div>
                ))}
                  </div>
                )}
                </>
                  )
                })()}
              </div>
            ))}
          </nav>

          {/* Account + Logout Card */}
          <div className="sb-foot">
            <div className="sb-account-card">
              <div className="sb-logout sb-logout-danger" onClick={handleLogout} title="ออกจากระบบ">
                <span style={{ fontSize: '18px' }}>🚪</span>
                <span className="sb-logout-label">ออกจากระบบ</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="tb-ham" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</div>
          <div className="tb-title tb-title-desktop">
            {topbarTitle.main} — <span className="hl">{topbarTitle.sub}</span>
          </div>
          <div className="tb-title tb-title-mobile">สวัสดี ผู้ดูแลระบบ</div>
          <div className="tb-right">
            <div style={{ position: 'relative' }}>
              <div className="tb-ico" id="admin-notify-btn" onClick={() => setNotifyOpen((prev) => !prev)} title="การแจ้งเตือน">🔔</div>
              {(notifyCounts.requests + notifyCounts.issues + notifyCounts.payments) > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {notifyCounts.requests + notifyCounts.issues + notifyCounts.payments}
                </span>
              )}

              {notifyOpen && (
                <div id="admin-notify-menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, background: 'var(--card)', border: '1.5px solid var(--bo)', borderRadius: 12, boxShadow: '0 10px 28px rgba(0,0,0,.14)', zIndex: 600, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bo)', fontSize: 12, fontWeight: 800, color: 'var(--mu)' }}>แจ้งเตือนงานค้าง</div>

                  <button
                    type="button"
                    onClick={() => { setNotifyOpen(false); navigate('/admin/requests') }}
                    style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--tx)' }}>📝 คำขอแก้ไข</span>
                    <span className="bd b-wn">{notifyCounts.requests}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setNotifyOpen(false); navigate('/admin/issues') }}
                    style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--bo)' }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--tx)' }}>🔧 จัดการปัญหา</span>
                    <span className="bd b-wn">{notifyCounts.issues}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setNotifyOpen(false); navigate('/admin/payments') }}
                    style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--bo)' }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--tx)' }}>💳 รอตรวจสอบชำระค่าส่วนกลาง</span>
                    <span className="bd b-wn">{notifyCounts.payments}</span>
                  </button>
                </div>
              )}
            </div>

            <span className="tb-user-greeting" style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', marginRight: '4px' }}>สวัสดี คุณ{profile?.full_name || profile?.username || ''}</span>
            <div className="setup-wrap">
              <div className="tb-ico" onClick={() => setSetupOpen((prev) => !prev)}>⚙️</div>

              {setupOpen && (
                <div className="setup-menu">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div className="setup-title" style={{ marginBottom: 0 }}>Setup</div>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--mu)', lineHeight: 1, padding: '0 2px' }} onClick={() => setSetupOpen(false)}>✕</button>
                  </div>

                  <div className="setup-section">
                    <div style={{ fontSize: '13px', color: 'var(--tx)', marginBottom: '10px', fontWeight: 600 }}>สวัสดี คุณ{profile?.full_name || profile?.username || ''}</div>
                    <div className="setup-label">Profile</div>
                    <div className="setup-profile-row"><span>ชื่อ</span><strong>{profile?.full_name || '-'}</strong></div>
                    <div className="setup-profile-row"><span>Username</span><strong>{profile?.username || '-'}</strong></div>
                    <div className="setup-profile-row"><span>บทบาท</span><strong>{roleLabel(profile?.role)}</strong></div>
                    <div className="setup-profile-row"><span>บ้าน</span><strong>{houseNo}</strong></div>
                  </div>

                  <div className="setup-section">
                    <div className="setup-label">Theme</div>
                    <div className="theme-strip">
                      {['normal', 'dark', 'rose', 'sage', 'sand', 'violet', 'teal', 'coral', 'mauve', 'dustyrose'].map((t) => (
                        <div
                          key={t}
                          className={`th-dot ${theme === t ? 'on' : ''}`}
                          onClick={() => setTheme(t)}
                          title={t}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="setup-section">
                    {profile?.role === 'admin' && profile?.house_id && (
                      <button className="btn btn-a btn-sm" style={{ width: '100%', marginBottom: '6px' }} onClick={() => { setSetupOpen(false); navigate('/resident/home') }}>🏠 โหมดลูกบ้าน (ดูข้อมูลของฉัน)</button>
                    )}
                    <button className="btn btn-p btn-sm" style={{ width: '100%' }} onClick={() => { setSetupOpen(false); setShowPasswordModal(true) }}>🔑 เปลี่ยนรหัสผ่าน</button>
                    <button className="btn btn-g btn-sm" style={{ width: '100%', marginTop: '6px' }} onClick={() => setSetupOpen(false)}>ปิด</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="page">
          <ModalContext.Provider value={{ openModal, closeModal, modalFields, setModalFields }}>
            <Outlet />
          </ModalContext.Provider>
        </div>

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="house-mo">
            <div className="house-md house-md--xs">
              <div className="house-md-head">
                <div>
                  <div className="house-md-title">🔑 เปลี่ยนรหัสผ่าน</div>
                  <div className="house-md-sub">{profile?.full_name || profile?.username}</div>
                </div>
              </div>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <label className="house-field">
                      <span>รหัสผ่านใหม่ <strong style={{ color: '#dc2626' }}>*</strong></span>
                      <input type="password" placeholder="อย่างน้อย 6 ตัวอักษร" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </label>
                    <label className="house-field">
                      <span>ยืนยันรหัสผ่านใหม่ <strong style={{ color: '#dc2626' }}>*</strong></span>
                      <input type="password" placeholder="กรอกรหัสผ่านอีกครั้ง" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </label>
                  </div>
                </section>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={() => { setShowPasswordModal(false); setNewPassword(''); setConfirmPassword('') }}>ยกเลิก</button>
                <button className="btn btn-p" type="button" onClick={handleChangeMyPassword}>บันทึก</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        <div className={`mo ${modalOpen ? 'show' : ''}`}>
          <div className="md">
            <div className="md-hd">
              <h2>{modalTitle}</h2>
            </div>
            <div className="md-bd">
              {Object.entries(modalFields).length > 0 ? (
                <div className="fg">
                  {Object.entries(modalFields).map(([key, value]) => (
                    <div key={key} style={{ marginBottom: '12px' }}>
                      <label className="fl">{value.label}</label>
                      {value.type === 'select' ? (
                        <StyledSelect
                          value={value.value ?? ''}
                          onChange={(e) => setModalFields({ ...modalFields, [key]: { ...value, value: e.target.value } })}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--bo)', borderRadius: '6px' }}
                        >
                          {(value.options || []).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </StyledSelect>
                      ) : value.type === 'textarea' ? (
                        <textarea
                          placeholder={value.placeholder || ''}
                          value={value.value ?? ''}
                          rows={value.rows || 3}
                          onChange={(e) => setModalFields({ ...modalFields, [key]: { ...value, value: e.target.value } })}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--bo)', borderRadius: '6px', resize: 'vertical' }}
                        />
                      ) : (
                        <input
                          type={value.type || 'text'}
                          placeholder={value.placeholder || ''}
                          value={value.value ?? ''}
                          onChange={(e) => setModalFields({ ...modalFields, [key]: { ...value, value: e.target.value } })}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--bo)', borderRadius: '6px' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>
                  โปรแกรมกำเนิดหนังสือการทำงาน
                </div>
              )}
            </div>
            <div className="md-ft">
              <button className="btn btn-g" onClick={closeModal}>ยกเลิก</button>
              <button className="btn btn-p" onClick={handleModalSubmit}>บันทึก</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="fixed bottom-0 right-0 left-0 sm:left-60 bg-white/80 border-t border-slate-200 px-6 py-3 text-center text-xs text-slate-500">
          <p>©VMS™ All Rights Reserved 2026 | version {APP_VERSION} | Built no : {BUILD_SHA} | Built date : {BUILD_DATE}</p>
        </footer>
      </div>
    </div>
  )
}

export default AdminLayout