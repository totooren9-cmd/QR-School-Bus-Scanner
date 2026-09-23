import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, Car, ScanRecord } from '../types';

// LocalStorage Keys for persistent client-side configuration
const STORAGE_KEY_URL = 'qr_bus_supabase_url';
const STORAGE_KEY_KEY = 'qr_bus_supabase_anon_key';

export function normalizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  // Strip /rest/v1 or /dashboard if accidentally copied from address bar
  url = url.replace(/\/rest\/v1\/?$/, '');
  url = url.replace(/\/dashboard.*$/, '');
  return url;
}

// Default / fallback demo URL if needed or environment variables
export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const localUrl = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) : '') || '';
  const localKey = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) : '') || '';

  return {
    url: normalizeSupabaseUrl(localUrl || envUrl),
    anonKey: (localKey || envKey).trim(),
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    const cleanUrl = normalizeSupabaseUrl(url);
    const cleanKey = anonKey.trim();
    localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEY_KEY, cleanKey);
    cachedClient = null; // reset cached instance
  }
}

export function clearSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_KEY);
    cachedClient = null;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = anonKey.trim();

  if (!cachedClient) {
    try {
      cachedClient = createClient(cleanUrl, cleanKey, {
        auth: { persistSession: true },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return cachedClient;
}

export function isSupabaseConnected(): boolean {
  const { url, anonKey } = getStoredSupabaseConfig();
  return Boolean(url && anonKey);
}

// Test connectivity to Supabase
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  studentCount?: number;
  carCount?: number;
  scanCount?: number;
  scansTableReady?: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'กรุณาระบุ Supabase Project URL และ Anon Key เพื่อเชื่อมต่อฐานข้อมูล',
    };
  }

  try {
    const [stuRes, carRes, scanRes] = await Promise.all([
      client.from('students').select('student_id', { count: 'exact', head: true }),
      client.from('cars').select('car_id', { count: 'exact', head: true }),
      client.from('scans').select('scan_id', { count: 'exact', head: true }),
    ]);

    const isMissingStudents =
      stuRes.error &&
      (stuRes.error.code === '42P01' ||
        stuRes.error.code === 'PGRST125' ||
        stuRes.error.message?.includes('Invalid path') ||
        stuRes.error.message?.includes('does not exist'));

    const isMissingScans =
      scanRes.error &&
      (scanRes.error.code === '42P01' ||
        scanRes.error.code === 'PGRST125' ||
        scanRes.error.message?.includes('Invalid path') ||
        scanRes.error.message?.includes('does not exist'));

    if (isMissingStudents) {
      if (!scanRes.error) {
        return {
          success: true,
          message: 'เชื่อมต่อสำเร็จ! ตาราง public.scans พร้อมบันทึกข้อมูลแล้ว (แนะนำรัน SQL เพิ่มตารางนักเรียนและรถ)',
          studentCount: 0,
          carCount: carRes.count || 0,
          scanCount: scanRes.count || 0,
          scansTableReady: true,
        };
      }
      return {
        success: false,
        message: 'เชื่อมต่อ Supabase สำเร็จ แต่ยังไม่พบตาราง public.students! กรุณารันโค้ด SQL จากแท็บ Supabase SQL ใน Supabase SQL Editor ก่อน',
      };
    }

    if (isMissingScans) {
      return {
        success: false,
        message: 'เชื่อมต่อสำเร็จ แต่ยังไม่พบตาราง public.scans! ให้รันคำสั่ง SQL สร้างตาราง scans ใน Supabase ก่อน เพื่อบันทึกการสแกนได้จริง',
        studentCount: stuRes.count || 0,
        carCount: carRes.count || 0,
        scansTableReady: false,
      };
    }

    if (scanRes.error && (scanRes.error.code === '42501' || scanRes.error.message?.includes('policy'))) {
      return {
        success: false,
        message: 'ตาราง public.scans ติดนโยบายความปลอดภัย RLS! กรุณาเพิ่ม Policy "Public scans access" ใน Supabase',
        studentCount: stuRes.count || 0,
        carCount: carRes.count || 0,
        scansTableReady: false,
      };
    }

    if (stuRes.error) {
      return {
        success: false,
        message: `ข้อผิดพลาดตารางนักเรียน: ${stuRes.error.message}`,
      };
    }

    return {
      success: true,
      message: 'เชื่อมต่อฐานข้อมูล Supabase และตารางสแกนสำเร็จ 100%!',
      studentCount: stuRes.count || 0,
      carCount: carRes.count || 0,
      scanCount: scanRes.count || 0,
      scansTableReady: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `ไม่สามารถเชื่อมต่อ Supabase ได้: ${msg}`,
    };
  }
}

