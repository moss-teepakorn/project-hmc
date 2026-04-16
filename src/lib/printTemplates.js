function toNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateDMY(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function periodLabel(period) {
  if (period === 'first_half') return 'ครึ่งปีแรก'
  if (period === 'second_half') return 'ครึ่งปีหลัง'
  if (period === 'full_year') return 'เต็มปี'
  return period || '-'
}

function toBE(yearCE) {
  const year = Number(yearCE)
  if (!Number.isFinite(year)) return '-'
  return year + 543
}

function formatMethod(method) {
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'cash') return 'เงินสด'
  if (method === 'qr') return 'QR'
  return method || '-'
}

function getSetupValue(setup = {}, snakeKey, camelKey, fallback = '') {
  if (setup && Object.prototype.hasOwnProperty.call(setup, snakeKey) && setup[snakeKey] !== undefined && setup[snakeKey] !== null) {
    return setup[snakeKey]
  }
  if (setup && Object.prototype.hasOwnProperty.call(setup, camelKey) && setup[camelKey] !== undefined && setup[camelKey] !== null) {
    return setup[camelKey]
  }
  return fallback
}

function normalizeMultilineText(input, fallback = '') {
  const raw = String(input || '').trim()
  const source = raw || String(fallback || '')
  const withLineBreaks = source
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*br\s*>/gi, '\n')
  const noTags = withLineBreaks.replace(/<[^>]*>/g, '')
  const lines = noTags
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.join('\n').trim()
}

function toThaiBahtText(value) {
  const amount = toNumber(value)
  if (!Number.isFinite(amount) || amount < 0) return '-'
  if (amount === 0) return 'ศูนย์บาทถ้วน'

  const numberText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const positionText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  const convertInteger = (num) => {
    if (num === 0) return ''
    let result = ''
    const digits = String(num).split('').map((d) => Number(d))
    const len = digits.length

    digits.forEach((digit, idx) => {
      const pos = len - idx - 1
      if (digit === 0) return

      if (pos === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด'
        return
      }
      if (pos === 1 && digit === 1) {
        result += 'สิบ'
        return
      }
      if (pos === 1 && digit === 2) {
        result += 'ยี่สิบ'
        return
      }

      result += `${numberText[digit]}${positionText[pos]}`
    })

    return result
  }

  const [intPartRaw, decPartRaw = '00'] = amount.toFixed(2).split('.')
  let intPart = Number(intPartRaw)
  const decPart = Number(decPartRaw)

  const millionChunks = []
  while (intPart > 0) {
    millionChunks.unshift(intPart % 1000000)
    intPart = Math.floor(intPart / 1000000)
  }

  const bahtText = millionChunks
    .map((chunk, index) => {
      const text = convertInteger(chunk)
      if (!text) return ''
      const isLast = index === millionChunks.length - 1
      return isLast ? text : `${text}ล้าน`
    })
    .join('') || 'ศูนย์'

  if (decPart === 0) return `${bahtText}บาทถ้วน`
  return `${bahtText}บาท${convertInteger(decPart)}สตางค์`
}

export function buildInvoiceDocumentNo(fee) {
  return `INV-${String(fee?.year || '').slice(-2)}-${String(fee?.id || '').slice(0, 8).toUpperCase()}`
}

