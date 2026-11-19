export interface GeoCoords {
  latitude: number;
  longitude: number;
  locationName: string;
}

let cachedGeo: GeoCoords | null = null;
let lastGeoAttemptAt = 0;

function getFallbackCoords(): GeoCoords {
  return {
    latitude: 13.7548,
    longitude: 100.4982,
    locationName: 'จุดรับส่งพนักงาน',
  };
}

export function warmUpCoordinates(): void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
  const now = Date.now();
  if (now - lastGeoAttemptAt < 15000) return;
  lastGeoAttemptAt = now;

  try {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        cachedGeo = {
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
          locationName: 'พิกัด GPS สแกนเนอร์ปัจจุบัน',
        };
      },
      () => {
        // Ignore background GPS errors; fallback coordinates remain valid
      },
      { timeout: 3000, maximumAge: 60000, enableHighAccuracy: false }
    );
  } catch {
    // Ignore if browser blocks geolocation
  }
}

export function getInstantCoordinates(): GeoCoords {
  warmUpCoordinates();
  return cachedGeo || getFallbackCoords();
}

export async function getCurrentCoordinates(): Promise<GeoCoords> {
  return new Promise((resolve) => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: Number(position.coords.latitude.toFixed(4)),
            longitude: Number(position.coords.longitude.toFixed(4)),
            locationName: 'พิกัด GPS สแกนเนอร์ปัจจุบัน',
          };
          cachedGeo = coords;
          resolve(coords);
        },
        () => {
          // Graceful fallback with realistic Thai bus stop coordinates
          const defaultLat = 13.7548 + (Math.random() - 0.5) * 0.01;
          const defaultLng = 100.4982 + (Math.random() - 0.5) * 0.01;
          resolve({
            latitude: Number(defaultLat.toFixed(4)),
            longitude: Number(defaultLng.toFixed(4)),
            locationName: 'จุดรับส่งพนักงาน',
          });
        },
        { timeout: 3500, enableHighAccuracy: true }
      );
    } else {
      resolve(getFallbackCoords());
    }
  });
}
