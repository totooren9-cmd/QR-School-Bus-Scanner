import * as XLSX from 'xlsx';
import { Student, ScanRecord } from '../types';

/**
 * Sample template rows for student import
 */
const TEMPLATE_SAMPLE_ROWS = [
  {
    'รหัส QR (ID)': '10001',
    'ชื่อ-นามสกุล': 'นายธนภัทร รัตนเวช',
    'ชื่อเล่น': 'ภัทร',
    'แผนก': 'ฝ่ายผลิต',
    'รหัสพนักงาน': '101',
    'หอพัก': 'หอ A',
    'สายรถ': 'CAR01',
    'จุดขึ้นรถ': 'จุดรับส่งหน้าหอ A',
    'เบอร์โทรศัพท์': '081-234-5678',
    'สถานะ': 'ปกติ',
  },
  {
    'รหัส QR (ID)': '10002',
    'ชื่อ-นามสกุล': 'นางสาวกัญญาณัฐ วงศ์วิจิตร',
    'ชื่อเล่น': 'ปลาย',
    'แผนก': 'บัญชี',
    'รหัสพนักงาน': '102',
    'หอพัก': 'หอ B',
    'สายรถ': 'CAR02',
    'จุดขึ้นรถ': 'จุดรับส่งโซน B',
    'เบอร์โทรศัพท์': '089-876-5432',
    'สถานะ': 'ปกติ',
  },
  {
    'รหัส QR (ID)': '10003',
    'ชื่อ-นามสกุล': 'นายชินดนัย เมธากุล',
    'ชื่อเล่น': 'ชิน',
    'แผนก': 'คลังสินค้า',
    'รหัสพนักงาน': '105',
    'หอพัก': 'หอ C',
    'สายรถ': 'CAR03',
    'จุดขึ้นรถ': 'อาคาร 4 โดมกีฬา',
    'เบอร์โทรศัพท์': '086-555-1234',
    'สถานะ': 'ปกติ',
  },
  {
    'รหัส QR (ID)': '10004',
    'ชื่อ-นามสกุล': 'นางสาววรินทร จินดารัตน์',
    'ชื่อเล่น': 'มิ้นท์',
    'แผนก': 'ฝ่ายบุคคล',
    'รหัสพนักงาน': '110',
    'หอพัก': 'หอ A',
    'สายรถ': 'CAR01',
    'จุดขึ้นรถ': 'ศาลาหน้าหอพัก A',
    'เบอร์โทรศัพท์': '084-333-9876',
    'สถานะ': 'ปกติ',
  },
  {
    'รหัส QR (ID)': '10005',
    'ชื่อ-นามสกุล': 'นายณภัทร ปัญญาวงศ์',
    'ชื่อเล่น': 'เจแปน',
    'แผนก': 'ไอที',
    'รหัสพนักงาน': '114',
    'หอพัก': 'หอ B',
    'สายรถ': 'CAR02',
    'จุดขึ้นรถ': 'จุดรวมพลหน้าอาคาร',
    'เบอร์โทรศัพท์': '082-999-4455',
    'สถานะ': 'ปกติ',
  },
];

const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-purple-500',
  'bg-sky-500',
];

/**
 * Export sample template for employee import
 */
export function exportStudentTemplateXLSX(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS);

  // Set column widths
  ws['!cols'] = [
    { wch: 16 }, // รหัส QR (ID)
    { wch: 28 }, // ชื่อ-นามสกุล
    { wch: 12 }, // ชื่อเล่น
    { wch: 16 }, // แผนก
    { wch: 14 }, // รหัสพนักงาน
    { wch: 12 }, // หอพัก
    { wch: 12 }, // สายรถ
    { wch: 24 }, // จุดขึ้นรถ
    { wch: 16 }, // เบอร์โทรศัพท์
    { wch: 10 }, // สถานะ
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'แม่แบบพนักงาน');
  XLSX.writeFile(wb, 'employee_import_template.xlsx');
}

/**
 * Export sample template as CSV
 */
export function exportStudentTemplateCSV(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'employee_import_template.csv');
}

/**
 * Export current employees list to Excel file
 */
