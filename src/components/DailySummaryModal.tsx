import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  Bus,
  LogIn,
  LogOut,
  Users,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Printer,
  ChevronDown,
  Layers,
  ArrowRight,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { ScanRecord, Car, Student } from '../types';
import { formatThaiDateTime } from '../data/mockData';

interface DailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: ScanRecord[];
  cars?: Car[];
  students?: Student[];
}

export const DailySummaryModal: React.FC<DailySummaryModalProps> = ({
  isOpen,
  onClose,
  scans,
  cars = [],
  students = [],
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [activeTab, setActiveTab] = useState<'overview' | 'buses' | 'grades' | 'logs'>('overview');
  const [logFilter, setLogFilter] = useState<'all' | 'pickup' | 'dropoff'>('all');
  const [copied, setCopied] = useState<boolean>(false);

  // Today's formatted Thai date
  const todayInfo = useMemo(() => formatThaiDateTime(new Date()), []);
  const todayDateThai = todayInfo.dateThai;

  // Collect all available dates from scans for the date picker
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    scans.forEach((s) => {
      if (s.dateThai) dates.add(s.dateThai.trim());
    });
    // Ensure today is always an option
    dates.add(todayDateThai.trim());
    return Array.from(dates);
  }, [scans, todayDateThai]);

  // Determine active date string to filter by
  const activeDateString = selectedDate === 'today' ? todayDateThai : selectedDate;

  // Filter scans for the active date (Default: Current Day)
  const currentDayScans = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    return scans.filter((s) => {
      // If user selected 'today'
      if (selectedDate === 'today') {
        if (s.dateThai && s.dateThai.trim() === todayDateThai.trim()) return true;
        if (s.timestamp && s.timestamp >= startOfToday && s.timestamp < endOfToday) return true;
        // If scan has no dateThai and was added during this session
        if (!s.dateThai && s.timestamp && s.timestamp >= startOfToday) return true;
        return false;
      }
      // If user selected a specific historical date
      return s.dateThai && s.dateThai.trim() === selectedDate.trim();
    });
  }, [scans, selectedDate, todayDateThai]);

  // Is dropoff check
  const isDropOff = (s: ScanRecord) =>
    s.scanType === 'ลงรถ' || (s.scanType != null && s.scanType.includes('ลง'));

  // Calculate Core Metrics for Current Day
  const totalScans = currentDayScans.length;
  const totalPickups = useMemo(
    () => currentDayScans.filter((s) => !isDropOff(s)).length,
    [currentDayScans]
  );
  const totalDropOffs = useMemo(
    () => currentDayScans.filter((s) => isDropOff(s)).length,
    [currentDayScans]
  );

  // Unique students count today
  const uniqueStudentsToday = useMemo(() => {
    const map = new Map<string, ScanRecord[]>();
    currentDayScans.forEach((s) => {
      const key = s.studentCode || s.studentId || s.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [currentDayScans]);

  // Students currently still on the bus (latest scan today was 'ขึ้นรถ' and hasn't scanned 'ลงรถ' yet)
  const studentsOnBus = useMemo(() => {
    const list: { code: string; name: string; car: string; time: string }[] = [];
    uniqueStudentsToday.forEach((records, code) => {
      // Sort records ascending by timestamp
      const sorted = [...records].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const latest = sorted[sorted.length - 1];
      if (!isDropOff(latest)) {
        list.push({
          code,
          name: latest.name,
          car: latest.busNumber || latest.carID || '-',
          time: latest.timeThai || latest.time || '-',
        });
      }
    });
    return list;
  }, [uniqueStudentsToday]);

  // Breakdown by Bus / Route
  const busBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      {
        carId: string;
        busName: string;
        plate: string;
        pickups: number;
        dropoffs: number;
        total: number;
        studentsOnBus: number;
      }
    > = {};

    // Seed from known cars
    cars.forEach((c) => {
      breakdown[c.carID] = {
        carId: c.carID,
        busName: c.name || c.route || `สาย ${c.carID}`,
        plate: c.plate || c.plateNumber || '',
        pickups: 0,
        dropoffs: 0,
        total: 0,
        studentsOnBus: 0,
      };
    });

    // Populate from currentDayScans
    currentDayScans.forEach((s) => {
      const key = s.carID || s.busNumber || 'OTHER';
      if (!breakdown[key]) {
        breakdown[key] = {
          carId: key,
          busName: s.busNumber || key,
          plate: s.plate || '',
          pickups: 0,
          dropoffs: 0,
          total: 0,
          studentsOnBus: 0,
        };
      }
      breakdown[key].total += 1;
      if (isDropOff(s)) {
        breakdown[key].dropoffs += 1;
      } else {
        breakdown[key].pickups += 1;
      }
    });

    // Calculate students currently on bus per car
    studentsOnBus.forEach((s) => {
      if (breakdown[s.car]) {
        breakdown[s.car].studentsOnBus += 1;
      }
    });

    return Object.values(breakdown).filter((b) => b.total > 0 || cars.some((c) => c.carID === b.carId));
  }, [currentDayScans, cars, studentsOnBus]);

  // Breakdown by Grade / Class
  const gradeBreakdown = useMemo(() => {
    const breakdown: Record<string, { grade: string; pickups: number; dropoffs: number; total: number }> = {};
    currentDayScans.forEach((s) => {
      const g = s.grade || 'ไม่ระบุ';
      if (!breakdown[g]) {
        breakdown[g] = { grade: g, pickups: 0, dropoffs: 0, total: 0 };
      }
      breakdown[g].total += 1;
      if (isDropOff(s)) {
        breakdown[g].dropoffs += 1;
      } else {
        breakdown[g].pickups += 1;
      }
    });
    return Object.values(breakdown).sort((a, b) => b.total - a.total);
  }, [currentDayScans]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (logFilter === 'pickup') {
      return currentDayScans.filter((s) => !isDropOff(s));
    }
    if (logFilter === 'dropoff') {
      return currentDayScans.filter((s) => isDropOff(s));
    }
    return currentDayScans;
  }, [currentDayScans, logFilter]);

  // Percentage calculations
  const pickupPercent = totalScans > 0 ? Math.round((totalPickups / totalScans) * 100) : 0;
  const dropoffPercent = totalScans > 0 ? Math.round((totalDropOffs / totalScans) * 100) : 0;

  // Copy Summary Text
  const handleCopySummary = async () => {
    const lines = [
      `🚌 รายงานสรุปการรับส่งนักเรียนประจำวัน`,
      `📅 วันที่: ${activeDateString} (ณ เวลา ${todayInfo.timeThai})`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🟢 ยอดขึ้นรถทั้งหมด: ${totalPickups} ครั้ง`,
      `🔵 ยอดลงรถทั้งหมด: ${totalDropOffs} ครั้ง`,
      `👥 จำนวนนักเรียนที่สแกน: ${uniqueStudentsToday.size} คน`,
      `🟡 กำลังเดินทาง / อยู่บนรถ: ${studentsOnBus.length} คน`,
      `📋 รวมการสแกนทั้งหมด: ${totalScans} รายการ`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🚍 สรุปแยกตามสายรถ:`,
      ...busBreakdown.map(
        (b) =>
          `• ${b.busName} (${b.carId}) [${b.plate || '-'}] : ขึ้น ${b.pickups} | ลง ${b.dropoffs} (บนรถ ${b.studentsOnBus})`
      ),
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 ส่งจากระบบ Remix QR School Bus`,
    ];

    const text = lines.join('\n');
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      id="dailySummaryModal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ============ MODAL HEADER ============ */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-900/90 to-sky-950/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-xl shrink-0 shadow-lg shadow-sky-500/10">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  รายงานสรุปประจำวัน
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Daily Report
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>วันที่: {activeDateString}</span>
                <span className="text-slate-600">•</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300 font-mono">{todayInfo.timeThai}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="btnCloseDailySummary"
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ============ DATE SELECTOR BAR ============ */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              รอบรายงาน:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-900 border border-white/10 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setSelectedDate('today')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  selectedDate === 'today'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                วันนี้ ({todayDateThai})
              </button>
              {availableDates.length > 1 && (
                <div className="relative inline-block">
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-slate-300 px-2 py-1 text-xs rounded-lg focus:outline-none cursor-pointer"
                  >
                    <option value="today" className="bg-slate-900 text-white">
                      เลือกวันอื่น...
                    </option>
                    {availableDates
                      .filter((d) => d !== todayDateThai)
                      .map((d) => (
                        <option key={d} value={d} className="bg-slate-900 text-white">
                          {d}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">
              สถานะ: <span className="text-emerald-400 font-semibold">อัปเดตสด Real-time</span>
            </span>
          </div>
        </div>

        {/* ============ MODAL BODY ============ */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* 1. PRIMARY METRIC CARDS (Total Pickups & Drop-offs) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: ขึ้นรถ (Total Pickups) */}
            <div
              id="dailyTotalPickups"
              className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-lg shadow-emerald-950/20 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">ยอดขึ้นรถ (Pickups)</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <LogIn className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
                  {totalPickups}
                </div>
                <div className="text-[11px] text-emerald-300/80 mt-0.5 flex items-center gap-1">
                  <span>{pickupPercent}% ของสแกนทั้งหมด</span>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* Card 2: ลงรถ (Total Drop-offs) */}
            <div
              id="dailyTotalDropOffs"
              className="bg-sky-950/30 border border-sky-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-lg shadow-sky-950/20 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-400">ยอดลงรถ (Drop-offs)</span>
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center">
                  <LogOut className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
                  {totalDropOffs}
                </div>
                <div className="text-[11px] text-sky-300/80 mt-0.5 flex items-center gap-1">
                  <span>{dropoffPercent}% ของสแกนทั้งหมด</span>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-sky-500/10 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* Card 3: กำลังอยู่บนรถ (Students in Transit) */}
            <div
              id="dailyOnBusCount"
              className={`border rounded-2xl p-3.5 flex flex-col justify-between shadow-lg relative overflow-hidden ${
                studentsOnBus.length > 0
                  ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                  : 'bg-slate-800/50 border-white/10 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">กำลังอยู่บนรถ</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                  <Bus className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
                  {studentsOnBus.length}
                </div>
                <div className="text-[11px] text-amber-300/80 mt-0.5">
                  {studentsOnBus.length > 0 ? 'ยังไม่ได้สแกนลงรถ' : 'ทุกคนลงรถครบแล้ว ✓'}
                </div>
              </div>
            </div>

            {/* Card 4: รวมการสแกนวันนี้ (Total Scans) */}
            <div
              id="dailyTotalScans"
              className="bg-slate-800/60 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between shadow-lg"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">รวมสแกนทั้งหมด</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
                  {totalScans}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  จากนักเรียน {uniqueStudentsToday.size} คน
                </div>
              </div>
            </div>
          </div>

          {/* 2. PROGRESS BAR: Pickups vs Drop-offs visual balance */}
          <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                สัดส่วนการเดินทางวันนี้
              </span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  ขึ้นรถ ({totalPickups})
                </span>
                <span className="flex items-center gap-1 text-sky-400">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  ลงรถ ({totalDropOffs})
                </span>
              </div>
            </div>

            {totalScans > 0 ? (
              <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex border border-white/5">
                <div
                  style={{ width: `${pickupPercent}%` }}
                  className="bg-emerald-500 transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-slate-950"
                  title={`ขึ้นรถ: ${totalPickups} ครั้ง (${pickupPercent}%)`}
                >
                  {pickupPercent > 15 ? `${pickupPercent}%` : ''}
                </div>
                <div
                  style={{ width: `${dropoffPercent}%` }}
                  className="bg-sky-500 transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-slate-950"
                  title={`ลงรถ: ${totalDropOffs} ครั้ง (${dropoffPercent}%)`}
                >
                  {dropoffPercent > 15 ? `${dropoffPercent}%` : ''}
                </div>
              </div>
            ) : (
              <div className="w-full h-3 bg-slate-800 rounded-full"></div>
            )}

            {/* Students on Bus Banner */}
            {studentsOnBus.length > 0 && (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">
                    มีนักเรียน {studentsOnBus.length} คน ที่สแกนขึ้นรถแล้วแต่ยังไม่มีบันทึกลงรถ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('logs')}
                  className="text-[11px] font-semibold underline shrink-0 hover:text-amber-200"
                >
                  ดูรายชื่อ
                </button>
              </div>
            )}
          </div>

          {/* 3. SECTION TABS */}
          <div className="flex border-b border-white/10 text-xs font-semibold gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-3 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🚍 แยกตามสายรถ ({busBreakdown.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('grades')}
              className={`pb-2.5 px-3 border-b-2 transition-colors ${
                activeTab === 'grades'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🎓 แยกตามระดับชั้น ({gradeBreakdown.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`pb-2.5 px-3 border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              📝 บันทึกรายบุคคล ({currentDayScans.length})
            </button>
          </div>

          {/* 4. TAB CONTENTS */}
          {/* TAB 1: BREAKDOWN BY BUS */}
          {activeTab === 'overview' && (
            <div className="space-y-2.5">
              {busBreakdown.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  ยังไม่มีข้อมูลการสแกนในแต่ละสายรถสำหรับวันที่เลือก
                </div>
              ) : (
                busBreakdown.map((bus) => {
                  const busPickups = bus.pickups;
                  const busDropoffs = bus.dropoffs;
                  const isCompleted = busPickups > 0 && busPickups === busDropoffs;

                  return (
                    <div
                      key={bus.carId}
                      className="bg-slate-800/70 border border-white/5 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-lg text-emerald-400 shrink-0">
                          🚌
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{bus.busName}</h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-white/10">
                              {bus.carId}
                            </span>
                            {bus.plate && (
                              <span className="text-[11px] text-slate-400 font-mono">
                                ทะเบียน {bus.plate}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                            {bus.studentsOnBus > 0 ? (
                              <span className="text-amber-400 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                อยู่บนรถ {bus.studentsOnBus} คน
                              </span>
                            ) : isCompleted ? (
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                ส่งครบแล้วทุกคน
                              </span>
                            ) : (
                              <span>ยังไม่มีนักเรียนอยู่บนรถ</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                            <LogIn className="w-3 h-3 text-emerald-400" />
                            ขึ้น {busPickups}
                          </span>
                          <span className="px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 font-semibold flex items-center gap-1">
                            <LogOut className="w-3 h-3 text-sky-400" />
                            ลง {busDropoffs}
                          </span>
                          <span className="px-2 py-1 rounded-xl bg-slate-900 text-slate-400 text-[11px]">
                            รวม {bus.total}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: BREAKDOWN BY GRADE */}
          {activeTab === 'grades' && (
            <div className="space-y-2">
              {gradeBreakdown.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  ยังไม่มีข้อมูลแยกตามระดับชั้น
                </div>
              ) : (
                gradeBreakdown.map((g) => (
                  <div
                    key={g.grade}
                    className="bg-slate-800/60 border border-white/5 rounded-xl p-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-xs">
                        {g.grade}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-semibold">ขึ้นรถ {g.pickups}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-sky-400 font-semibold">ลงรถ {g.dropoffs}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">รวม {g.total} รายการ</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: DETAILED LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              {/* Filter Pills */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLogFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      logFilter === 'all'
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ทั้งหมด ({currentDayScans.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogFilter('pickup')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      logFilter === 'pickup'
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'bg-slate-900 text-slate-400 hover:text-emerald-300'
                    }`}
                  >
                    เฉพาะขึ้นรถ ({totalPickups})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogFilter('dropoff')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      logFilter === 'dropoff'
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'bg-slate-900 text-slate-400 hover:text-sky-300'
                    }`}
                  >
                    เฉพาะลงรถ ({totalDropOffs})
                  </button>
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  ไม่มีรายการสแกนในหมวดนี้
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredLogs.map((s, idx) => {
                    const isDown = isDropOff(s);
                    return (
                      <div
                        key={`log-${s.id || idx}`}
                        className="bg-slate-950/60 border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isDown
                                ? 'bg-sky-500/20 text-sky-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {isDown ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">{s.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                              <span>รหัส {s.studentCode}</span>
                              <span>•</span>
                              <span className="text-amber-300">{s.grade}</span>
                              <span>•</span>
                              <span>{s.busNumber || s.carID}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isDown
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {isDown ? 'ลงรถ แล้ว' : 'ขึ้นรถ'}
                          </span>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {s.timeThai || s.time || '-'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============ MODAL FOOTER & ACTIONS ============ */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              id="btnCopyDailySummary"
              type="button"
              onClick={handleCopySummary}
              className={`px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95 ${
                copied
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/30'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>คัดลอกข้อความสำเร็จ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>คัดลอกสรุปข้อความ (LINE)</span>
                </>
              )}
            </button>

            <button
              id="btnPrintDailyReport"
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2.5 rounded-xl font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
              title="พิมพ์รายงานสรุป"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">พิมพ์ / PDF</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
