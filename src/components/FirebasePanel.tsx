import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  Users,
  Settings,
  Plus,
  Trash2,
  Edit,
  LogIn,
  LogOut,
  ShieldCheck,
  Save,
  X,
} from 'lucide-react';
import { AppUser, SystemSetting } from '../types';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  BOOTSTRAPPED_ADMIN_EMAIL,
  isBootstrappedAdminEmail,
  signInWithFirebaseGoogle,
  signOutFirebase,
  seedAllInitialDataToFirebase,
  testConnection,
  MigrationProgress,
} from '../services/firebaseClient';

interface FirebasePanelProps {
  firebaseUser: User | null;
  studentCount: number;
  carCount: number;
  scanCount: number;
  users: AppUser[];
  settings: SystemSetting[];
  onSyncFromFirebase?: () => Promise<void>;
  isSyncingFirebase?: boolean;
  onUpsertUser?: (user: AppUser) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  onUpsertSetting?: (setting: SystemSetting) => Promise<void>;
  onDeleteSetting?: (key: string) => Promise<void>;
}

export const FirebasePanel: React.FC<FirebasePanelProps> = ({
  firebaseUser,
  studentCount,
  carCount,
  scanCount,
  users,
  settings,
  onSyncFromFirebase,
  isSyncingFirebase = false,
  onUpsertUser,
  onDeleteUser,
  onUpsertSetting,
  onDeleteSetting,
}) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [includeSampleScans, setIncludeSampleScans] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);

  // User Form State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [userNameInput, setUserNameInput] = useState('');
  const [userEmailInput, setUserEmailInput] = useState('');
  const [userRoleInput, setUserRoleInput] = useState<'Admin' | 'Staff' | 'Viewer'>('Staff');
  const [userCarInput, setUserCarInput] = useState('ALL');
  const [userStatusInput, setUserStatusInput] = useState('ใช้งาน');

  // Setting Form State
  const [editingSetting, setEditingSetting] = useState<SystemSetting | null>(null);
  const [showSettingForm, setShowSettingForm] = useState(false);
  const [settingKeyInput, setSettingKeyInput] = useState('');
  const [settingValueInput, setSettingValueInput] = useState('');
  const [settingDescInput, setSettingDescInput] = useState('');

  const isConnected = Boolean(firebaseUser && firebaseUser.emailVerified);
  const isAdmin = isBootstrappedAdminEmail(firebaseUser?.email);

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    const res = await testConnection();
    setIsTestingConn(false);
    setStatusMessage({
      type: res.online ? 'success' : 'error',
      text: res.message,
    });
  };

  const handleMigrateAll = async () => {
    if (!isConnected || isMigrating) return;
    setIsMigrating(true);
    setStatusMessage(null);
    try {
      const res = await seedAllInitialDataToFirebase({
        includeSampleScans,
        onProgress: (p) => setMigrationProgress(p),
      });
      setStatusMessage({
        type: 'success',
        text: `ย้ายข้อมูลเข้า Firebase สำเร็จ 100%! พนักงาน ${res.studentsCount} คน, รถ ${res.carsCount} คัน, ผู้ใช้ ${res.usersCount} บัญชี, ตั้งค่า ${res.settingsCount} รายการ${
          res.scansCount > 0 ? `, สแกนตัวอย่าง ${res.scansCount} รายการ` : ''
        }`,
      });
      if (onSyncFromFirebase) {
        await onSyncFromFirebase();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsMigrating(false);
      setMigrationProgress(null);
    }
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setShowUserForm(false);
    setUserIdInput('');
    setUserNameInput('');
    setUserEmailInput('');
    setUserRoleInput('Staff');
    setUserCarInput('ALL');
    setUserStatusInput('ใช้งาน');
  };

  const handleStartEditUser = (u: AppUser) => {
    setEditingUser(u);
    setShowUserForm(true);
    setUserIdInput(u.user_id);
    setUserNameInput(u.name);
    setUserEmailInput(u.email);
    setUserRoleInput(u.role);
    setUserCarInput(u.car_id);
    setUserStatusInput(u.status);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpsertUser || !userIdInput.trim() || !userNameInput.trim() || !userEmailInput.trim()) return;
    await onUpsertUser({
      user_id: userIdInput.trim(),
      name: userNameInput.trim(),
      email: userEmailInput.trim(),
      role: userRoleInput,
      car_id: userCarInput.trim() || 'ALL',
      status: userStatusInput,
    });
    resetUserForm();
  };

  const resetSettingForm = () => {
    setEditingSetting(null);
    setShowSettingForm(false);
    setSettingKeyInput('');
    setSettingValueInput('');
    setSettingDescInput('');
  };

  const handleStartEditSetting = (s: SystemSetting) => {
    setEditingSetting(s);
    setShowSettingForm(true);
    setSettingKeyInput(s.key);
    setSettingValueInput(s.value);
    setSettingDescInput(s.description);
  };

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpsertSetting || !settingKeyInput.trim()) return;
    await onUpsertSetting({
      key: settingKeyInput.trim(),
      value: settingValueInput.trim(),
      description: settingDescInput.trim(),
    });
    resetSettingForm();
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-emerald-950/70 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex flex-wrap items-center gap-2">
                <span>Firebase Cloud Firestore Hub</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  100% Real-time Database
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Project ID: <span className="font-mono text-amber-300">{FIREBASE_PROJECT_ID}</span> • DB:{' '}
                <span className="font-mono text-slate-400">{FIRESTORE_DATABASE_ID}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isConnected ? (
              <>
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{firebaseUser?.email}</span>
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[10px] font-mono">
                      ADMIN
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => signOutFirebase()}
                  className="px-3 py-1.5 rounded-full bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => signInWithFirebaseGoogle()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบ Google (Firebase Auth)</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Collection Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-white/10">
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-slate-400 text-[11px] block">students</span>
            <span className="text-xl font-bold font-mono text-emerald-400">{studentCount} คน</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-slate-400 text-[11px] block">cars</span>
            <span className="text-xl font-bold font-mono text-amber-400">{carCount} คัน</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-slate-400 text-[11px] block">scans</span>
            <span className="text-xl font-bold font-mono text-cyan-400">{scanCount} รายการ</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-slate-400 text-[11px] block">users</span>
            <span className="text-xl font-bold font-mono text-purple-400">{users.length} บัญชี</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-slate-400 text-[11px] block">settings</span>
            <span className="text-xl font-bold font-mono text-rose-400">{settings.length} รายการ</span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-start gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/50 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <span className="font-semibold">{statusMessage.text}</span>
        </div>
      )}

      {/* Migration & Sync Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-emerald-400" />
              <span>ย้ายข้อมูลทั้งหมด (300 พนักงาน + 5 รถ + ผู้ใช้ + ตั้งค่า) ขึ้น Firebase</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              บันทึกข้อมูลพนักงานรหัส STD0001–STD0300, รถรับส่ง CAR01–CAR05, บัญชีผู้ใช้ และตั้งค่าระบบลง Cloud Firestore ครบ 100%
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTestingConn}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-white/10 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingConn ? 'animate-spin' : ''}`} />
            <span>ทดสอบการเชื่อมต่อ Server</span>
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSampleScans}
            onChange={(e) => setIncludeSampleScans(e.target.checked)}
            className="rounded border-slate-600 bg-slate-950 text-emerald-500"
          />
          <span>นำเข้าประวัติสแกนตัวอย่าง 40 รายการ (SC20260915...) ด้วย</span>
        </label>

        {migrationProgress && (
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-300 font-semibold">{migrationProgress.step}</span>
              <span className="font-mono text-white">
                {migrationProgress.completed}/{migrationProgress.total}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-300"
                style={{
                  width: `${
                    migrationProgress.total > 0
                      ? Math.round((migrationProgress.completed / migrationProgress.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleMigrateAll}
            disabled={!isConnected || isMigrating}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/30 disabled:opacity-50"
          >
            <UploadCloud className={`w-4 h-4 ${isMigrating ? 'animate-bounce' : ''}`} />
            <span>
              {isMigrating
                ? 'กำลังอัปโหลดข้อมูลเข้า Firebase...'
                : 'ซิงค์ / ย้ายข้อมูล 300 พนักงาน & ทุกคอลเล็กชันขึ้น Firebase'}
            </span>
          </button>

          {onSyncFromFirebase && (
            <button
              type="button"
              onClick={() => onSyncFromFirebase()}
              disabled={!isConnected || isSyncingFirebase}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-2 border border-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
              <span>{isSyncingFirebase ? 'กำลังรีเฟรช...' : 'รีเฟรชข้อมูลสดจาก Firestore'}</span>
            </button>
          )}
        </div>

        {!isAdmin && isConnected && (
          <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5">
            หมายเหตุ: บัญชีแอดมินหลักคือ <strong className="font-mono">{BOOTSTRAPPED_ADMIN_EMAIL}</strong> หากล็อกอินด้วยบัญชีอื่น ข้อมูลจะแยกเก็บตามสิทธิ์เจ้าของข้อมูล (ownerId)
          </p>
        )}
      </div>

      {/* Firestore Collections & Schema Map */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>โครงสร้าง Collections & Fields ใน Firestore (ครบทั้งระบบ 100%)</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-emerald-400 font-bold">/students/{'{studentId}'}</div>
            <p className="text-[11px] text-slate-400">
              student_id, qr_code, name, nickname, grade, room, className, seat_number, dorm, car_id, plate, pickup_point, latitude, longitude, map_link, parent_name, parent_phone, status, qr_image, avatarColor
            </p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-amber-400 font-bold">/cars/{'{carId}'}</div>
            <p className="text-[11px] text-slate-400">
              car_id, plate_number, name, route, driver_name, driver_phone, attendant_name, capacity, status
            </p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-cyan-400 font-bold">/scans/{'{scanId}'}</div>
            <p className="text-[11px] text-slate-400">
              scan_id, timestamp, scan_date, dateThai, scan_time, timeThai, student_id, student_name, grade, car_id, plate_number, dorm, location_name, scan_type, scan_source, scanner_by, scanner_device, scan_result, note, latitude, longitude, avatar
            </p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-purple-400 font-bold">/users/{'{userId}'}</div>
            <p className="text-[11px] text-slate-400">
              user_id, name, email, role (Admin / Staff / Viewer), car_id, status
            </p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-rose-400 font-bold">/settings/{'{settingKey}'}</div>
            <p className="text-[11px] text-slate-400">
              key, value, description
            </p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <div className="font-mono text-sky-400 font-bold">/admins/{'{userId}'}</div>
            <p className="text-[11px] text-slate-400">
              uid, email, createdAt (สิทธิ์ผู้ดูแลระบบเพิ่มเติม)
            </p>
          </div>
        </div>
      </div>

      {/* Collection 4: Users CRUD */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-bold text-white">จัดการผู้ใช้งานระบบ (Collection: users)</h4>
          </div>
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => {
              resetUserForm();
              setShowUserForm(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มผู้ใช้</span>
          </button>
        </div>

        {showUserForm && (
          <form onSubmit={handleSaveUser} className="bg-slate-950 p-4 rounded-2xl border border-purple-500/30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-300">
                {editingUser ? `แก้ไขผู้ใช้ ${editingUser.user_id}` : 'เพิ่มผู้ใช้งานใหม่'}
              </span>
              <button type="button" onClick={resetUserForm} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                required
                disabled={Boolean(editingUser)}
                placeholder="รหัส (เช่น U004)"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono disabled:opacity-50"
              />
              <input
                required
                placeholder="ชื่อ-นามสกุล"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
              <input
                required
                type="email"
                placeholder="อีเมล"
                value={userEmailInput}
                onChange={(e) => setUserEmailInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
              <select
                value={userRoleInput}
                onChange={(e) => setUserRoleInput(e.target.value as 'Admin' | 'Staff' | 'Viewer')}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="Staff">Staff</option>
                <option value="Viewer">Viewer</option>
                {isAdmin && <option value="Admin">Admin</option>}
              </select>
              <input
                placeholder="สายรถ (เช่น ALL หรือ CAR01)"
                value={userCarInput}
                onChange={(e) => setUserCarInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
              <select
                value={userStatusInput}
                onChange={(e) => setUserStatusInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="ใช้งาน">ใช้งาน</option>
                <option value="ระงับ">ระงับ</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetUserForm} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
                ยกเลิก
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-1">
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกลง Firestore</span>
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 px-2">user_id</th>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th>สิทธิ์ (role)</th>
                <th>สายรถ</th>
                <th>สถานะ</th>
                <th className="text-right px-2">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-slate-500">
                    ยังไม่มีข้อมูลผู้ใช้ใน Firestore (กดปุ่มย้ายข้อมูลด้านบนเพื่อสร้างอัตโนมัติ)
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.user_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-2 font-mono text-purple-300">{u.user_id}</td>
                    <td className="text-white font-medium">{u.name}</td>
                    <td className="text-slate-300">{u.email}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300">
                        {u.role}
                      </span>
                    </td>
                    <td className="font-mono text-slate-300">{u.car_id}</td>
                    <td className="text-emerald-400">{u.status}</td>
                    <td className="text-right px-2 space-x-1">
                      <button
                        type="button"
                        onClick={() => handleStartEditUser(u)}
                        className="p-1 rounded bg-blue-950/60 hover:bg-blue-900/70 text-blue-300"
                        title="แก้ไขผู้ใช้"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {onDeleteUser && (
                        <button
                          type="button"
                          onClick={() => onDeleteUser(u.user_id)}
                          className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 text-rose-300"
                          title="ลบผู้ใช้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Collection 5: System Settings CRUD */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-rose-400" />
            <h4 className="text-sm font-bold text-white">ตั้งค่าระบบบนคลาวด์ (Collection: settings)</h4>
          </div>
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => {
              resetSettingForm();
              setShowSettingForm(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มค่าระบบ</span>
          </button>
        </div>

        {showSettingForm && (
          <form onSubmit={handleSaveSetting} className="bg-slate-950 p-4 rounded-2xl border border-rose-500/30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-300">
                {editingSetting ? `แก้ไขค่า ${editingSetting.key}` : 'เพิ่มการตั้งค่าระบบใหม่'}
              </span>
              <button type="button" onClick={resetSettingForm} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                required
                disabled={Boolean(editingSetting)}
                placeholder="Key (เช่น academic_year)"
                value={settingKeyInput}
                onChange={(e) => setSettingKeyInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono disabled:opacity-50"
              />
              <input
                required
                placeholder="Value (เช่น 2569)"
                value={settingValueInput}
                onChange={(e) => setSettingValueInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
              <input
                placeholder="คำอธิบาย"
                value={settingDescInput}
                onChange={(e) => setSettingDescInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetSettingForm} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
                ยกเลิก
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1">
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกลง Firestore</span>
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 px-2">Key</th>
                <th>ค่าที่ตั้งไว้ (Value)</th>
                <th>คำอธิบาย</th>
                <th className="text-right px-2">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {settings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-slate-500">
                    ยังไม่มีการตั้งค่าใน Firestore (กดปุ่มย้ายข้อมูลด้านบนเพื่อสร้างอัตโนมัติ)
                  </td>
                </tr>
              ) : (
                settings.map((s) => (
                  <tr key={s.key} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-2 font-mono text-rose-300">{s.key}</td>
                    <td className="text-white font-medium">{s.value}</td>
                    <td className="text-slate-400">{s.description}</td>
                    <td className="text-right px-2 space-x-1">
                      <button
                        type="button"
                        onClick={() => handleStartEditSetting(s)}
                        className="p-1 rounded bg-blue-950/60 hover:bg-blue-900/70 text-blue-300"
                        title="แก้ไขค่า"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {onDeleteSetting && (
                        <button
                          type="button"
                          onClick={() => onDeleteSetting(s.key)}
                          className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 text-rose-300"
                          title="ลบค่า"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
  );
};