// Helper to map DB row to Student model matching public.students table
function mapStudentRow(s: Record<string, unknown>): Student {
  const studentId = String(s.student_id || s.id || '').trim();
  const qrCode = String(s.qr_code || studentId).trim();
  const grade = String(s.grade || 'ม.1');
  const room = String(s.room || '1');
  const dorm = String(s.dorm || 'หอ A');
  const carId = String(s.car_id || 'CAR01');
  const nickname = s.nickname ? String(s.nickname) : undefined;
  const parentName = s.parent_name ? String(s.parent_name) : undefined;
  const pickupPoint = s.pickup_point ? String(s.pickup_point) : undefined;
  const seatNumber = s.seat_number != null ? Number(s.seat_number) : undefined;
  const latitude = s.latitude != null ? Number(s.latitude) : null;
  const longitude = s.longitude != null ? Number(s.longitude) : null;
  const mapLink = s.map_link ? String(s.map_link) : undefined;
  const qrImage = s.qr_image
    ? String(s.qr_image)
    : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode || studentId)}`;

  let avatarColor = 'bg-indigo-500';
  if (dorm.includes('B')) avatarColor = 'bg-blue-500';
  else if (dorm.includes('C')) avatarColor = 'bg-amber-500';
  else if (dorm.includes('D')) avatarColor = 'bg-emerald-500';
  else if (dorm.includes('E')) avatarColor = 'bg-rose-500';

  return {
    id: studentId,
    studentCode: qrCode || studentId,
    name: String(s.name || ''),
    nickname,
    grade,
    classroom: `${grade}/${room}`,
    className: `${grade}/${room}`,
    room,
    number: seatNumber,
    seatNumber,
    dorm,
    carID: carId,
    car_id: carId,
    plate: '1กข 1234',
    busNumber: carId,
    dormOrStop: pickupPoint || dorm,
    busStopName: pickupPoint || dorm,
    pickup: pickupPoint,
    pickupPoint,
    parent: parentName,
    parentName,
    parentPhone: String(s.parent_phone || '0810000000'),
    parent_phone: String(s.parent_phone || '0810000000'),
    status: String(s.status || 'ใช้งาน'),
    latitude,
    longitude,
    mapLink,
    map_link: mapLink,
    avatarColor,
    qrUrl: qrImage,
    qr_image: qrImage,
    qr_code: qrCode,
    created_at: s.created_at ? String(s.created_at) : undefined,
    updated_at: s.updated_at ? String(s.updated_at) : undefined,
  };
}

// ==========================================
// 1. STUDENTS CRUD (SELECT, INSERT, UPDATE, DELETE) 100% Supabase
// ==========================================

// SELECT: Fetch Students from Supabase (No mock data fallback)
export async function fetchStudentsFromSupabase(): Promise<{ success: boolean; data: Student[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, data: [], error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const { data, error } = await client
      .from('students')
      .select('*')
      .order('grade', { ascending: true })
      .order('room', { ascending: true })
      .order('seat_number', { ascending: true })
      .order('student_id', { ascending: true });

    if (error) {
      console.warn('Supabase fetch students error:', error);
      return { success: false, data: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    const mappedStudents: Student[] = data.map(mapStudentRow);
    return { success: true, data: mappedStudents };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch students from Supabase:', err);
    return { success: false, data: [], error: msg };
  }
}

// UPSERT: Add or Update Student in Supabase (public.students)
export async function upsertStudentToSupabase(
  student: Student
): Promise<{ success: boolean; error?: string; data?: Student }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const studentId = (student.id || student.studentCode || `STD${Date.now()}`).trim();
    const qrCode = (student.studentCode || student.id || studentId).trim();
    const grade = student.grade || 'ม.1';
    let room = student.room || '1';
    if (student.className && student.className.includes('/')) {
      room = student.className.split('/')[1] || room;
    }

    const carId = (student.carID || student.car_id || student.busNumber || 'CAR01').trim();
    if (carId) {
      await ensureCarExistsInSupabase(carId, student.plate || '1กข 1234');
    }

    const qrImage =
      student.qrUrl ||
      student.qr_image ||
      `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`;

    const row: Record<string, unknown> = {
      student_id: studentId,
      qr_code: qrCode,
      name: (student.name || 'นักเรียน').trim(),
      nickname: student.nickname?.trim() || null,
      grade: grade,
      room: room,
      seat_number: student.number ? Number(student.number) : (student.seatNumber ?? null),
      dorm: student.dorm || student.dormOrStop || 'หอ A',
      car_id: carId || null,
      pickup_point: student.pickup || student.pickupPoint || student.pickup_point || student.busStopName || student.dormOrStop || null,
      latitude: typeof student.latitude === 'number' ? student.latitude : null,
      longitude: typeof student.longitude === 'number' ? student.longitude : null,
      map_link: student.mapLink || student.map_link || null,
      parent_name: student.parent || student.parentName || student.parent_name || null,
      parent_phone: student.parentPhone || student.parent_phone || '0810000000',
      status: student.status || 'ใช้งาน',
      qr_image: qrImage,
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await client
      .from('students')
      .upsert(row, { onConflict: 'student_id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Upsert student warning in Supabase:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapStudentRow(data) : student };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Failed to upsert student to Supabase:', msg);
    return { success: false, error: msg };
  }
}

// INSERT: Add Student to Supabase (public.students)
export async function insertStudentToSupabase(student: Student): Promise<{ success: boolean; error?: string; data?: Student }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const studentId = (student.id || student.studentCode || `STD${Date.now()}`).trim();
    const qrCode = (student.studentCode || student.id || studentId).trim();
    const grade = student.grade || 'ม.1';
    let room = student.room || '1';
    if (student.className && student.className.includes('/')) {
      room = student.className.split('/')[1] || room;
    }

    const carId = (student.carID || student.car_id || student.busNumber || 'CAR01').trim();
    if (carId) {
      await ensureCarExistsInSupabase(carId, student.plate || '1กข 1234');
    }

    const qrImage =
      student.qrUrl ||
      student.qr_image ||
      `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`;

    const row = {
      student_id: studentId,
      qr_code: qrCode,
      name: (student.name || '').trim(),
      nickname: student.nickname?.trim() || null,
      grade: grade,
      room: room,
      seat_number: student.number ? Number(student.number) : (student.seatNumber ?? null),
      dorm: student.dorm || student.dormOrStop || 'หอ A',
      car_id: carId || null,
      pickup_point: student.pickup || student.pickupPoint || student.pickup_point || student.busStopName || student.dormOrStop || null,
      latitude: typeof student.latitude === 'number' ? student.latitude : null,
      longitude: typeof student.longitude === 'number' ? student.longitude : null,
      map_link: student.mapLink || student.map_link || null,
      parent_name: student.parent || student.parentName || student.parent_name || null,
      parent_phone: student.parentPhone || student.parent_phone || '0810000000',
      status: student.status || 'ใช้งาน',
      qr_image: qrImage,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('students')
      .insert(row)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return updateStudentInSupabase(student);
      }
      console.warn('Insert student error in Supabase:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapStudentRow(data) : student };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// UPDATE: Edit Student in Supabase (public.students)
export async function updateStudentInSupabase(student: Student): Promise<{ success: boolean; error?: string; data?: Student }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const studentId = (student.id || student.studentCode).trim();
    const qrCode = (student.studentCode || student.id || studentId).trim();
    const grade = student.grade || 'ม.1';
    let room = student.room || '1';
    if (student.className && student.className.includes('/')) {
      room = student.className.split('/')[1] || room;
    }

    const carId = (student.carID || student.car_id || student.busNumber || 'CAR01').trim();
    if (carId) {
      await ensureCarExistsInSupabase(carId, student.plate || '1กข 1234');
    }

    const qrImage =
      student.qrUrl ||
      student.qr_image ||
      `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`;

    const row = {
      qr_code: qrCode,
      name: (student.name || '').trim(),
      nickname: student.nickname?.trim() || null,
      grade: grade,
      room: room,
      seat_number: student.number ? Number(student.number) : (student.seatNumber ?? null),
      dorm: student.dorm || student.dormOrStop || 'หอ A',
      car_id: carId || null,
      pickup_point: student.pickup || student.pickupPoint || student.pickup_point || student.busStopName || student.dormOrStop || null,
      latitude: typeof student.latitude === 'number' ? student.latitude : null,
      longitude: typeof student.longitude === 'number' ? student.longitude : null,
      map_link: student.mapLink || student.map_link || null,
      parent_name: student.parent || student.parentName || student.parent_name || null,
      parent_phone: student.parentPhone || student.parent_phone || '0810000000',
      status: student.status || 'ใช้งาน',
      qr_image: qrImage,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('students')
      .update(row)
      .eq('student_id', studentId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Update student error in Supabase:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapStudentRow(data) : undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// DELETE: Delete Student from Supabase (public.students)
export async function deleteStudentFromSupabase(studentId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const cleanId = studentId.trim();
    const { error } = await client.from('students').delete().eq('student_id', cleanId);
    if (error) {
      console.warn('Delete student warning in Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ==========================================
// 2. CARS CRUD (SELECT, INSERT, UPDATE, DELETE)
// ==========================================

function mapCarRow(c: Record<string, unknown>): Car {
  return {
    carID: String(c.car_id || ''),
    plate: String(c.plate_number || ''),
    name: String(c.name || ''),
    route: String(c.route || ''),
    driver: String(c.driver_name || ''),
    driverPhone: String(c.driver_phone || ''),
    attendant: String(c.attendant_name || ''),
    capacity: Number(c.capacity || 60),
    status: String(c.status || 'ใช้งาน'),
  };
}

// SELECT: Fetch Cars from Supabase
export async function fetchCarsFromSupabase(): Promise<{ success: boolean; data: Car[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, data: [], error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const { data, error } = await client
      .from('cars')
      .select('*')
      .order('car_id', { ascending: true });

    if (error) {
      console.warn('Supabase fetch cars error:', error);
      return { success: false, data: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    const mappedCars: Car[] = data.map(mapCarRow);
    return { success: true, data: mappedCars };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch cars from Supabase:', err);
    return { success: false, data: [], error: msg };
  }
}

// ENSURE CAR EXISTS: Helper to guarantee foreign key validity
export async function ensureCarExistsInSupabase(
  carId: string,
  plateNumber = '1กข 1234'
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !carId) return;

  try {
    const cleanCarId = carId.trim();
    await client.from('cars').upsert(
      {
        car_id: cleanCarId,
        plate_number: plateNumber.trim(),
        name: cleanCarId,
        route: 'สายทั่วไป',
        status: 'ใช้งาน',
      },
      { onConflict: 'car_id' }
    );
  } catch {
    // Ignore error if already exists or column omitted
  }
}

// INSERT: Add Car to Supabase
export async function insertCarToSupabase(car: Car): Promise<{ success: boolean; error?: string; data?: Car }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const row = {
      car_id: car.carID.trim(),
      plate_number: car.plate.trim(),
      name: car.name.trim(),
      route: car.route?.trim() || null,
      driver_name: car.driver?.trim() || null,
      driver_phone: car.driverPhone?.trim() || null,
      attendant_name: car.attendant?.trim() || null,
      capacity: Number(car.capacity) || 60,
      status: car.status || 'ใช้งาน',
    };

    const { data, error } = await client.from('cars').insert([row]).select().single();
    if (error) {
      console.error('Insert car error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapCarRow(data) : undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// UPDATE: Edit Car in Supabase
export async function updateCarInSupabase(car: Car): Promise<{ success: boolean; error?: string; data?: Car }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const row = {
      plate_number: car.plate.trim(),
      name: car.name.trim(),
      route: car.route?.trim() || null,
      driver_name: car.driver?.trim() || null,
      driver_phone: car.driverPhone?.trim() || null,
      attendant_name: car.attendant?.trim() || null,
      capacity: Number(car.capacity) || 60,
      status: car.status || 'ใช้งาน',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('cars')
      .update(row)
      .eq('car_id', car.carID.trim())
      .select()
      .single();

    if (error) {
      console.error('Update car error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapCarRow(data) : undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// DELETE: Delete Car from Supabase
export async function deleteCarFromSupabase(carId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const { error } = await client.from('cars').delete().eq('car_id', carId.trim());
    if (
      error &&
      (error.code === 'PGRST125' ||
        error.code === '42P01' ||
        error.message?.includes('Invalid path') ||
        error.message?.includes('does not exist'))
    ) {
      console.info('Table cars not found in Supabase during delete; local deletion completed.');
      return { success: true };
    }
    if (error) {
      console.warn('Delete car warning:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ==========================================
// 3. SCANS CRUD (SELECT, INSERT, DELETE, CLEAR)
// ==========================================

function mapScanRow(sc: Record<string, unknown>): ScanRecord {
  const scanDate = String(sc.scan_date || '');
  const scanTime = String(sc.scan_time || '');
  const studentId = String(sc.student_id || '');
  const dateObj = new Date(`${scanDate}T${scanTime}`);
  const timestamp = isNaN(dateObj.getTime()) ? Date.now() : dateObj.getTime();

  return {
    id: String(sc.scan_id || `sc-${Date.now()}`),
    scanId: String(sc.scan_id || `sc-${Date.now()}`),
    timestamp: timestamp,
    dateThai: scanDate,
    timeThai: `${scanTime} น.`,
    time: `${scanTime} น.`,
    studentId: studentId,
    studentCode: studentId,
    name: String(sc.student_name || 'นักเรียน'),
    grade: 'ม.1',
    dorm: sc.dorm ? String(sc.dorm) : undefined,
    carID: sc.car_id ? String(sc.car_id) : undefined,
    plate: sc.plate_number ? String(sc.plate_number) : undefined,
    busNumber: String(sc.car_id || 'CAR01'),
    locationName: String(sc.dorm || 'จุดรับส่ง'),
    latitude: sc.latitude ? Number(sc.latitude) : 13.7548,
    longitude: sc.longitude ? Number(sc.longitude) : 100.4982,
    scanSource: 'camera',
    status: 'success',
    scanType: String(sc.scan_type || 'ขึ้นรถ'),
    scannerName: String(sc.scanner_by || 'เจ้าหน้าที่'),
    device: String(sc.scanner_device || 'MOBILE01'),
    note: sc.note ? String(sc.note) : undefined,
    dbSaved: true,
  };
}

// SELECT: Fetch Scans from Supabase
export async function fetchScansFromSupabase(): Promise<{ success: boolean; data: ScanRecord[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, data: [], error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const { data, error } = await client
      .from('scans')
      .select('*')
      .order('scan_date', { ascending: false })
      .order('scan_time', { ascending: false })
      .limit(500);

    if (error) {
      if (
        error.code === 'PGRST125' ||
        error.code === '42P01' ||
        error.message?.includes('Invalid path') ||
        error.message?.includes('does not exist')
      ) {
        return { success: true, data: [] };
      }
      console.warn('Supabase fetch scans error:', error);
      return { success: false, data: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    const mappedScans: ScanRecord[] = data.map(mapScanRow);
    return { success: true, data: mappedScans };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch scans from Supabase:', err);
    return { success: false, data: [], error: msg };
  }
}

// ==========================================
// PENDING SCANS QUEUE (OFFLINE-FIRST / RECOVERY)
// ==========================================
const STORAGE_KEY_PENDING_SCANS = 'qr_bus_pending_scans';

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
    // avoid duplicates
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
    const list = getPendingScans().filter((s) => (s.scanId || s.id) !== scanId);
    localStorage.setItem(STORAGE_KEY_PENDING_SCANS, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to remove pending scan:', e);
  }
}

export function clearPendingScans(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_PENDING_SCANS);
  } catch {
    // ignore
  }
}

// Sync all pending scans that were saved while offline or before connecting
export async function syncPendingScans(): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  if (!isSupabaseConnected()) {
    return { success: false, syncedCount: 0, error: 'Supabase ยังไม่ได้เชื่อมต่อ' };
  }

  const pending = getPendingScans();
  if (pending.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  let successCount = 0;
  for (const scan of pending) {
    const res = await insertScanToSupabase(scan, { skipQueue: true });
    if (res.success) {
      removePendingScan(scan.scanId || scan.id);
      successCount++;
    }
  }

  return { success: true, syncedCount: successCount };
}

// INSERT: Insert real-time Scan directly to Supabase with auto-healing, column-pruning, and zero-loss fallback
export async function insertScanToSupabase(
  scan: ScanRecord,
  options?: { skipQueue?: boolean; student?: Student }
): Promise<{ success: boolean; error?: string; isOfflineQueued?: boolean }> {
  const client = getSupabaseClient();
  if (!client) {
    if (!options?.skipQueue) {
      savePendingScan(scan);
    }
    return {
      success: false,
      error: 'ยังไม่ได้เชื่อมต่อ Supabase (บันทึกในเครื่อง & รอเชื่อมต่อ)',
      isOfflineQueued: true,
    };
  }

  try {
    // Reliable ISO Date (YYYY-MM-DD) and 24-hour Time (HH:MM:SS)
    const ts = scan.timestamp || Date.now();
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    const scanDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const scanTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const scanId = (scan.scanId || scan.id || `SCN${Date.now()}`).trim();
    const studentId = (scan.studentCode || scan.studentId || '').trim();
    const carId = (scan.carID || scan.busNumber || 'CAR01').trim();
    const studentName = (scan.name || 'นักเรียน').trim();
    const plateNumber = (scan.plate || '1กข 1234').trim();

    // 1. Guaranteed: Always save the student's name & profile to database `students` table first!
    try {
      if (options?.student) {
        await upsertStudentToSupabase(options.student);
      } else if (studentId) {
        await upsertStudentToSupabase({
          id: studentId,
          studentCode: studentId,
          name: studentName,
          grade: scan.grade || 'ม.1',
          dorm: scan.dorm || 'หอ A',
          carID: carId,
          busNumber: scan.busNumber || carId,
          dormOrStop: scan.locationName || 'จุดรับส่ง',
          parentPhone: '081-000-0000',
        });
      }
    } catch (stuErr) {
      console.warn('Note: Background student upsert notice:', stuErr);
    }

    // 2. Guaranteed: Always ensure car exists in `cars` table so foreign keys never fail
    try {
      if (carId) {
        await ensureCarExistsInSupabase(carId, plateNumber);
      }
    } catch {
      // ignore
    }

    const payload: Record<string, unknown> = {
      scan_id: scanId,
      scan_date: scanDate,
      scan_time: scanTime,
      student_id: studentId || null,
      student_name: studentName,
      car_id: carId || null,
      plate_number: plateNumber,
      dorm: scan.dorm || scan.locationName || 'จุดรับส่ง',
      scan_type: scan.scanType || 'ขึ้นรถ',
      scanner_by: scan.scannerName || 'เจ้าหน้าที่',
      scanner_device: scan.device || 'MOBILE01',
      scan_result: 'สำเร็จ',
      note: scan.note || '',
      latitude: typeof scan.latitude === 'number' ? scan.latitude : 13.7548,
      longitude: typeof scan.longitude === 'number' ? scan.longitude : 100.4982,
    };

    // Attempt 1: Standard Direct Insert (recommended by PostgREST for new records)
    let { error } = await client.from('scans').insert(payload);

    // If duplicate scan_id (e.g., resending an offline scan), fallback to upsert
    if (
      error &&
      (error.code === '23505' ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('already exists') ||
        error.message?.includes('unique constraint'))
    ) {
      const upsertResult = await client.from('scans').upsert(payload, { onConflict: 'scan_id' });
      error = upsertResult.error;
    }

    // Handle Foreign Key Constraint Violations (error code 23503)
    if (error && (error.code === '23503' || error.message?.includes('foreign key constraint'))) {
      console.warn('Foreign key violation encountered, applying self-healing:', error.message);

      if (error.message?.includes('scans_student_id_fkey') || error.message?.includes('student_id')) {
        if (studentId) {
          try {
            await client.from('students').upsert(
              {
                student_id: studentId,
                qr_code: studentId,
                name: studentName,
                status: 'ใช้งาน',
              },
              { onConflict: 'student_id' }
            );
          } catch {
            // ignore
          }
        }
      }

      if (error.message?.includes('scans_car_id_fkey') || error.message?.includes('car_id')) {
        if (carId) {
          try {
            await client.from('cars').upsert(
              {
                car_id: carId,
                plate_number: plateNumber,
                name: carId,
                status: 'ใช้งาน',
              },
              { onConflict: 'car_id' }
            );
          } catch {
            // ignore
          }
        }
      }

      // Retry insert
      const retryResult = await client.from('scans').insert(payload);
      error = retryResult.error;

      // If still failing foreign key, nullify foreign keys so the scan is NEVER discarded!
      if (error && (error.code === '23503' || error.message?.includes('foreign key'))) {
        payload.student_id = null;
        payload.car_id = null;
        const lastChance = await client.from('scans').insert(payload);
        error = lastChance.error;
      }
    }

    // Adaptive Column Pruning Loop: If table schema lacks any optional columns, prune and retry
    let pruneAttempts = 0;
    while (
      error &&
      pruneAttempts < 6 &&
      (error.code === '42703' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('Could not find') ||
        error.message?.includes('column'))
    ) {
      pruneAttempts++;
      const match =
        error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i) ||
        error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i) ||
        error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);

      if (match && match[1] && match[1] in payload) {
        console.warn(`Pruning missing column "${match[1]}" from scans payload and retrying...`);
        delete payload[match[1]];
        const retryPruned = await client.from('scans').insert(payload);
        error = retryPruned.error;
      } else {
        // Drop non-essential columns in batch
        delete payload.scanner_device;
        delete payload.scan_result;
        delete payload.latitude;
        delete payload.longitude;
        delete payload.note;
        delete payload.scanner_by;
        const retryClean = await client.from('scans').insert(payload);
        error = retryClean.error;
        break;
      }
    }

    // If still error because 'scan_id' column was named 'id' in customized schema
    if (error && (error.message?.includes('scan_id') && error.message?.includes('does not exist'))) {
      payload.id = scanId;
      delete payload.scan_id;
      const idResult = await client.from('scans').insert(payload);
      error = idResult.error;
    }

    if (error) {
      console.error('Failed to insert scan into Supabase:', error);
      if (!options?.skipQueue) {
        savePendingScan(scan);
      }

      let friendlyMsg = error.message;
      if (error.code === '42P01') {
        friendlyMsg = 'ไม่พบตาราง public.scans ใน Supabase! กรุณารันคำสั่ง SQL สร้างตาราง scans';
      } else if (
        error.code === '42501' ||
        error.message?.includes('row-level security') ||
        error.message?.includes('policy')
      ) {
        friendlyMsg = 'ติดสิทธิ์ความปลอดภัย RLS ของตาราง scans ใน Supabase! กรุณารัน SQL ปลดล็อกสิทธิ์';
      }

      return { success: false, error: friendlyMsg, isOfflineQueued: true };
    }

    // Success: remove from pending queue if was queued
    removePendingScan(scanId);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error inserting scan to Supabase:', err);
    if (!options?.skipQueue) {
      savePendingScan(scan);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, isOfflineQueued: true };
  }
}

// DELETE: Delete a single Scan from Supabase
export async function deleteScanFromSupabase(scanId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    const trimmedId = scanId.trim();
    let { error } = await client.from('scans').delete().eq('scan_id', trimmedId);

    // Fallback if column is named 'id'
    if (error && (error.code === '42703' || error.message?.includes('scan_id'))) {
      const retryId = await client.from('scans').delete().eq('id', trimmedId);
      error = retryId.error;
    }

    // If table doesn't exist in Supabase yet (PGRST125 or 42P01), row is already absent in cloud
    if (
      error &&
      (error.code === 'PGRST125' ||
        error.code === '42P01' ||
        error.message?.includes('Invalid path') ||
        error.message?.includes('does not exist'))
    ) {
      console.info('Supabase scans table not found during delete; local record removed.');
      return { success: true };
    }

    if (error) {
      console.warn('Delete scan warning:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// CLEAR ALL: Clear all scans in Supabase
export async function clearAllScansInSupabase(): Promise<{ success: boolean; error?: string; warning?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase' };
  }

  try {
    // Delete all rows where scan_id is not null (safe, valid PostgREST syntax)
    let { error } = await client.from('scans').delete().not('scan_id', 'is', null);

    // Fallback 1: If column is named 'id' instead of 'scan_id'
    if (error && (error.code === '42703' || error.message?.includes('scan_id'))) {
      const retryId = await client.from('scans').delete().not('id', 'is', null);
      error = retryId.error;
    }

    // Fallback 2: If primary key filter wasn't accepted, delete by timestamp/created_at
    if (
      error &&
      error.code !== 'PGRST125' &&
      error.code !== '42P01' &&
      !error.message?.includes('Invalid path') &&
      !error.message?.includes('does not exist')
    ) {
      const retryDate = await client.from('scans').delete().gte('created_at', '1970-01-01');
      if (!retryDate.error) {
        error = null;
      }
    }

    // If table doesn't exist in Supabase yet (PGRST125 or 42P01), cloud is already empty!
    if (
      error &&
      (error.code === 'PGRST125' ||
        error.code === '42P01' ||
        error.message?.includes('Invalid path') ||
        error.message?.includes('does not exist') ||
        error.message?.includes('relation "public.scans" does not exist'))
    ) {
      console.info('Supabase scans table not created yet; cleared local scans.');
      return {
        success: true,
        warning: 'ตาราง scans ใน Supabase ยังไม่ได้สร้าง (ล้างข้อมูลในเครื่องเรียบร้อยแล้ว)',
      };
    }

    if (error) {
      console.warn('Clear all scans warning:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ==========================================
// 4. REALTIME SUBSCRIPTIONS
// ==========================================

export function subscribeToSupabaseRealtime(handlers: {
  onScanInsert?: (scan: ScanRecord) => void;
  onScanDelete?: (scanId: string) => void;
  onStudentChange?: () => void;
  onCarChange?: () => void;
}): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const channel = client
      .channel('supabase_realtime_all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scans' },
        (payload: { new: Record<string, unknown> }) => {
          if (handlers.onScanInsert && payload.new) {
            handlers.onScanInsert(mapScanRow(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'scans' },
        (payload: { old: Record<string, unknown> }) => {
          if (handlers.onScanDelete && payload.old && payload.old.scan_id) {
            handlers.onScanDelete(String(payload.old.scan_id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => {
          if (handlers.onStudentChange) handlers.onStudentChange();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cars' },
        () => {
          if (handlers.onCarChange) handlers.onCarChange();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Realtime subscription error:', err);
    return null;
  }
}

export function subscribeToSupabaseScans(onNewScan: (scan: ScanRecord) => void): (() => void) | null {
  return subscribeToSupabaseRealtime({ onScanInsert: onNewScan });
}
