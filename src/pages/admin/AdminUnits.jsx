export default function AdminUnits() {
  return (
    <div className="pane on" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">🏘️</div>
            <div>
              <div className="ph-h1">ห้องพัก</div>
              <div className="ph-sub">จัดการยูนิตและทรัพย์สินในโครงการ</div>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">ข้อมูลยูนิต</div></div>
        <div className="cb" style={{ color: 'var(--mu)' }}>กำลังสร้าง...</div>
      </div>
    </div>
  )
}