export function buildInvoiceHtmlAdminStyle({
  fee,
  outstandingItems = [],
  setup = {},
  logoUrl = '',
  signatureUrl = '',
  houseInfo = {},
  autoPrint = false,
  forCapture = false,
} = {}) {
  const invoiceNo = buildInvoiceDocumentNo(fee)
  const periodText = `${periodLabel(fee?.period)} ปี ${toBE(fee?.year)}`

  const villageName = getSetupValue(setup, 'village_name', 'villageName', 'The Greenfield')
  const juristicName = getSetupValue(setup, 'juristic_name', 'juristicName', 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์')
  const juristicAddress = getSetupValue(setup, 'juristic_address', 'juristicAddress', '-')
  const bankName = getSetupValue(setup, 'bank_name', 'bankName', '-')
  const bankAccountNo = getSetupValue(setup, 'bank_account_no', 'bankAccountNo', '-')
  const bankAccountName = getSetupValue(setup, 'bank_account_name', 'bankAccountName', '-')
  const feeRatePerSqw = toNumber(getSetupValue(setup, 'fee_rate_per_sqw', 'feeRatePerSqw', 0))
  const invoiceMessage = getSetupValue(
    setup,
    'invoice_message',
    'invoiceMessage',
    'กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%\nไม่รับชำระเงินเป็นเงินสดทุกกรณี คณะกรรมการจะไม่รับผิดชอบจากการชำระด้วยเงินสด\nขอให้ท่านส่งหลักฐานการชำระเงินเข้ามาที่ Line Official ID : @gusto.ssw26 หรือทำผ่านระบบ',
  )
  const invoiceMessageText = normalizeMultilineText(
    invoiceMessage,
    'กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%\nไม่รับชำระเงินเป็นเงินสดทุกกรณี คณะกรรมการจะไม่รับผิดชอบจากการชำระด้วยเงินสด\nขอให้ท่านส่งหลักฐานการชำระเงินเข้ามาที่ Line Official ID : @gusto.ssw26 หรือทำผ่านระบบ',
  )
  const houseNo = fee?.houses?.house_no || houseInfo?.house_no || '-'
  const ownerName = fee?.houses?.owner_name || houseInfo?.owner_name || '-'
  const soi = fee?.houses?.soi || houseInfo?.soi || '-'
  const areaSqw = toNumber(fee?.houses?.area_sqw || houseInfo?.area_sqw || 0)
  const feeRate = feeRatePerSqw > 0 ? feeRatePerSqw : toNumber(fee?.houses?.fee_rate || houseInfo?.fee_rate || 0)

  const rows = Array.isArray(outstandingItems) ? outstandingItems : []
  const rowHtml = rows.length === 0
    ? `
      <tr>
        <td class="c">1</td>
        <td>ไม่มีรายการค้างชำระ</td>
        <td class="r">0.00</td>
      </tr>
    `
    : rows.map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${item.label}</td>
        <td class="r">${formatMoney(item.amount)}</td>
      </tr>
    `).join('')

  const totalOutstanding = rows.reduce((sum, item) => sum + toNumber(item?.amount), 0)

  const renderSheet = (copyLabel, isLastCopy) => `
    <section class="sheet${isLastCopy ? '' : ' page-break'}">
      <header class="head">
        <div class="brand">
          <div class="logo-wrap"><img src="${logoUrl}" alt="village-logo" /></div>
          <div>
            <div class="doc">ใบแจ้งหนี้ค่าส่วนกลาง</div>
            <div class="village">${villageName}</div>
            <div class="sub">${juristicName}</div>
            <div class="sub">${juristicAddress}</div>
            <div class="sub">ใบแจ้งหนี้ ${houseNo} ${periodText}</div>
          </div>
        </div>
        <div class="doc-meta">
          <div><span>เลขที่เอกสาร:</span> <strong>${invoiceNo}</strong></div>
          <div><span>วันที่ออกเอกสาร:</span> <strong>${formatDateDMY(fee?.invoice_date)}</strong></div>
          <div><span>ครบกำหนดชำระ:</span> <strong>${formatDateDMY(fee?.due_date)}</strong></div>
          <div class="copy-mark-row">
            <div class="copy-mark copy-mark--active">${copyLabel}</div>
          </div>
        </div>
      </header>

      <section class="box">
        <div class="grid">
          <div><span>บ้านเลขที่</span><strong>${houseNo}</strong></div>
          <div><span>ชื่อเจ้าของบ้าน</span><strong>${ownerName}</strong></div>
          <div><span>งวดเรียกเก็บ</span><strong>${periodText}</strong></div>
          <div><span>ซอย</span><strong>${soi}</strong></div>
          <div><span>พื้นที่ (ตร.วา)</span><strong>${areaSqw.toLocaleString('en-US')}</strong></div>
          <div><span>อัตราค่าส่วนกลาง</span><strong>${feeRate.toLocaleString('en-US')} บาท/ตร.วา/ปี</strong></div>
        </div>
      </section>

      <section class="box">
        <table>
          <thead>
            <tr>
              <th class="c" style="width:56px;">ลำดับ</th>
              <th>รายการ</th>
              <th class="r" style="width:180px;">จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            ${rowHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="r"><strong>รวมทั้งสิ้น</strong></td>
              <td class="r"><strong>${formatMoney(totalOutstanding)}</strong></td>
            </tr>
          </tfoot>
        </table>
        <div class="amount-text">(${toThaiBahtText(totalOutstanding)})</div>
      </section>

      <section class="box payment-box">
        <div class="payment-title">รายละเอียดการชำระเงิน</div>
        <div class="payment-grid">
          <div><span>ธนาคาร</span><strong>${bankName}</strong></div>
          <div><span>เลขที่บัญชี</span><strong>${bankAccountNo}</strong></div>
          <div><span>ชื่อบัญชี</span><strong>${bankAccountName}</strong></div>
          <div><span>กำหนดชำระ</span><strong>${formatDateDMY(fee?.due_date)}</strong></div>
        </div>
        <div class="payment-note">${invoiceMessageText}</div>
      </section>

      <section class="foot">
        <div class="note">
          หมายเหตุ: กรุณาชำระภายในวันที่ครบกำหนด เพื่อหลีกเลี่ยงค่าปรับ/ค่าทวงถามเพิ่มเติม
        </div>
        <div class="sign-wrap">
          ${signatureUrl ? `<img src="${signatureUrl}" alt="juristic-signature" />` : ''}
          <div class="sign-line"></div>
          <div>ผู้มีอำนาจลงนาม</div>
        </div>
      </section>
    </section>
  `

  return `
    <html>
      <head>
        <title>ใบแจ้งหนี้ ${invoiceNo}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          html, body { font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; margin: 0; padding: 0; color: #111827; background: #fff; }
          .sheet {
            position: relative;
            width: ${forCapture ? '794px' : '100%'};
            ${forCapture ? 'height: 1122px; overflow: hidden;' : 'page-break-after: always; break-after: page; break-inside: avoid;'}
            background: #fff;
            padding: 24px 28px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .page-break {}
          .head {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 12px;
            background: #ffffff;
            margin-bottom: 4px;
          }
          .brand { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
          .logo-wrap { width: 64px; height: 64px; border-radius: 12px; background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 6px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
          .logo-wrap img { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 8px; }
          .doc { font-size: 16px; font-weight: 700; line-height: 1.3; }
          .village { font-size: 11px; margin-top: 3px; font-weight: 600; }
          .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
          .doc-meta { font-size: 10px; min-width: 180px; display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
          .doc-meta span { color: #6b7280; font-weight: 500; }
          .copy-mark-row {
            display: flex;
            gap: 6px;
            justify-content: flex-end;
            margin-top: 10px;
            margin-right: -4px;
          }
          .copy-mark {
            border: none;
            border-radius: 4px;
            padding: 3px 10px;
            text-align: center;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.3;
            color: #94a3b8;
            background: transparent;
          }
          .copy-mark--active {
            color: #0c4a6e;
            background: transparent;
          }
          .box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
          .grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
          .grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
          .grid strong { font-size: 11px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; table-layout: auto; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; }
          th { background: #f1f5f9; text-align: left; font-weight: 600; }
          .c { text-align: center; }
          .r { text-align: right; }
          tfoot td { background: #f1f5f9; font-weight: 600; }
          .amount-text {
            margin-top: 4px;
            font-size: 10px;
            color: #374151;
            font-weight: 500;
            text-align: right;
          }
          .payment-box { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
          .payment-title { font-size: 11px; font-weight: 700; color: #111827; }
          .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
          .payment-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
          .payment-grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
          .payment-grid strong { font-size: 11px; font-weight: 600; }
          .payment-note {
            border-top: 1px dashed #d1d5db;
            padding-top: 4px;
            font-size: 10px;
            color: #4b5563;
            white-space: pre-line;
          }
          .foot {
            margin-top: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 12px;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 12px;
            background: #f9fafb;
          }
          .note { font-size: 9px; color: #64748b; line-height: 1.4; }
          .sign-wrap { min-width: 140px; text-align: center; font-size: 9px; color: #64748b; }
          .sign-wrap img { max-width: 100px; max-height: 36px; object-fit: contain; margin-bottom: 4px; }
          .sign-line { border-top: 1px solid #cbd5e1; margin: 4px 0; }
          @media print {
            html, body { background: #fff; }
            .sheet { page-break-after: always; break-after: page; break-inside: avoid; }
            .sheet:last-child { page-break-after: avoid; break-after: avoid; }
          }
        </style>
      </head>
      <body>
        ${renderSheet('ต้นฉบับ', false)}
        ${renderSheet('สำเนา', true)}
        ${autoPrint ? '<script>window.onload = () => window.print();</script>' : ''}
      </body>
    </html>
  `
}

export function buildReceiptHtmlAdminStyle({
  payment,
  setup = {},
  receiptNo,
  logoUrl = '',
  signatureUrl = '',
  itemRows = [],
  houseInfo = {},
  autoPrint = false,
  forCapture = false,
  displayNote = '',
} = {}) {
  const finalReceiptNo = receiptNo || payment?.receipt_no || `REC-${String(payment?.id || '').slice(0, 8).toUpperCase()}`
  const issueDate = formatDateTime(payment?.verified_at)
  const houseNo = payment?.houses?.house_no || houseInfo?.house_no || '-'
  const ownerName = payment?.houses?.owner_name || houseInfo?.owner_name || '-'
  const invoiceLabel = payment?.fees ? `${periodLabel(payment.fees.period)} ปี ${toBE(payment.fees.year)}` : '-'
  const invoiceNo = payment?.fees ? buildInvoiceDocumentNo(payment.fees) : '-'
  const amount = toNumber(payment?.amount)

  const rows = Array.isArray(itemRows) ? itemRows : []
  const totalPaid = rows.reduce((sum, row) => sum + toNumber(row?.paidAmount), 0) || amount
  const totalDue = toNumber(payment?.fees?.total_amount || rows.reduce((sum, row) => sum + toNumber(row?.dueAmount), 0))
  const totalOutstanding = Math.max(0, totalDue - totalPaid)

  const renderTableRows = () => rows.map((row, index) => (`
    <tr>
      <td class="c">${index + 1}</td>
      <td>${row.label}</td>
      <td class="r">${formatMoney(row.dueAmount)}</td>
      <td class="r">${formatMoney(row.paidAmount)}</td>
    </tr>
  `)).join('')

  const renderSheet = (copyLabel) => (`
    <div class="sheet page-break">
      <div class="head">
        <div class="brand">
          <img src="${logoUrl}" alt="logo" />
          <div>
            <div class="doc">ใบเสร็จรับเงินค่าส่วนกลาง</div>
            <div class="village">${getSetupValue(setup, 'village_name', 'villageName', 'Village Management System')}</div>
            <div class="sub">${getSetupValue(setup, 'juristic_address', 'address', '-')}</div>
            <div class="sub">อ้างอิงใบแจ้งหนี้ ${invoiceNo}</div>
          </div>
        </div>
        <div class="doc-meta">
          <div><span>เลขที่ใบเสร็จ:</span> <strong>${finalReceiptNo}</strong></div>
          <div><span>วันที่รับชำระ:</span> <strong>${formatDateTime(payment?.paid_at)}</strong></div>
          <div><span>วันที่อนุมัติ:</span> <strong>${issueDate}</strong></div>
          <div class="copy-mark-row"><div class="copy-mark">${copyLabel}</div></div>
        </div>
      </div>

      <section class="box">
        <div class="grid">
          <div><span>บ้านเลขที่</span><strong>${houseNo}</strong></div>
          <div><span>ชื่อเจ้าของบ้าน</span><strong>${ownerName}</strong></div>
          <div><span>รอบใบแจ้งหนี้</span><strong>${invoiceLabel}</strong></div>
          <div><span>วิธีชำระ</span><strong>${formatMethod(payment?.payment_method)}</strong></div>
        </div>
      </section>

      <section class="box">
        <table>
          <thead>
            <tr>
              <th class="c" style="width:56px;">ลำดับ</th>
              <th>รายการ</th>
              <th class="r" style="width:170px;">ยอดที่ต้องชำระ (บาท)</th>
              <th class="r" style="width:170px;">ยอดชำระจริง (บาท)</th>
            </tr>
          </thead>
          <tbody>
            ${renderTableRows()}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="r"><strong>ยอดรวมที่ต้องชำระ</strong></td>
              <td class="r"><strong>${formatMoney(totalDue)}</strong></td>
              <td class="r"><strong>${formatMoney(totalPaid)}</strong></td>
            </tr>
            <tr>
              <td colspan="3" class="r"><strong>ยอดคงค้างหลังชำระ</strong></td>
              <td class="r"><strong>${formatMoney(totalOutstanding)}</strong></td>
            </tr>
          </tfoot>
        </table>
        <div class="note-box">ยอดชำระรวม ${formatMoney(totalPaid)} บาท (${toThaiBahtText(totalPaid)})</div>
        ${displayNote ? `<div class="note-box">${displayNote}</div>` : ''}
      </section>

      <section class="foot">
        <div class="note">
          ออกใบเสร็จหลังจากตรวจสอบการชำระเรียบร้อยแล้ว<br />
          บัญชีอ้างอิง ${getSetupValue(setup, 'bank_account_name', 'bankAccountName', '-')} ${getSetupValue(setup, 'bank_account_no', 'bankAccountNo', '')}
        </div>
        <div class="sign-wrap">
          ${signatureUrl ? `<img src="${signatureUrl}" alt="juristic-signature" class="sign-img" />` : ''}
          <div class="sign-line"></div>
          <div>ผู้ตรวจสอบ / ผู้ออกใบเสร็จ</div>
        </div>
      </section>
    </div>
  `)

  return `
    <html>
      <head>
        <title>ใบเสร็จรับเงิน ${finalReceiptNo}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          html, body { font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; margin: 0; padding: 0; color: #111827; background: #fff; }
          .sheet {
            position: relative;
            width: ${forCapture ? '794px' : '100%'};
            ${forCapture ? 'height: 1122px; overflow: hidden;' : 'page-break-after: always; break-after: page; break-inside: avoid;'}
            background: #fff;
            padding: 24px 28px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .page-break {}
          .head {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 12px;
            background: #ffffff;
          }
          .brand { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
          .brand img {
            width: 48px;
            height: 48px;
            border-radius: 6px;
            object-fit: cover;
            border: 1px solid #cbd5e1;
          }
          .doc { font-size: 16px; font-weight: 700; line-height: 1.3; }
          .village { font-size: 11px; margin-top: 3px; font-weight: 600; }
          .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
          .doc-meta { font-size: 10px; min-width: 200px; display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
          .doc-meta span { color: #6b7280; font-weight: 500; }
          .copy-mark-row {
            display: flex;
            justify-content: flex-end;
            margin-top: 10px;
          }
          .copy-mark {
            border: none;
            border-radius: 4px;
            padding: 3px 10px;
            text-align: center;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.3;
            color: #0c4a6e;
            background: transparent;
          }
          .box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
          .grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
          .grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
          .grid strong { font-size: 11px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; table-layout: auto; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; }
          th { background: #f1f5f9; text-align: left; font-weight: 600; }
          .c { text-align: center; }
          .r { text-align: right; }
          tfoot td { background: #f8fafc; font-weight: 700; }
          .note-box {
            border-top: 1px dashed #d1d5db;
            padding-top: 4px;
            font-size: 10px;
            color: #4b5563;
            margin-top: 4px;
          }
          .foot {
            margin-top: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 12px;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 12px;
            background: #f9fafb;
          }
          .note { font-size: 9px; color: #64748b; line-height: 1.4; }
          .sign-wrap { min-width: 180px; text-align: center; font-size: 9px; color: #64748b; }
          .sign-img { max-width: 160px; max-height: 52px; width: auto; height: auto; display: block; margin: 0 auto 6px; object-fit: contain; }
          .sign-line { border-top: 1px solid #cbd5e1; margin: 36px 0 4px; }
          @media print {
            html, body { background: #fff; }
            .sheet { page-break-after: always; break-after: page; break-inside: avoid; }
            .sheet:last-child { page-break-after: avoid; break-after: avoid; }
          }
        </style>
      </head>
      <body>
        ${renderSheet('ต้นฉบับ')}
        ${renderSheet('สำเนา')}
        ${autoPrint ? '<script>window.onload = () => window.print();</script>' : ''}
      </body>
    </html>
  `
}
