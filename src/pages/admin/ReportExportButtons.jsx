
import React from 'react';
import Swal from 'sweetalert2';

import { exportReportExcel } from '../admin/reports/reportExport.mjs';
import { exportPaymentReportPdf } from '../admin/reports/paymentReportExportPdf.js';


export default function ReportExportButtons({ columns, rows, filter, reportTitle, sumAmount, logoUrl, footerLabel }) {
  // Export Excel (ใช้ฟังก์ชันกลาง)
  const handleExportExcel = () => {
    try {
      exportReportExcel({ fileName: reportTitle, columns, rows });
      Swal.fire({ icon: 'success', title: 'ส่งออก Excel สำเร็จ', timer: 1200, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
    }
  };

  // Export PDF (ใช้ html2canvas + jsPDF แบบหน้า fees)
  const handleExportPDF = async () => {
    try {
      await exportPaymentReportPdf({
        title: reportTitle,
        fileName: reportTitle,
        columns,
        rows,
        filter,
        sumAmount,
        logoUrl,
        footerLabel
      });
      Swal.fire({ icon: 'success', title: 'ส่งออก PDF สำเร็จ', timer: 1200, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        className="btn btn-p"
        style={{
          width: 38,
          height: 38,
          minWidth: 38,
          borderRadius: 10,
          padding: 0,
          background: '#16a34a',
          color: '#fff',
          border: 'none',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={handleExportExcel}
        type="button"
        title="Export Excel"
      >
        📗
      </button>
      <button
        className="btn btn-p"
        style={{
          width: 38,
          height: 38,
          minWidth: 38,
          borderRadius: 10,
          padding: 0,
          background: '#ea580c',
          color: '#fff',
          border: 'none',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={handleExportPDF}
        type="button"
        title="Export PDF"
      >
        📕
      </button>
    </div>
  );
}
