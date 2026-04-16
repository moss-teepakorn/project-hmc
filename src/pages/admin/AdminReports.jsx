import React, { useContext } from 'react'
import { ModalContext } from './AdminLayout'
import { Link } from 'react-router-dom'

const AdminReports = () => {
  const { openModal } = useContext(ModalContext)

  const handleAddReport = () => {
    openModal('สร้างรายงานใหม่', {
      title: { label: 'ชื่อรายงาน', type: 'text', placeholder: 'รายงานบัญชี' },
      period: { label: 'ระยะเวลา', type: 'text', placeholder: 'มกราคม - มีนาคม' },
      type: { label: 'ประเภท', type: 'text', placeholder: 'การเงิน' },
    }, (data) => {
      console.log('Add report:', data)
    })
  }
  return (
    <div className="pane on reports-compact">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">🏆</div>
            <div>
              <div className="ph-h1">ผลงานนิติ</div>
              <div className="ph-sub">รายงานประวัติและประสิทธิภาพ</div>
            </div>
          </div>
            <div style={{ marginTop: 16 }}>
              <div className="card">
                <div className="ch"><div className="ct">รายงาน</div></div>
                <div className="cb">
                  <ul style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 0, margin: 0, listStyle: 'none' }}>
                    <li><Link to="/admin/reports/payments" className="btn">รายงานจ่ายค่าส่วนกลาง</Link></li>
                    <li><Link to="/admin/reports/outstanding" className="btn">รายงานค่างชำระ</Link></li>
                    <li><Link to="/admin/reports/overdue" className="btn">สรุปค้างชำระ</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          <div className="ph-acts">
            <button className="btn btn-p btn-sm">📄 ออกรายงาน</button>
          </div>
        </div>
      </div>

  <div className="stats">
        <div className="sc"><div className="sc-ico p">📋</div><div><div className="sc-v">242</div><div className="sc-l">การประชุมทั้งหมด</div></div></div>
        <div className="sc"><div className="sc-ico a">✅</div><div><div className="sc-v">95%</div><div className="sc-l">อัตราการมาประชุม</div></div></div>
      </div>

      <div className="card">
        <div className="ch"><div className="ct">ประวัติการประชุม</div></div>
        <div className="cb">
          <div style={{ overflowX: 'auto' }}>
            <table className="tw" style={{ width: '100%', minWidth: '500px' }}>
              <thead>
                <tr>
                  <th>ลำดับที่</th>
                  <th>วันที่</th>
                  <th>ประเภท</th>
                  <th>ผู้มาประชุม</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>242</td>
                  <td>14 มีนาคม 2568</td>
                  <td><span className="bd b-p">ประชุมประจำเดือน</span></td>
                  <td>98 คน</td>
                  <td><span className="bd b-ok">สำเร็จ</span></td>
                </tr>
                <tr>
                  <td>241</td>
                  <td>14 กุมภาพันธ์ 2568</td>
                  <td><span className="bd b-p">ประชุมประจำเดือน</span></td>
                  <td>97 คน</td>
                  <td><span className="bd b-ok">สำเร็จ</span></td>
                </tr>
                <tr>
                  <td>240</td>
                  <td>14 มกราคม 2568</td>
                  <td><span className="bd b-p">ประชุมประจำเดือน</span></td>
                  <td>96 คน</td>
                  <td><span className="bd b-ok">สำเร็จ</span></td>
                </tr>
                <tr>
                  <td>239</td>
                  <td>14 ธันวาคม 2567</td>
                  <td><span className="bd b-w">ประชุมพิเศษ</span></td>
                  <td>102 คน</td>
                  <td><span className="bd b-ok">สำเร็จ</span></td>
                </tr>
                <tr>
                  <td>238</td>
                  <td>14 พฤศจิกายน 2567</td>
                  <td><span className="bd b-p">ประชุมประจำเดือน</span></td>
                  <td>99 คน</td>
                  <td><span className="bd b-ok">สำเร็จ</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminReports
