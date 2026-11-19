import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  Query,
  DocumentData,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Student, Car, ScanRecord, AppUser, SystemSetting } from '../types';
import {
  FIREBASE_STUDENTS,
  FIREBASE_CARS,
  FIREBASE_USERS,
  FIREBASE_SETTINGS,
  FIREBASE_SCANS,
} from '../data/firebaseSeed';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'totooren9@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

// Single shared Firebase App, Auth, and Named Firestore Database instance
export const firebaseApp: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// ==========================================
// MANDATORY ERROR HANDLING & CONNECTION TEST
// ==========================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ online: boolean; message: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { online: true, message: 'เชื่อมต่อ Firebase Firestore สำเร็จ' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { online: false, message: 'ไม่สามารถเชื่อมต่อ Firebase Firestore ได้ (Client is offline)' };
    }
    // Permission error or missing doc proves server connectivity
    return { online: true, message: 'เชื่อมต่อเซิร์ฟเวอร์ Firebase Firestore สำเร็จ' };
  }
}

// ==========================================
// AUTHENTICATION HELPERS
// ==========================================
export function isBootstrappedAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase());
}

export function isFirebaseReady(): boolean {
  return Boolean(db && firebaseApp);
}

export function isUserAuthenticated(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

export function getCurrentFirebaseUser(): User | null {
  return auth.currentUser;
}

export function onFirebaseAuthChanged(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithFirebaseGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, basicGoogleProvider);
  return res.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

// ==========================================
// STRICT SANITIZATION HELPERS (MATCH FIRESTORE RULES)
// ==========================================
export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'ID'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128);
  if (!cleaned || !/[a-zA-Z0-9]/.test(cleaned)) {
    return `${fallbackPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 128);
  }
  return cleaned;
}

function clampString(val: unknown, maxLen: number): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().slice(0, maxLen);
}

function clampNullableString(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s ? s.slice(0, maxLen) : null;
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toValidNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function formatTimestampField(ts: unknown): string | undefined {
  if (!ts) return undefined;
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (typeof ts === 'string') return ts;
  return undefined;
}

function buildScopedCollectionQuery(collectionName: string): Query<DocumentData> {
  const colRef = collection(db, collectionName);
  return colRef;
}

// ==========================================
// DATA MAPPERS & PAYLOAD BUILDERS
// ==========================================
function mapStudentDoc(data: DocumentData): Student {
  const studentId = String(data.student_id || '').trim();
  const qrCode = String(data.qr_code || studentId).trim();
  const grade = String(data.grade || 'แผนกทั่วไป');
  const room = data.room ? String(data.room) : '';
  const dorm = String(data.dorm || 'หอ A');
  const carId = String(data.car_id || 'CAR01');
  const nickname = data.nickname ? String(data.nickname) : undefined;
  const parentName = data.parent_name ? String(data.parent_name) : undefined;
  const pickupPoint = data.pickup_point ? String(data.pickup_point) : undefined;
  const seatNumber = data.seat_number != null ? Number(data.seat_number) : undefined;
  const latitude = data.latitude != null ? Number(data.latitude) : null;
  const longitude = data.longitude != null ? Number(data.longitude) : null;
  const mapLink = data.map_link ? String(data.map_link) : undefined;
  const qrImage = data.qr_image
    ? String(data.qr_image)
    : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode || studentId)}`;

  let avatarColor = data.avatarColor ? String(data.avatarColor) : 'bg-indigo-500';
  if (!data.avatarColor) {
    if (dorm.includes('B')) avatarColor = 'bg-blue-500';
    else if (dorm.includes('C')) avatarColor = 'bg-amber-500';
    else if (dorm.includes('D')) avatarColor = 'bg-emerald-500';
    else if (dorm.includes('E')) avatarColor = 'bg-rose-500';
  }

  const resolvedClassName = String(data.className || (room ? `${grade}/${room}` : grade));

  return {
    id: studentId,
    student_id: studentId,
    studentId,
    studentCode: qrCode || studentId,
    qrCode,
    qr_code: qrCode,
    name: String(data.name || ''),
    nickname,
    grade,
    classroom: resolvedClassName,
    className: resolvedClassName,
    room,
    number: seatNumber,
    seatNumber,
    seat_number: seatNumber,
    dorm,
    carID: carId,
    car_id: carId,
    plate: String(data.plate || '1กข 1234'),
    busNumber: carId,
    dormOrStop: pickupPoint || dorm,
    busStopName: pickupPoint || dorm,
    pickup: pickupPoint,
    pickupPoint,
    pickup_point: pickupPoint,
    parent: parentName,
    parentName,
    parent_name: parentName,
    parentPhone: String(data.parent_phone || '0810000000'),
    parent_phone: String(data.parent_phone || '0810000000'),
    status: String(data.status || 'ใช้งาน'),
    latitude,
    longitude,
    mapLink,
    map_link: mapLink,
    avatarColor,
    qrUrl: qrImage,
    qrImage,
    qr_image: qrImage,
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    created_at: formatTimestampField(data.createdAt),
    updated_at: formatTimestampField(data.updatedAt),
  };
}

