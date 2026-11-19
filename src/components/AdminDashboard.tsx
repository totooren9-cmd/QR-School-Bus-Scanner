import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  UserPlus,
  Bus,
  Trash2,
  Edit,
  QrCode,
  Search,
  Filter,
  RefreshCw,
  Plus,
  CheckCircle2,
  X,
  Phone,
  User,
  MapPin,
  Calendar,
  FileSpreadsheet,
  Layers,
  Database,
  Shield,
  Clock,
  Car as CarIcon,
  AlertTriangle,
  Download,
  Upload,
  Printer,
} from 'lucide-react';
import type { User as FirebaseAuthUser } from 'firebase/auth';
import { Student, ScanRecord, Car, AdminTab, AppUser, SystemSetting } from '../types';
import { GoogleSheetsPanel } from './GoogleSheetsPanel';
import { FirebasePanel } from './FirebasePanel';
import { isFirebaseReady } from '../services/firebaseClient';
import { StudentExcelModal } from './StudentExcelModal';
import { BusRouteMap } from './BusRouteMap';
import { QRPrintPage } from './QRPrintPage';
import { exportStudentTemplateXLSX, exportStudentsToXLSX, exportScansToXLSX } from '../utils/excelStudents';

interface AdminDashboardProps {
  students: Student[];
  cars?: Car[];
  scans: ScanRecord[];
  users?: AppUser[];
  settings?: SystemSetting[];
  firebaseUser?: FirebaseAuthUser | null;
  onAddStudent: (student: Student) => Promise<boolean | void> | void;
  onEditStudent?: (student: Student) => Promise<boolean | void> | void;
  onDeleteStudent: (id: string) => Promise<boolean | void> | void;
  onImportStudents?: (students: Student[]) => Promise<boolean | void> | void;
  onAddCar?: (car: Car) => Promise<boolean | void> | void;
  onEditCar?: (car: Car) => Promise<boolean | void> | void;
  onDeleteCar?: (carId: string) => Promise<boolean | void> | void;
  onDeleteScan?: (scanId: string) => Promise<boolean | void> | void;
  onClearAllScans?: () => Promise<boolean | void> | void;
  onUpsertUser?: (user: AppUser) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  onUpsertSetting?: (setting: SystemSetting) => Promise<void>;
  onDeleteSetting?: (key: string) => Promise<void>;
  onCloseAdmin: () => void;
  appsScriptUrl: string;
  onUpdateAppsScriptUrl: (url: string) => void;
  connectedSheetId: string;
  onUpdateConnectedSheetId: (id: string, url: string, title?: string) => void;
  connectedSheetTitle: string;
  connectedSheetUrl: string;
  autoSyncEnabled: boolean;
  onToggleAutoSync: () => void;
  onSyncFromGoogleSheets?: () => Promise<void>;
  isSyncingSheets?: boolean;
  onSyncFromFirebase?: () => Promise<void>;
  isSyncingFirebase?: boolean;
  onClearMockStudents?: () => void;
  onOpenFirebaseAuth?: () => void;
  initialTab?: AdminTab;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  students,
  cars = [],
  scans,
  users = [],
  settings = [],
  firebaseUser = null,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onAddCar,
  onEditCar,
  onDeleteCar,
  onDeleteScan,
  onClearAllScans,
  onUpsertUser,
  onDeleteUser,
  onUpsertSetting,
  onDeleteSetting,
  onCloseAdmin,
  appsScriptUrl,
  onUpdateAppsScriptUrl,
  connectedSheetId,
  onUpdateConnectedSheetId,
  connectedSheetTitle,
  connectedSheetUrl,
  autoSyncEnabled,
  onToggleAutoSync,
  onSyncFromGoogleSheets,
  isSyncingSheets = false,
  onSyncFromFirebase,
  isSyncingFirebase = false,
  onClearMockStudents,
  onImportStudents,
  onOpenFirebaseAuth,
  initialTab = 'dashboard',
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab || 'dashboard');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Excel Modal State
  const [showExcelModal, setShowExcelModal] = useState(false);

  // Student Filter state
  const [stuSearch, setStuSearch] = useState('');
  const [stuCar, setStuCar] = useState('');
  const [stuGrade, setStuGrade] = useState('');
  const [stuDorm, setStuDorm] = useState('');

  // Student Modals
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Student Form Fields (Directly matching public.students columns)
  const [formStudentCode, setFormStudentCode] = useState('');
  const [formStudentName, setFormStudentName] = useState('');
  const [formStudentNickname, setFormStudentNickname] = useState('');
  const [formStudentGrade, setFormStudentGrade] = useState('');
  const [formStudentRoom, setFormStudentRoom] = useState('');
  const [formStudentNumber, setFormStudentNumber] = useState('');
  const [formStudentDorm, setFormStudentDorm] = useState('หอ A');
  const [formStudentCar, setFormStudentCar] = useState('CAR01');
  const [formStudentStop, setFormStudentStop] = useState('');
  const [formStudentLat, setFormStudentLat] = useState('');
  const [formStudentLng, setFormStudentLng] = useState('');
  const [formStudentMapLink, setFormStudentMapLink] = useState('');
  const [formStudentParent, setFormStudentParent] = useState('');
  const [formStudentPhone, setFormStudentPhone] = useState('');
  const [formStudentStatus, setFormStudentStatus] = useState('ใช้งาน');

  // Car Modals
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);

  // Car Form Fields
  const [formCarId, setFormCarId] = useState('');
  const [formCarPlate, setFormCarPlate] = useState('');
  const [formCarName, setFormCarName] = useState('');
  const [formCarRoute, setFormCarRoute] = useState('');
  const [formCarDriver, setFormCarDriver] = useState('');
  const [formCarDriverPhone, setFormCarDriverPhone] = useState('');
  const [formCarAttendant, setFormCarAttendant] = useState('');
  const [formCarCapacity, setFormCarCapacity] = useState('60');
  const [formCarStatus, setFormCarStatus] = useState('ใช้งาน');

  // QR Code Tab state
  const [qrPrintPreselectedId, setQrPrintPreselectedId] = useState<string | null>(null);
  const [selectedStudentForQR, setSelectedStudentForQR] = useState<Student | null>(null);
  const [singleQrUrl, setSingleQrUrl] = useState<string>('');

  // Reports Tab state
  const [reportMode, setReportMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportDate, setReportDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reportCar, setReportCar] = useState('');
  const [reportScanType, setReportScanType] = useState<'all' | 'ขึ้นรถ' | 'ลงรถ'>('all');
  const [reportSearch, setReportSearch] = useState('');

  // Confirm delete dialog state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: 'student' | 'car' | 'scan' | 'clear_scans' | 'clear_cache';
    id?: string;
    name?: string;
  } | null>(null);

  const firebaseConnected = isFirebaseReady() || Boolean(firebaseUser && firebaseUser.emailVerified);

  // Reset Student Form
  const resetStudentForm = () => {
    setFormStudentCode('');
    setFormStudentName('');
    setFormStudentNickname('');
    setFormStudentGrade('');
    setFormStudentRoom('');
    setFormStudentNumber('');
    setFormStudentDorm('หอ A');
    setFormStudentCar(cars[0]?.carID || 'CAR01');
    setFormStudentStop('');
    setFormStudentLat('');
    setFormStudentLng('');
    setFormStudentMapLink('');
    setFormStudentParent('');
    setFormStudentPhone('');
    setFormStudentStatus('ใช้งาน');
    setIsAddingStudent(false);
    setEditingStudent(null);
  };

  // Open Edit Student
  const handleStartEditStudent = (st: Student) => {
    setEditingStudent(st);
    setFormStudentCode(st.studentCode || st.studentId || st.student_id || st.id);
    setFormStudentName(st.name);
    setFormStudentNickname(st.nickname || '');
    setFormStudentGrade(st.grade || st.className || '');
    setFormStudentRoom('');
    setFormStudentNumber(st.seat_number != null ? String(st.seat_number) : (st.seatNumber != null ? String(st.seatNumber) : (st.number ? String(st.number) : '')));
    setFormStudentDorm(st.dorm || 'หอ A');
    setFormStudentCar(st.car_id || st.carID || st.busNumber || 'CAR01');
    setFormStudentStop(st.pickup_point || st.pickupPoint || st.pickup || st.busStopName || st.dormOrStop || '');
    setFormStudentLat(st.latitude != null ? String(st.latitude) : '');
    setFormStudentLng(st.longitude != null ? String(st.longitude) : '');
    setFormStudentMapLink(st.map_link || st.mapLink || '');
    setFormStudentParent('');
    setFormStudentPhone(st.parent_phone || st.parentPhone || '');
    setFormStudentStatus(st.status || 'ใช้งาน');
  };

  // Save Student (Add / Edit) - Maps 100% to Firestore students collection
  const handleSubmitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentCode.trim() || !formStudentName.trim()) return;

    const studentCode = formStudentCode.trim();
    const dept = formStudentGrade.trim() || 'แผนกทั่วไป';
    const studentData: Student = {
      id: studentCode,
      studentId: studentCode,
      student_id: studentCode,
      studentCode: studentCode,
      qrCode: studentCode,
      qr_code: studentCode,
      name: formStudentName.trim(),
      nickname: formStudentNickname.trim() || undefined,
      grade: dept,
      room: '',
      className: dept,
      classroom: dept,
      number: formStudentNumber ? Number(formStudentNumber) : undefined,
      seatNumber: formStudentNumber ? Number(formStudentNumber) : undefined,
      seat_number: formStudentNumber ? Number(formStudentNumber) : undefined,
      dorm: formStudentDorm,
      carID: formStudentCar,
      car_id: formStudentCar,
      busNumber: formStudentCar,
      dormOrStop: formStudentStop || formStudentDorm,
      busStopName: formStudentStop || formStudentDorm,
      pickup: formStudentStop || undefined,
      pickupPoint: formStudentStop || undefined,
      pickup_point: formStudentStop || undefined,
      latitude: formStudentLat ? Number(formStudentLat) : undefined,
      longitude: formStudentLng ? Number(formStudentLng) : undefined,
      mapLink: formStudentMapLink.trim() || undefined,
      map_link: formStudentMapLink.trim() || undefined,
      parent: undefined,
      parentName: undefined,
      parent_name: undefined,
      parentPhone: formStudentPhone.trim() || '081-000-0000',
      parent_phone: formStudentPhone.trim() || '081-000-0000',
      status: formStudentStatus,
      avatarColor: formStudentDorm.includes('B')
        ? 'bg-blue-500'
        : formStudentDorm.includes('C')
        ? 'bg-amber-500'
        : formStudentDorm.includes('D')
        ? 'bg-emerald-500'
        : 'bg-indigo-500',
      qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`,
      qr_image: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`,
    };

    if (editingStudent) {
      if (onEditStudent) {
        await onEditStudent(studentData);
      }
    } else {
      await onAddStudent(studentData);
    }

    resetStudentForm();
  };

  // Reset Car Form
  const resetCarForm = () => {
    setFormCarId('');
    setFormCarPlate('');
    setFormCarName('');
    setFormCarRoute('');
    setFormCarDriver('');
    setFormCarDriverPhone('');
    setFormCarAttendant('');
    setFormCarCapacity('60');
    setFormCarStatus('ใช้งาน');
    setIsAddingCar(false);
    setEditingCar(null);
  };

  // Open Edit Car
  const handleStartEditCar = (car: Car) => {
    setEditingCar(car);
    setFormCarId(car.carID);
    setFormCarPlate(car.plate);
    setFormCarName(car.name);
    setFormCarRoute(car.route || '');
    setFormCarDriver(car.driver || '');
    setFormCarDriverPhone(car.driverPhone || '');
    setFormCarAttendant(car.attendant || '');
    setFormCarCapacity(String(car.capacity || 60));
    setFormCarStatus(car.status || 'ใช้งาน');
  };

  // Save Car (Add / Edit)
  const handleSubmitCar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCarId.trim() || !formCarPlate.trim() || !formCarName.trim()) return;

    const carData: Car = {
      carID: formCarId.trim(),
      plate: formCarPlate.trim(),
      name: formCarName.trim(),
      route: formCarRoute.trim() || 'เส้นทางทั่วไป',
      driver: formCarDriver.trim() || 'พนักงานขับรถ',
      driverPhone: formCarDriverPhone.trim() || '081-000-0000',
      attendant: formCarAttendant.trim() || 'เจ้าหน้าที่ประจำรถ',
      capacity: Number(formCarCapacity) || 60,
      status: formCarStatus,
    };

    if (editingCar) {
      if (onEditCar) {
        await onEditCar(carData);
      }
    } else {
      if (onAddCar) {
        await onAddCar(carData);
      }
    }

    resetCarForm();
  };

  // Handle Confirmed Delete
  const handleExecuteDelete = async () => {
    if (!deleteConfirmItem) return;

    if (deleteConfirmItem.type === 'student' && deleteConfirmItem.id) {
      await onDeleteStudent(deleteConfirmItem.id);
    } else if (deleteConfirmItem.type === 'car' && deleteConfirmItem.id && onDeleteCar) {
      await onDeleteCar(deleteConfirmItem.id);
    } else if (deleteConfirmItem.type === 'scan' && deleteConfirmItem.id && onDeleteScan) {
      await onDeleteScan(deleteConfirmItem.id);
    } else if (deleteConfirmItem.type === 'clear_scans' && onClearAllScans) {
      await onClearAllScans();
    } else if (deleteConfirmItem.type === 'clear_cache' && onClearMockStudents) {
      onClearMockStudents();
    }

    setDeleteConfirmItem(null);
  };

  // Generate single QR when modal or selection changes
  useEffect(() => {
    if (selectedStudentForQR) {
      const payload = JSON.stringify({
        code: selectedStudentForQR.studentCode,
        name: selectedStudentForQR.name,
        grade: selectedStudentForQR.className || selectedStudentForQR.grade,
        bus: selectedStudentForQR.busNumber || selectedStudentForQR.carID,
      });
      QRCode.toDataURL(payload, { width: 260, margin: 2 }).then(setSingleQrUrl);
    }
  }, [selectedStudentForQR]);

  // Helper: Date Matching for Reports
  const isScanDateMatching = (scan: ScanRecord, targetDateYMD: string): boolean => {
    if (!targetDateYMD) return true;

    // 1. Check timestamp
    if (scan.timestamp) {
      const d = new Date(scan.timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (`${y}-${m}-${day}` === targetDateYMD) return true;
    }

    // 2. Exact match in dateThai
    if (scan.dateThai && scan.dateThai.includes(targetDateYMD)) return true;

    // 3. Thai date matching (e.g. "18 ก.ย. 2569")
    if (scan.dateThai) {
      const parts = targetDateYMD.split('-');
      if (parts.length === 3) {
        const [yearStr, monthStr, dayStr] = parts;
        const thaiYear = String(Number(yearStr) + 543);
        const thaiMonths = [
          'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
          'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
        ];
        const thaiMonth = thaiMonths[Number(monthStr) - 1];
        const dayNum = String(Number(dayStr));

        if (thaiMonth && scan.dateThai.includes(thaiMonth) && scan.dateThai.includes(thaiYear)) {
          const matchPattern = new RegExp(`(^|\\s)0?${dayNum}(\\s|$)`);
          if (
            matchPattern.test(scan.dateThai) ||
            scan.dateThai.startsWith(`${dayNum} `) ||
            scan.dateThai.startsWith(`${dayStr} `)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // Helper: Car Matching for Reports (ตาม รถแต่ละสาย)
  const isScanCarMatching = (scan: ScanRecord, targetCar: string): boolean => {
    if (!targetCar) return true;
    const target = targetCar.toLowerCase().trim();
    const scanCarId = (scan.carID || '').toLowerCase().trim();
    const scanBusNum = (scan.busNumber || '').toLowerCase().trim();

    if (scanCarId === target || scanBusNum === target) return true;

    const matchedCar = cars.find((c) => c.carID.toLowerCase() === target || c.name.toLowerCase() === target);
    if (matchedCar) {
      const carId = matchedCar.carID.toLowerCase();
      const carName = matchedCar.name.toLowerCase();
      const carPlate = (matchedCar.plate || matchedCar.plateNumber || '').toLowerCase();
      if (
        scanCarId === carId ||
        scanBusNum === carId ||
        scanBusNum.includes(carName) ||
        (carPlate && scanBusNum.includes(carPlate))
      ) {
        return true;
      }
    }

    return scanCarId.includes(target) || scanBusNum.includes(target);
  };

  // Filtered Scans for Reports tab (กรองตามวันที่, รถแต่ละสาย, ประเภทสแกน, ค้นหา)
  const filteredScans = scans.filter((s) => {
    if (!isScanDateMatching(s, reportDate)) return false;
    if (!isScanCarMatching(s, reportCar)) return false;
    if (reportScanType !== 'all') {
      const type = s.scanType || 'ขึ้นรถ';
      if (type !== reportScanType) return false;
    }
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase().trim();
      const match =
        s.name.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        s.locationName.toLowerCase().includes(q) ||
        (s.dorm && s.dorm.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Export Filtered Scans to XLSX (Excel)
  const handleExportXLSX = () => {
    const dateLabel = reportDate || 'ทุกวัน';
    const carLabel = reportCar || 'ทุกสายรถ';
    exportScansToXLSX(filteredScans, `รายงานสแกน_${dateLabel}_${carLabel}.xlsx`);
  };

  // Export Filtered Scans to CSV (UTF-8 BOM)
  const handleExportCSV = () => {
    const headers = [
      'ลำดับ',
      'ScanID',
      'รหัสพนักงาน',
      'ชื่อ-นามสกุล',
      'แผนก',
      'รหัสรถ',
      'สายรถ',
      'จุดสแกน',
      'ละติจูด',
      'ลองจิจูด',
      'วันที่',
      'เวลา',
      'ประเภทสแกน',
      'สถานะ',
      'ผู้บันทึก',
    ];

    const rows = filteredScans.map((s, idx) => [
      idx + 1,
      s.scanId || s.id,
      s.studentCode,
      `"${s.name}"`,
      s.grade || '',
      s.carID || '',
      `"${s.busNumber}"`,
      `"${s.locationName || s.dorm || ''}"`,
      s.latitude ?? '',
      s.longitude ?? '',
      `"${s.dateThai || ''}"`,
      `"${s.timeThai || ''}"`,
      s.scanType || 'ขึ้นรถ',
      'สำเร็จ',
      `"${s.scannerName || 'เจ้าหน้าที่'}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateLabel = reportDate || 'ทุกวัน';
    link.setAttribute('download', `รายงานสแกน_${dateLabel}_${reportCar || 'ทุกสายรถ'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered students for Students tab
  const filteredStudents = students.filter((s) => {
    const matchSearch =
      !stuSearch.trim() ||
      s.name.toLowerCase().includes(stuSearch.toLowerCase()) ||
      s.studentCode.toLowerCase().includes(stuSearch.toLowerCase()) ||
      (s.nickname && s.nickname.toLowerCase().includes(stuSearch.toLowerCase())) ||
      s.grade.toLowerCase().includes(stuSearch.toLowerCase()) ||
      (s.className && s.className.toLowerCase().includes(stuSearch.toLowerCase())) ||
      (s.seat_number != null && String(s.seat_number).includes(stuSearch.trim()));

    const matchCar = !stuCar || s.busNumber === stuCar || s.carID === stuCar;
    const matchGrade = !stuGrade || s.grade === stuGrade || s.className?.startsWith(stuGrade);
    const matchDorm = !stuDorm || s.dorm === stuDorm;

    return matchSearch && matchCar && matchGrade && matchDorm;
  });

  // Calculate unique buses & dorms
  const allBuses = Array.from(
    new Set([...cars.map((c) => c.carID), ...students.map((s) => s.busNumber || s.carID || 'CAR01')])
  ).filter(Boolean);

  const allDorms = Array.from(
    new Set(students.map((s) => s.dorm).filter(Boolean))
  ) as string[];

  // Bus stats
  const busStats = allBuses.map((bus) => {
    const busStudents = students.filter((s) => s.busNumber === bus || s.carID === bus);
    const busScans = scans.filter((s) => s.busNumber === bus || s.carID === bus);
    return {
      bus,
      total: busStudents.length,
      scanned: busScans.length,
      percent: busStudents.length > 0 ? Math.round((busScans.length / busStudents.length) * 100) : 0,
    };
  });

  return (
    <section id="screen-admin" className="screen admin-screen active fixed inset-0 z-50 flex flex-col overflow-hidden select-none bg-slate-950 text-slate-100">
      {/* Topbar */}
      <div className="admin-topbar bg-slate-900/90 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button
          className="icon-circle w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
          type="button"
          onClick={onCloseAdmin}
          title="กลับหน้าสแกน"
        >
          ←
        </button>
        <div className="admin-title text-center">
          <div className="flex items-center justify-center gap-2">
            <strong className="text-sm font-bold text-white">ระบบจัดการหลังบ้าน</strong>
            {firebaseConnected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Firebase 100%
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                รอเข้าสู่ระบบ Google
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">แอดมินระบบเช็คอินรถรับส่ง</span>
        </div>
        <button
          className="icon-circle w-9 h-9 rounded-full bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 flex items-center justify-center transition-colors"
          type="button"
          onClick={onCloseAdmin}
          title="ปิดหน้าต่าง"
        >
          ✕
        </button>
      </div>

      {/* Cloud & Realtime Action Bar */}
      <div className="bg-slate-900 border-b border-white/5 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300">ฐานข้อมูล:</span>
            <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              พนักงาน ({students.length}) • รถ ({cars.length}) • สแกน ({scans.length})
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('firebase')}
            className="text-[11px] px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors flex items-center gap-1 font-semibold"
          >
            <span>🔥 Firebase Firestore (CRUD 100%)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onSyncFromFirebase && (
            <button
              type="button"
              onClick={() => onSyncFromFirebase()}
              disabled={isSyncingFirebase}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs shadow transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
              <span>{isSyncingFirebase ? 'กำลังซิงค์...' : 'ดึงสดจาก Firebase'}</span>
            </button>
          )}

          {onSyncFromGoogleSheets && (
            <button
              type="button"
              onClick={() => onSyncFromGoogleSheets()}
              disabled={isSyncingSheets}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs shadow transition-all active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>{isSyncingSheets ? 'กำลังดึง...' : 'ซิงค์ Sheets'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Sign-In Notice inside Admin when Firebase Auth is not connected */}
      {!firebaseConnected && (
        <div className="bg-amber-950/70 border-b border-amber-500/30 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              ยังไม่ได้เชื่อมต่อบัญชี Google — ข้อมูลรถและพนักงานที่เพิ่มจะเก็บคิวรอซิงค์ในเครื่องไว้ให้ชั่วคราว
            </span>
          </div>
          {onOpenFirebaseAuth && (
            <button
              type="button"
              onClick={onOpenFirebaseAuth}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 transition-colors"
            >
              เข้าสู่ระบบ Google เพื่อซิงค์ถาวร
            </button>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="admin-tabs flex overflow-x-auto bg-slate-900/80 border-b border-white/5 p-1 gap-1" id="adminTabs">
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('dashboard')}
        >
          📊 แดชบอร์ด
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'routes' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('routes')}
        >
          <MapPin className="w-3.5 h-3.5 text-amber-400" />
          <span>แผนที่เส้นทาง</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'students' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('students')}
        >
          <User className="w-3.5 h-3.5" />
          <span>พนักงาน ({students.length})</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'cars' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('cars')}
        >
          <Bus className="w-3.5 h-3.5" />
          <span>รถรับส่ง ({cars.length})</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'qrcode' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('qrcode')}
        >
          <Printer className="w-3.5 h-3.5" />
          <span>พิมพ์ QR Code (3.5×3.5)</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'reports' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('reports')}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>รายงานสแกน</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'sheets' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveTab('sheets')}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Google Sheets</span>
        </button>
        <button
          className={`at px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'firebase' ? 'bg-amber-600 text-white shadow-md' : 'text-amber-400 hover:text-amber-200'
          }`}
          type="button"
          onClick={() => setActiveTab('firebase')}
        >
          <Database className="w-3.5 h-3.5 text-amber-300" />
          <span>Firebase DB & Sync</span>
        </button>
      </div>

      {/* Admin Body Panels */}
      <div className="admin-body flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* ======================================================== */}
        {/* TAB 1: DASHBOARD */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5" id="tab-dashboard">
            {/* Stat Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-sm">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>สแกนวันนี้</span>
                  <Clock className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {scans.length} <span className="text-xs text-slate-400 font-normal">ครั้ง</span>
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>เช็คอิน Realtime</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-sm">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>พนักงานทั้งหมด</span>
                  <User className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {students.length} <span className="text-xs text-slate-400 font-normal">คน</span>
                </div>
                <div className="text-[11px] text-blue-400 mt-1">
                  ฐานข้อมูล Firebase
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-sm">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>รถรับส่ง</span>
                  <Bus className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {cars.length} <span className="text-xs text-slate-400 font-normal">คัน</span>
                </div>
                <div className="text-[11px] text-amber-400 mt-1">
                  {allBuses.length} สายบริการ
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-sm">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>อัตราขึ้นรถ</span>
                  <Shield className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-teal-400 mt-2">
                  {students.length > 0 ? Math.round((scans.length / students.length) * 100) : 0}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  ความครอบคลุม
                </div>
              </div>
            </div>

            {/* Bus Cards */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bus className="w-4 h-4 text-amber-400" />
                  <span>สถานะรถรับส่งแยกตามสาย</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('cars')}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  จัดการรถ &gt;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {busStats.map((item) => (
                  <div
                    key={item.bus}
                    className="bg-slate-950 border border-white/5 p-3.5 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{item.bus}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        ขึ้นแล้ว <strong className="text-white">{item.scanned}</strong> จาก {item.total} คน
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.percent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Realtime Bus Route Map by Scanned Student Coordinates */}
            <BusRouteMap
              cars={cars}
              scans={scans}
              students={students}
            />

            {/* Recent Scans Table */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>รายการสแกนล่าสุด (Firebase Live Scans)</span>
                </h3>
                <div className="flex items-center gap-2">
                  {onClearAllScans && scans.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteConfirmItem({
                          type: 'clear_scans',
                          name: 'ล้างประวัติการสแกนทั้งหมด',
                        })
                      }
                      className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-800/40 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>ล้างประวัติ</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2.5">เวลา</th>
                      <th>รหัสพนักงาน</th>
                      <th>ชื่อ-สกุล</th>
                      <th>แผนก</th>
                      <th>สายรถ</th>
                      <th>จุดสแกน</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-500">
                          ยังไม่มีประวัติการสแกนในระบบ Firebase Firestore
                        </td>
                      </tr>
                    ) : (
                      scans.slice(0, 15).map((s, index) => (
                        <tr key={`admin-top-scan-${s.id || s.scanId || 'item'}-${index}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 font-mono text-emerald-400 font-semibold">{s.timeThai}</td>
                          <td className="font-mono text-amber-400">{s.studentCode}</td>
                          <td className="font-semibold text-white">{s.name}</td>
                          <td className="text-slate-300">{s.grade}</td>
                          <td className="text-slate-300">{s.busNumber}</td>
                          <td className="text-slate-400">{s.locationName}</td>
                          <td>
                            {onDeleteScan && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmItem({
                                    type: 'scan',
                                    id: s.scanId || s.id,
                                    name: `สแกนของ ${s.name} (${s.timeThai})`,
                                  })
                                }
                                className="p-1 rounded bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 transition-colors"
                                title="ลบรายการสแกนนี้ออกจาก Firebase"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: ROUTES MAP */}
        {/* ======================================================== */}
        {activeTab === 'routes' && (
          <div className="space-y-4" id="tab-routes">
            <BusRouteMap
              cars={cars}
              scans={scans}
              students={students}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: STUDENTS (CRUD 100%) */}
        {/* ======================================================== */}
        {activeTab === 'students' && (
          <div className="space-y-4" id="tab-students">
            {/* Filter & Action Bar */}
            <div className="flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    placeholder="🔎 ค้นหา ชื่อ, รหัสพนักงาน, ชื่อเล่น, แผนก..."
                    value={stuSearch}
                    onChange={(e) => setStuSearch(e.target.value)}
                  />
                </div>

                <select
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  value={stuCar}
                  onChange={(e) => setStuCar(e.target.value)}
                >
                  <option value="">ทุกสายรถ</option>
                  {allBuses.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <select
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  value={stuDorm}
                  onChange={(e) => setStuDorm(e.target.value)}
                >
                  <option value="">ทุกหอพัก</option>
                  {allDorms.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Excel Import Button */}
                <button
                  type="button"
                  id="btnImportExcel"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                  onClick={() => setShowExcelModal(true)}
                  title="นำเข้าไฟล์ Excel พนักงาน"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>นำเข้า Excel</span>
                </button>

                {/* Export Template Button */}
                <button
                  type="button"
                  id="btnExportTemplate"
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  onClick={exportStudentTemplateXLSX}
                  title="ดาวน์โหลดไฟล์แม่แบบ Excel สำหรับกรอกข้อมูล"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>แม่แบบ Excel (Template)</span>
                </button>

                {/* Export Current Students */}
                <button
                  type="button"
                  id="btnExportStudents"
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 font-medium text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  onClick={() => exportStudentsToXLSX(students)}
                  title="ส่งออกรายชื่อพนักงานทั้งหมดเป็น Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ส่งออก Excel</span>
                </button>

                {/* Fetch from Firebase Button */}
                {onSyncFromFirebase && (
                  <button
                    type="button"
                    id="btnSyncFirebaseStudents"
                    disabled={isSyncingFirebase}
                    className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                    onClick={() => onSyncFromFirebase()}
                    title="ดึงข้อมูลล่าสุดจากคอลเล็กชัน students บน Firebase Firestore 100%"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
                    <span>{isSyncingFirebase ? 'กำลังดึง...' : '🔥 ดึงจาก Firebase'}</span>
                  </button>
                )}

                {/* Clear Cache Button */}
                {onClearMockStudents && (
                  <button
                    type="button"
                    id="btnClearMockStudents"
                    className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-white/10 font-medium text-xs flex items-center gap-1.5 transition-all active:scale-95"
                    onClick={() =>
                      setDeleteConfirmItem({
                        type: 'clear_cache',
                        name: 'ล้างแคชในเครื่องและโหลดข้อมูลสดจาก Firebase Firestore 100%',
                      })
                    }
                    title="ล้างแคชในเครื่อง เพื่อโหลดข้อมูลจริงจาก Firebase Firestore 100%"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>ล้างแคชเครื่อง (Firebase 100%)</span>
                  </button>
                )}

                {/* Print QR Codes Shortcut */}
                <button
                  type="button"
                  id="btnGoToQrPrint"
                  className="px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  onClick={() => {
                    setQrPrintPreselectedId(null);
                    setActiveTab('qrcode');
                  }}
                  title="เปิดหน้าสั่งพิมพ์บัตร QR Code ขนาด 3.5 × 3.5 ซม."
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-400" />
                  <span>พิมพ์ QR 3.5×3.5 ซม.</span>
                </button>

                {/* Add Single Student */}
                <button
                  type="button"
                  id="btnAddStudent"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-all"
                  onClick={() => {
                    resetStudentForm();
                    setIsAddingStudent(true);
                  }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ เพิ่มพนักงานใหม่</span>
                </button>
              </div>
            </div>

            {/* Student Table */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-950/60 border-b border-white/5 flex items-center justify-between text-xs text-slate-400">
                <span>
                  แสดงผล <strong>{filteredStudents.length}</strong> จากทั้งหมด {students.length} คน
                </span>
                <span className="text-amber-400 font-mono text-[11px]">
                  🔥 Realtime Firebase Firestore (students 100%)
                </span>
              </div>

              <div className="overflow-x-auto max-h-[600px]">
                <table className="table w-full text-xs text-left" id="stuTable">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2.5 px-3">รหัส QR (ID)</th>
                      <th>ชื่อ-นามสกุล</th>
                      <th>ชื่อเล่น</th>
                      <th>แผนก</th>
                      <th>รหัสพนักงาน</th>
                      <th>หอพัก</th>
                      <th>สายรถ (car_id)</th>
                      <th>จุดขึ้นรถ</th>
                      <th>เบอร์โทรศัพท์</th>
                      <th>สถานะ</th>
                      <th className="text-right px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 px-4 text-slate-400">
                          <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-white/10 flex items-center justify-center text-teal-400">
                              <Database className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                              <p className="font-semibold text-sm text-white">
                                {students.length === 0
                                  ? 'ยังไม่มีข้อมูลพนักงานในคอลเล็กชัน students ของ Firebase'
                                  : 'ไม่พบข้อมูลพนักงานที่ค้นหา'}
                              </p>
                              <p className="text-xs text-slate-400">
                                {students.length === 0
                                  ? 'กรุณาเข้าสู่ระบบ Google แล้วกดปุ่ม "ดึงจาก Firebase" หรือไปที่แท็บ Firebase DB & Sync เพื่อย้ายรายชื่อพนักงาน 300 คน'
                                  : 'ลองตรวจสอบคำค้นหา หรือเลือกตัวกรองสายรถ / หอพักอีกครั้ง'}
                              </p>
                            </div>
                            {students.length === 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetStudentForm();
                                    setIsAddingStudent(true);
                                  }}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>+ เพิ่มพนักงานคนแรก</span>
                                </button>
                                {onSyncFromFirebase && (
                                  <button
                                    type="button"
                                    onClick={() => onSyncFromFirebase()}
                                    className="px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
                                    <span>🔥 ดึงข้อมูลจาก Firebase</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((st) => (
                        <tr
                          key={st.id || st.studentCode || st.student_id}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors text-slate-200"
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                            {st.studentCode || st.studentId || st.student_id || st.id}
                          </td>
                          <td className="font-semibold text-white">{st.name}</td>
                          <td className="text-slate-300">{st.nickname || '-'}</td>
                          <td>{st.className || st.grade || '-'}</td>
                          <td className="font-mono text-slate-400">
                            {st.seat_number != null ? st.seat_number : (st.seatNumber != null ? st.seatNumber : (st.number || '-'))}
                          </td>
                          <td>
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-white/5">
                              {st.dorm || '-'}
                            </span>
                          </td>
                          <td className="text-emerald-400 font-medium">
                            {st.car_id || st.carID || st.busNumber || '-'}
                          </td>
                          <td className="text-slate-400 truncate max-w-[120px]">
                            {st.pickup_point || st.pickupPoint || st.pickup || st.busStopName || st.dormOrStop || '-'}
                          </td>
                          <td className="font-mono text-slate-300 text-[11px]">
                            {st.parent_phone || st.parentPhone || '-'}
                          </td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] ${
                                st.status === 'ใช้งาน' || !st.status
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {st.status || 'ใช้งาน'}
                            </span>
                          </td>
                          <td className="text-right px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentForQR(st)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] transition-colors"
                                title="ดู QR Code"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditStudent(st)}
                                className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/70 text-blue-300 text-[10px] transition-colors"
                                title="แก้ไขข้อมูลใน Firebase"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmItem({
                                    type: 'student',
                                    id: st.student_id || st.studentId || st.studentCode || st.id,
                                    name: `${st.name} (${st.studentCode || st.student_id || st.id})`,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 text-[10px] transition-colors"
                                title="ลบออกจาก Firebase"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: CARS (CRUD 100%) */}
        {/* ======================================================== */}
        {activeTab === 'cars' && (
          <div className="space-y-4" id="tab-cars">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Bus className="w-4 h-4 text-amber-400" />
                  <span>ข้อมูลรถรับส่งพนักงาน (Collection: cars)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  เชื่อมต่อกับ Firebase Firestore 100% เพิ่ม แก้ไข ลบ และดึงข้อมูลสด
                </p>
              </div>

              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-all"
                onClick={() => {
                  resetCarForm();
                  setIsAddingCar(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ เพิ่มรถรับส่ง</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 bg-slate-950/40">
                      <th className="py-3 px-3">CarID</th>
                      <th>ทะเบียนรถ</th>
                      <th>ชื่อรถ / สาย</th>
                      <th>เส้นทาง / หอพัก</th>
                      <th>คนขับ</th>
                      <th>เบอร์โทรคนขับ</th>
                      <th>พี่เลี้ยงประจำรถ</th>
                      <th>ความจุ</th>
                      <th>สถานะ</th>
                      <th className="text-right px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cars.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-slate-500">
                          ยังไม่มีข้อมูลรถในระบบ Firebase Firestore
                        </td>
                      </tr>
                    ) : (
                      cars.map((car) => (
                        <tr key={car.carID} className="border-b border-white/5 hover:bg-white/5 transition-colors text-slate-200">
                          <td className="py-3 px-3 font-mono font-bold text-amber-400">{car.carID}</td>
                          <td className="font-semibold text-white">{car.plate}</td>
                          <td>{car.name}</td>
                          <td className="text-emerald-300 font-medium">{car.route}</td>
                          <td>{car.driver}</td>
                          <td className="font-mono text-slate-400">{car.driverPhone}</td>
                          <td>{car.attendant}</td>
                          <td className="font-mono">{car.capacity} ที่นั่ง</td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] ${
                                car.status === 'ใช้งาน'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {car.status}
                            </span>
                          </td>
                          <td className="text-right px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditCar(car)}
                                className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/70 text-blue-300 text-[10px] transition-colors"
                                title="แก้ไขรถใน Firebase"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmItem({
                                    type: 'car',
                                    id: car.carID,
                                    name: `${car.name} (${car.carID})`,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 text-[10px] transition-colors"
                                title="ลบรถออกจาก Firebase"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: QR CODE PRINT STUDIO (3.5 x 3.5 CM A4) */}
        {/* ======================================================== */}
        {activeTab === 'qrcode' && (
          <div id="tab-qrcode">
            <QRPrintPage
              students={students}
              cars={cars}
              preselectedStudentId={qrPrintPreselectedId}
              onClearPreselection={() => setQrPrintPreselectedId(null)}
              onGoToStudents={() => setActiveTab('students')}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: REPORTS (กรองตามวันที่, กรองตามรถแต่ละสาย, นำออก Excel) */}
        {/* ======================================================== */}
        {activeTab === 'reports' && (
          <div className="space-y-4" id="tab-reports">
            {/* Filter Controls Bar */}
            <div className="bg-slate-900 p-4 rounded-2xl border border-white/10 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">รายงานสรุปการสแกนและตัวกรอง</h3>
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow transition-colors"
                    type="button"
                    onClick={handleExportXLSX}
                    title="ดาวน์โหลดไฟล์ Excel .xlsx"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ดาวน์โหลด Excel (.xlsx)</span>
                  </button>
                  <button
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium text-xs flex items-center gap-1.5 transition-colors"
                    type="button"
                    onClick={handleExportCSV}
                    title="ดาวน์โหลดไฟล์ CSV (UTF-8)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {/* 1. Date Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" />
                    <span>กรองตามวันที่</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      id="reportDate"
                      className="bg-slate-800 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white w-full focus:outline-none focus:border-emerald-500"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                    />
                    {reportDate && (
                      <button
                        type="button"
                        onClick={() => setReportDate('')}
                        className="px-2 py-1.5 text-[11px] rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-white/10 whitespace-nowrap"
                        title="ดูทุกวัน"
                      >
                        ทุกวัน
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Car Filter (กรองตามรถแต่ละสาย) */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Bus className="w-3 h-3 text-amber-400" />
                    <span>กรองตามรถแต่ละสาย</span>
                  </label>
                  <select
                    id="reportCar"
                    className="bg-slate-800 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white w-full focus:outline-none focus:border-amber-500"
                    value={reportCar}
                    onChange={(e) => setReportCar(e.target.value)}
                  >
                    <option value="">ทุกสายรถ (ทั้งหมด {cars.length > 0 ? cars.length : allBuses.length} สาย)</option>
                    {cars.length > 0
                      ? cars.map((c) => (
                          <option key={c.carID} value={c.carID}>
                            {c.carID} - {c.name} ({c.plateNumber || 'ไม่ระบุทะเบียน'})
                          </option>
                        ))
                      : allBuses.map((b) => (
                          <option key={b} value={b}>
                            สายรถ {b}
                          </option>
                        ))}
                  </select>
                </div>

                {/* 3. Scan Type Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Layers className="w-3 h-3 text-sky-400" />
                    <span>ประเภทการสแกน</span>
                  </label>
                  <select
                    id="reportScanType"
                    className="bg-slate-800 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white w-full focus:outline-none focus:border-sky-500"
                    value={reportScanType}
                    onChange={(e) => setReportScanType(e.target.value as 'all' | 'ขึ้นรถ' | 'ลงรถ')}
                  >
                    <option value="all">ทั้งหมด (ขึ้นรถ และ ลงรถ)</option>
                    <option value="ขึ้นรถ">เฉพาะขึ้นรถ</option>
                    <option value="ลงรถ">เฉพาะลงรถ</option>
                  </select>
                </div>

                {/* 4. Search Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Search className="w-3 h-3 text-purple-400" />
                    <span>ค้นหาพนักงาน / จุดสแกน</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="พิมพ์ชื่อ, รหัสพนักงาน, หรือจุดรับส่ง..."
                      className="bg-slate-800 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white w-full pr-7 focus:outline-none focus:border-purple-500"
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                    />
                    {reportSearch && (
                      <button
                        type="button"
                        onClick={() => setReportSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Date Presets and Filter Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-400 text-[11px]">เลือกด่วน:</span>
                  <button
                    type="button"
                    onClick={() => setReportDate(new Date().toISOString().split('T')[0])}
                    className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors ${
                      reportDate === new Date().toISOString().split('T')[0]
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    วันนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setReportDate(d.toISOString().split('T')[0]);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[11px] bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    เมื่อวาน
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportDate('')}
                    className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors ${
                      !reportDate
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ทุกวัน
                  </button>
                </div>

                {(reportDate || reportCar || reportScanType !== 'all' || reportSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportDate('');
                      setReportCar('');
                      setReportScanType('all');
                      setReportSearch('');
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>ล้างตัวกรองทั้งหมด</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">รายการตรงตามตัวกรอง</div>
                <div className="text-xl font-bold text-white mt-0.5 flex items-baseline gap-1">
                  <span>{filteredScans.length}</span>
                  <span className="text-[11px] font-normal text-slate-500">/ {scans.length} ทั้งหมด</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 rounded-xl p-3">
                <div className="text-[11px] text-emerald-400">จำนวนขึ้นรถ</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">
                  {filteredScans.filter((s) => (s.scanType || 'ขึ้นรถ') === 'ขึ้นรถ').length}
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 rounded-xl p-3">
                <div className="text-[11px] text-sky-400">จำนวนลงรถ</div>
                <div className="text-xl font-bold text-sky-400 mt-0.5">
                  {filteredScans.filter((s) => s.scanType === 'ลงรถ').length}
                </div>
              </div>

              <div className="bg-slate-900 border border-white/10 rounded-xl p-3">
                <div className="text-[11px] text-amber-400">สายรถที่เลือก</div>
                <div className="text-xs font-semibold text-white mt-1 truncate">
                  {reportCar ? reportCar : 'ทุกสายรถ'}
                </div>
              </div>
            </div>

            {/* Filtered Scans List Table */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>ผลลัพธ์รายการสแกน ({filteredScans.length} รายการ)</span>
                  {reportDate && (
                    <span className="text-[11px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-normal">
                      วันที่: {reportDate}
                    </span>
                  )}
                  {reportCar && (
                    <span className="text-[11px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md font-normal">
                      สาย: {reportCar}
                    </span>
                  )}
                </h3>
              </div>

              <div className="overflow-x-auto max-h-[520px]">
                <table className="table w-full text-xs text-left" id="reportStuTable">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2.5">วันที่ / เวลา</th>
                      <th>รหัส</th>
                      <th>ชื่อ-สกุล</th>
                      <th>สายรถ</th>
                      <th>จุดสแกน</th>
                      <th>พิกัด GPS</th>
                      <th>ประเภทสแกน</th>
                      <th className="text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScans.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-400">
                          <div className="space-y-2">
                            <p className="text-sm">ไม่พบข้อมูลการสแกนตามตัวกรองที่เลือก</p>
                            <p className="text-xs text-slate-500">
                              ลองเปลี่ยนวันที่ เลือกรถสายอื่น หรือกด "ล้างตัวกรองทั้งหมด"
                            </p>
                            {(reportDate || reportCar || reportScanType !== 'all' || reportSearch) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReportDate('');
                                  setReportCar('');
                                  setReportScanType('all');
                                  setReportSearch('');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs inline-block"
                              >
                                ล้างตัวกรองเพื่อดูทั้งหมด
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredScans.map((s, index) => {
                        const isDrop = s.scanType === 'ลงรถ';
                        return (
                          <tr
                            key={`admin-all-scan-${s.id || s.scanId || 'item'}-${index}`}
                            className="border-b border-white/5 hover:bg-white/5 text-slate-200 transition-colors"
                          >
                            <td className="py-2 font-mono">
                              <span className="text-emerald-400 block">{s.timeThai}</span>
                              <span className="text-[10px] text-slate-500 block">{s.dateThai}</span>
                            </td>
                            <td className="font-mono text-amber-400 font-semibold">{s.studentCode}</td>
                            <td className="font-semibold text-white">
                              <div>{s.name}</div>
                              {s.grade && <span className="text-[10px] text-slate-400">{s.grade}</span>}
                            </td>
                            <td>
                              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800 border border-white/10 text-slate-300 font-mono">
                                {s.busNumber || s.carID || 'CAR01'}
                              </span>
                            </td>
                            <td className="text-slate-300">{s.locationName || s.dorm || '-'}</td>
                            <td className="text-[10px] font-mono text-slate-400">
                              {s.latitude && s.longitude ? (
                                <a
                                  href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-emerald-400 underline"
                                  title="เปิดใน Google Maps"
                                >
                                  {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                                </a>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  isDrop
                                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isDrop ? 'ลงรถแล้ว' : 'ขึ้นรถแล้ว'}
                              </span>
                            </td>
                            <td className="text-right">
                              {onDeleteScan && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirmItem({
                                      type: 'scan',
                                      id: s.scanId || s.id,
                                      name: `สแกนของ ${s.name}`,
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 transition-colors"
                                  title="ลบรายการสแกนนี้"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: GOOGLE SHEETS */}
        {/* ======================================================== */}
        {activeTab === 'sheets' && (
          <div className="space-y-4" id="tab-sheets">
            <GoogleSheetsPanel
              appsScriptUrl={appsScriptUrl}
              onUpdateAppsScriptUrl={onUpdateAppsScriptUrl}
              connectedSheetId={connectedSheetId}
              onUpdateConnectedSheetId={onUpdateConnectedSheetId}
              connectedSheetTitle={connectedSheetTitle}
              connectedSheetUrl={connectedSheetUrl}
              autoSyncEnabled={autoSyncEnabled}
              onToggleAutoSync={onToggleAutoSync}
              scans={scans}
              onRefreshFromGoogleSheets={onSyncFromGoogleSheets}
              isSyncingSheets={isSyncingSheets}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 7: FIREBASE DATABASE & MIGRATION */}
        {/* ======================================================== */}
        {activeTab === 'firebase' && (
          <div className="space-y-4" id="tab-firebase">
            <FirebasePanel
              firebaseUser={firebaseUser}
              studentCount={students.length}
              carCount={cars.length}
              scanCount={scans.length}
              users={users}
              settings={settings}
              onSyncFromFirebase={onSyncFromFirebase}
              isSyncingFirebase={isSyncingFirebase}
              onUpsertUser={onUpsertUser}
              onDeleteUser={onDeleteUser}
              onUpsertSetting={onUpsertSetting}
              onDeleteSetting={onDeleteSetting}
            />
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: ADD / EDIT STUDENT (Firebase Firestore 100%) */}
      {/* ======================================================== */}
      {(isAddingStudent || editingStudent) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>{editingStudent ? 'แก้ไขข้อมูลพนักงาน (Firebase)' : 'เพิ่มพนักงานใหม่ (Firebase)'}</span>
              </h3>
              <button
                type="button"
                onClick={resetStudentForm}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitStudent} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">รหัส QR / ID พนักงาน (student_id) *</label>
                  <input
                    required
                    disabled={Boolean(editingStudent)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono disabled:opacity-60"
                    placeholder="เช่น EMP0301"
                    value={formStudentCode}
                    onChange={(e) => setFormStudentCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">ชื่อเล่น (nickname)</label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    placeholder="เช่น โบ๊ท"
                    value={formStudentNickname}
                    onChange={(e) => setFormStudentNickname(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">ชื่อ-นามสกุล (name) *</label>
                <input
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  placeholder="เช่น นายกานต์ ธนบดี"
                  value={formStudentName}
                  onChange={(e) => setFormStudentName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">แผนก</label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    placeholder="เช่น ฝ่ายผลิต / บัญชี / ไอที"
                    value={formStudentGrade}
                    onChange={(e) => setFormStudentGrade(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">รหัสพนักงาน</label>
                  <input
                    type="number"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                    placeholder="เช่น 101"
                    value={formStudentNumber}
                    onChange={(e) => setFormStudentNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">หอพัก (dorm)</label>
                  <select
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    value={formStudentDorm}
                    onChange={(e) => setFormStudentDorm(e.target.value)}
                  >
                    <option value="หอ A">หอ A</option>
                    <option value="หอ B">หอ B</option>
                    <option value="หอ C">หอ C</option>
                    <option value="หอ D">หอ D</option>
                    <option value="หอ E">หอ E</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">สายรถรับส่ง (car_id)</label>
                  <select
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    value={formStudentCar}
                    onChange={(e) => setFormStudentCar(e.target.value)}
                  >
                    {cars.map((c) => (
                      <option key={c.carID} value={c.carID}>
                        {c.carID} - {c.name} ({c.plate})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">จุดขึ้นรถ / รับส่ง (pickup_point)</label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  placeholder="เช่น หน้าหอพัก A หรือ ประตู 1"
                  value={formStudentStop}
                  onChange={(e) => setFormStudentStop(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">ละติจูด (latitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs"
                    placeholder="เช่น 13.7563309"
                    value={formStudentLat}
                    onChange={(e) => setFormStudentLat(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">ลองจิจูด (longitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs"
                    placeholder="เช่น 100.5017651"
                    value={formStudentLng}
                    onChange={(e) => setFormStudentLng(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">ลิงก์แผนที่ (map_link)</label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  placeholder="https://maps.google.com/..."
                  value={formStudentMapLink}
                  onChange={(e) => setFormStudentMapLink(e.target.value)}
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">เบอร์โทรศัพท์ (phone)</label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  placeholder="081-234-5678"
                  value={formStudentPhone}
                  onChange={(e) => setFormStudentPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">สถานะ (status)</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={formStudentStatus}
                  onChange={(e) => setFormStudentStatus(e.target.value)}
                >
                  <option value="ใช้งาน">ใช้งาน (Active)</option>
                  <option value="ลาพักงาน">ลาพักงาน</option>
                  <option value="ระงับการใช้">ระงับการใช้</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  onClick={resetStudentForm}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/40"
                >
                  {editingStudent ? 'บันทึกการแก้ไข (Update)' : 'บันทึกลง Firebase (Insert)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD / EDIT CAR (Firebase Firestore 100%) */}
      {/* ======================================================== */}
      {(isAddingCar || editingCar) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bus className="w-4 h-4 text-amber-400" />
                <span>{editingCar ? 'แก้ไขข้อมูลรถรับส่ง (Firebase)' : 'เพิ่มรถรับส่งใหม่ (Firebase)'}</span>
              </h3>
              <button
                type="button"
                onClick={resetCarForm}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCar} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">รหัสรถ (car_id) *</label>
                  <input
                    required
                    disabled={Boolean(editingCar)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono disabled:opacity-60"
                    placeholder="เช่น CAR06"
                    value={formCarId}
                    onChange={(e) => setFormCarId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">ทะเบียนรถ (plate_number) *</label>
                  <input
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    placeholder="เช่น 1กข 5566"
                    value={formCarPlate}
                    onChange={(e) => setFormCarPlate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">ชื่อรถ / สายรถ (name) *</label>
                <input
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  placeholder="เช่น รถบัสสาย 6 (หอพักนานาชาติ)"
                  value={formCarName}
                  onChange={(e) => setFormCarName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">เส้นทาง / หอพัก (route)</label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  placeholder="เช่น หอ A - อาคารเรียน 1"
                  value={formCarRoute}
                  onChange={(e) => setFormCarRoute(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">พนักงานขับรถ (driver_name)</label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    placeholder="เช่น นายประสิทธิ์ ขับดี"
                    value={formCarDriver}
                    onChange={(e) => setFormCarDriver(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">เบอร์คนขับ (driver_phone)</label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                    placeholder="081-111-2222"
                    value={formCarDriverPhone}
                    onChange={(e) => setFormCarDriverPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-slate-300 font-semibold block mb-1">พี่เลี้ยงประจำรถ (attendant_name)</label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    placeholder="เช่น น.ส. อารียา ดูแลดี"
                    value={formCarAttendant}
                    onChange={(e) => setFormCarAttendant(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">ความจุ (ที่นั่ง)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                    value={formCarCapacity}
                    onChange={(e) => setFormCarCapacity(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">สถานะรถ (status)</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={formCarStatus}
                  onChange={(e) => setFormCarStatus(e.target.value)}
                >
                  <option value="ใช้งาน">ใช้งาน (Active)</option>
                  <option value="ซ่อมบำรุง">ซ่อมบำรุง (Maintenance)</option>
                  <option value="สำรอง">สำรอง (Standby)</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  onClick={resetCarForm}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-lg shadow-amber-900/40"
                >
                  {editingCar ? 'บันทึกการแก้ไขรถ (Update)' : 'บันทึกรถลง Firebase (Insert)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ======================================================== */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">ยืนยันการดำเนินการ?</h3>
              <p className="text-xs text-slate-300 mt-1">
                คุณต้องการลบ <strong className="text-rose-400">{deleteConfirmItem.name}</strong> ออกจาก Firebase ใช่หรือไม่?
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                การดำเนินการนี้จะลบข้อมูลออกจากระบบฐานข้อมูลคลาวด์ทันที
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
                onClick={() => setDeleteConfirmItem(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-900/40"
                onClick={handleExecuteDelete}
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: SINGLE EMPLOYEE QR */}
      {/* ======================================================== */}
      {selectedStudentForQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <h3 className="text-base font-bold text-white">บัตร QR Code ประจำตัว</h3>
            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner">
              <img src={singleQrUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">{selectedStudentForQR.name}</div>
              <div className="text-xs text-amber-400 font-mono">
                {selectedStudentForQR.studentCode} • {selectedStudentForQR.className || selectedStudentForQR.grade}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {selectedStudentForQR.busNumber || selectedStudentForQR.carID} • {selectedStudentForQR.dorm}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
                onClick={() => {
                  const key =
                    selectedStudentForQR.id ||
                    selectedStudentForQR.student_id ||
                    selectedStudentForQR.studentCode;
                  setQrPrintPreselectedId(key);
                  setSelectedStudentForQR(null);
                  setActiveTab('qrcode');
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>สั่งพิมพ์ (3.5×3.5 ซม.)</span>
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
                onClick={() => setSelectedStudentForQR(null)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EXCEL IMPORT & EXPORT TEMPLATE */}
      {/* ======================================================== */}
      <StudentExcelModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        currentStudents={students}
        onImportStudents={async (newStudents) => {
          if (onImportStudents) {
            await onImportStudents(newStudents);
          } else {
            for (const s of newStudents) {
              await onAddStudent(s);
            }
          }
        }}
      />
    </section>
  );
};
