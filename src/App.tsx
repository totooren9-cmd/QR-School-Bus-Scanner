import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';
import { SplashScreen } from './components/SplashScreen';
import { CameraHalf } from './components/CameraHalf';
import { ScanListHalf } from './components/ScanListHalf';
import { CardDetailModal } from './components/CardDetailModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboard } from './components/AdminDashboard';
import { FirebaseAuthModal } from './components/FirebaseAuthModal';
import { TestScanModal } from './components/TestScanModal';
import { formatThaiDateTime } from './data/mockData';
import { speakFastSuccess, triggerVibration } from './utils/audio';
import { getInstantCoordinates, warmUpCoordinates } from './utils/geo';
import { convertKedmaneeToEnglish, hasThaiCharacters } from './utils/thaiKeyboard';
import { Student, ScanRecord, Car, AdminTab, AppUser, SystemSetting } from './types';
import {
  DEFAULT_APPS_SCRIPT_URL,
  syncToAppsScriptWebhook,
  appendScansToSheet,
  fetchStudentsFromAppsScript,
  fetchCarsFromAppsScript,
  fetchScansFromAppsScript,
} from './services/googleSheets';
import { getAccessToken } from './services/googleAuth';
import {
  testConnection,
  onFirebaseAuthChanged,
  isFirebaseReady,
  fetchStudentsFromFirebase,
  fetchCarsFromFirebase,
  fetchScansFromFirebase,
  fetchUsersFromFirebase,
  fetchSettingsFromFirebase,
  upsertStudentToFirebase,
  deleteStudentFromFirebase,
  upsertCarToFirebase,
  deleteCarFromFirebase,
  insertScanToFirebase,
  deleteScanFromFirebase,
  clearAllScansInFirebase,
  upsertUserToFirebase,
  deleteUserFromFirebase,
  upsertSettingToFirebase,
  deleteSettingFromFirebase,
  importStudentsBatchToFirebase,
  subscribeToFirebaseRealtime,
  syncPendingScans,
  getPendingScans,
  removePendingScan,
  clearPendingScans,
  mergeScansWithPending,
  getPendingCars,
  savePendingCar,
  removePendingCar,
  mergeCarsWithPending,
  syncPendingCars,
  getPendingStudents,
  savePendingStudent,
  removePendingStudent,
  mergeStudentsWithPending,
  syncPendingStudents,
  ensureDatabaseSeededIfEmpty,
} from './services/firebaseClient';

function deduplicateAndFixScanIds(records: ScanRecord[]): ScanRecord[] {
  const seenIds = new Set<string>();
  return records.map((scan, index) => {
    let id = scan.id;
    if (!id || seenIds.has(id)) {
      const typeSuffix = scan.scanType === 'ลงรถ' ? 'drop' : 'pickup';
      id = `${scan.id || 'SC'}-${typeSuffix}-${index + 1}`;
      if (seenIds.has(id)) {
        id = `${id}-${index + 1}`;
      }
    }
    seenIds.add(id);
    return {
      ...scan,
      id,
      scanId: scan.scanId && scan.scanId !== scan.id && !seenIds.has(scan.scanId) ? scan.scanId : id,
    };
  });
}

const DUPLICATE_SCAN_GUARD_MS = 10000;
const STORAGE_KEY_RECENT_SCAN_LOCKS = 'qr_bus_recent_scan_locks_v1';

function hashQrTextDeterministic(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().slice(0, 6);
}

function readPersistedScanLocks(now: number): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === 'undefined') return map;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_SCAN_LOCKS);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < DUPLICATE_SCAN_GUARD_MS) {
        map.set(k, ts);
      }
    }
  } catch {
    // Ignore storage read error
  }
  return map;
}

function writePersistedScanLocks(map: Map<string, number>, now: number): void {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, number> = {};
    for (const [k, ts] of map.entries()) {
      if (now - ts < DUPLICATE_SCAN_GUARD_MS) {
        obj[k] = ts;
      }
    }
    localStorage.setItem(STORAGE_KEY_RECENT_SCAN_LOCKS, JSON.stringify(obj));
  } catch {
    // Ignore storage write error
  }
}

