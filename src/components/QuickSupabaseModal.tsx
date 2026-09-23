import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  Zap,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  isSupabaseConnected,
  getPendingScans,
  syncPendingScans,
} from '../services/supabaseClient';

interface QuickSupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectedChange?: (connected: boolean) => void;
  onOpenFullSqlTab?: () => void;
}

export const QuickSupabaseModal: React.FC<QuickSupabaseModalProps> = ({
  isOpen,
  onClose,
  onConnectedChange,
  onOpenFullSqlTab,
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    studentCount?: number;
    carCount?: number;
    scanCount?: number;
    scansTableReady?: boolean;
  } | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const config = getStoredSupabaseConfig();
      setUrl(config.url || '');
      setAnonKey(config.anonKey || '');
      setPendingCount(getPendingScans().length);

      if (config.url && config.anonKey) {
        runTest(config.url, config.anonKey);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const runTest = async (testUrl?: string, testKey?: string) => {
    setIsTesting(true);
    setTestResult(null);

    const targetUrl = (testUrl !== undefined ? testUrl : url).trim();
    const targetKey = (testKey !== undefined ? testKey : anonKey).trim();

    if (targetUrl && targetKey) {
      saveSupabaseConfig(targetUrl, targetKey);
    }

    const res = await testSupabaseConnection();
    setIsTesting(false);
    setTestResult(res);
    setPendingCount(getPendingScans().length);

    if (onConnectedChange) {
      onConnectedChange(res.success);
    }
  };

  const handleSaveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();

    if (!cleanUrl || !cleanKey) {
      setTestResult({
        success: false,
        message: 'กรุณากรอกทั้ง Project URL และ Public Anon Key',
      });
      return;
    }

    saveSupabaseConfig(cleanUrl, cleanKey);
    await runTest(cleanUrl, cleanKey);

    // If connected and pending scans exist, auto-sync immediately!
    const pending = getPendingScans();
    if (pending.length > 0) {
      setIsSyncing(true);
      await syncPendingScans();
      setIsSyncing(false);
      setPendingCount(getPendingScans().length);
    }

    // Auto-close on successful connection
    const currentTest = await testSupabaseConnection();
    if (currentTest.success) {
      setTimeout(() => {
        onClose();
      }, 1200);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await syncPendingScans();
    setIsSyncing(false);
    setPendingCount(getPendingScans().length);
    if (res.success) {
      await runTest();
    }
  };

  const sqlQuickSetup = `-- ========================================================
-- คำสั่ง SQL สำหรับสร้างตารางทั้งหมดใน Supabase SQL Editor (100% Real Cloud)
-- ========================================================

-- 1. ตารางรถรับส่ง (cars)
CREATE TABLE IF NOT EXISTS public.cars (
    car_id TEXT PRIMARY KEY,
    plate_number TEXT NOT NULL,
    name TEXT NOT NULL,
    route TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    attendant_name TEXT,
    capacity INTEGER DEFAULT 60,
    status TEXT DEFAULT 'ใช้งาน',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางข้อมูลนักเรียน (students)
CREATE TABLE IF NOT EXISTS public.students (
    student_id TEXT PRIMARY KEY,
    qr_code TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    grade TEXT,
    room TEXT,
    seat_number INTEGER,
    dorm TEXT,
    car_id TEXT,
    pickup_point TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    map_link TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    status TEXT DEFAULT 'ใช้งาน',
    qr_image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตารางบันทึกการสแกน (scans)
CREATE TABLE IF NOT EXISTS public.scans (
    scan_id TEXT PRIMARY KEY,
    scan_date DATE NOT NULL,
    scan_time TIME NOT NULL,
    student_id TEXT,
    student_name TEXT,
    car_id TEXT,
    plate_number TEXT,
    dorm TEXT,
    scan_type TEXT NOT NULL DEFAULT 'ขึ้นรถ',
    scanner_by TEXT DEFAULT 'เจ้าหน้าที่',
    scanner_device TEXT DEFAULT 'MOBILE01',
    scan_result TEXT DEFAULT 'สำเร็จ',
    note TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ตารางผู้ใช้งาน (users)
CREATE TABLE IF NOT EXISTS public.users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'Staff',
    car_id TEXT DEFAULT 'ALL',
    status TEXT DEFAULT 'ใช้งาน',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ตารางตั้งค่าระบบ (settings)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ดัชนีเพื่อค้นหาได้รวดเร็ว
CREATE INDEX IF NOT EXISTS idx_students_car_id ON public.students(car_id);
CREATE INDEX IF NOT EXISTS idx_scans_date ON public.scans(scan_date);
CREATE INDEX IF NOT EXISTS idx_scans_student_id ON public.scans(student_id);

-- ปลดล็อก Foreign Key เพื่อให้บันทึกสแกนได้ทันที
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_student_id_fkey;
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_car_id_fkey;

-- เปิด RLS และอนุญาตให้อ่าน/บันทึก 100%
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public cars access" ON public.cars;
CREATE POLICY "Public cars access" ON public.cars FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public students access" ON public.students;
CREATE POLICY "Public students access" ON public.students FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public scans access" ON public.scans;
CREATE POLICY "Public scans access" ON public.scans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public users access" ON public.users;
CREATE POLICY "Public users access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public settings access" ON public.settings;
CREATE POLICY "Public settings access" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- อนุญาตสิทธิ์ PostgREST API
GRANT ALL ON TABLE public.cars TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.students TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.scans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.settings TO anon, authenticated, service_role;

-- เปิด Realtime สำหรับทุกตาราง
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cars') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cars;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'students') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'scans') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
  END IF;
END $$;

-- 6. ข้อมูลรถรับส่งเริ่มต้น 5 คัน (บันทึกลง Supabase Cloud โดยตรง)
INSERT INTO public.cars (car_id, plate_number, name, route, driver_name, driver_phone, attendant_name, capacity, status)
VALUES
  ('CAR01', '1กข 1234', 'รถคันที่ 1', 'หอ A', 'นายสมชาย ใจดี', '081-111-1111', 'นางสาวเอ รักเรียน', 60, 'ใช้งาน'),
  ('CAR02', '2กข 2345', 'รถคันที่ 2', 'หอ B', 'นายวิชัย มั่นคง', '082-222-2222', 'นางสาวบี ศรีสุข', 60, 'ใช้งาน'),
  ('CAR03', '3กข 3456', 'รถคันที่ 3', 'หอ C', 'นายประเสริฐ ทองคำ', '083-333-3333', 'นางสาวซี บุญมี', 60, 'ใช้งาน'),
  ('CAR04', '4กข 4567', 'รถคันที่ 4', 'หอ D', 'นายอนุชา แสงทอง', '084-444-4444', 'นางสาวดี พูลสุข', 60, 'ใช้งาน'),
  ('CAR05', '5กข 5678', 'รถคันที่ 5', 'หอ E', 'นายธนกร วงศ์ไทย', '085-555-5555', 'นางสาวอี จันทร์เพ็ญ', 60, 'ใช้งาน')
ON CONFLICT (car_id) DO NOTHING;

-- รีโหลด PostgREST Schema แคชทันที
NOTIFY pgrst, 'reload schema';`;

  const copySqlCode = async () => {
    try {
      await navigator.clipboard.writeText(sqlQuickSetup);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // fallback
    }
  };

  const isConnected = isSupabaseConnected() && testResult?.success;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      id="quickSupabaseModal"
    >
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>เชื่อมต่อ Supabase Database</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Real-time 100%
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                บันทึกประวัติการสแกนขึ้น-ลงรถลงคลาวด์สดทันที
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Status Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
              isConnected
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
            }`}
          >
            {isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-white">
                {isConnected
                  ? 'สถานะ: เชื่อมต่อ Supabase Cloud เรียบร้อย 100%'
                  : 'สถานะ: ยังไม่ได้เชื่อมต่อ Supabase'}
              </div>
              <div className="text-[11px] opacity-90 mt-0.5">
                {testResult?.message ||
                  (isConnected
                    ? 'ระบบจะบันทึกทุกการสแกนลงตาราง public.scans ใน Supabase แบบ Real-time ทันที'
                    : 'กรุณาระบุ Project URL และ Anon Key ด้านล่าง แล้วกด "บันทึกและเชื่อมต่อ"')}
              </div>

              {testResult && testResult.success && (
                <div className="mt-2.5 flex items-center gap-3 pt-2 border-t border-emerald-500/20 text-[11px]">
                  <span className="text-slate-300">
                    นักเรียน:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {testResult.studentCount ?? 0}
                    </strong>{' '}
                    คน
                  </span>
                  <span className="text-slate-300">
                    รถ:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {testResult.carCount ?? 0}
                    </strong>{' '}
                    คัน
                  </span>
                  <span className="text-slate-300">
                    บันทึกสแกนใน DB:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {testResult.scanCount ?? 0}
                    </strong>{' '}
                    รายการ
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pending offline scans notice */}
          {pendingCount > 0 && (
            <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-2xl flex items-center justify-between gap-3 text-purple-200">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  มีรายการสแกนรอส่งขึ้น Supabase อยู่{' '}
                  <strong className="text-white font-mono">{pendingCount}</strong>{' '}
                  รายการ
                </span>
              </div>
              <button
                type="button"
                disabled={isSyncing || !isConnected}
                onClick={handleManualSync}
                className="px-3 py-1 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center gap-1 shrink-0 text-[11px]"
              >
                {isSyncing ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                <span>{isSyncing ? 'กำลังส่ง...' : 'ส่งขึ้นทันที'}</span>
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSaveAndConnect} className="space-y-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Supabase Project URL *
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-project-id.supabase.co"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                ดูได้จาก Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL
              </span>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Project API Key (Anon / Public) *
              </label>
              <input
                type="text"
                required
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                ดูได้จาก Supabase Dashboard &gt; Project Settings &gt; API &gt; Project API keys (anon public)
              </span>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={isTesting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isTesting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>
                  {isTesting ? 'กำลังตรวจสอบ...' : 'บันทึกและเชื่อมต่อ Real-time'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => runTest()}
                disabled={isTesting || !url || !anonKey}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 transition-colors flex items-center gap-1"
                title="ทดสอบการเชื่อมต่อ"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>ทดสอบ</span>
              </button>
            </div>
          </form>

          {/* Quick SQL Helper */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>ยังไม่มีตาราง public.scans ใน Supabase?</span>
              </span>
              <button
                type="button"
                onClick={copySqlCode}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition-colors text-[11px] shadow-sm"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3 h-3 text-white" />
                    <span className="font-semibold">คัดลอกแล้ว!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>คัดลอก SQL สร้างตารางทั้งหมด</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              เพียงคัดลอกโค้ด SQL ด้านบน แล้วนำไปวางและกด Run ใน{' '}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline hover:text-emerald-300 inline-flex items-center gap-0.5"
              >
                Supabase SQL Editor <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}
              ตารางทั้งหมด รถ และการบันทึกสแกนจะพร้อมใช้งาน 100% ทันที
            </p>

            {/* Netlify instructions card */}
            <div className="mt-3 p-3 bg-slate-950/70 border border-sky-500/30 rounded-2xl space-y-1.5 text-[11px]">
              <div className="font-bold text-sky-400 flex items-center gap-1.5">
                <span>🌐 ตั้งค่าบน Netlify ให้เชื่อมต่ออัตโนมัติทุกเครื่อง:</span>
              </div>
              <p className="text-slate-300 text-[10px] leading-relaxed">
                ไปที่ <strong>Netlify Dashboard</strong> &rarr; <strong>Site configuration</strong> &rarr; <strong>Environment variables</strong> แล้วเพิ่ม:
              </p>
              <div className="font-mono text-[10px] bg-slate-900 px-2.5 py-1.5 rounded-lg border border-white/5 text-emerald-300 space-y-0.5 select-all">
                <div>VITE_SUPABASE_URL = {url || 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'}</div>
                <div>VITE_SUPABASE_ANON_KEY = {anonKey || 'eyJhbGciOi...'}</div>
              </div>
              <p className="text-slate-400 text-[9.5px]">
                จากนั้นกด Trigger deploy ใหม่ ทุกคนที่เข้าเว็บจะเชื่อมต่อ Supabase เดียวกันอัตโนมัติ 100%!
              </p>
            </div>

            {onOpenFullSqlTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullSqlTab();
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 pt-1"
              >
                <span>เปิดดูโครงสร้างฐานข้อมูลฉบับเต็มในแอดมิน</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
