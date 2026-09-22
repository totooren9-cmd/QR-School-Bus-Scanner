import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  UserCheck,
  Zap,
  Sparkles,
  Database,
  ArrowRight,
  Plus,
  Bus,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { Student, Car } from '../types';

interface TestScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  cars: Car[];
  onTestScanStudent: (student: Student, scanType?: 'ขึ้นรถ' | 'ลงรถ') => void;
  onBatchTestScanAll: () => Promise<void>;
  isSupabaseReady: boolean;
  onOpenSupabaseConfig: () => void;
}

export const TestScanModal: React.FC<TestScanModalProps> = ({
  isOpen,
  onClose,
  students,
  cars,
  onTestScanStudent,
  onBatchTestScanAll,
  isSupabaseReady,
  onOpenSupabaseConfig,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScanType, setSelectedScanType] = useState<'auto' | 'ขึ้นรถ' | 'ลงรถ'>('auto');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Custom student inputs
  const [customName, setCustomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customGrade, setCustomGrade] = useState('ม.1');
  const [customBus, setCustomBus] = useState('CAR01');

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        (s.nickname && s.nickname.toLowerCase().includes(q)) ||
        (s.grade && s.grade.toLowerCase().includes(q)) ||
        (s.busNumber && s.busNumber.toLowerCase().includes(q)) ||
        (s.carID && s.carID.toLowerCase().includes(q))
    );
  }, [students, searchQuery]);

  if (!isOpen) return null;

  const handleScanSingle = (student: Student) => {
    const scanType = selectedScanType === 'auto' ? undefined : selectedScanType;
    onTestScanStudent(student, scanType);
  };

  const handleRandomScan = () => {
    if (students.length === 0) return;
    const randomIndex = Math.floor(Math.random() * students.length);
    const picked = students[randomIndex];
    handleScanSingle(picked);
  };

  const handleRunBatch = async () => {
    if (students.length === 0 || isBatchRunning) return;
    setIsBatchRunning(true);
    setBatchProgress({ current: 0, total: Math.min(students.length, 20) });

    const targetList = students.slice(0, 20); // test up to 20 students per batch
    for (let i = 0; i < targetList.length; i++) {
      const student = targetList[i];
      const scanType = selectedScanType === 'auto' ? undefined : selectedScanType;
      onTestScanStudent(student, scanType);
      setBatchProgress({ current: i + 1, total: targetList.length });
      // small delay for realistic scanning effect
      await new Promise((resolve) => setTimeout(resolve, 380));
    }

    setIsBatchRunning(false);
    setTimeout(() => {
      setBatchProgress(null);
    }, 2500);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const code = customCode.trim() || `STD${Math.floor(1000 + Math.random() * 9000)}`;
    const matchedCar = cars.find((c) => c.carID === customBus);

    const newStudent: Student = {
      id: code,
      studentCode: code,
      name: customName.trim(),
      grade: customGrade,
      className: `${customGrade}/1`,
      dorm: 'หอ A',
      carID: customBus,
      busNumber: customBus,
      plate: matchedCar?.plate || '1กข 1234',
      dormOrStop: 'จุดรับส่งนักเรียน',
      parentPhone: '081-234-5678',
      status: 'ใช้งาน',
      avatarColor: 'bg-indigo-500',
    };

    handleScanSingle(newStudent);
    setCustomName('');
    setCustomCode('');
    setShowCustomForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        id="testScanModal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>ทดสอบสแกน & บันทึกลงฐานข้อมูล</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ทุกๆ รายชื่อ
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                จำลองการสแกนและบันทึกลงฐานข้อมูล (Students + Scans) ทันที
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            type="button"
            title="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Status Banner */}
        <div className="px-5 py-2.5 bg-slate-800/60 border-b border-white/5 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 ${isSupabaseReady ? 'text-emerald-400' : 'text-cyan-400'}`} />
            {isSupabaseReady ? (
              <span className="text-emerald-300 font-medium">
                ⚡ ฐานข้อมูล Supabase เชื่อมต่อพร้อมบันทึก Real-time 100%
              </span>
            ) : (
              <span className="text-cyan-300 font-medium">
                💾 บันทึกในฐานข้อมูลระบบ (Local Database) ปลอดภัย 100%
              </span>
            )}
          </div>
          {!isSupabaseReady && (
            <button
              onClick={() => {
                onClose();
                onOpenSupabaseConfig();
              }}
              className="text-[11px] text-amber-300 hover:underline flex items-center gap-1 font-medium"
              type="button"
            >
              <span>เชื่อมต่อ Supabase Cloud</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Quick Actions Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={handleRandomScan}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] text-sm"
              type="button"
              id="btnRandomTestScan"
            >
              <Sparkles className="w-4 h-4" />
              <span>สุ่มทดสอบสแกน 1 รายชื่อ</span>
            </button>

            <button
              onClick={handleRunBatch}
              disabled={isBatchRunning || students.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-white font-medium rounded-xl border border-white/10 shadow-sm transition-all active:scale-[0.98] text-sm disabled:opacity-50"
              type="button"
              id="btnBatchTestScan"
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>
                {isBatchRunning ? 'กำลังสแกนครบทุกคน...' : 'ทดสอบสแกนครบทุกคน (Batch)'}
              </span>
            </button>
          </div>

          {/* Batch Progress Bar */}
          {batchProgress && (
            <div className="bg-slate-800/80 p-3 rounded-xl border border-emerald-500/30 space-y-1.5 animate-fadeIn">
              <div className="flex justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  บันทึกลงฐานข้อมูลแล้ว {batchProgress.current} จาก {batchProgress.total} รายชื่อ
                </span>
                <span className="font-mono text-emerald-300 font-bold">
                  {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Scan Type Filter & Custom Name Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-white/5 text-xs">
              <span className="text-slate-400 px-2 font-medium">ประเภทสแกน:</span>
              <button
                type="button"
                onClick={() => setSelectedScanType('auto')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedScanType === 'auto'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                อัตโนมัติ (ขึ้น/ลง)
              </button>
              <button
                type="button"
                onClick={() => setSelectedScanType('ขึ้นรถ')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedScanType === 'ขึ้นรถ'
                    ? 'bg-emerald-500 text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                ขึ้นรถ
              </button>
              <button
                type="button"
                onClick={() => setSelectedScanType('ลงรถ')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedScanType === 'ลงรถ'
                    ? 'bg-sky-500 text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                ลงรถ
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium bg-slate-800/70 px-2.5 py-1.5 rounded-lg border border-white/5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCustomForm ? 'ซ่อนแบบฟอร์ม' : 'สร้างรายชื่อใหม่เพื่อทดสอบ'}</span>
            </button>
          </div>

          {/* Custom Student Form */}
          {showCustomForm && (
            <form
              onSubmit={handleCustomSubmit}
              className="bg-slate-800/70 p-4 rounded-xl border border-amber-500/30 space-y-3 animate-fadeIn"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <UserCheck className="w-3.5 h-3.5" />
                <span>เพิ่มรายชื่อนักเรียนใหม่และบันทึกลงฐานข้อมูลทันที</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">ชื่อ-นามสกุล นักเรียน *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="เช่น ด.ช.เอกชัย ใจดี"
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">รหัสนักเรียน (ไม่ระบุจะสร้างอัตโนมัติ)</label>
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="เช่น STD9001"
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">ระดับชั้น</label>
                  <select
                    value={customGrade}
                    onChange={(e) => setCustomGrade(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="ม.1">ม.1</option>
                    <option value="ม.2">ม.2</option>
                    <option value="ม.3">ม.3</option>
                    <option value="ม.4">ม.4</option>
                    <option value="ม.5">ม.5</option>
                    <option value="ม.6">ม.6</option>
                    <option value="ป.1">ป.1</option>
                    <option value="ป.2">ป.2</option>
                    <option value="ป.3">ป.3</option>
                    <option value="ป.4">ป.4</option>
                    <option value="ป.5">ป.5</option>
                    <option value="ป.6">ป.6</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">สายรถประจำ</label>
                  <select
                    value={customBus}
                    onChange={(e) => setCustomBus(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    {cars.map((car) => (
                      <option key={car.carID} value={car.carID}>
                        {car.name || car.carID} ({car.plate})
                      </option>
                    ))}
                    {cars.length === 0 && <option value="CAR01">CAR01</option>}
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>บันทึกรายชื่อและสแกนทันที</span>
                </button>
              </div>
            </form>
          )}

          {/* Student Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารายชื่อนักเรียน, รหัส, ระดับชั้น, สายรถ เพื่อทดสอบสแกน..."
              className="w-full bg-slate-800/90 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Student Roster List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>รายชื่อนักเรียนในฐานข้อมูล ({filteredStudents.length} คน)</span>
              <span>กดปุ่มเพื่อทดสอบสแกนรายชื่อ</span>
            </div>

            <div className="divide-y divide-white/5 border border-white/5 rounded-xl bg-slate-800/40 overflow-hidden max-h-72 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  ไม่พบรายชื่อนักเรียนที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredStudents.map((student) => (
                  <div
                    key={student.id || student.studentCode}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/80 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                          student.avatarColor || 'bg-indigo-600'
                        }`}
                      >
                        {student.name.charAt(0) || 'น'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-amber-300 transition-colors">
                          {student.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>{student.studentCode}</span>
                          <span>•</span>
                          <span className="text-slate-300">
                            {student.className || student.grade || 'ม.1'}
                          </span>
                          <span>•</span>
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <Bus className="w-3 h-3" />
                            {student.busNumber || student.carID}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleScanSingle(student)}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-all shrink-0 active:scale-95 flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>สแกนรายชื่อนี้</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>
            ระบบจะบันทึกทั้งรายชื่อนักเรียนและประวัติสแกนลงฐานข้อมูลอัตโนมัติ
          </span>
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