function resolveStudentFromQrText(
  rawText: string,
  studentList: Student[]
): { student: Student; studentKey: string; rawKey: string } {
  let rawClean = rawText.trim();

  // If input contains Thai characters from hardware scanner with Thai OS keyboard, convert to English
  if (hasThaiCharacters(rawClean)) {
    rawClean = convertKedmaneeToEnglish(rawClean).trim();
  }

  if (rawClean.includes('text=')) {
    try {
      const url = new URL(rawClean);
      rawClean = url.searchParams.get('text') || rawClean;
    } catch {
      const m = rawClean.match(/text=([^&]+)/);
      if (m) rawClean = decodeURIComponent(m[1]);
    }
  }

  let matchedStudent: Student | undefined;

  try {
    const parsed = JSON.parse(rawClean);
    if (parsed && (parsed.code || parsed.studentCode || parsed.studentID)) {
      const targetCode = String(parsed.code || parsed.studentCode || parsed.studentID)
        .trim()
        .toUpperCase();
      matchedStudent = studentList.find(
        (s) => s.studentCode.trim().toUpperCase() === targetCode || s.id.trim().toUpperCase() === targetCode
      );
      if (!matchedStudent) {
        matchedStudent = {
          id: targetCode,
          studentCode: targetCode,
          name: parsed.name || 'พนักงานทั่วไป',
          grade: parsed.grade || 'แผนกทั่วไป',
          className: parsed.classroom || parsed.grade || 'แผนกทั่วไป',
          dorm: parsed.dorm || 'หอ A',
          carID: parsed.carID || 'CAR01',
          busNumber: parsed.bus || parsed.carID || 'CAR01',
          dormOrStop: parsed.dorm || 'จุดรับส่งพนักงาน',
          parentPhone: parsed.parentPhone || '081-000-0000',
          avatarColor: 'bg-indigo-500',
        };
      }
    }
  } catch {
    const textUpper = rawClean.toUpperCase();
    matchedStudent = studentList.find(
      (s) =>
        s.studentCode.trim().toUpperCase() === textUpper ||
        s.id.trim().toUpperCase() === textUpper ||
        s.name.includes(rawClean) ||
        (s.nickname && s.nickname.toLowerCase() === rawClean.toLowerCase())
    );

    if (!matchedStudent && /^\d+$/.test(rawClean)) {
      const padded = 'STD' + String(parseInt(rawClean, 10)).padStart(4, '0');
      matchedStudent = studentList.find((s) => s.studentCode.toUpperCase() === padded);
    }
  }

  if (!matchedStudent) {
    const alnum = rawClean.replace(/[^A-Za-z0-9]/g, '').slice(0, 7).toUpperCase();
    const fallbackCode = alnum || `STD_${hashQrTextDeterministic(rawClean)}`;
    matchedStudent = {
      id: fallbackCode,
      studentCode: fallbackCode,
      name:
        rawClean.length > 2 && !rawClean.startsWith('http')
          ? rawClean
          : `พนักงานรหัส ${fallbackCode}`,
      grade: 'แผนกทั่วไป',
      dorm: 'หอ A',
      carID: 'CAR01',
      busNumber: 'CAR01',
      dormOrStop: 'จุดรับส่งพนักงาน',
      parentPhone: '089-111-2233',
      avatarColor: 'bg-emerald-500',
    };
  }

  const studentKey = (matchedStudent.studentCode || matchedStudent.id || '').trim().toUpperCase();
  const rawKey = `RAW:${rawClean.toUpperCase()}`;
  return { student: matchedStudent, studentKey, rawKey };
}

