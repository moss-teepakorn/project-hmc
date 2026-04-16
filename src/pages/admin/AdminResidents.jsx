export default function AdminResidents() {
  return (
    <div className="pane on" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">🧑‍🤝‍🧑</div>
            <div>
              <div className="ph-h1">ผู้พักอาศัย</div>
              <div className="ph-sub">จัดการข้อมูลผู้พักอาศัยในหมู่บ้าน</div>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">ข้อมูลผู้พักอาศัย</div></div>
        <div className="cb" style={{ color: 'var(--mu)' }}>กำลังสร้าง...</div>
      </div>
    </div>
  )
}
