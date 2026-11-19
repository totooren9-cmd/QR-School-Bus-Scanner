import React, { useRef, useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { ScanRecord } from '../types';
import { playSuccessChime, triggerVibration } from '../utils/audio';

interface CameraHalfProps {
  onScanSuccess: (studentData: { studentCode?: string; rawText: string; source: 'camera' | 'upload' | 'simulated' }) => void;
  checkDuplicateBeforeScan?: (rawText: string) => { blocked: boolean; remainSec: number; label?: string };
  onSimulateScan: () => void;
  onOpenTestScanModal?: () => void;
  activeScan: ScanRecord | null;
  totalScans: number;
  onCameraActiveChange?: (active: boolean) => void;
}

interface FocusRing {
  id: number;
  x: number;
  y: number;
}

const CAMERA_BRIEF_COOLDOWN_MS = 2500;
const JUST_SCANNED_FLASH_MS = 1500;
const DUPLICATE_QR_LOCK_MS = 10000;

export const CameraHalf: React.FC<CameraHalfProps> = ({
  onScanSuccess,
  checkDuplicateBeforeScan,
  onSimulateScan,
  onOpenTestScanModal,
  activeScan,
  totalScans,
  onCameraActiveChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchError, setTorchError] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanningCooldown, setIsScanningCooldown] = useState<boolean>(false);
  const [isJustScanned, setIsJustScanned] = useState<boolean>(false);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [focusRing, setFocusRing] = useState<FocusRing | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const frameCountRef = useRef<number>(0);
  const isCooldownRef = useRef<boolean>(false);
  const isDetectingRef = useRef<boolean>(false);
  const isCameraActiveRef = useRef<boolean>(false);
  const recentRawScansRef = useRef<Map<string, number>>(new Map());
  const lastDuplicateNoticeRef = useRef<number>(0);
  const justScannedTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const duplicateHintTimerRef = useRef<number | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const checkDuplicateRef = useRef(checkDuplicateBeforeScan);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    checkDuplicateRef.current = checkDuplicateBeforeScan;
  }, [checkDuplicateBeforeScan]);

  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
  }, [isCameraActive]);

  const clearScanTimers = useCallback(() => {
    if (justScannedTimerRef.current !== null) {
      window.clearTimeout(justScannedTimerRef.current);
      justScannedTimerRef.current = null;
    }
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (duplicateHintTimerRef.current !== null) {
      window.clearTimeout(duplicateHintTimerRef.current);
      duplicateHintTimerRef.current = null;
    }
  }, []);

  // Initialize native BarcodeDetector if available in browser
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BD = (window as any).BarcodeDetector;
        barcodeDetectorRef.current = new BD({ formats: ['qr_code'] });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Stop camera tracks
  const stopScanner = useCallback(() => {
    clearScanTimers();
    isCameraActiveRef.current = false;
    isCooldownRef.current = false;
    isDetectingRef.current = false;
    setIsScanningCooldown(false);
    setIsJustScanned(false);
    setDuplicateHint(null);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
    onCameraActiveChange?.(false);
  }, [clearScanTimers, onCameraActiveChange]);

  // Apply autofocus to hardware video track
  const applyAutofocusConstraints = useCallback(async (track: MediaStreamTrack) => {
    try {
      if (!track.getCapabilities) return;
      const capabilities = track.getCapabilities() as any;
      const constraints: any = { advanced: [] };

      // Continuous autofocus if supported
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        constraints.advanced.push({ focusMode: 'continuous' });
      }

      // Exposure mode continuous if supported
      if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
        constraints.advanced.push({ exposureMode: 'continuous' });
      }

      if (constraints.advanced.length > 0) {
        await track.applyConstraints(constraints);
      }
    } catch {
      // Ignore if device ignores advanced constraints
    }
  }, []);

  // Trigger scan success with brief delay cooldown & 10-second duplicate QR lock
  const triggerScanFound = useCallback(
    (rawText: string, source: 'camera' | 'upload' | 'simulated' = 'camera') => {
      if (source === 'camera' && isCooldownRef.current) {
        return;
      }

      const normalizedKey = rawText.trim();
      const now = Date.now();

      // Prune expired entries older than 10 seconds
      for (const [key, ts] of recentRawScansRef.current.entries()) {
        if (now - ts >= DUPLICATE_QR_LOCK_MS) {
          recentRawScansRef.current.delete(key);
        }
      }

      const lastScannedAt = recentRawScansRef.current.get(normalizedKey);
      const localBlocked = Boolean(lastScannedAt && now - lastScannedAt < DUPLICATE_QR_LOCK_MS);
      const localRemainSec = lastScannedAt
        ? Math.max(1, Math.ceil((DUPLICATE_QR_LOCK_MS - (now - lastScannedAt)) / 1000))
        : 0;

      const appCheck = checkDuplicateRef.current?.(rawText);
      const isBlocked = localBlocked || Boolean(appCheck?.blocked);
      const remainSec = Math.max(localRemainSec, appCheck?.remainSec || 0, 1);

      if (isBlocked) {
        if (source === 'camera') {
          if (now - lastDuplicateNoticeRef.current >= 850) {
            lastDuplicateNoticeRef.current = now;
            const targetText = appCheck?.label ? ` ${appCheck.label}` : 'คิวอาร์โค้ดนี้';
            setDuplicateHint(`⏳ เพิ่งสแกน${targetText}แล้ว (รออีก ${remainSec} วินาที)`);
            if (duplicateHintTimerRef.current !== null) {
              window.clearTimeout(duplicateHintTimerRef.current);
            }
            duplicateHintTimerRef.current = window.setTimeout(() => {
              setDuplicateHint(null);
            }, 1800);
          }
          return;
        }
        // For gallery upload, forward to App duplicate guard without chime/vibration so user gets toast
        onScanSuccessRef.current({
          rawText,
          source,
        });
        return;
      }

      // Synchronously lock BEFORE chime/emit so no parallel frame can fire
      recentRawScansRef.current.set(normalizedKey, now);
      clearScanTimers();
      isCooldownRef.current = true;
      setIsScanningCooldown(true);
      setIsJustScanned(true);
      setDuplicateHint(null);
      playSuccessChime();
      triggerVibration();

      onScanSuccessRef.current({
        rawText,
        source,
      });

      justScannedTimerRef.current = window.setTimeout(() => {
        setIsJustScanned(false);
      }, JUST_SCANNED_FLASH_MS);

      cooldownTimerRef.current = window.setTimeout(() => {
        isCooldownRef.current = false;
        setIsScanningCooldown(false);
      }, CAMERA_BRIEF_COOLDOWN_MS);
    },
    [clearScanTimers]
  );

  // Dual engine scan loop (Hardware BarcodeDetector + Center Crop jsQR)
  const scanLoop = useCallback(async () => {
    if (!isCameraActiveRef.current || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    if (
      video.readyState === video.HAVE_ENOUGH_DATA &&
      !isCooldownRef.current &&
      !isDetectingRef.current
    ) {
      isDetectingRef.current = true;
      try {
        frameCountRef.current++;
        let detectedText: string | null = null;

        // 1. Hardware BarcodeDetector (instant hardware ISP decode)
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
              detectedText = barcodes[0].rawValue;
            }
          } catch {
            // Fallback to jsQR
          }
        }

        // 2. High-speed Center Viewport Crop with jsQR
        if (!detectedText && canvasRef.current && isCameraActiveRef.current && !isCooldownRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;

            // Crop strictly to the center 65% of the frame (where the viewfinder aligns "ตรง ๆ")
            const cropSize = Math.min(vw, vh) * 0.65;
            const cropX = (vw - cropSize) / 2;
            const cropY = (vh - cropSize) / 2;

            const targetSize = 420;
            canvas.width = targetSize;
            canvas.height = targetSize;

            ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, targetSize, targetSize);

            const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });

            if (code && code.data) {
              detectedText = code.data;
            } else if (frameCountRef.current % 4 === 0) {
              // Check full frame every 4th frame in case QR is slightly off-center
              const fullTargetW = 480;
              const fullTargetH = Math.round((vh / vw) * 480);
              canvas.width = fullTargetW;
              canvas.height = fullTargetH;
              ctx.drawImage(video, 0, 0, fullTargetW, fullTargetH);
              const fullImgData = ctx.getImageData(0, 0, fullTargetW, fullTargetH);
              const fallbackCode = jsQR(fullImgData.data, fullImgData.width, fullImgData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (fallbackCode && fallbackCode.data) {
                detectedText = fallbackCode.data;
              }
            }
          }
        }

        if (detectedText && !isCooldownRef.current && isCameraActiveRef.current) {
          triggerScanFound(detectedText, 'camera');
        }
      } finally {
        isDetectingRef.current = false;
      }
    }

    if (isCameraActiveRef.current) {
      animationFrameId.current = requestAnimationFrame(scanLoop);
    }
  }, [triggerScanFound]);

  // Start real camera with optimal resolution and continuous focus
  const startScanner = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('กล้องไม่รองรับในเบราว์เซอร์นี้');
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          // @ts-expect-error focusMode is standard in mobile MediaTrackConstraints
          focusMode: { ideal: 'continuous' },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) {
        await applyAutofocusConstraints(track);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      setIsCameraActive(true);
      setCameraError(null);
      onCameraActiveChange?.(true);
    } catch (err: unknown) {
      console.warn('Camera start error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(
        msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'อุปกรณ์ยังไม่อนุญาตให้เข้าถึงกล้อง (สามารถใช้ปุ่ม "ทดสอบสแกน" หรือ "คลังรูป" ด้านล่างได้ทันที)'
          : 'ไม่สามารถเปิดกล้องได้ในเบราว์เซอร์นี้ (ใช้ปุ่ม "ทดสอบสแกน" เพื่อทดสอบบันทึกได้ 100%)'
      );
    }
  };

  // Tap-to-Focus interaction
  const handleStageTap = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current || !isCameraActive) return;

    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Show visual iOS-like focus ring
    setFocusRing({ id: Date.now(), x, y });
    setTimeout(() => {
      setFocusRing((curr) => (curr && curr.x === x && curr.y === y ? null : curr));
    }, 850);

    // If hardware track supports point-of-interest focus, apply it
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        try {
          const cap = track.getCapabilities() as any;
          if (cap.pointsOfInterest) {
            const normX = x / rect.width;
            const normY = y / rect.height;
            await track.applyConstraints({
              // @ts-expect-error pointsOfInterest is supported in mobile browsers
              advanced: [{ pointsOfInterest: [{ x: normX, y: normY }] }],
            });
          } else if (cap.focusMode?.includes('continuous')) {
            await track.applyConstraints({
              // @ts-expect-error focusMode
              advanced: [{ focusMode: 'continuous' }],
            });
          }
        } catch {
          // Ignore
        }
      }
    }
  };

  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
    if (isCameraActive) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      animationFrameId.current = requestAnimationFrame(scanLoop);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isCameraActive, scanLoop]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Toggle Torch / Flashlight
  const toggleFlash = async () => {
    if (!streamRef.current) {
      setTorchError(true);
      setTimeout(() => setTorchError(false), 2000);
      return;
    }
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as { torch?: boolean };
      if (capabilities.torch) {
        try {
          const nextTorch = !torchOn;
          await track.applyConstraints({
            // @ts-expect-error torch is valid in modern mobile browsers
            advanced: [{ torch: nextTorch }],
          });
          setTorchOn(nextTorch);
        } catch {
          setTorchError(true);
          setTimeout(() => setTorchError(false), 2000);
        }
      } else {
        setTorchError(true);
        setTimeout(() => setTorchError(false), 2000);
      }
    }
  };

  // Open photo gallery
  const openGallery = () => {
    fileInputRef.current?.click();
  };

  // Upload image file to scan QR
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code && code.data) {
          triggerScanFound(code.data, 'upload');
        } else {
          setCameraError('ไม่พบ QR Code ในรูปภาพที่เลือก กรุณาลองรูปใหม่อีกครั้ง');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="camera-half">
      {/* Dynamic Island */}
      <div className="flex flex-col items-center gap-1.5 z-20 pointer-events-auto">
        <div className="dynamic-island">
          <span className="di-dot"></span>
          <span className="di-text font-medium">
            {activeScan ? `✓ ${activeScan.name} (${activeScan.grade})` : `QR SCAN • ${totalScans} คน`}
          </span>
        </div>
      </div>

      <div
        id="cameraStage"
        ref={stageRef}
        className="camera-stage"
        onClick={handleStageTap}
        title="แตะหน้าจอเพื่อปรับโฟกัสกล้อง"
      >
        {/* Hidden Canvas for QR frame processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Video stream when camera active */}
        <div id="qr-reader" className="qr-reader">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
            style={{ display: isCameraActive ? 'block' : 'none' }}
          />
        </div>

        {/* Tap-to-Focus Animated Ring */}
        {focusRing && (
          <div
            className="camera-focus-ring"
            style={{ left: focusRing.x, top: focusRing.y }}
          />
        )}

        {/* QR Overlay Frame with Precision Optical Alignment ("ตรง ๆ") */}
        {isCameraActive && (
          <div className="qr-overlay" id="qrOverlay">
            <div className={`qr-frame ${isJustScanned ? 'scanned' : ''}`}>
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>

              {/* Center Optical Crosshairs for Direct Focus */}
              <div className="crosshair-center">
                <div className="crosshair-h"></div>
                <div className="crosshair-v"></div>
                <div className="crosshair-dot"></div>
              </div>

              {/* Laser Scanning Line */}
              <div className="scan-line"></div>
            </div>

            <div className="qr-hint flex items-center gap-1.5" id="qrHint">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isJustScanned
                    ? 'bg-emerald-400'
                    : duplicateHint
                    ? 'bg-amber-400 animate-pulse'
                    : isScanningCooldown
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-amber-400 animate-ping'
                }`}
              ></span>
              <span>
                {isJustScanned
                  ? '✓ ล็อกเป้าสำเร็จ! (หน่วงเวลา 2.5 วิ)'
                  : duplicateHint
                  ? duplicateHint
                  : isScanningCooldown
                  ? '⏳ หน่วงเวลาสแกนสักครู่...'
                  : 'จัด QR Code ให้อยู่ตรงกลางกรอบเล็ง (แตะจอเพื่อปรับโฟกัส)'}
              </span>
            </div>
          </div>
        )}

        {/* Start Cover (When camera is not active) */}
        {!isCameraActive && (
          <div className="camera-cover" id="cameraCover">
            <div className="cover-icon">📷</div>
            <h2 className="text-xl font-bold text-white">พร้อมสแกน QR Code</h2>
            <p className="text-slate-300 text-xs mt-1">
              ระบบโฟกัสตรงกึ่งกลาง & บันทึกฐานข้อมูลทุกๆ รายชื่อ Real-time
            </p>

            {cameraError && (
              <div className="mt-3 px-3 py-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-200 text-xs max-w-sm text-center">
                {cameraError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2 mt-4 w-full max-w-xs">
              <button
                className="btn-ios-primary w-full flex items-center justify-center gap-2"
                id="btnStartScan"
                onClick={startScanner}
                type="button"
              >
                <span>เปิดกล้องสแกน</span>
              </button>

              <button
                className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] text-xs flex items-center justify-center gap-1.5"
                id="btnOpenTestScanFromCover"
                onClick={onOpenTestScanModal || onSimulateScan}
                type="button"
              >
                <span>🧪 ทดสอบสแกนรายชื่อ</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Controls */}
        <div className="cam-controls">
          <button
            className={`cam-btn ${torchOn ? 'active' : ''}`}
            id="btnFlash"
            onClick={toggleFlash}
            type="button"
            title="ไฟฉาย"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </button>

          <button
            className="cam-btn"
            onClick={openGallery}
            type="button"
            title="คลังรูป"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>

          <button
            className="cam-btn bg-amber-500/20 text-amber-300 border-amber-500/40"
            onClick={onOpenTestScanModal || onSimulateScan}
            type="button"
            title="ทดสอบสแกน & บันทึกลงฐานข้อมูลทุกๆ รายชื่อ"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </button>

          {isCameraActive && (
            <button
              className="cam-btn"
              onClick={() => {
                const nextMode = facingMode === 'environment' ? 'user' : 'environment';
                setFacingMode(nextMode);
                stopScanner();
                setTimeout(() => startScanner(), 100);
              }}
              type="button"
              title="สลับกล้อง"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8c0 2.21 1.006 4.21 2.607 5.568L4 20l4.432-2.607C9.79 17.794 10.79 18 12 18c4.418 0 8-3.582 8-8z" />
              </svg>
            </button>
          )}
        </div>

        <input
          type="file"
          id="galleryInput"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePhotoUpload}
          style={{ display: 'none' }}
        />

        <div id="torchNote" className={`torch-note ${torchError ? '' : 'hidden'}`}>
          ไฟฉายไม่พร้อมใช้งานบนอุปกรณ์นี้
        </div>
      </div>
    </div>
  );
};
