import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Bus,
  Navigation,
  Clock,
  User,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  Copy,
  Check,
  Compass,
  Search,
} from 'lucide-react';
import { Car, ScanRecord, Student } from '../types';

interface BusRouteMapProps {
  cars: Car[];
  scans: ScanRecord[];
  students: Student[];
  onSelectStudent?: (student: Student) => void;
}

interface StopPoint {
  id: string;
  stopName: string;
  carID: string;
  latitude: number;
  longitude: number;
  latestScanTime: string;
  latestTimestamp: number;
  studentsScanned: {
    name: string;
    studentCode: string;
    grade?: string;
    avatar?: string;
    scanTime: string;
    scanType?: string;
  }[];
  isLatestForCar: boolean;
  order: number;
}

// Visual theme colors for each bus
const CAR_COLORS: Record<string, { bg: string; border: string; hex: string; text: string }> = {
  CAR01: { bg: 'bg-amber-500', border: 'border-amber-400', hex: '#f59e0b', text: 'text-amber-400' },
  CAR02: { bg: 'bg-sky-500', border: 'border-sky-400', hex: '#0284c7', text: 'text-sky-400' },
  CAR03: { bg: 'bg-emerald-500', border: 'border-emerald-400', hex: '#10b981', text: 'text-emerald-400' },
  CAR04: { bg: 'bg-purple-500', border: 'border-purple-400', hex: '#8b5cf6', text: 'text-purple-400' },
  CAR05: { bg: 'bg-rose-500', border: 'border-rose-400', hex: '#f43f5e', text: 'text-rose-400' },
};

const DEFAULT_COLOR = { bg: 'bg-teal-500', border: 'border-teal-400', hex: '#14b8a6', text: 'text-teal-400' };

function getCarColor(carId: string) {
  return CAR_COLORS[carId] || DEFAULT_COLOR;
}

// School coordinates (Destination/Origin terminal hub)
const SCHOOL_TERMINAL = {
  name: 'โรงเรียน (จุดหมายปลายทาง)',
  latitude: 13.7563,
  longitude: 100.5018,
};

