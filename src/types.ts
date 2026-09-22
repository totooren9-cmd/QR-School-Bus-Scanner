export interface Student {
  id: string;
  student_id?: string;
  studentId?: string;
  studentCode: string;
  qrCode?: string;
  qr_code?: string;
  qrImage?: string;
  qr_image?: string;
  name: string;
  nickname?: string;
  grade: string;
  classroom?: string;
  className?: string;
  room?: string;
  number?: string | number;
  seatNumber?: number | null;
  seat_number?: number | null;
  dorm?: string;
  carID?: string;
  car_id?: string;
  plate?: string;
  busNumber: string;
  dormOrStop?: string;
  busStopName?: string;
  pickup?: string;
  pickupPoint?: string;
  pickup_point?: string;
  latitude?: number | null;
  longitude?: number | null;
  mapLink?: string;
  map_link?: string;
  parent?: string;
  parentName?: string;
  parent_name?: string;
  parentPhone: string;
  parent_phone?: string;
  avatarColor?: string;
  avatar?: string;
  avatarUrl?: string;
  status?: string;
  qrUrl?: string;
  created_at?: string;
  updated_at?: string;
  createdDate?: string;
}

export interface Car {
  carID: string;
  plate: string;
  plateNumber?: string;
  name: string;
  route: string;
  driver: string;
  driverPhone: string;
  attendant: string;
  capacity: number;
  status: string;
}

export interface ScanRecord {
  id: string;
  scanId: string;
  timestamp: number;
  dateThai: string;
  timeThai: string;
  time?: string;
  studentId: string;
  studentCode: string;
  name: string;
  grade: string;
  dorm?: string;
  carID?: string;
  plate?: string;
  busNumber: string;
  locationName: string;
  latitude: number;
  longitude: number;
  scanSource: 'camera' | 'upload' | 'simulated';
  status: 'success' | 'warn' | 'error';
  scanType?: string;
  scannerName?: string;
  device?: string;
  note?: string;
  avatar?: string;
  dbSaved?: boolean;
}

export type AdminTab =
  | 'dashboard'
  | 'students'
  | 'cars'
  | 'qrcode'
  | 'qr-generator'
  | 'reports'
  | 'sheets'
  | 'supabase';

