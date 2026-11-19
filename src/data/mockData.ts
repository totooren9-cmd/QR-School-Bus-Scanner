import { Student, ScanRecord, Car } from '../types';

// 100% Firebase Firestore Students - Loaded live from Firestore collection `students`
export const INITIAL_STUDENTS: Student[] = [];

// 100% Firebase Firestore Cars - Loaded live from Firestore collection `cars`
export const INITIAL_CARS: Car[] = [];

// 100% Firebase Firestore Scans - Loaded live from Firestore collection `scans`
export const INITIAL_SCANS: ScanRecord[] = [];

// Bus stops align with student routes and dorms
export const MOCK_BUS_STOPS = [
  { name: 'หอ A • จุดรับ 1', lat: 13.7548, lng: 100.4982 },
  { name: 'หอ B • จุดรับ 2', lat: 13.7582, lng: 100.5054 },
  { name: 'หอ C • จุดรับ 3', lat: 13.7259, lng: 100.4935 },
  { name: 'หอ D • จุดรับ 4', lat: 13.7208, lng: 100.4578 },
  { name: 'หอ E • จุดรับ 5', lat: 13.7745, lng: 100.4782 },
  { name: 'ประตู 1 จุดรับส่งพนักงาน', lat: 13.7431, lng: 100.4990 },
];

export function formatThaiDateTime(date = new Date()) {
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return {
    dateThai: `${day} ${month} ${year}`,
    timeThai: `${hours}:${minutes}:${seconds} น.`
  };
}