// Auto-purge any legacy Supabase or mock data keys from localStorage (100% Firebase Firestore)
if (typeof window !== 'undefined') {
  try {
    const PURGE_KEY = 'qr_bus_firebase_migration_purged_v1';
    if (!localStorage.getItem(PURGE_KEY)) {
      localStorage.removeItem('qr_bus_supabase_url');
      localStorage.removeItem('qr_bus_supabase_anon_key');
      localStorage.removeItem('qr_bus_pending_scans');
      localStorage.removeItem('bus_students');
      localStorage.removeItem('bus_cars');
      localStorage.removeItem('bus_scans');
      localStorage.setItem(PURGE_KEY, 'done');
    }
  } catch (err) {
    console.warn('Storage purge warning:', err);
  }
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<string>('09:41');
  const [toastMsg, setToastMsg] = useState<string>('');

  // Firebase Auth & Primary Cloud Data States (100% Firestore Driven)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'camera' | 'scanner'>(() => {
    try {
      return (localStorage.getItem('qr_bus_scan_mode') as 'camera' | 'scanner') || 'camera';
    } catch {
      return 'camera';
    }
  });
  const [students, setStudents] = useState<Student[]>(() => getPendingStudents());
  const [cars, setCars] = useState<Car[]>(() => getPendingCars());
  const [scans, setScans] = useState<ScanRecord[]>(() => getPendingScans());
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<SystemSetting[]>([]);

  const [activeScan, setActiveScan] = useState<ScanRecord | null>(null);
  const [selectedScanDetail, setSelectedScanDetail] = useState<ScanRecord | null>(null);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState<boolean>(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState<boolean>(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [isTestScanModalOpen, setIsTestScanModalOpen] = useState<boolean>(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab>('dashboard');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);

  const hasAutoSeededRef = useRef<boolean>(false);
  const recentStudentScanRef = useRef<Map<string, number>>(readPersistedScanLocks(Date.now()));
  const scansRef = useRef<ScanRecord[]>(scans);
  const studentsRef = useRef<Student[]>(students);
  const seenScanIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedInitialScansRef = useRef<boolean>(false);

  useEffect(() => {
    scansRef.current = scans;
  }, [scans]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // Google Sheets & Apps Script State
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>(() => {
    return localStorage.getItem('gas_webhook_url') || DEFAULT_APPS_SCRIPT_URL;
  });
  const [connectedSheetId, setConnectedSheetId] = useState<string>(() => {
    return localStorage.getItem('gsheet_id') || '';
  });
  const [connectedSheetTitle, setConnectedSheetTitle] = useState<string>(() => {
    return localStorage.getItem('gsheet_title') || '';
  });
  const [connectedSheetUrl, setConnectedSheetUrl] = useState<string>(() => {
    return localStorage.getItem('gsheet_url') || '';
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('gsheet_autosync') !== 'false';
  });

  // Clock in status bar
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      setCurrentTime(`${h}:${m}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? '' : curr));
    }, 3200);
  }, []);

  // Persist Sheets settings
  useEffect(() => {
    localStorage.setItem('gas_webhook_url', appsScriptUrl);
  }, [appsScriptUrl]);

  useEffect(() => {
    localStorage.setItem('gsheet_id', connectedSheetId);
  }, [connectedSheetId]);

  useEffect(() => {
    localStorage.setItem('gsheet_title', connectedSheetTitle);
  }, [connectedSheetTitle]);

  useEffect(() => {
    localStorage.setItem('gsheet_url', connectedSheetUrl);
  }, [connectedSheetUrl]);

  useEffect(() => {
    localStorage.setItem('gsheet_autosync', String(autoSyncEnabled));
  }, [autoSyncEnabled]);

  const handleUpdateConnectedSheetId = (id: string, url: string, title?: string) => {
    setConnectedSheetId(id);
    setConnectedSheetUrl(url);
    if (title) setConnectedSheetTitle(title);
  };

  // Run mandatory Firestore connection check and warm up GPS cache in background on mount
  useEffect(() => {
    testConnection();
    warmUpCoordinates();
  }, []);

  // ==========================================
  // FIREBASE AUTH + REALTIME FIRESTORE SYNC
  // ==========================================
  const refreshFromFirebase = useCallback(
    async (silent = false) => {
      if (!isFirebaseReady()) return;
      setIsSyncingFirebase(true);
      try {
        const [stuRes, carRes, scanRes, userList, settingList] = await Promise.all([
          fetchStudentsFromFirebase(),
          fetchCarsFromFirebase(),
          fetchScansFromFirebase(),
          fetchUsersFromFirebase(),
          fetchSettingsFromFirebase(),
        ]);

        const summary: string[] = [];
        if (stuRes.success) {
          setStudents(stuRes.data);
          summary.push(`พนักงาน ${stuRes.data.length} คน`);
        }
        if (carRes.success) {
          setCars(carRes.data);
          summary.push(`รถ ${carRes.data.length} คัน`);
        }
        if (scanRes.success) {
          const uniqueScans = deduplicateAndFixScanIds(mergeScansWithPending(scanRes.data));
          setScans(uniqueScans);
          summary.push(`สแกน ${uniqueScans.length} รายการ`);
        }
        setUsers(userList);
        setSettings(settingList);

        if (!silent) {
          showToast(`🔥 ดึงข้อมูล Firebase 100%: ${summary.join(' • ')}`);
        }
      } catch (err) {
        console.warn('Failed to fetch from Firebase:', err);
        if (!silent) {
          showToast('ไม่สามารถดึงข้อมูลจาก Firebase ได้ในขณะนี้');
        }
      } finally {
        setIsSyncingFirebase(false);
      }
    },
    [showToast]
  );

  // Listen to Firebase Auth state and attach Firestore onSnapshot listeners ONLY when authenticated
  useEffect(() => {
    let unsubscribeRealtime: (() => void) | null = null;

    const unsubscribeAuth = onFirebaseAuthChanged(async (user) => {
      setFirebaseUser(user);

      if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
      }

      if (user && user.emailVerified) {
        // Flush pending offline Cars -> Students -> Scans FIRST so nothing is overwritten
        try {
          const carSync = await syncPendingCars();
          const stuSync = await syncPendingStudents();
          const scanSync = await syncPendingScans();
          const totalSynced = carSync.syncedCount + stuSync.syncedCount + scanSync.syncedCount;
          if (totalSynced > 0) {
            showToast(
              `🔥 ซิงค์ข้อมูลที่เพิ่มไว้ขึ้น Firebase สำเร็จ (รถ ${carSync.syncedCount}, พนักงาน ${stuSync.syncedCount}, สแกน ${scanSync.syncedCount})`
            );
          }
        } catch {
          // Will retry on next reconnect
        }

        // Auto-seed 300 students + 5 cars + 3 users + 10 settings on first connection if DB is empty
        if (!hasAutoSeededRef.current) {
          hasAutoSeededRef.current = true;
          try {
            const seedResult = await ensureDatabaseSeededIfEmpty((p) => {
              showToast(`🔥 ${p.step}`);
            });
            if (seedResult.seeded) {
              showToast(`🔥 ย้ายรายชื่อพนักงาน ${seedResult.studentsCount} คน & ข้อมูลระบบเข้า Firebase ครบ 100%!`);
            }
          } catch (seedErr) {
            console.warn('Auto-seed check notice:', seedErr);
          }
        }

        // Attach real-time Firestore listeners for all 5 collections (merging any pending records)
        unsubscribeRealtime = subscribeToFirebaseRealtime({
          onStudents: (rows) => setStudents(mergeStudentsWithPending(rows)),
          onCars: (rows) => setCars(mergeCarsWithPending(rows)),
          onScans: (rows) => {
            const merged = deduplicateAndFixScanIds(mergeScansWithPending(rows));
            if (hasLoadedInitialScansRef.current) {
              const nowTs = Date.now();
              const newRemoteScan = merged.find((s) => {
                const key = s.scanId || s.id;
                return (
                  key &&
                  !seenScanIdsRef.current.has(key) &&
                  typeof s.timestamp === 'number' &&
                  nowTs - s.timestamp < 20000
                );
              });
              if (newRemoteScan) {
                showToast(
                  `📡 ซิงค์รายการสแกนเรียลไทม์: ${newRemoteScan.name} (${newRemoteScan.scanType || 'ขึ้นรถ'})`
                );
              }
            }
            const nextSeen = new Set<string>();
            merged.forEach((s) => {
              const key = s.scanId || s.id;
              if (key) nextSeen.add(key);
            });
            seenScanIdsRef.current = nextSeen;
            hasLoadedInitialScansRef.current = true;
            setScans(merged);
          },
          onUsers: (rows) => setUsers(rows),
          onSettings: (rows) => setSettings(rows),
        });
      } else {
        hasLoadedInitialScansRef.current = false;
        seenScanIdsRef.current = new Set();
        setStudents(getPendingStudents());
        setCars(getPendingCars());
        setScans(getPendingScans());
        setUsers([]);
        setSettings([]);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [showToast]);

  // Flush pending offline records when browser comes back online
  useEffect(() => {
    const handleOnline = async () => {
      if (isFirebaseReady()) {
        try {
          const carRes = await syncPendingCars();
          const stuRes = await syncPendingStudents();
          const scanRes = await syncPendingScans();
          const total = carRes.syncedCount + stuRes.syncedCount + scanRes.syncedCount;
          if (total > 0) {
            showToast(`🔥 ออนไลน์: ซิงค์ข้อมูลขึ้น Firebase สำเร็จ (${total} รายการ)`);
          }
        } catch {
          // Ignore transient error
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [showToast]);

  // Google Sheets Fetch
  const refreshFromGoogleSheets = useCallback(
    async (silent = false) => {
      if (!appsScriptUrl) return;
      setIsSyncingSheets(true);
      try {
        const [stuRes, carRes, scanRes] = await Promise.all([
          fetchStudentsFromAppsScript(appsScriptUrl),
          fetchCarsFromAppsScript(appsScriptUrl),
          fetchScansFromAppsScript(appsScriptUrl),
        ]);

        const successItems: string[] = [];

        if (stuRes.success && stuRes.data && stuRes.data.length > 0) {
          setStudents(stuRes.data);
          if (isFirebaseReady()) {
            await importStudentsBatchToFirebase(stuRes.data).catch(() => {});
          }
          successItems.push(`พนักงาน ${stuRes.data.length} คน`);
        }

        if (carRes.success && carRes.data && carRes.data.length > 0) {
          setCars(carRes.data);
          successItems.push(`รถ ${carRes.data.length} คัน`);
        }

        if (scanRes.success && scanRes.data && scanRes.data.length > 0) {
          const uniqueScans = deduplicateAndFixScanIds(scanRes.data);
          setScans(uniqueScans);
          successItems.push(`สแกน ${uniqueScans.length} รายการ`);
        }

        if (successItems.length > 0) {
          showToast(`✓ ซิงค์ Google Sheet: ${successItems.join(' • ')}`);
        } else if (!silent) {
          showToast('✓ เชื่อมต่อ Google Sheet สำเร็จ (ข้อมูลเป็นปัจจุบัน)');
        }
      } catch (err) {
        console.warn('Failed to fetch from Google Sheets:', err);
        if (!silent) {
          showToast('ไม่สามารถดึงข้อมูลจาก Google Apps Script ได้ในขณะนี้');
        }
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [appsScriptUrl, showToast]
  );

  // ==========================================
  // SCAN ACTION (10s ANTI-DUPLICATE + IMMEDIATE FIREBASE SAVE)
  // ==========================================
  const checkDuplicateForKeys = useCallback((keys: string[]): { blocked: boolean; remainSec: number } => {
    const now = Date.now();
    const persisted = readPersistedScanLocks(now);
    for (const [k, ts] of persisted.entries()) {
      const existingTs = recentStudentScanRef.current.get(k) || 0;
      if (ts > existingTs) {
        recentStudentScanRef.current.set(k, ts);
      }
    }
    for (const [k, ts] of recentStudentScanRef.current.entries()) {
      if (now - ts >= DUPLICATE_SCAN_GUARD_MS) {
        recentStudentScanRef.current.delete(k);
      }
    }

    let latestTs = 0;
    const normalizedKeys = keys.map((k) => k.trim().toUpperCase()).filter(Boolean);

    for (const key of normalizedKeys) {
      const refTs = recentStudentScanRef.current.get(key) || 0;
      if (refTs > latestTs) latestTs = refTs;

      if (!key.startsWith('RAW:')) {
        const stateScan = scansRef.current.find((s) => {
          const codeMatch = (s.studentCode || '').trim().toUpperCase() === key;
          const idMatch = (s.studentId || '').trim().toUpperCase() === key;
          return (codeMatch || idMatch) && typeof s.timestamp === 'number';
        });
        if (stateScan?.timestamp && stateScan.timestamp > latestTs) {
          latestTs = stateScan.timestamp;
        }
      }
    }

    if (latestTs > 0 && now - latestTs < DUPLICATE_SCAN_GUARD_MS) {
      const remainSec = Math.max(1, Math.ceil((DUPLICATE_SCAN_GUARD_MS - (now - latestTs)) / 1000));
      return { blocked: true, remainSec };
    }
    return { blocked: false, remainSec: 0 };
  }, []);

  const checkDuplicateBeforeCameraScan = useCallback(
    (rawText: string): { blocked: boolean; remainSec: number; label?: string } => {
      const { student, studentKey, rawKey } = resolveStudentFromQrText(rawText, studentsRef.current);
      const check = checkDuplicateForKeys([studentKey, rawKey]);
      return {
        ...check,
        label: student.name,
      };
    },
    [checkDuplicateForKeys]
  );

  const registerScan = useCallback(
    async (
      student: Student,
      source: 'camera' | 'upload' | 'simulated' | 'scanner',
      customScanType?: 'ขึ้นรถ' | 'ลงรถ',
      rawKey?: string
    ) => {
      const now = Date.now();
      const studentKey = (student.studentCode || student.id || '').trim().toUpperCase();
      const lockKeys = [studentKey, rawKey || ''].filter(Boolean);

      if (lockKeys.length > 0) {
        const dup = checkDuplicateForKeys(lockKeys);
        if (dup.blocked) {
          showToast(`⏳ เพิ่งสแกน ${student.name} ไปแล้ว (รออีก ${dup.remainSec} วินาที)`);
          return;
        }

        for (const k of lockKeys) {
          recentStudentScanRef.current.set(k.toUpperCase(), now);
        }
        writePersistedScanLocks(recentStudentScanRef.current, now);
      }

      const isKnownStudent = studentsRef.current.some(
        (s) => s.studentCode === student.studentCode || s.id === student.id
      );

      setStudents((prev) => {
        const existingIdx = prev.findIndex(
          (s) => s.studentCode === student.studentCode || s.id === student.id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...student };
          return updated;
        }
        return [student, ...prev];
      });

      const geo = getInstantCoordinates();
      const { dateThai, timeThai } = formatThaiDateTime();

      const studentCar = cars.find((c) => c.carID === student.carID || c.carID === student.busNumber);

      const studentScansToday = scansRef.current.filter(
        (s) =>
          (s.studentCode === student.studentCode || s.studentId === student.id) &&
          (s.dateThai === dateThai || !s.dateThai)
      );

      const isDropOff = customScanType
        ? customScanType === 'ลงรถ'
        : studentScansToday.length > 0 &&
          (studentScansToday[0].scanType === 'ขึ้นรถ' || studentScansToday.length % 2 === 1);

      const scanType = customScanType || (isDropOff ? 'ลงรถ' : 'ขึ้นรถ');

      const newScan: ScanRecord = {
        id: `scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        scanId: `SCN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: Date.now(),
        dateThai,
        timeThai,
        time: timeThai,
        studentId: student.id || student.studentCode,
        studentCode: student.studentCode || student.id,
        name: student.name,
        grade: student.className || student.classroom || student.grade || 'แผนกทั่วไป',
        dorm: student.dorm || student.dormOrStop || 'หอ A',
        carID: student.carID || student.busNumber || 'CAR01',
        plate: student.plate || studentCar?.plate || '1กข 1234',
        scanType,
        scannerName: firebaseUser?.displayName || 'MOBILE01',
        busNumber: student.busNumber || student.carID || 'CAR01',
        locationName:
          student.pickup_point ||
          student.pickupPoint ||
          student.pickup ||
          student.dormOrStop ||
          student.busStopName ||
          geo.locationName,
        latitude:
          typeof student.latitude === 'number' && !isNaN(student.latitude) && student.latitude !== 0
            ? student.latitude
            : typeof student.lat === 'number' && !isNaN(student.lat)
            ? student.lat
            : geo.latitude,
        longitude:
          typeof student.longitude === 'number' && !isNaN(student.longitude) && student.longitude !== 0
            ? student.longitude
            : typeof student.lng === 'number' && !isNaN(student.lng)
            ? student.lng
            : geo.longitude,
        scanSource: source,
        status: 'success',
        dbSaved: false,
        avatar:
          student.avatar ||
          student.avatarUrl ||
          `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(student.studentCode)}`,
      };

      seenScanIdsRef.current.add(newScan.scanId || newScan.id);
      setScans((prev) => [newScan, ...prev]);
      setActiveScan(newScan);
      const srcPrefix = source === 'scanner' ? '🔌 [เครื่องยิง] ' : '🔥 ';
      showToast(
        isDropOff
          ? `${srcPrefix}สแกนลงรถสำเร็จ: ${student.name}`
          : `${srcPrefix}สแกนขึ้นรถสำเร็จ: ${student.name}`
      );

      if (soundEnabled) {
        speakFastSuccess(isDropOff ? 'สแกนลงรถเรียบร้อย' : 'สแกนขึ้นรถเรียบร้อย');
      }
      triggerVibration();

      try {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#38bdf8', '#34d399', '#fbbf24', '#f43f5e'],
        });
      } catch {
        // Ignore if blocked
      }

      // Immediately write scan document to Firebase Firestore (zero pre-delay)
      insertScanToFirebase(newScan, {
        student: isKnownStudent ? undefined : student,
        isNewScan: true,
        skipStudentUpsert: isKnownStudent,
      })
        .then((res) => {
          if (res.success) {
            setScans((prev) =>
              prev.map((s) =>
                s.id === newScan.id || s.scanId === newScan.scanId
                  ? { ...s, dbSaved: true }
                  : s
              )
            );
            setActiveScan((curr) =>
              curr && (curr.id === newScan.id || curr.scanId === newScan.scanId)
                ? { ...curr, dbSaved: true }
                : curr
            );
            showToast(
              isDropOff
                ? `✓ บันทึกลง Firebase ทันที: ${student.name} (ลงรถ)`
                : `✓ บันทึกลง Firebase ทันที: ${student.name} (ขึ้นรถ)`
            );
          } else if (res.isOfflineQueued) {
            showToast(`⏳ บันทึกลงคิวรอซิงค์ Firebase (กรุณาเข้าสู่ระบบ Google)`);
            if (source !== 'camera') {
              setIsFirebaseModalOpen(true);
            }
          }
        })
        .catch((err) => {
          console.warn('Immediate Firebase scan insert failed:', err);
          showToast(`⚠️ บันทึก Firebase ไม่สำเร็จ (เก็บในคิวรอส่งแล้ว): ${err instanceof Error ? err.message : ''}`);
        });

      // Auto-Sync to Google Sheets & Apps Script
      if (autoSyncEnabled) {
        syncToAppsScriptWebhook(appsScriptUrl, newScan).catch((err) => {
          console.warn('Background Apps Script sync failed:', err);
        });

        if (connectedSheetId) {
          getAccessToken()
            .then((token) => {
              if (token) {
                appendScansToSheet(connectedSheetId, [newScan], token).catch((err) => {
                  console.warn('Background Google Sheet append failed:', err);
                });
              }
            })
            .catch(() => {});
        }
      }

      setTimeout(() => {
        setActiveScan((curr) => (curr?.id === newScan.id ? null : curr));
      }, 3500);
    },
    [cars, soundEnabled, autoSyncEnabled, appsScriptUrl, connectedSheetId, firebaseUser, checkDuplicateForKeys, showToast]
  );

  // Handle Real Camera / Scanner / Upload QR code parsing
  const handleScanSuccess = useCallback(
    (data: {
      studentCode?: string;
      rawText: string;
      source: 'camera' | 'upload' | 'simulated' | 'scanner';
      customScanType?: 'ขึ้นรถ' | 'ลงรถ';
    }) => {
      const convertedText = convertKedmaneeToEnglish(data.rawText);
      const { student, rawKey } = resolveStudentFromQrText(convertedText, studentsRef.current);
      registerScan(student, data.source, data.customScanType, rawKey);
    },
    [registerScan]
  );

  // Handle Simulate Scan
  const handleSimulateScan = useCallback(() => {
    if (studentsRef.current.length === 0) {
      showToast('⚠️ กรุณาเข้าสู่ระบบ Google เพื่อดึงรายชื่อพนักงาน 300 คนจาก Firebase ก่อน');
      setIsFirebaseModalOpen(true);
      return;
    }
    const picked = studentsRef.current[Math.floor(Math.random() * studentsRef.current.length)];
    registerScan(picked, 'simulated');
  }, [registerScan, showToast]);

  const handleTestScanStudent = useCallback(
    (student: Student, scanType?: 'ขึ้นรถ' | 'ลงรถ') => {
      registerScan(student, 'simulated', scanType);
    },
    [registerScan]
  );

  const handleBatchTestScanAll = useCallback(async () => {
    const seen = new Set<string>();
    const batchList: Student[] = [];
    for (const s of studentsRef.current) {
      const k = (s.studentCode || s.id || '').trim().toUpperCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        batchList.push(s);
        if (batchList.length >= 20) break;
      }
    }
    for (let i = 0; i < batchList.length; i++) {
      const student = batchList[i];
      await registerScan(student, 'simulated');
      await new Promise((resolve) => setTimeout(resolve, 380));
    }
    showToast(`✓ ทดสอบสแกนบันทึกสำเร็จครบ ${batchList.length} รายชื่อ`);
  }, [registerScan, showToast]);

  // ==========================================
  // FIREBASE CRUD HANDLERS: STUDENTS
  // ==========================================
  const handleAddStudent = async (newStudent: Student) => {
    setStudents((prev) => [newStudent, ...prev.filter((s) => s.id !== newStudent.id && s.studentCode !== newStudent.studentCode)]);
    if (isFirebaseReady()) {
      try {
        const res = await upsertStudentToFirebase(newStudent);
        if (res.success) {
          removePendingStudent(newStudent.id || newStudent.studentCode);
          showToast(`🔥 บันทึก ${newStudent.name} ลง Firebase สำเร็จ`);
          return true;
        }
        savePendingStudent(newStudent);
        showToast(`แจ้งเตือน Firebase (สำรองในเครื่องไว้แล้ว): ${res.error}`);
        return false;
      } catch (err) {
        savePendingStudent(newStudent);
        showToast(`⚠️ บันทึก Firebase ไม่สำเร็จ (เก็บคิวในเครื่องไว้แล้ว): ${err instanceof Error ? err.message : ''}`);
        return false;
      }
    } else {
      savePendingStudent(newStudent);
      showToast('💾 บันทึกพนักงานลงเครื่องไว้แล้ว — กรุณาเข้าสู่ระบบ Google เพื่อซิงค์ขึ้น Firebase ถาวร');
      setIsFirebaseModalOpen(true);
      return true;
    }
  };

  const handleEditStudent = async (updatedStudent: Student) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === updatedStudent.id || s.studentCode === updatedStudent.studentCode ? updatedStudent : s))
    );
    if (isFirebaseReady()) {
      try {
        const res = await upsertStudentToFirebase(updatedStudent);
        if (res.success) {
          removePendingStudent(updatedStudent.id || updatedStudent.studentCode);
          showToast(`🔥 อัปเดต ${updatedStudent.name} ใน Firebase สำเร็จ`);
          return true;
        }
        savePendingStudent(updatedStudent);
        showToast(`แจ้งเตือน Firebase (สำรองในเครื่องไว้แล้ว): ${res.error}`);
        return false;
      } catch (err) {
        savePendingStudent(updatedStudent);
        showToast(`⚠️ อัปเดต Firebase ไม่สำเร็จ (เก็บคิวในเครื่องไว้แล้ว): ${err instanceof Error ? err.message : ''}`);
        return false;
      }
    } else {
      savePendingStudent(updatedStudent);
      showToast('💾 บันทึกการแก้ไขลงเครื่องไว้แล้ว — กรุณาเข้าสู่ระบบ Google เพื่อซิงค์ขึ้น Firebase');
      setIsFirebaseModalOpen(true);
      return true;
    }
  };

  const handleDeleteStudent = async (id: string) => {
    removePendingStudent(id);
    setStudents((prev) => prev.filter((s) => s.id !== id && s.studentCode !== id));
    if (isFirebaseReady()) {
      try {
        const res = await deleteStudentFromFirebase(id);
        if (res.success) {
          showToast('🔥 ลบพนักงานออกจาก Firebase สำเร็จ');
        } else {
          showToast(`แจ้งเตือน Firebase: ${res.error}`);
        }
      } catch (err) {
        showToast(`⚠️ ลบจาก Firebase ไม่สำเร็จ: ${err instanceof Error ? err.message : ''}`);
      }
    }
  };

  const handleClearMockStudents = () => {
    setStudents(getPendingStudents());
    setCars(getPendingCars());
    setScans([]);
    showToast('รีเซ็ตแคชหน้าจอเรียบร้อย (กำลังซิงค์ข้อมูลสดจาก Firebase Firestore)');
    if (isFirebaseReady()) {
      refreshFromFirebase(false);
    }
  };

  const handleImportStudents = async (importedStudents: Student[]) => {
    if (importedStudents.length === 0) return;

    setStudents((prev) => {
      const existingMap = new Map<string, Student>();
      prev.forEach((s) => existingMap.set(s.studentCode.trim().toUpperCase(), s));
      importedStudents.forEach((s) => existingMap.set(s.studentCode.trim().toUpperCase(), s));
      return Array.from(existingMap.values());
    });

    if (isFirebaseReady()) {
      try {
        const res = await importStudentsBatchToFirebase(importedStudents);
        showToast(`🔥 นำเข้า & บันทึกลง Firebase สำเร็จ ${res.count} คน`);
      } catch (err) {
        importedStudents.forEach(savePendingStudent);
        showToast(`⚠️ นำเข้า Firebase ไม่สำเร็จ (เก็บคิวในเครื่องไว้แล้ว): ${err instanceof Error ? err.message : ''}`);
      }
    } else {
      importedStudents.forEach(savePendingStudent);
      showToast('💾 เก็บรายชื่อที่นำเข้าไว้ในเครื่องแล้ว — กรุณาเข้าสู่ระบบ Google เพื่อซิงค์ขึ้น Firebase');
      setIsFirebaseModalOpen(true);
    }
  };

  // ==========================================
  // FIREBASE CRUD HANDLERS: CARS
  // ==========================================
  const handleAddCar = async (newCar: Car) => {
    setCars((prev) => [...prev.filter((c) => c.carID !== newCar.carID), newCar]);
    if (isFirebaseReady()) {
      try {
        const res = await upsertCarToFirebase(newCar);
        if (res.success) {
          removePendingCar(newCar.carID);
          showToast(`🔥 บันทึกรถ ${newCar.name} ลง Firebase สำเร็จ`);
          return true;
        }
        savePendingCar(newCar);
        showToast(`แจ้งเตือน Firebase (สำรองในเครื่องไว้แล้ว): ${res.error}`);
        return false;
      } catch (err) {
        savePendingCar(newCar);
        showToast(`⚠️ บันทึกรถลง Firebase ไม่สำเร็จ (เก็บคิวในเครื่องไว้แล้ว): ${err instanceof Error ? err.message : ''}`);
        return false;
      }
    } else {
      savePendingCar(newCar);
      showToast('💾 บันทึกรถลงเครื่องไว้แล้ว — กรุณาเข้าสู่ระบบ Google เพื่อซิงค์ขึ้น Firebase ถาวร');
      setIsFirebaseModalOpen(true);
      return true;
    }
  };

  const handleEditCar = async (updatedCar: Car) => {
    setCars((prev) => prev.map((c) => (c.carID === updatedCar.carID ? updatedCar : c)));
    if (isFirebaseReady()) {
      try {
        const res = await upsertCarToFirebase(updatedCar);
        if (res.success) {
          removePendingCar(updatedCar.carID);
          showToast(`🔥 อัปเดตรถ ${updatedCar.name} ใน Firebase สำเร็จ`);
          return true;
        }
        savePendingCar(updatedCar);
        showToast(`แจ้งเตือน Firebase (สำรองในเครื่องไว้แล้ว): ${res.error}`);
        return false;
      } catch (err) {
        savePendingCar(updatedCar);
        showToast(`⚠️ อัปเดตรถลง Firebase ไม่สำเร็จ (เก็บคิวในเครื่องไว้แล้ว): ${err instanceof Error ? err.message : ''}`);
        return false;
      }
    } else {
      savePendingCar(updatedCar);
      showToast('💾 บันทึกการแก้ไขรถลงเครื่องไว้แล้ว — กรุณาเข้าสู่ระบบ Google เพื่อซิงค์ขึ้น Firebase');
      setIsFirebaseModalOpen(true);
      return true;
    }
  };

  const handleDeleteCar = async (carId: string) => {
    removePendingCar(carId);
    setCars((prev) => prev.filter((c) => c.carID !== carId));
    if (isFirebaseReady()) {
      try {
        const res = await deleteCarFromFirebase(carId);
        if (res.success) {
          showToast('🔥 ลบรถออกจาก Firebase สำเร็จ');
        } else {
          showToast(`แจ้งเตือน Firebase: ${res.error}`);
        }
      } catch (err) {
        showToast(`⚠️ ลบรถจาก Firebase ไม่สำเร็จ: ${err instanceof Error ? err.message : ''}`);
      }
    }
  };

  // ==========================================
  // FIREBASE CRUD HANDLERS: SCANS
  // ==========================================
  const handleDeleteScan = async (scanId: string) => {
    removePendingScan(scanId);
    setScans((prev) => prev.filter((s) => s.id !== scanId && s.scanId !== scanId));
    if (isFirebaseReady()) {
      try {
        const res = await deleteScanFromFirebase(scanId);
        if (res.success) {
          showToast('🔥 ลบรายการสแกนจาก Firebase แล้ว');
        } else {
          showToast(`แจ้งเตือน Firebase: ${res.error}`);
        }
      } catch (err) {
        showToast(`⚠️ ลบจาก Firebase ไม่สำเร็จ: ${err instanceof Error ? err.message : ''}`);
      }
    }
  };

  const handleClearAllScans = async () => {
    clearPendingScans();
    setScans([]);
    setActiveScan(null);
    if (isFirebaseReady()) {
      try {
        const res = await clearAllScansInFirebase();
        if (res.success) {
          showToast('🔥 ล้างประวัติสแกนใน Firebase ทั้งหมดแล้ว');
        } else {
          showToast(`แจ้งเตือน Firebase: ${res.error || ''}`);
        }
      } catch (err) {
        showToast(`⚠️ ล้างประวัติสแกน Firebase ไม่สำเร็จ: ${err instanceof Error ? err.message : ''}`);
      }
    }
  };

  // ==========================================
  // FIREBASE CRUD HANDLERS: USERS & SETTINGS
  // ==========================================
  const handleUpsertUser = async (appUser: AppUser) => {
    await upsertUserToFirebase(appUser);
    showToast(`🔥 บันทึกบัญชีผู้ใช้ ${appUser.name} ลง Firebase สำเร็จ`);
  };

  const handleDeleteUser = async (userId: string) => {
    await deleteUserFromFirebase(userId);
    showToast('🔥 ลบบัญชีผู้ใช้จาก Firebase แล้ว');
  };

  const handleUpsertSetting = async (setting: SystemSetting) => {
    await upsertSettingToFirebase(setting);
    showToast(`🔥 บันทึกการตั้งค่า ${setting.key} ลง Firebase สำเร็จ`);
  };

  const handleDeleteSetting = async (key: string) => {
    await deleteSettingFromFirebase(key);
    showToast('🔥 ลบการตั้งค่าจาก Firebase แล้ว');
  };

  const firebaseReady = Boolean(firebaseUser && firebaseUser.emailVerified);

  return (
    <>
      {/* ============ SPLASH ============ */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* ============ MAIN APP ============ */}
      <div id="app" className={`app ${showSplash ? 'hidden' : ''}`}>
        {/* iOS Status Bar Mock */}
        <div className="statusbar-mock">
          <span id="statusTime">{currentTime}</span>
          <div className="status-right">
            <span>📶</span>
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>

        {/* ============ SCAN SCREEN (HOME) ============ */}
        <section
          id="screen-scan"
          className={`screen ${!isAdminDashboardOpen ? 'active' : ''}`}
        >
          {/* Top : Camera */}
          <CameraHalf
            scanMode={scanMode}
            onScanModeChange={setScanMode}
            onScanSuccess={handleScanSuccess}
            checkDuplicateBeforeScan={checkDuplicateBeforeCameraScan}
            onSimulateScan={handleSimulateScan}
            onOpenTestScanModal={() => setIsTestScanModalOpen(true)}
            activeScan={activeScan}
            totalScans={scans.length}
            onCameraActiveChange={setIsCameraActive}
          />

          {/* Bottom : Scan List (Bottom Sheet with Auto-Collapse) */}
          <ScanListHalf
            scans={scans}
            cars={cars}
            students={students}
            cameraActive={isCameraActive}
            scanMode={scanMode}
            onSelectScan={(scan) => setSelectedScanDetail(scan)}
            onClearAll={handleClearAllScans}
            onOpenAdmin={() => setIsAdminLoginOpen(true)}
            onOpenMap={() => {
              setAdminInitialTab('routes');
              setIsAdminDashboardOpen(true);
            }}
            soundEnabled={soundEnabled}
            onToggleSound={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                showToast(next ? 'เปิดเสียงประกาศภาษาไทย' : 'ปิดเสียงประกาศ');
                return next;
              });
            }}
          />
        </section>

        {/* ============ ADMIN SCREEN (FULL CRUD FIREBASE) ============ */}
        {isAdminDashboardOpen && (
          <AdminDashboard
            initialTab={adminInitialTab}
            students={students}
            cars={cars}
            scans={scans}
            users={users}
            settings={settings}
            firebaseUser={firebaseUser}
            onAddStudent={handleAddStudent}
            onEditStudent={handleEditStudent}
            onDeleteStudent={handleDeleteStudent}
            onImportStudents={handleImportStudents}
            onAddCar={handleAddCar}
            onEditCar={handleEditCar}
            onDeleteCar={handleDeleteCar}
            onDeleteScan={handleDeleteScan}
            onClearAllScans={handleClearAllScans}
            onUpsertUser={handleUpsertUser}
            onDeleteUser={handleDeleteUser}
            onUpsertSetting={handleUpsertSetting}
            onDeleteSetting={handleDeleteSetting}
            onCloseAdmin={() => setIsAdminDashboardOpen(false)}
            appsScriptUrl={appsScriptUrl}
            onUpdateAppsScriptUrl={setAppsScriptUrl}
            connectedSheetId={connectedSheetId}
            onUpdateConnectedSheetId={handleUpdateConnectedSheetId}
            connectedSheetTitle={connectedSheetTitle}
            connectedSheetUrl={connectedSheetUrl}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={() => setAutoSyncEnabled((prev) => !prev)}
            onSyncFromGoogleSheets={() => refreshFromGoogleSheets(false)}
            isSyncingSheets={isSyncingSheets}
            onSyncFromFirebase={() => refreshFromFirebase(false)}
            isSyncingFirebase={isSyncingFirebase}
            onClearMockStudents={handleClearMockStudents}
            onOpenFirebaseAuth={() => setIsFirebaseModalOpen(true)}
          />
        )}
      </div>

      {/* ============ FIREBASE AUTH & MIGRATION MODAL ============ */}
      <FirebaseAuthModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
        firebaseUser={firebaseUser}
        studentCount={students.length}
        carCount={cars.length}
        scanCount={scans.length}
        onSyncComplete={() => refreshFromFirebase(true)}
        onOpenFullFirebaseTab={() => {
          setAdminInitialTab('firebase');
          setIsAdminDashboardOpen(true);
        }}
      />

      {/* ============ TEST SCAN MODAL (ALL STUDENTS & CUSTOM NAMES) ============ */}
      <TestScanModal
        isOpen={isTestScanModalOpen}
        onClose={() => setIsTestScanModalOpen(false)}
        students={students}
        cars={cars}
        onTestScanStudent={handleTestScanStudent}
        onBatchTestScanAll={handleBatchTestScanAll}
        isFirebaseReady={firebaseReady}
        onOpenFirebaseConfig={() => setIsFirebaseModalOpen(true)}
      />

      {/* ============ LOGIN SHEET ============ */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onSuccess={() => {
          setIsAdminLoginOpen(false);
          setIsAdminDashboardOpen(true);
          showToast('เข้าสู่ระบบแอดมินสำเร็จ');
        }}
      />

      {/* ============ RESULT DETAIL SHEET & MAP MODAL ============ */}
      <CardDetailModal
        scan={selectedScanDetail}
        studentDetails={
          selectedScanDetail
            ? students.find((s) => s.studentCode === selectedScanDetail.studentCode || s.id === selectedScanDetail.studentId)
            : undefined
        }
        onClose={() => setSelectedScanDetail(null)}
      />

      {/* ============ TOAST / NOTIFICATION ============ */}
      <div id="toast" className={`toast ${toastMsg ? 'show' : ''}`}>
        {toastMsg}
      </div>

      <iframe id="printFrame" style={{ display: 'none' }} title="Print Frame" />
    </>
  );
}