export function exportStudentsToXLSX(students: Student[], filename = 'employees_export.xlsx'): void {
  const rows = students.map((s, index) => ({
    'ลำดับ': index + 1,
    'รหัส QR (ID)': s.studentCode || s.id,
    'ชื่อ-นามสกุล': s.name,
    'ชื่อเล่น': s.nickname || '',
    'แผนก': s.grade || s.className || '',
    'รหัสพนักงาน': s.seat_number ?? s.seatNumber ?? s.number ?? '',
    'หอพัก': s.dorm || '',
    'สายรถ': s.busNumber || s.carID || '',
    'จุดขึ้นรถ': s.pickup || s.busStopName || s.dormOrStop || '',
    'เบอร์โทรศัพท์': s.parentPhone || s.parent_phone || '',
    'สถานะ': s.status || 'ปกติ',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
    { wch: 16 },
    { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อพนักงาน');
  XLSX.writeFile(wb, filename);
}

/**
 * Export filtered scan report to Excel (.xlsx) file
 */
export function exportScansToXLSX(scans: ScanRecord[], filename = 'scan_report.xlsx'): void {
  const rows = scans.map((s, idx) => ({
    'ลำดับ': idx + 1,
    'วันที่': s.dateThai || '',
    'เวลา': s.timeThai || '',
    'รหัสพนักงาน': s.studentCode || '',
    'ชื่อ-นามสกุล': s.name || '',
    'แผนก': s.grade || '',
    'สายรถ': s.busNumber || s.carID || '',
    'สถานะ': s.scanType || 'ขึ้นรถ',
    'จุดสแกน': s.locationName || s.dorm || '',
    'ละติจูด': s.latitude ?? '',
    'ลองจิจูด': s.longitude ?? '',
    'ผู้บันทึก': s.scannerName || 'เจ้าหน้าที่',
    'อุปกรณ์': s.device || 'MOBILE01',
    'หมายเหตุ': s.note || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'รายงานการสแกน');
  XLSX.writeFile(wb, filename);
}

/**
 * Helper to normalize string for flexible header matching
 */
function cleanKey(key: string): string {
  return String(key || '').toLowerCase().replace(/[\s\-_()\[\]*]/g, '');
}

/**
 * Parse an Excel or CSV file buffer into Student objects
 */
export async function parseStudentExcelFile(
  file: File
): Promise<{ students: Student[]; errors: string[]; rawCount: number }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('ไม่พบข้อมูล Sheet ในไฟล์ Excel');
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const students: Student[] = [];
  const errors: string[] = [];

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // account for header row

    // Find columns flexibly
    let studentCode = '';
    let name = '';
    let nickname = '';
    let grade = '';
    let room = '';
    let number = '';
    let dorm = '';
    let busNumber = '';
    let pickup = '';
    let parentPhone = '';
    let status = 'ปกติ';

    for (const [key, val] of Object.entries(row)) {
      const k = cleanKey(key);
      const strVal = String(val ?? '').trim();
      if (!strVal) continue;

      if (
        k.includes('รหัสพนักงาน') ||
        k.includes('empid') ||
        k.includes('employeecode') ||
        k.includes('เลขที่') ||
        k.includes('number') ||
        k === 'no'
      ) {
        number = strVal;
      } else if (
        k.includes('รหัส') ||
        k.includes('studentcode') ||
        k.includes('stdcode') ||
        k.includes('qrcode') ||
        k === 'code' ||
        k === 'id'
      ) {
        studentCode = strVal;
      } else if (
        k.includes('ชื่อนามสกุล') ||
        k.includes('ชื่อสกุล') ||
        k.includes('fullname') ||
        k.includes('studentname') ||
        k.includes('employeename') ||
        k === 'ชื่อ' ||
        k === 'name'
      ) {
        name = strVal;
      } else if (k.includes('ชื่อเล่น') || k.includes('nickname') || k === 'nick') {
        nickname = strVal;
      } else if (
        k.includes('แผนก') ||
        k.includes('ฝ่าย') ||
        k.includes('department') ||
        k.includes('dept') ||
        k.includes('ระดับชั้น') ||
        k.includes('ชั้น') ||
        k.includes('grade') ||
        k.includes('level')
      ) {
        grade = strVal;
      } else if (k.includes('ห้อง') || k.includes('room') || k.includes('classroom')) {
        room = strVal;
      } else if (k.includes('หอพัก') || k.includes('หอ') || k.includes('dorm')) {
        dorm = strVal;
      } else if (
        k.includes('สายรถ') ||
        k.includes('รถบัส') ||
        k.includes('รถ') ||
        k.includes('bus') ||
        k.includes('carid') ||
        k.includes('busnumber')
      ) {
        busNumber = strVal;
      } else if (
        k.includes('จุดขึ้นรถ') ||
        k.includes('จุดรับส่ง') ||
        k.includes('จุดขึ้น') ||
        k.includes('สถานที่') ||
        k.includes('pickup') ||
        k.includes('stop')
      ) {
        pickup = strVal;
      } else if (
        k.includes('เบอร์') ||
        k.includes('โทร') ||
        k.includes('phone') ||
        k.includes('tel') ||
        k.includes('mobile')
      ) {
        parentPhone = strVal;
      } else if (k.includes('สถานะ') || k.includes('status')) {
        status = strVal;
      }
    }

    // Fallback: if sheet only provided รหัสพนักงาน and not รหัส QR
    if (!studentCode && number) {
      studentCode = number;
    }

    // Validation
    if (!name && !studentCode) {
      // Empty row, skip silently
      return;
    }

    if (!name) {
      errors.push(`แถวที่ ${rowNum}: ไม่มีข้อมูลชื่อ-นามสกุล (ข้ามแถวนี้)`);
      return;
    }

    if (!studentCode) {
      // Auto-generate code if missing
      studentCode = `AUTO${Date.now().toString().slice(-4)}${idx}`;
    }

    const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const normalizedCar = busNumber.toUpperCase().startsWith('CAR')
      ? busNumber.toUpperCase()
      : busNumber || 'CAR01';

    const resolvedDept = grade || 'แผนกทั่วไป';
    const fullClassName = room ? `${resolvedDept}/${room}` : resolvedDept;

    const student: Student = {
      id: studentCode,
      studentCode,
      name,
      nickname,
      grade: resolvedDept,
      room,
      classroom: fullClassName,
      className: fullClassName,
      number,
      dorm: dorm || 'หอ A',
      carID: normalizedCar,
      busNumber: normalizedCar,
      dormOrStop: pickup || 'จุดรับส่งพนักงาน',
      busStopName: pickup || 'จุดรับส่งพนักงาน',
      pickup: pickup || 'จุดรับส่งพนักงาน',
      parentPhone: parentPhone || '-',
      status: status || 'ปกติ',
      avatarColor: color,
      avatar: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`,
      avatarUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`,
    };

    students.push(student);
  });

  return {
    students,
    errors,
    rawCount: rawRows.length,
  };
}
