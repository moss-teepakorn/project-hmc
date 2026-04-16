// paymentReportExportPdf.js
// ใช้ html2canvas + jsPDF export PDF แบบเดียวกับหน้า fees
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { buildPaymentReportHtml } from './PaymentReportExportHtml';
import { resolveImageToDataUrl, DEFAULT_LOGO_DATAURL } from '../../../lib/logoUtils';
import villageLogo from '../../../assets/village-logo.svg';
import { getSystemConfig } from '../../../lib/systemConfig';

// use shared `resolveImageToDataUrl` from lib/logoUtils

export async function exportPaymentReportPdf({ title, fileName, columns, rows, filter, sumAmount, logoUrl, footerLabel }) {
  // 1. แปลงโลโก้เป็น Data URL ก่อน (เหมือนใบแจ้งหนี้)
  // prefer latest setup logo (like fees): try fetching fresh system config first
  const freshConfig = await getSystemConfig().catch(() => null);
  // Prefer the login-circle logo if configured, then fall back to village logo.
  const rawLogoUrl = freshConfig?.login_circle_logo_url || freshConfig?.village_logo_url || logoUrl || localStorage.getItem('vms-login-circle-logo-url') || '';
  const fallbackLogo = `${window.location.origin}${villageLogo}`;
  let printLogoUrl = await resolveImageToDataUrl(rawLogoUrl, fallbackLogo);
  // Normalize accidental concatenation like "<origin>data:image..." -> keep only data URL portion
  if (typeof printLogoUrl === 'string') {
    const idx = printLogoUrl.indexOf('data:image');
    if (idx > 0) printLogoUrl = printLogoUrl.slice(idx);
  }
  // 2. สร้าง HTML
  const html = buildPaymentReportHtml({ title, columns, rows, filter, sumAmount, logoUrl: printLogoUrl, footerLabel });
  // 3. สร้าง iframe ซ่อน
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;border:none;width:1122px;height:793px;'; // A4 landscape
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  // 4. รอโหลดฟอนต์ Sarabun จาก Google Fonts ให้แน่ใจก่อน (สำคัญมากสำหรับ html2canvas)
  const fontReady = () => {
    if (doc.fonts && doc.fonts.check) {
      return doc.fonts.load('1em Sarabun');
    }
    return Promise.resolve();
  };
  await fontReady();
  await new Promise(res => setTimeout(res, 500)); // เผื่อฟอนต์โหลดช้า
  // 5. แปลงเป็น canvas
  const el = doc.body.querySelector('.report-wrap');
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff', width: 1122, height: 793 });
  // 6. ใส่ลง jsPDF (landscape)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const A4W = pdf.internal.pageSize.getWidth();
  const A4H = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4W, A4H, undefined, 'FAST');
  pdf.save(`${fileName}.pdf`);
  // 7. ลบ iframe
  document.body.removeChild(iframe);
}
