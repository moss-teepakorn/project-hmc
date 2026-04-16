// ฟังก์ชันดึงโลโก้จาก system-assets เหมือนหน้า Login
export async function getLogoUrl() {
  // สมมติว่าโลโก้ถูกเก็บไว้ที่ public/system-assets/logo.png
  return '/system-assets/logo.png';
}