export const BusRouteMap: React.FC<BusRouteMapProps> = ({
  cars,
  scans,
  students,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<string | null>(null);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // 1. Process Route Data: Group scans & student coords by Car and Stop Point
  const { routeDataByCar, allStops } = useMemo(() => {
    const routeMap: Record<string, StopPoint[]> = {};
    const effectiveCars = cars.length > 0 ? cars : [{ carID: 'CAR01', plate: '1กข 1234', name: 'รถคันที่ 1' } as Car];

    effectiveCars.forEach((car) => {
      routeMap[car.carID] = [];
    });

    // Group scans for each car
    const scansByCar: Record<string, ScanRecord[]> = {};
    scans.forEach((scan) => {
      const cId = scan.carID || scan.busNumber || 'CAR01';
      if (!scansByCar[cId]) scansByCar[cId] = [];
      scansByCar[cId].push(scan);
    });

    // For each car, group scans by stop name or coordinate cluster
    Object.keys(scansByCar).forEach((cId) => {
      const carScans = scansByCar[cId];
      // Sort chronologically ascending
      carScans.sort((a, b) => a.timestamp - b.timestamp);

      const stopDict: Record<string, StopPoint> = {};

      carScans.forEach((scan) => {
        // Validate coordinates
        const lat = Number(scan.latitude);
        const lng = Number(scan.longitude);
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

        // Group key: combination of location name and coordinate rounded to 3 decimals
        const key = `${scan.locationName || 'จุดรับส่ง'}_${lat.toFixed(3)}_${lng.toFixed(3)}`;

        if (!stopDict[key]) {
          stopDict[key] = {
            id: `stop-${cId}-${Object.keys(stopDict).length + 1}`,
            stopName: scan.locationName || `จุดสแกน ${Object.keys(stopDict).length + 1}`,
            carID: cId,
            latitude: lat,
            longitude: lng,
            latestScanTime: scan.timeThai || scan.time || '16:00 น.',
            latestTimestamp: scan.timestamp,
            studentsScanned: [],
            isLatestForCar: false,
            order: Object.keys(stopDict).length + 1,
          };
        } else {
          // Update latest scan time if newer
          if (scan.timestamp >= stopDict[key].latestTimestamp) {
            stopDict[key].latestScanTime = scan.timeThai || scan.time || stopDict[key].latestScanTime;
            stopDict[key].latestTimestamp = scan.timestamp;
            stopDict[key].latitude = lat;
            stopDict[key].longitude = lng;
          }
        }

        // Add student entry (avoid exact duplicate scan records in list)
        const alreadyAdded = stopDict[key].studentsScanned.some(
          (s) => s.studentCode === scan.studentCode && s.scanTime === (scan.timeThai || scan.time)
        );
        if (!alreadyAdded) {
          stopDict[key].studentsScanned.push({
            name: scan.name,
            studentCode: scan.studentCode,
            grade: scan.grade,
            avatar: scan.avatar,
            scanTime: scan.timeThai || scan.time || '',
            scanType: scan.scanType,
          });
        }
      });

      const stopList = Object.values(stopDict).sort((a, b) => a.latestTimestamp - b.latestTimestamp);

      // Re-index order and mark the very latest scan
      stopList.forEach((st, idx) => {
        st.order = idx + 1;
        st.isLatestForCar = idx === stopList.length - 1;
      });

      routeMap[cId] = stopList;
    });

    // Fallback: If a car has no scans today, but has students in database with pickup points & coords
    effectiveCars.forEach((car) => {
      if (!routeMap[car.carID] || routeMap[car.carID].length === 0) {
        const carStudents = students.filter(
          (s) => (s.car_id === car.carID || s.carID === car.carID || s.busNumber === car.carID) &&
                 s.latitude && s.longitude
        );

        const stopDict: Record<string, StopPoint> = {};
        carStudents.forEach((st) => {
          const lat = Number(st.latitude);
          const lng = Number(st.longitude);
          if (isNaN(lat) || isNaN(lng)) return;

          const key = `${st.pickup_point || st.pickupPoint || st.pickup || 'จุดรับส่ง'}`;
          if (!stopDict[key]) {
            stopDict[key] = {
              id: `planned-${car.carID}-${Object.keys(stopDict).length + 1}`,
              stopName: st.pickup_point || st.pickupPoint || st.pickup || `จุดรับส่ง ${car.name}`,
              carID: car.carID,
              latitude: lat,
              longitude: lng,
              latestScanTime: 'พิกัดตามฐานข้อมูล',
              latestTimestamp: 0,
              studentsScanned: [
                {
                  name: st.name,
                  studentCode: st.studentCode || st.id,
                  grade: st.className || st.grade,
                  avatar: st.avatarUrl || st.avatar,
                  scanTime: 'ตามรายชื่อ',
                }
              ],
              isLatestForCar: false,
              order: Object.keys(stopDict).length + 1,
            };
          } else {
            stopDict[key].studentsScanned.push({
              name: st.name,
              studentCode: st.studentCode || st.id,
              grade: st.className || st.grade,
              avatar: st.avatarUrl || st.avatar,
              scanTime: 'ตามรายชื่อ',
            });
          }
        });

        const stopList = Object.values(stopDict);
        if (stopList.length > 0) {
          stopList[stopList.length - 1].isLatestForCar = true;
          routeMap[car.carID] = stopList;
        }
      }
    });

    // Flatten all stops
    const allStopsFlat: StopPoint[] = [];
    Object.values(routeMap).forEach((stops) => {
      allStopsFlat.push(...stops);
    });

    return { routeDataByCar: routeMap, allStops: allStopsFlat };
  }, [cars, scans, students]);

  // Stops to display according to filter
  const displayedStops = useMemo(() => {
    let stops = selectedCarId === 'ALL'
      ? allStops
      : (routeDataByCar[selectedCarId] || []);

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      stops = stops.filter(
        (s) =>
          s.stopName.toLowerCase().includes(q) ||
          s.carID.toLowerCase().includes(q) ||
          s.studentsScanned.some((stu) => stu.name.toLowerCase().includes(q) || stu.studentCode.toLowerCase().includes(q))
      );
    }

    return stops;
  }, [selectedCarId, allStops, routeDataByCar, searchFilter]);

  // Total students scanned in active view
  const totalScannedInView = useMemo(() => {
    return displayedStops.reduce((acc, curr) => acc + curr.studentsScanned.length, 0);
  }, [displayedStops]);

  // 2. Initialize and Update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [SCHOOL_TERMINAL.latitude, SCHOOL_TERMINAL.longitude],
        zoom: 14,
        zoomControl: false,
      });

      // Add Zoom Control to bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // CartoDB Positron / OpenStreetMap Dark/Modern Tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    // Clear previous markers & polylines
    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);

    // Add School Terminal Marker
    const schoolIcon = L.divIcon({
      className: 'custom-school-icon',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-2xl bg-indigo-600 text-white shadow-xl border-2 border-white flex items-center justify-center font-bold text-lg transform hover:scale-110 transition-transform">
            🏫
          </div>
          <div class="absolute -bottom-5 bg-slate-900/90 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30 whitespace-nowrap shadow">
            โรงเรียน
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });

    const schoolMarker = L.marker([SCHOOL_TERMINAL.latitude, SCHOOL_TERMINAL.longitude], { icon: schoolIcon });
    schoolMarker.bindPopup(`
      <div class="p-1 text-slate-800">
        <h4 class="font-bold text-sm text-indigo-600">🏫 โรงเรียน (จุดหมายปลายทาง)</h4>
        <p class="text-xs text-slate-600 mt-1">จุดรวมรับส่งนักเรียนทุกสายประจำโรงเรียน</p>
        <div class="mt-2 font-mono text-[11px] bg-slate-100 p-1.5 rounded text-slate-700">
          พิกัด: ${SCHOOL_TERMINAL.latitude.toFixed(4)}, ${SCHOOL_TERMINAL.longitude.toFixed(4)}
        </div>
      </div>
    `);
    layerGroup.addLayer(schoolMarker);
    bounds.extend([SCHOOL_TERMINAL.latitude, SCHOOL_TERMINAL.longitude]);

    // Render Routes & Stops for the selected car(s)
    const carsToRender = selectedCarId === 'ALL'
      ? Object.keys(routeDataByCar)
      : [selectedCarId];

    carsToRender.forEach((cId) => {
      const stops = routeDataByCar[cId] || [];
      if (stops.length === 0) return;

      const theme = getCarColor(cId);
      const latLngs: [number, number][] = [];

      // Add stops to polyline
      stops.forEach((stop, index) => {
        latLngs.push([stop.latitude, stop.longitude]);
        bounds.extend([stop.latitude, stop.longitude]);

        // Stop marker
        const isLatest = stop.isLatestForCar;
        const markerHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer">
            ${isLatest ? `
              <span class="absolute -top-1 -right-1 flex h-4 w-4">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 text-white text-[8px] font-bold items-center justify-center">🚌</span>
              </span>
            ` : ''}
            <div class="w-8 h-8 rounded-full ${theme.bg} text-white shadow-lg border-2 border-white flex items-center justify-center font-bold text-xs transform group-hover:scale-125 transition-transform">
              ${stop.order}
            </div>
            <div class="bg-slate-900/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/20 whitespace-nowrap shadow mt-1 max-w-[110px] truncate">
              ${stop.stopName}
            </div>
          </div>
        `;

        const stopIcon = L.divIcon({
          className: `custom-stop-icon-${stop.id}`,
          html: markerHtml,
          iconSize: [32, 45],
          iconAnchor: [16, 20],
          popupAnchor: [0, -20],
        });

        const stopMarker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon });

        // Build popup content
        const studentListHtml = stop.studentsScanned.length > 0
          ? stop.studentsScanned
              .slice(0, 5)
              .map(
                (st) => `
                <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
                  <span style="font-weight: 600; color: #1e293b;">${st.name}</span>
                  <span style="color: #64748b; font-family: monospace;">(${st.studentCode})</span>
                  <span style="margin-left: auto; color: #10b981; font-weight: 500;">${st.scanTime}</span>
                </div>
              `
              )
              .join('') + (stop.studentsScanned.length > 5 ? `<div style="font-size: 10px; color: #64748b; padding-top: 4px; text-align: center;">และอีก ${stop.studentsScanned.length - 5} คน...</div>` : '')
          : `<div style="font-size: 11px; color: #94a3b8;">ยังไม่มีประวัติสแกนเฉพาะจุดนี้</div>`;

        const popupContent = `
          <div style="min-width: 210px; font-family: sans-serif; color: #0f172a;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 2px solid ${theme.hex};">
              <span style="font-weight: bold; font-size: 13px; color: ${theme.hex};">🚌 ${stop.carID} • จุดที่ ${stop.order}</span>
              ${isLatest ? '<span style="background: #10b981; color: white; font-size: 9px; padding: 2px 6px; border-radius: 9999px; font-weight: bold;">ตำแหน่งล่าสุด</span>' : ''}
            </div>
            <div style="font-size: 12px; font-weight: 600; margin-top: 6px; color: #1e293b;">📍 ${stop.stopName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">สแกนล่าสุด: <strong style="color: #059669;">${stop.latestScanTime}</strong> (${stop.studentsScanned.length} คน)</div>
            <div style="margin-top: 8px; max-height: 120px; overflow-y: auto; background: #f8fafc; border-radius: 8px; padding: 4px 8px;">
              ${studentListHtml}
            </div>
            <div style="margin-top: 8px; display: flex; gap: 4px;">
              <a href="https://www.google.com/maps?q=${stop.latitude},${stop.longitude}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #2563eb; color: white; padding: 5px 8px; border-radius: 6px; font-size: 11px; text-decoration: none; font-weight: 600;">
                🗺️ Google Maps
              </a>
            </div>
          </div>
        `;

        stopMarker.bindPopup(popupContent);
        stopMarker.on('click', () => {
          setActiveStopId(stop.id);
        });

        layerGroup.addLayer(stopMarker);
      });

      // Connect stops with Polyline
      if (latLngs.length > 1) {
        // Connect to school at the end of the route
        const routeLatLngs = [...latLngs, [SCHOOL_TERMINAL.latitude, SCHOOL_TERMINAL.longitude] as [number, number]];

        const polyline = L.polyline(routeLatLngs, {
          color: theme.hex,
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 8',
          lineCap: 'round',
          lineJoin: 'round',
        });

        polyline.bindTooltip(`เส้นทาง ${cId} (${stops.length} จุดรับส่ง)`, { sticky: true });
        layerGroup.addLayer(polyline);
      }
    });

    // Fit map view to cover all markers
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [selectedCarId, routeDataByCar]);

  // Fly map to specific stop when clicked in timeline
  const handleFlyToStop = (stop: StopPoint) => {
    setActiveStopId(stop.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([stop.latitude, stop.longitude], 16, {
        duration: 0.8,
      });
    }
  };

  // Generate Google Maps Directions URL for all stops in the route
  const googleMapsDirectionsUrl = useMemo(() => {
    const stops = displayedStops;
    if (stops.length === 0) {
      return `https://www.google.com/maps?q=${SCHOOL_TERMINAL.latitude},${SCHOOL_TERMINAL.longitude}`;
    }

    // Google Maps dir URL: /origin/waypoint1/waypoint2/.../destination
    const origin = `${stops[0].latitude},${stops[0].longitude}`;
    const destination = `${SCHOOL_TERMINAL.latitude},${SCHOOL_TERMINAL.longitude}`;
    const waypoints = stops
      .slice(1)
      .map((s) => `${s.latitude},${s.longitude}`)
      .join('/');

    return waypoints
      ? `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`
      : `https://www.google.com/maps/dir/${origin}/${destination}`;
  }, [displayedStops]);

  // Copy coordinates helper
  const handleCopy = (coordsStr: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(coordsStr);
      setCopiedCoords(coordsStr);
      setTimeout(() => setCopiedCoords(null), 2000);
    }
  };

  const activeCarDetails = cars.find((c) => c.carID === selectedCarId);

  return (
    <div
      className={`bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-3 z-50 rounded-2xl bg-slate-950 border-emerald-500/50' : 'w-full'
      }`}
      id="busRouteMapCard"
    >
      {/* ======================================================== */}
      {/* 1. MAP HEADER & CAR SELECTOR */}
      {/* ======================================================== */}
      <div className="bg-slate-950/80 border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-emerald-600 flex items-center justify-center text-white shadow-md">
            <Compass className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>แผนที่เส้นทางและพิกัดสแกนจุดรับส่ง</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                GPS Realtime
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              พิกัดจุดรับส่งตามลำดับการสแกนล่าสุดของนักเรียนแต่ละคัน
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* External Google Maps Button */}
          <a
            href={googleMapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="เปิดดูเส้นทางนำทางจริงใน Google Maps"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เปิดนำทาง Google Maps</span>
            <span className="sm:hidden">Google Maps</span>
          </a>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title={isFullscreen ? 'ย่อหน้าต่าง' : 'ขยายเต็มหน้าจอ'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CAR TABS & FILTER BAR */}
      {/* ======================================================== */}
      <div className="bg-slate-900/90 border-b border-white/5 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Car filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedCarId('ALL')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCarId === 'ALL'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ทุกสายรถ ({allStops.length} จุด)</span>
          </button>

          {cars.map((car) => {
            const stopsCount = (routeDataByCar[car.carID] || []).length;
            const theme = getCarColor(car.carID);
            const isSelected = selectedCarId === car.carID;

            return (
              <button
                key={car.carID}
                type="button"
                onClick={() => setSelectedCarId(car.carID)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                  isSelected
                    ? `${theme.bg} text-white border-white/30 shadow-md`
                    : 'bg-slate-800/80 text-slate-300 hover:text-white border-white/5'
                }`}
              >
                <Bus className="w-3.5 h-3.5" />
                <span>{car.carID}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-black/30 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {stopsCount} จุด
                </span>
              </button>
            );
          })}
        </div>

        {/* Search in stops */}
        <div className="relative min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="w-full bg-slate-950/70 border border-white/10 rounded-xl pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            placeholder="ค้นหาจุดสแกน/นักเรียน..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Car Info Bar if single car selected */}
      {activeCarDetails && selectedCarId !== 'ALL' && (
        <div className="bg-slate-950/50 border-b border-white/5 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${getCarColor(activeCarDetails.carID).bg}`} />
              {activeCarDetails.name} ({activeCarDetails.plate})
            </span>
            <span className="text-slate-400">
              คนขับ: <strong className="text-slate-200">{activeCarDetails.driver || 'นายสมชาย ใจดี'}</strong>
            </span>
            {activeCarDetails.driverPhone && (
              <a
                href={`tel:${activeCarDetails.driverPhone}`}
                className="text-blue-400 hover:underline flex items-center gap-1 font-mono"
              >
                📞 {activeCarDetails.driverPhone}
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20 font-mono">
              นักเรียนสแกนแล้ว {totalScannedInView} คน
            </span>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MAIN MAP CONTAINER & SIDEBAR */}
      {/* ======================================================== */}
      <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} flex-1 min-h-[420px]`}>
        {/* The Leaflet Map Canvas */}
        <div className={`${isFullscreen ? 'lg:col-span-3' : 'lg:col-span-2'} relative min-h-[380px] bg-slate-950`}>
          <div ref={mapContainerRef} className="w-full h-full min-h-[380px] z-0" />

          {/* Overlay Map Legend & Quick Controls */}
          <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-xl p-2.5 text-xs text-white shadow-lg space-y-1.5 max-w-[210px] pointer-events-auto">
            <div className="font-bold text-slate-200 flex items-center justify-between border-b border-white/10 pb-1">
              <span>สัญลักษณ์บนแผนที่</span>
              <span className="text-[10px] text-emerald-400 font-mono">Realtime</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 rounded-full bg-indigo-600 border border-white" />
              <span>🏫 จุดหมาย (โรงเรียน)</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse border border-white" />
              <span>🚌 จุดสแกนล่าสุดของรถ</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 rounded-full bg-amber-500 border border-white" />
              <span>📍 จุดรับส่ง (ตามลำดับเวลา)</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-4 h-0.5 bg-amber-400 border-dashed border-t border-amber-300" />
              <span>เส้นทางเดินรถ</span>
            </div>
          </div>

          {/* Empty state notice if no stops */}
          {displayedStops.length === 0 && (
            <div className="absolute inset-0 z-[400] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
              <div className="max-w-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-400 mx-auto">
                  <MapPin className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-sm">ยังไม่มีพิกัดการสแกนของรถสายนี้</h4>
                <p className="text-xs text-slate-400">
                  เมื่อนักเรียนสแกน QR Code ขึ้นรถหรือลงรถ ระบบจะบันทึกพิกัด GPS อัตโนมัติและวาดเส้นทางบนแผนที่แบบ Realtime
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Stop Timeline & Scanned Students List */}
        <div className="bg-slate-950 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col max-h-[460px] overflow-hidden">
          <div className="p-3 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>ลำดับจุดรับส่ง ({displayedStops.length} จุด)</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              สแกน {totalScannedInView} คน
            </span>
          </div>

          {/* Scrollable Timeline */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {displayedStops.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                ไม่พบข้อมูลจุดรับส่งตามเงื่อนไข
              </div>
            ) : (
              displayedStops.map((stop) => {
                const isSelected = activeStopId === stop.id;
                const theme = getCarColor(stop.carID);
                const coordsString = `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`;

                return (
                  <div
                    key={stop.id}
                    onClick={() => handleFlyToStop(stop)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-white/5 hover:border-white/15'
                    }`}
                  >
                    {/* Stop Header */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full ${theme.bg} text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow`}
                        >
                          {stop.order}
                        </span>
                        <div>
                          <div className="font-bold text-white text-xs truncate max-w-[150px]">
                            {stop.stopName}
                          </div>
                          <span className={`text-[10px] font-semibold ${theme.text}`}>
                            {stop.carID}
                          </span>
                        </div>
                      </div>

                      {stop.isLatestForCar && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                          🚌 ล่าสุด
                        </span>
                      )}
                    </div>

                    {/* Scan Time & Students count */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 px-2 py-1 rounded-lg mt-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{stop.latestScanTime}</span>
                      </span>
                      <span className="font-medium text-emerald-400">
                        {stop.studentsScanned.length} คน
                      </span>
                    </div>

                    {/* Coordinates & Google Maps Link */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] text-slate-400 font-mono">
                      <span className="truncate max-w-[130px]">{coordsString}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(coordsString);
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-0.5 transition-colors"
                          title="คัดลอกพิกัด"
                        >
                          {copiedCoords === coordsString ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                          <span>{copiedCoords === coordsString ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                        </button>
                        <a
                          href={`https://www.google.com/maps?q=${stop.latitude},${stop.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-1.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 transition-colors"
                          title="เปิดใน Google Maps"
                        >
                          🗺️
                        </a>
                      </div>
                    </div>

                    {/* Students list expandable / preview */}
                    {stop.studentsScanned.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] text-slate-500 font-medium">นักเรียนที่สแกนจุดนี้:</div>
                        <div className="flex flex-wrap gap-1">
                          {stop.studentsScanned.slice(0, 3).map((stu, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] flex items-center gap-1 border border-white/5 truncate max-w-[120px]"
                            >
                              <User className="w-2.5 h-2.5 text-slate-400" />
                              <span className="truncate">{stu.name}</span>
                            </span>
                          ))}
                          {stop.studentsScanned.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-800/60 text-slate-400 text-[10px]">
                              +{stop.studentsScanned.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