function buildStudentPayload(student: Student, ownerId: string, isCreate: boolean): Record<string, unknown> {
  const studentId = sanitizeFirestoreId(
    student.student_id || student.studentId || student.id || student.studentCode || '',
    'STD'
  );
  const qrCode = clampString(student.qr_code || student.qrCode || student.studentCode || studentId, 200) || studentId;
  const grade = clampString(student.grade || 'แผนกทั่วไป', 50) || 'แผนกทั่วไป';
  let room = clampString(student.room || '', 50);
  if (!room && student.className && student.className.includes('/')) {
    room = clampString(student.className.split('/')[1] || '', 50);
  }
  const className = clampNullableString(
    student.className || student.classroom || (room ? `${grade}/${room}` : grade),
    100
  );
  const dorm = clampString(student.dorm || student.dormOrStop || 'หอ A', 100) || 'หอ A';
  const carId = clampString(student.car_id || student.carID || student.busNumber || 'CAR01', 128) || 'CAR01';
  const qrImage = clampNullableString(
    student.qr_image ||
      student.qrImage ||
      student.qrUrl ||
      `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`,
    500
  );

  let avatarColor = student.avatarColor || 'bg-indigo-500';
  if (dorm.includes('B')) avatarColor = 'bg-blue-500';
  else if (dorm.includes('C')) avatarColor = 'bg-amber-500';
  else if (dorm.includes('D')) avatarColor = 'bg-emerald-500';
  else if (dorm.includes('E')) avatarColor = 'bg-rose-500';

  const payload: Record<string, unknown> = {
    student_id: studentId,
    qr_code: qrCode,
    name: clampString(student.name || 'พนักงาน', 200) || 'พนักงาน',
    nickname: clampNullableString(student.nickname, 100),
    grade,
    room: clampNullableString(room, 50),
    className,
    seat_number: toNullableNumber(student.seat_number ?? student.seatNumber ?? student.number),
    dorm,
    car_id: carId,
    plate: clampNullableString(student.plate || '1กข 1234', 50),
    pickup_point: clampNullableString(
      student.pickup_point || student.pickupPoint || student.pickup || student.busStopName || student.dormOrStop,
      300
    ),
    latitude: toNullableNumber(student.latitude ?? student.lat),
    longitude: toNullableNumber(student.longitude ?? student.lng),
    map_link: clampNullableString(student.map_link || student.mapLink, 500),
    parent_name: clampNullableString(student.parent_name || student.parentName || student.parent, 200),
    parent_phone: clampNullableString(student.parent_phone || student.parentPhone || '0810000000', 50),
    status: clampString(student.status || 'ใช้งาน', 50) || 'ใช้งาน',
    qr_image: qrImage,
    avatarColor: clampNullableString(avatarColor, 50),
    ownerId,
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

function mapCarDoc(data: DocumentData): Car {
  return {
    carID: String(data.car_id || ''),
    plate: String(data.plate_number || ''),
    plateNumber: String(data.plate_number || ''),
    name: String(data.name || ''),
    route: String(data.route || ''),
    driver: String(data.driver_name || ''),
    driverPhone: String(data.driver_phone || ''),
    attendant: String(data.attendant_name || ''),
    capacity: Number(data.capacity || 60),
    status: String(data.status || 'ใช้งาน'),
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
  };
}

function buildCarPayload(car: Car, ownerId: string, isCreate: boolean): Record<string, unknown> {
  const carId = sanitizeFirestoreId(car.carID || '', 'CAR');
  const rawCapacity = Number(car.capacity);
  const capacity = Number.isFinite(rawCapacity) ? Math.min(500, Math.max(1, Math.round(rawCapacity))) : 60;

  const payload: Record<string, unknown> = {
    car_id: carId,
    plate_number: clampString(car.plate || car.plateNumber || '1กข 1234', 50) || '1กข 1234',
    name: clampString(car.name || carId, 200) || carId,
    route: clampNullableString(car.route || 'สายทั่วไป', 200),
    driver_name: clampNullableString(car.driver || 'พนักงานขับรถ', 200),
    driver_phone: clampNullableString(car.driverPhone || '081-000-0000', 50),
    attendant_name: clampNullableString(car.attendant || 'เจ้าหน้าที่ประจำรถ', 200),
    capacity,
    status: clampString(car.status || 'ใช้งาน', 50) || 'ใช้งาน',
    ownerId,
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

function mapScanDoc(data: DocumentData): ScanRecord {
  const scanDate = String(data.scan_date || '');
  const scanTime = String(data.scan_time || '');
  const studentId = String(data.student_id || '');
  const timestamp =
    typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
      ? data.timestamp
      : Date.now();

  return {
    id: String(data.scan_id || `SCN-${timestamp}`),
    scanId: String(data.scan_id || `SCN-${timestamp}`),
    timestamp,
    dateThai: String(data.dateThai || scanDate),
    timeThai: String(data.timeThai || (scanTime ? `${scanTime} น.` : '')),
    time: String(data.timeThai || (scanTime ? `${scanTime} น.` : '')),
    studentId,
    studentCode: studentId,
    name: String(data.student_name || 'พนักงาน'),
    grade: String(data.grade || 'แผนกทั่วไป'),
    dorm: data.dorm ? String(data.dorm) : undefined,
    carID: data.car_id ? String(data.car_id) : undefined,
    plate: data.plate_number ? String(data.plate_number) : undefined,
    busNumber: String(data.car_id || 'CAR01'),
    locationName: String(data.location_name || data.dorm || 'จุดรับส่ง'),
    latitude: typeof data.latitude === 'number' ? data.latitude : 13.7548,
    longitude: typeof data.longitude === 'number' ? data.longitude : 100.4982,
    scanSource:
      data.scan_source === 'upload' || data.scan_source === 'simulated' || data.scan_source === 'scanner'
        ? data.scan_source
        : 'camera',
    status: 'success',
    scanType: String(data.scan_type || 'ขึ้นรถ'),
    scannerName: String(data.scanner_by || 'เจ้าหน้าที่'),
    device: String(data.scanner_device || 'MOBILE01'),
    note: data.note ? String(data.note) : undefined,
    avatar: data.avatar ? String(data.avatar) : undefined,
    dbSaved: true,
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
  };
}

function buildScanPayload(scan: ScanRecord, ownerId: string, isCreate: boolean): Record<string, unknown> {
  const scanId = sanitizeFirestoreId(scan.scanId || scan.id || '', 'SCN');
  const ts = typeof scan.timestamp === 'number' && Number.isFinite(scan.timestamp) && scan.timestamp >= 0
    ? scan.timestamp
    : Date.now();
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const scanDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const scanTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const scanType = scan.scanType === 'ลงรถ' ? 'ลงรถ' : 'ขึ้นรถ';
  const scanSource =
    scan.scanSource === 'upload' || scan.scanSource === 'simulated' || scan.scanSource === 'scanner'
      ? scan.scanSource
      : 'camera';

  const payload: Record<string, unknown> = {
    scan_id: scanId,
    timestamp: ts,
    scan_date: clampString(scanDate, 30),
    dateThai: clampNullableString(scan.dateThai || scanDate, 50),
    scan_time: clampString(scanTime, 30),
    timeThai: clampNullableString(scan.timeThai || scan.time || `${scanTime} น.`, 50),
    student_id: clampString(scan.studentCode || scan.studentId || '', 128),
    student_name: clampString(scan.name || 'พนักงาน', 200) || 'พนักงาน',
    grade: clampNullableString(scan.grade || 'แผนกทั่วไป', 100),
    car_id: clampString(scan.carID || scan.busNumber || 'CAR01', 128) || 'CAR01',
    plate_number: clampNullableString(scan.plate || '1กข 1234', 50),
    dorm: clampNullableString(scan.dorm || 'หอ A', 200),
    location_name: clampNullableString(scan.locationName || scan.dorm || 'จุดรับส่ง', 300),
    scan_type: scanType,
    scan_source: scanSource,
    scanner_by: clampNullableString(scan.scannerName || 'เจ้าหน้าที่', 200),
    scanner_device: clampNullableString(scan.device || 'MOBILE01', 100),
    scan_result: clampNullableString('สำเร็จ', 50),
    note: clampNullableString(scan.note || '', 500),
    latitude: toValidNumber(scan.latitude, 13.7548),
    longitude: toValidNumber(scan.longitude, 100.4982),
    avatar: clampNullableString(scan.avatar, 500),
    ownerId,
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

function mapAppUserDoc(data: DocumentData): AppUser {
  const role =
    data.role === 'Admin' || data.role === 'Staff' || data.role === 'Viewer'
      ? data.role
      : 'Staff';
  return {
    user_id: String(data.user_id || ''),
    name: String(data.name || ''),
    email: String(data.email || ''),
    role,
    car_id: String(data.car_id || 'ALL'),
    status: String(data.status || 'ใช้งาน'),
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
  };
}

function buildAppUserPayload(appUser: AppUser, ownerId: string, isCreate: boolean): Record<string, unknown> {
  const userId = sanitizeFirestoreId(appUser.user_id || '', 'USR');
  const role: 'Admin' | 'Staff' | 'Viewer' =
    appUser.role === 'Admin' || appUser.role === 'Staff' || appUser.role === 'Viewer'
      ? appUser.role
      : 'Staff';
  const email = clampString(appUser.email || `${userId.toLowerCase()}@example.com`, 200);
  const validEmail = email.length >= 3 ? email : `${userId}@school.local`;

  const payload: Record<string, unknown> = {
    user_id: userId,
    name: clampString(appUser.name || userId, 200) || userId,
    email: validEmail,
    role,
    car_id: clampString(appUser.car_id || 'ALL', 128) || 'ALL',
    status: clampString(appUser.status || 'ใช้งาน', 50) || 'ใช้งาน',
    ownerId,
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

function mapSettingDoc(data: DocumentData): SystemSetting {
  return {
    key: String(data.key || ''),
    value: String(data.value || ''),
    description: String(data.description || ''),
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
  };
}

function buildSettingPayload(setting: SystemSetting, ownerId: string, isCreate: boolean): Record<string, unknown> {
  const key = sanitizeFirestoreId(setting.key || '', 'setting');
  const payload: Record<string, unknown> = {
    key,
    value: clampString(setting.value ?? '', 500),
    description: clampString(setting.description ?? '', 300),
    ownerId,
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

// ==========================================
// 1. STUDENTS CRUD (FIRESTORE)
// ==========================================
export async function fetchStudentsFromFirebase(): Promise<{
  success: boolean;
  data: Student[];
  error?: string;
}> {
  try {
    const q = buildScopedCollectionQuery('students');
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => mapStudentDoc(d.data()));
    list.sort((a, b) => a.id.localeCompare(b.id));
    return { success: true, data: list };
  } catch (err) {
    console.warn('fetchStudentsFromFirebase warning:', err);
    return { success: false, data: [] };
  }
}

export async function upsertStudentToFirebase(
  student: Student
): Promise<{ success: boolean; error?: string; data?: Student }> {
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const studentId = sanitizeFirestoreId(
    student.student_id || student.studentId || student.id || student.studentCode || '',
    'STD'
  );
  const path = `students/${studentId}`;

  try {
    const carId = clampString(student.car_id || student.carID || student.busNumber || 'CAR01', 128);
    if (carId) {
      await ensureCarExistsInFirebase(carId, student.plate || '1กข 1234');
    }

    const docRef = doc(db, 'students', studentId);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      const existingOwner = String(existingData.ownerId || ownerId);
      const payload = buildStudentPayload({ ...student, id: studentId, student_id: studentId }, existingOwner, false);
      delete payload.ownerId;
      delete payload.student_id;
      await updateDoc(docRef, payload);
      return { success: true, data: { ...student, id: studentId, student_id: studentId } };
    } else {
      const payload = buildStudentPayload({ ...student, id: studentId, student_id: studentId }, ownerId, true);
      await setDoc(docRef, payload);
      return { success: true, data: { ...student, id: studentId, student_id: studentId } };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteStudentFromFirebase(
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanId = sanitizeFirestoreId(studentId, 'STD');
  const path = `students/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'students', cleanId));
    return { success: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// 2. CARS CRUD (FIRESTORE)
// ==========================================
export async function fetchCarsFromFirebase(): Promise<{
  success: boolean;
  data: Car[];
  error?: string;
}> {
  try {
    const q = buildScopedCollectionQuery('cars');
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => mapCarDoc(d.data()));
    list.sort((a, b) => a.carID.localeCompare(b.carID));
    return { success: true, data: list };
  } catch (err) {
    console.warn('fetchCarsFromFirebase warning:', err);
    return { success: false, data: [] };
  }
}

export async function ensureCarExistsInFirebase(
  carId: string,
  plateNumber = '1กข 1234'
): Promise<void> {
  if (!carId) return;
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const cleanCarId = sanitizeFirestoreId(carId, 'CAR');
  const docRef = doc(db, 'cars', cleanCarId);
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      const payload = buildCarPayload(
        {
          carID: cleanCarId,
          plate: plateNumber || '1กข 1234',
          name: cleanCarId,
          route: 'สายทั่วไป',
          driver: 'พนักงานขับรถ',
          driverPhone: '081-000-0000',
          attendant: 'เจ้าหน้าที่ประจำรถ',
          capacity: 60,
          status: 'ใช้งาน',
        },
        ownerId,
        true
      );
      await setDoc(docRef, payload);
    }
  } catch {
    // Do not break student/scan write if car lookup fails
  }
}

export async function upsertCarToFirebase(
  car: Car
): Promise<{ success: boolean; error?: string; data?: Car }> {
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const carId = sanitizeFirestoreId(car.carID, 'CAR');
  const path = `cars/${carId}`;
  try {
    const docRef = doc(db, 'cars', carId);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const existingOwner = String(existingSnap.data().ownerId || ownerId);
      const payload = buildCarPayload({ ...car, carID: carId }, existingOwner, false);
      delete payload.ownerId;
      delete payload.car_id;
      await updateDoc(docRef, payload);
      return { success: true, data: { ...car, carID: carId } };
    } else {
      const payload = buildCarPayload({ ...car, carID: carId }, ownerId, true);
      await setDoc(docRef, payload);
      return { success: true, data: { ...car, carID: carId } };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCarFromFirebase(
  carId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanId = sanitizeFirestoreId(carId, 'CAR');
  const path = `cars/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'cars', cleanId));
    return { success: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// 2.5 PERSISTENT PENDING QUEUES FOR CARS & STUDENTS
// ==========================================
const STORAGE_KEY_PENDING_CARS = 'qr_bus_pending_cars_firebase';
const STORAGE_KEY_PENDING_STUDENTS = 'qr_bus_pending_students_firebase';

export function getPendingCars(): Car[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_CARS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePendingCar(car: Car): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getPendingCars().filter((c) => c.carID !== car.carID);
    list.push(car);
    localStorage.setItem(STORAGE_KEY_PENDING_CARS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save pending car:', e);
  }
}

export function removePendingCar(carId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = sanitizeFirestoreId(carId, 'CAR');
    const list = getPendingCars().filter(
      (c) => c.carID !== carId && sanitizeFirestoreId(c.carID, 'CAR') !== clean
    );
    localStorage.setItem(STORAGE_KEY_PENDING_CARS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to remove pending car:', e);
  }
}

export function mergeCarsWithPending(remoteCars: Car[]): Car[] {
  const pending = getPendingCars();
  if (pending.length === 0) return remoteCars;
  const map = new Map<string, Car>();
  remoteCars.forEach((c) => map.set(c.carID, c));
  pending.forEach((c) => map.set(c.carID, c));
  return Array.from(map.values()).sort((a, b) => a.carID.localeCompare(b.carID));
}

export async function syncPendingCars(): Promise<{ success: boolean; syncedCount: number }> {
  if (!isFirebaseReady()) return { success: false, syncedCount: 0 };
  const pending = getPendingCars();
  if (pending.length === 0) return { success: true, syncedCount: 0 };

  let count = 0;
  for (const car of pending) {
    try {
      const res = await upsertCarToFirebase(car);
      if (res.success) {
        removePendingCar(car.carID);
        count++;
      }
    } catch {
      // Keep remaining cars queued
    }
  }
  return { success: true, syncedCount: count };
}

export function getPendingStudents(): Student[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_STUDENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePendingStudent(student: Student): void {
  if (typeof window === 'undefined') return;
  try {
    const key = student.id || student.studentCode;
    const list = getPendingStudents().filter(
      (s) => s.id !== key && s.studentCode !== student.studentCode
    );
    list.unshift(student);
    localStorage.setItem(STORAGE_KEY_PENDING_STUDENTS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save pending student:', e);
  }
}

export function removePendingStudent(idOrCode: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = sanitizeFirestoreId(idOrCode, 'STD');
    const list = getPendingStudents().filter(
      (s) =>
        s.id !== idOrCode &&
        s.studentCode !== idOrCode &&
        sanitizeFirestoreId(s.id || s.studentCode, 'STD') !== clean
    );
    localStorage.setItem(STORAGE_KEY_PENDING_STUDENTS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to remove pending student:', e);
  }
}

export function mergeStudentsWithPending(remoteStudents: Student[]): Student[] {
  const pending = getPendingStudents();
  if (pending.length === 0) return remoteStudents;
  const map = new Map<string, Student>();
  remoteStudents.forEach((s) => map.set(s.id || s.studentCode, s));
  pending.forEach((s) => map.set(s.id || s.studentCode, s));
  return Array.from(map.values());
}

export async function syncPendingStudents(): Promise<{ success: boolean; syncedCount: number }> {
  if (!isFirebaseReady()) return { success: false, syncedCount: 0 };
  const pending = getPendingStudents();
  if (pending.length === 0) return { success: true, syncedCount: 0 };

  let count = 0;
  for (const stu of pending) {
    try {
      const res = await upsertStudentToFirebase(stu);
      if (res.success) {
        removePendingStudent(stu.id || stu.studentCode);
        count++;
      }
    } catch {
      // Keep remaining students queued
    }
  }
  return { success: true, syncedCount: count };
}

// ==========================================
// 3. SCANS CRUD & OFFLINE RECOVERY QUEUE
// ==========================================
const STORAGE_KEY_PENDING_SCANS = 'qr_bus_pending_scans_firebase';

export function getPendingScans(): ScanRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_SCANS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePendingScan(scan: ScanRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getPendingScans();
    const scanId = scan.scanId || scan.id;
    if (!list.some((s) => (s.scanId || s.id) === scanId)) {
      list.push(scan);
      localStorage.setItem(STORAGE_KEY_PENDING_SCANS, JSON.stringify(list));
    }
  } catch (e) {
    console.warn('Failed to save pending scan:', e);
  }
}

export function removePendingScan(scanId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = sanitizeFirestoreId(scanId, 'SCN');
    const list = getPendingScans().filter(
      (s) => (s.scanId || s.id) !== scanId && s.id !== scanId && sanitizeFirestoreId(s.scanId || s.id, 'SCN') !== clean
    );
    localStorage.setItem(STORAGE_KEY_PENDING_SCANS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to remove pending scan:', e);
  }
}

export function clearPendingScans(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_PENDING_SCANS);
  } catch (e) {
    console.warn('Failed to clear pending scans:', e);
  }
}

export function mergeScansWithPending(remoteScans: ScanRecord[]): ScanRecord[] {
  const pending = getPendingScans();
  if (pending.length === 0) return remoteScans;
  const map = new Map<string, ScanRecord>();
  remoteScans.forEach((s) => map.set(s.scanId || s.id, s));
  pending.forEach((s) => {
    const key = s.scanId || s.id;
    if (!map.has(key)) {
      map.set(key, s);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function syncPendingScans(): Promise<{
  success: boolean;
  syncedCount: number;
  error?: string;
}> {
  if (!isFirebaseReady()) {
    return { success: false, syncedCount: 0, error: 'ยังไม่ได้เข้าสู่ระบบ Firebase' };
  }

  const pending = getPendingScans();
  if (pending.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  let successCount = 0;
  for (const scan of pending) {
    try {
      const res = await insertScanToFirebase(scan, { skipQueue: true });
      if (res.success) {
        removePendingScan(scan.scanId || scan.id);
        successCount++;
      }
    } catch {
      // keep remaining scans queued
    }
  }

  return { success: true, syncedCount: successCount };
}

export async function fetchScansFromFirebase(): Promise<{
  success: boolean;
  data: ScanRecord[];
  error?: string;
}> {
  try {
    const q = buildScopedCollectionQuery('scans');
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => mapScanDoc(d.data()));
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { success: true, data: list };
  } catch (err) {
    console.warn('fetchScansFromFirebase warning:', err);
    return { success: false, data: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function insertScanToFirebase(
  scan: ScanRecord,
  options?: {
    skipQueue?: boolean;
    student?: Student;
    isNewScan?: boolean;
    skipStudentUpsert?: boolean;
  }
): Promise<{ success: boolean; error?: string; isOfflineQueued?: boolean }> {
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const scanId = sanitizeFirestoreId(scan.scanId || scan.id || '', 'SCN');
  const path = `scans/${scanId}`;

  try {
    const docRef = doc(db, 'scans', scanId);

    // Write the scan document immediately without waiting for secondary student/car reads
    if (options?.isNewScan) {
      const payload = buildScanPayload({ ...scan, id: scanId, scanId }, ownerId, true);
      await setDoc(docRef, payload);
    } else {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const existingOwner = String(existingSnap.data().ownerId || ownerId);
        const payload = buildScanPayload({ ...scan, id: scanId, scanId }, existingOwner, false);
        delete payload.ownerId;
        delete payload.scan_id;
        await updateDoc(docRef, payload);
      } else {
        const payload = buildScanPayload({ ...scan, id: scanId, scanId }, ownerId, true);
        await setDoc(docRef, payload);
      }
    }

    removePendingScan(scan.scanId || scan.id);
    removePendingScan(scanId);

    // Sync unknown student / missing car in background so the scan save is instantaneous
    if (!options?.skipStudentUpsert) {
      const studentId = sanitizeFirestoreId(scan.studentCode || scan.studentId || '', 'STD');
      const carId = clampString(scan.carID || scan.busNumber || 'CAR01', 128);
      void Promise.resolve().then(async () => {
        if (options?.student) {
          await upsertStudentToFirebase(options.student).catch(() => {});
        } else if (studentId) {
          await upsertStudentToFirebase({
            id: studentId,
            studentCode: studentId,
            name: scan.name || 'พนักงาน',
            grade: scan.grade || 'แผนกทั่วไป',
            dorm: scan.dorm || 'หอ A',
            carID: carId || 'CAR01',
            busNumber: carId || 'CAR01',
            dormOrStop: scan.locationName || 'จุดรับส่ง',
            parentPhone: '081-000-0000',
          }).catch(() => {});
        }
        if (carId) {
          await ensureCarExistsInFirebase(carId, scan.plate || '1กข 1234').catch(() => {});
        }
      });
    }

    return { success: true };
  } catch (err) {
    if (!options?.skipQueue) {
      savePendingScan(scan);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteScanFromFirebase(
  scanId: string
): Promise<{ success: boolean; error?: string }> {
  removePendingScan(scanId);
  if (!auth.currentUser) {
    return { success: false, error: 'กรุณาเข้าสู่ระบบ Google ก่อนลบรายการสแกน' };
  }
  const cleanId = sanitizeFirestoreId(scanId, 'SCN');
  const path = `scans/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'scans', cleanId));
    return { success: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllScansInFirebase(): Promise<{
  success: boolean;
  error?: string;
  deletedCount?: number;
}> {
  clearPendingScans();
  if (!auth.currentUser) {
    return { success: false, error: 'กรุณาเข้าสู่ระบบ Google ก่อนล้างประวัติสแกน' };
  }

  try {
    const q = buildScopedCollectionQuery('scans');
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { success: true, deletedCount: 0 };
    }

    const docs = snapshot.docs;
    const chunkSize = 200;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    return { success: true, deletedCount: docs.length };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'scans');
  }
}

// ==========================================
// 4. USERS & SETTINGS CRUD (FIRESTORE)
// ==========================================
export async function fetchUsersFromFirebase(): Promise<AppUser[]> {
  if (!auth.currentUser) return [];
  try {
    const q = buildScopedCollectionQuery('users');
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => mapAppUserDoc(d.data()));
    list.sort((a, b) => a.user_id.localeCompare(b.user_id));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function upsertUserToFirebase(appUser: AppUser): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อนบันทึกผู้ใช้งาน');

  const userId = sanitizeFirestoreId(appUser.user_id, 'USR');
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const ownerId = String(snap.data().ownerId || user.uid);
      const payload = buildAppUserPayload({ ...appUser, user_id: userId }, ownerId, false);
      delete payload.ownerId;
      delete payload.user_id;
      await updateDoc(docRef, payload);
    } else {
      const payload = buildAppUserPayload({ ...appUser, user_id: userId }, user.uid, true);
      await setDoc(docRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirebase(userId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อนลบผู้ใช้งาน');
  const cleanId = sanitizeFirestoreId(userId, 'USR');
  try {
    await deleteDoc(doc(db, 'users', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${cleanId}`);
  }
}

export async function fetchSettingsFromFirebase(): Promise<SystemSetting[]> {
  if (!auth.currentUser) return [];
  try {
    const q = buildScopedCollectionQuery('settings');
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => mapSettingDoc(d.data()));
    list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'settings');
  }
}

export async function upsertSettingToFirebase(setting: SystemSetting): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อนบันทึกการตั้งค่า');

  const key = sanitizeFirestoreId(setting.key, 'setting');
  const path = `settings/${key}`;
  try {
    const docRef = doc(db, 'settings', key);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const ownerId = String(snap.data().ownerId || user.uid);
      const payload = buildSettingPayload({ ...setting, key }, ownerId, false);
      delete payload.ownerId;
      delete payload.key;
      await updateDoc(docRef, payload);
    } else {
      const payload = buildSettingPayload({ ...setting, key }, user.uid, true);
      await setDoc(docRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSettingFromFirebase(key: string): Promise<void> {
  if (!auth.currentUser) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อนลบการตั้งค่า');
  const cleanKey = sanitizeFirestoreId(key, 'setting');
  try {
    await deleteDoc(doc(db, 'settings', cleanKey));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `settings/${cleanKey}`);
  }
}

// ==========================================
// 5. REALTIME ONSNAPSHOT SUBSCRIPTIONS
// ==========================================
export function subscribeToFirebaseRealtime(handlers: {
  onStudents?: (students: Student[]) => void;
  onCars?: (cars: Car[]) => void;
  onScans?: (scans: ScanRecord[]) => void;
  onUsers?: (users: AppUser[]) => void;
  onSettings?: (settings: SystemSetting[]) => void;
}): () => void {
  const unsubs: Unsubscribe[] = [];

  if (handlers.onStudents) {
    const qStudents = buildScopedCollectionQuery('students');
    unsubs.push(
      onSnapshot(
        qStudents,
        (snap) => {
          const rows = snap.docs.map((d) => mapStudentDoc(d.data()));
          rows.sort((a, b) => a.id.localeCompare(b.id));
          handlers.onStudents?.(rows);
        },
        (err) => console.warn('Realtime students snapshot warning:', err)
      )
    );
  }

  if (handlers.onCars) {
    const qCars = buildScopedCollectionQuery('cars');
    unsubs.push(
      onSnapshot(
        qCars,
        (snap) => {
          const rows = snap.docs.map((d) => mapCarDoc(d.data()));
          rows.sort((a, b) => a.carID.localeCompare(b.carID));
          handlers.onCars?.(rows);
        },
        (err) => console.warn('Realtime cars snapshot warning:', err)
      )
    );
  }

  if (handlers.onScans) {
    const qScans = buildScopedCollectionQuery('scans');
    unsubs.push(
      onSnapshot(
        qScans,
        (snap) => {
          const rows = snap.docs.map((d) => mapScanDoc(d.data()));
          rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          handlers.onScans?.(rows);
        },
        (err) => console.warn('Realtime scans snapshot warning:', err)
      )
    );
  }

  if (handlers.onUsers && auth.currentUser && auth.currentUser.emailVerified) {
    const qUsers = buildScopedCollectionQuery('users');
    unsubs.push(
      onSnapshot(
        qUsers,
        (snap) => {
          const rows = snap.docs.map((d) => mapAppUserDoc(d.data()));
          rows.sort((a, b) => a.user_id.localeCompare(b.user_id));
          handlers.onUsers?.(rows);
        },
        (err) => console.warn('Realtime users snapshot warning:', err)
      )
    );
  }

  if (handlers.onSettings && auth.currentUser && auth.currentUser.emailVerified) {
    const qSettings = buildScopedCollectionQuery('settings');
    unsubs.push(
      onSnapshot(
        qSettings,
        (snap) => {
          const rows = snap.docs.map((d) => mapSettingDoc(d.data()));
          rows.sort((a, b) => a.key.localeCompare(b.key));
          handlers.onSettings?.(rows);
        },
        (err) => console.warn('Realtime settings snapshot warning:', err)
      )
    );
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

// ==========================================
// 6. FULL DATABASE MIGRATION & BATCH SEED (300 STUDENTS + ALL COLLECTIONS)
// ==========================================
export async function importStudentsBatchToFirebase(
  studentsList: Student[],
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; count: number }> {
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const existingSnap = await getDocs(buildScopedCollectionQuery('students'));
  const existingMap = new Map<string, string>();
  existingSnap.docs.forEach((d) => {
    const data = d.data();
    existingMap.set(d.id, String(data.ownerId || ownerId));
  });

  const chunkSize = 200;
  let processed = 0;

  for (let i = 0; i < studentsList.length; i += chunkSize) {
    const chunk = studentsList.slice(i, i + chunkSize);
    const batch = writeBatch(db);

    for (const student of chunk) {
      const studentId = sanitizeFirestoreId(
        student.student_id || student.studentId || student.id || student.studentCode || '',
        'STD'
      );
      const docRef = doc(db, 'students', studentId);
      const existingOwner = existingMap.get(studentId);
      if (existingOwner) {
        const payload = buildStudentPayload({ ...student, id: studentId, student_id: studentId }, existingOwner, false);
        delete payload.ownerId;
        delete payload.student_id;
        batch.update(docRef, payload);
      } else {
        const payload = buildStudentPayload({ ...student, id: studentId, student_id: studentId }, ownerId, true);
        batch.set(docRef, payload);
      }
    }

    await batch.commit();
    processed += chunk.length;
    onProgress?.(processed, studentsList.length);
  }

  return { success: true, count: processed };
}

export interface MigrationProgress {
  step: string;
  completed: number;
  total: number;
}

export async function seedAllInitialDataToFirebase(options?: {
  includeSampleScans?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
}): Promise<{
  studentsCount: number;
  carsCount: number;
  usersCount: number;
  settingsCount: number;
  scansCount: number;
}> {
  const user = auth.currentUser;
  const ownerId = user?.uid || 'system';

  const includeSampleScans = options?.includeSampleScans ?? false;
  const totalItems =
    FIREBASE_CARS.length +
    FIREBASE_STUDENTS.length +
    FIREBASE_USERS.length +
    FIREBASE_SETTINGS.length +
    (includeSampleScans ? FIREBASE_SCANS.length : 0);

  let completed = 0;
  const report = (step: string) => {
    options?.onProgress?.({ step, completed, total: totalItems });
  };

  // 1. Cars (5 docs)
  report('กำลังสร้างตาราง cars (รถรับส่ง 5 คัน)...');
  const existingCarsSnap = await getDocs(buildScopedCollectionQuery('cars'));
  const existingCarOwners = new Map<string, string>();
  existingCarsSnap.docs.forEach((d) => existingCarOwners.set(d.id, String(d.data().ownerId || ownerId)));

  {
    const batch = writeBatch(db);
    for (const car of FIREBASE_CARS) {
      const carId = sanitizeFirestoreId(car.carID, 'CAR');
      const docRef = doc(db, 'cars', carId);
      const existingOwner = existingCarOwners.get(carId);
      if (existingOwner) {
        const payload = buildCarPayload({ ...car, carID: carId }, existingOwner, false);
        delete payload.ownerId;
        delete payload.car_id;
        batch.update(docRef, payload);
      } else {
        batch.set(docRef, buildCarPayload({ ...car, carID: carId }, ownerId, true));
      }
    }
    await batch.commit();
    completed += FIREBASE_CARS.length;
    report('สร้างตาราง cars สำเร็จ (5 คัน)');
  }

  // 2. Employees (300 docs in chunks of 150)
  report('กำลังย้ายรายชื่อพนักงานทั้งหมด 300 คน เข้า Firebase...');
  const existingStuSnap = await getDocs(buildScopedCollectionQuery('students'));
  const existingStuOwners = new Map<string, string>();
  existingStuSnap.docs.forEach((d) => existingStuOwners.set(d.id, String(d.data().ownerId || ownerId)));

  const studentChunkSize = 150;
  for (let i = 0; i < FIREBASE_STUDENTS.length; i += studentChunkSize) {
    const chunk = FIREBASE_STUDENTS.slice(i, i + studentChunkSize);
    const batch = writeBatch(db);
    for (const stu of chunk) {
      const studentId = sanitizeFirestoreId(stu.id || stu.studentCode, 'STD');
      const docRef = doc(db, 'students', studentId);
      const existingOwner = existingStuOwners.get(studentId);
      if (existingOwner) {
        const payload = buildStudentPayload({ ...stu, id: studentId, student_id: studentId }, existingOwner, false);
        delete payload.ownerId;
        delete payload.student_id;
        batch.update(docRef, payload);
      } else {
        batch.set(docRef, buildStudentPayload({ ...stu, id: studentId, student_id: studentId }, ownerId, true));
      }
    }
    await batch.commit();
    completed += chunk.length;
    report(`ย้ายรายชื่อพนักงานแล้ว ${Math.min(i + chunk.length, FIREBASE_STUDENTS.length)} / ${FIREBASE_STUDENTS.length} คน`);
  }

  // 3. Users (3 docs) - Only if verified admin user
  let seededUsersCount = 0;
  if (user && user.emailVerified) {
    report('กำลังสร้างตาราง users (ผู้ใช้งานระบบ)...');
    const existingUsersSnap = await getDocs(buildScopedCollectionQuery('users'));
    const existingUserOwners = new Map<string, string>();
    existingUsersSnap.docs.forEach((d) => existingUserOwners.set(d.id, String(d.data().ownerId || ownerId)));

    const isAdmin = isBootstrappedAdminEmail(user.email);
    const batch = writeBatch(db);
    for (const rawUser of FIREBASE_USERS) {
      const role = rawUser.role as 'Admin' | 'Staff' | 'Viewer';
      if (!isAdmin && role === 'Admin') {
        continue;
      }
      const userId = sanitizeFirestoreId(rawUser.user_id, 'USR');
      const docRef = doc(db, 'users', userId);
      const appUser: AppUser = {
        user_id: userId,
        name: rawUser.name,
        email: rawUser.email,
        role,
        car_id: rawUser.car_id,
        status: rawUser.status,
      };
      const existingOwner = existingUserOwners.get(userId);
      if (existingOwner) {
        const payload = buildAppUserPayload(appUser, existingOwner, false);
        delete payload.ownerId;
        delete payload.user_id;
        batch.update(docRef, payload);
      } else {
        batch.set(docRef, buildAppUserPayload(appUser, ownerId, true));
      }
      seededUsersCount++;
    }
    if (seededUsersCount > 0) {
      await batch.commit();
    }
    completed += FIREBASE_USERS.length;
    report(`สร้างตาราง users สำเร็จ (${seededUsersCount} บัญชี)`);
  }

  // 4. Settings (10 docs) - Only if verified user
  if (user && user.emailVerified) {
    report('กำลังสร้างตาราง settings (ตั้งค่าระบบ 10 รายการ)...');
    const existingSettingsSnap = await getDocs(buildScopedCollectionQuery('settings'));
    const existingSettingOwners = new Map<string, string>();
    existingSettingsSnap.docs.forEach((d) => existingSettingOwners.set(d.id, String(d.data().ownerId || ownerId)));

    const batch = writeBatch(db);
    for (const s of FIREBASE_SETTINGS) {
      const key = sanitizeFirestoreId(s.key, 'setting');
      const docRef = doc(db, 'settings', key);
      const existingOwner = existingSettingOwners.get(key);
      if (existingOwner) {
        const payload = buildSettingPayload({ ...s, key }, existingOwner, false);
        delete payload.ownerId;
        delete payload.key;
        batch.update(docRef, payload);
      } else {
        batch.set(docRef, buildSettingPayload({ ...s, key }, ownerId, true));
      }
    }
    await batch.commit();
    completed += FIREBASE_SETTINGS.length;
    report('สร้างตาราง settings สำเร็จ (10 รายการ)');
  }

  // 5. Optional Sample Scans
  let seededScansCount = 0;
  if (includeSampleScans && FIREBASE_SCANS.length > 0) {
    report('กำลังนำเข้าประวัติสแกนตัวอย่าง...');
    const existingScansSnap = await getDocs(buildScopedCollectionQuery('scans'));
    const existingScanOwners = new Map<string, string>();
    existingScansSnap.docs.forEach((d) => existingScanOwners.set(d.id, String(d.data().ownerId || ownerId)));

    const scanChunkSize = 150;
    for (let i = 0; i < FIREBASE_SCANS.length; i += scanChunkSize) {
      const chunk = FIREBASE_SCANS.slice(i, i + scanChunkSize);
      const batch = writeBatch(db);
      for (const sc of chunk) {
        const scanId = sanitizeFirestoreId(sc.scanId || sc.id, 'SCN');
        const docRef = doc(db, 'scans', scanId);
        const existingOwner = existingScanOwners.get(scanId);
        if (existingOwner) {
          const payload = buildScanPayload({ ...sc, id: scanId, scanId }, existingOwner, false);
          delete payload.ownerId;
          delete payload.scan_id;
          batch.update(docRef, payload);
        } else {
          batch.set(docRef, buildScanPayload({ ...sc, id: scanId, scanId }, ownerId, true));
        }
      }
      await batch.commit();
      seededScansCount += chunk.length;
      completed += chunk.length;
      report(`นำเข้าประวัติสแกนแล้ว ${seededScansCount} / ${FIREBASE_SCANS.length} รายการ`);
    }
  }

  return {
    studentsCount: FIREBASE_STUDENTS.length,
    carsCount: FIREBASE_CARS.length,
    usersCount: seededUsersCount,
    settingsCount: FIREBASE_SETTINGS.length,
    scansCount: seededScansCount,
  };
}

export async function ensureDatabaseSeededIfEmpty(
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ seeded: boolean; studentsCount: number }> {
  try {
    const [stuSnap, carSnap] = await Promise.all([
      getDocs(buildScopedCollectionQuery('students')),
      getDocs(buildScopedCollectionQuery('cars')),
    ]);

    if (stuSnap.empty && carSnap.empty) {
      const res = await seedAllInitialDataToFirebase({
        includeSampleScans: false,
        onProgress,
      });
      return { seeded: true, studentsCount: res.studentsCount };
    }

    return { seeded: false, studentsCount: stuSnap.size };
  } catch (err) {
    console.warn('ensureDatabaseSeededIfEmpty notice:', err);
    return { seeded: false, studentsCount: 0 };
  }
}
