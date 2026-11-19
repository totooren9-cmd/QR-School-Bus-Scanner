import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Printer,
  FileDown,
  Search,
  CheckSquare,
  Square,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Bus,
  Building2,
  QrCode,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { Student, Car } from '../types';

export type QRSizePreset = 'qr-3.5' | 'card-3.5' | 'qr-4.5' | 'custom';

interface QRPrintPageProps {
  students: Student[];
  cars?: Car[];
  preselectedStudentId?: string | null;
  onClearPreselection?: () => void;
  onGoToStudents?: () => void;
}

const A4_PRINTABLE_WIDTH_CM = 19.0;
const A4_PRINTABLE_HEIGHT_CM = 27.6;

export const QRPrintPage: React.FC<QRPrintPageProps> = ({
  students,
  cars = [],
  preselectedStudentId = null,
  onClearPreselection,
  onGoToStudents,
}) => {
  // Filters
  const [filterCar, setFilterCar] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection (Set of student keys; empty/null behavior handled explicitly)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (preselectedStudentId) return new Set([preselectedStudentId]);
    return new Set(students.map((s) => s.id || s.studentCode));
  });
  const [hasInitializedSelection, setHasInitializedSelection] = useState<boolean>(false);

  // Print Layout & Sizing Settings
  const [preset, setPreset] = useState<QRSizePreset>('qr-3.5');
  const [customQrCm, setCustomQrCm] = useState<number>(3.5);
  const [copiesPerPerson, setCopiesPerPerson] = useState<number>(1);
  const [gapMm, setGapMm] = useState<number>(3);
  const [showName, setShowName] = useState<boolean>(true);
  const [showCode, setShowCode] = useState<boolean>(true);
  const [showDeptAndBus, setShowDeptAndBus] = useState<boolean>(true);
  const [showCutLines, setShowCutLines] = useState<boolean>(true);

  // Preview UI state
  const [previewZoom, setPreviewZoom] = useState<number>(0.85);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [printToast, setPrintToast] = useState<string | null>(null);

  // Generated high-res QR map (studentKey -> dataURL)
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const printSheetRef = useRef<HTMLDivElement>(null);

  const getStudentKey = (s: Student) => s.id || s.student_id || s.studentCode;

  // Sync initial or preselected selection
  useEffect(() => {
    if (preselectedStudentId) {
      setSelectedIds(new Set([preselectedStudentId]));
      setHasInitializedSelection(true);
      return;
    }
    if (!hasInitializedSelection && students.length > 0) {
      setSelectedIds(new Set(students.map(getStudentKey)));
      setHasInitializedSelection(true);
    }
  }, [students, preselectedStudentId, hasInitializedSelection]);

  // Unique departments and buses for filters
  const allDepartments = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const dept = (s.className || s.grade || '').trim();
      if (dept) set.add(dept);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [students]);

  const allBuses = useMemo(() => {
    const set = new Set<string>([
      ...cars.map((c) => c.carID),
      ...students.map((s) => s.car_id || s.carID || s.busNumber || '').filter(Boolean),
    ]);
    return Array.from(set).filter(Boolean).sort();
  }, [cars, students]);

  // Filtered roster
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      const carVal = s.car_id || s.carID || s.busNumber || '';
      const deptVal = s.className || s.grade || '';
      if (filterCar && carVal !== filterCar && s.busNumber !== filterCar) return false;
      if (filterDept && deptVal !== filterDept && s.grade !== filterDept) return false;
      if (q) {
        const seatStr = s.seat_number != null ? String(s.seat_number) : String(s.number || '');
        const match =
          s.name.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          (s.nickname && s.nickname.toLowerCase().includes(q)) ||
          deptVal.toLowerCase().includes(q) ||
          seatStr.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [students, filterCar, filterDept, searchQuery]);

  // Active selected students (respecting current filtered list if user wants, or all selected in roster)
  const selectedStudents = useMemo(() => {
    return filteredStudents.filter((s) => selectedIds.has(getStudentKey(s)));
  }, [filteredStudents, selectedIds]);

  // Expand by copies per person
  const printableCardsList = useMemo(() => {
    const expanded: Student[] = [];
    selectedStudents.forEach((st) => {
      for (let c = 0; c < copiesPerPerson; c++) {
        expanded.push(st);
      }
    });
    return expanded;
  }, [selectedStudents, copiesPerPerson]);

  // Compute physical card & QR dimensions in cm
  const dimensions = useMemo(() => {
    const gapCm = gapMm / 10;

    if (preset === 'card-3.5') {
      // Exact 3.5 x 3.5 cm outer square sticker/card
      const cardWidthCm = 3.5;
      const cardHeightCm = 3.5;
      const hasFooterText = showName || showCode || showDeptAndBus;
      const qrSizeCm = hasFooterText ? 2.45 : 3.1;
      const cols = Math.max(1, Math.floor((A4_PRINTABLE_WIDTH_CM + gapCm) / (cardWidthCm + gapCm)));
      const rows = Math.max(1, Math.floor((A4_PRINTABLE_HEIGHT_CM + gapCm) / (cardHeightCm + gapCm)));
      return {
        qrSizeCm,
        cardWidthCm,
        cardHeightCm,
        gapCm,
        cols,
        rows,
        perPage: cols * rows,
        isCompactCard: true,
      };
    }

    if (preset === 'qr-4.5') {
      const qrSizeCm = 4.5;
      const cardWidthCm = 5.4;
      const extraTextH = (showName ? 0.55 : 0) + (showCode ? 0.42 : 0) + (showDeptAndBus ? 0.38 : 0);
      const cardHeightCm = Number((qrSizeCm + 0.55 + extraTextH).toFixed(2));
      const cols = Math.max(1, Math.floor((A4_PRINTABLE_WIDTH_CM + gapCm) / (cardWidthCm + gapCm)));
      const rows = Math.max(1, Math.floor((A4_PRINTABLE_HEIGHT_CM + gapCm) / (cardHeightCm + gapCm)));
      return {
        qrSizeCm,
        cardWidthCm,
        cardHeightCm,
        gapCm,
        cols,
        rows,
        perPage: cols * rows,
        isCompactCard: false,
      };
    }

    // Default 'qr-3.5' or 'custom': QR image itself is exact customQrCm (default 3.5 x 3.5 cm)
    const qrSizeCm = preset === 'qr-3.5' ? 3.5 : customQrCm;
    const cardWidthCm = Number(Math.max(qrSizeCm + 0.7, 3.8).toFixed(2));
    const extraTextH = (showName ? 0.52 : 0) + (showCode ? 0.4 : 0) + (showDeptAndBus ? 0.38 : 0);
    const cardHeightCm = Number((qrSizeCm + 0.45 + extraTextH).toFixed(2));
    const cols = Math.max(1, Math.floor((A4_PRINTABLE_WIDTH_CM + gapCm) / (cardWidthCm + gapCm)));
    const rows = Math.max(1, Math.floor((A4_PRINTABLE_HEIGHT_CM + gapCm) / (cardHeightCm + gapCm)));

    return {
      qrSizeCm,
      cardWidthCm,
      cardHeightCm,
      gapCm,
      cols,
      rows,
      perPage: cols * rows,
      isCompactCard: false,
    };
  }, [preset, customQrCm, gapMm, showName, showCode, showDeptAndBus]);

  // Chunk printable items into exact A4 pages
  const a4Pages = useMemo(() => {
    const pages: Student[][] = [];
    const perPage = Math.max(1, dimensions.perPage);
    for (let i = 0; i < printableCardsList.length; i += perPage) {
      pages.push(printableCardsList.slice(i, i + perPage));
    }
    return pages;
  }, [printableCardsList, dimensions.perPage]);

  // Generate high-resolution local PNG QR Data URLs in batches
  useEffect(() => {
    let cancelled = false;

    const missing = selectedStudents.filter((s) => !qrMap[getStudentKey(s)]);
    if (missing.length === 0) return;

    const generateBatch = async () => {
      setIsGenerating(true);
      setGenProgress({ done: 0, total: missing.length });

      const nextEntries: Record<string, string> = {};
      const chunkSize = 25;

      for (let i = 0; i < missing.length; i += chunkSize) {
        if (cancelled) return;
        const chunk = missing.slice(i, i + chunkSize);

        await Promise.all(
          chunk.map(async (student) => {
            const key = getStudentKey(student);
            const payload = JSON.stringify({
              code: student.studentCode || student.id,
              name: student.name,
              grade: student.className || student.grade,
              bus: student.busNumber || student.carID,
            });

            try {
              const dataUrl = await QRCode.toDataURL(payload, {
                width: 480, // ~340 DPI at 3.5cm print size
                margin: 1,
                errorCorrectionLevel: 'M',
                color: {
                  dark: '#000000',
                  light: '#ffffff',
                },
              });
              nextEntries[key] = dataUrl;
            } catch {
              // Ignore individual failure
            }
          })
        );

        if (!cancelled) {
          setGenProgress({
            done: Math.min(i + chunk.length, missing.length),
            total: missing.length,
          });
        }
      }

      if (!cancelled && Object.keys(nextEntries).length > 0) {
        setQrMap((prev) => ({ ...prev, ...nextEntries }));
      }
      if (!cancelled) {
        setIsGenerating(false);
      }
    };

    generateBatch();

    return () => {
      cancelled = true;
    };
  }, [selectedStudents, qrMap]);

  // Selection helpers
  const toggleSelectAllFiltered = () => {
    const allFilteredSelected =
      filteredStudents.length > 0 &&
      filteredStudents.every((s) => selectedIds.has(getStudentKey(s)));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredStudents.forEach((s) => next.delete(getStudentKey(s)));
      } else {
        filteredStudents.forEach((s) => next.add(getStudentKey(s)));
      }
      return next;
    });
  };

  const toggleStudent = (s: Student) => {
    const key = getStudentKey(s);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Show subtle status notice
  const notify = (msg: string) => {
    setPrintToast(msg);
    setTimeout(() => {
      setPrintToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  // Execute clean A4 print using hidden #printFrame iframe
  const handleExecutePrint = () => {
    if (printableCardsList.length === 0) {
      notify('กรุณาเลือกรายชื่ออย่างน้อย 1 คนก่อนสั่งพิมพ์');
      return;
    }

    if (isGenerating) {
      notify('กำลังสร้างภาพ QR Code ความละเอียดสูง กรุณารอสักครู่...');
      return;
    }

    setIsPrinting(true);

    const cardsHtmlForPages = a4Pages
      .map((pageItems, pageIdx) => {
        const cardsHtml = pageItems
          .map((st) => {
            const key = getStudentKey(st);
            const imgSrc = qrMap[key] || '';
            const empNumber =
              st.seat_number != null
                ? String(st.seat_number)
                : st.seatNumber != null
                ? String(st.seatNumber)
                : st.number
                ? String(st.number)
                : '';
            const codeDisplay = empNumber
              ? `${st.studentCode || st.id} (#${empNumber})`
              : st.studentCode || st.id;
            const deptDisplay = st.className || st.grade || '';
            const busDisplay = st.car_id || st.carID || st.busNumber || '';
            const metaText = [deptDisplay, busDisplay].filter(Boolean).join(' · ');

            return `
              <div class="qr-card ${dimensions.isCompactCard ? 'compact' : ''}">
                <div class="qr-box">
                  ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(st.name)}" />` : ''}
                </div>
                ${
                  showName || showCode || showDeptAndBus
                    ? `<div class="qr-meta">
                        ${showName ? `<div class="qr-name">${escapeHtml(st.name)}</div>` : ''}
                        ${showCode ? `<div class="qr-code">${escapeHtml(codeDisplay)}</div>` : ''}
                        ${
                          showDeptAndBus && metaText
                            ? `<div class="qr-sub">${escapeHtml(metaText)}</div>`
                            : ''
                        }
                      </div>`
                    : ''
                }
              </div>
            `;
          })
          .join('');

        return `
          <div class="a4-page ${pageIdx < a4Pages.length - 1 ? 'page-break' : ''}">
            <div class="qr-grid">
              ${cardsHtml}
            </div>
          </div>
        `;
      })
      .join('');

    const htmlDoc = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>พิมพ์ QR Code (${dimensions.qrSizeCm} x ${dimensions.qrSizeCm} cm)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 1.0cm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Prompt', 'Sarabun', system-ui, sans-serif;
    }
    .a4-page {
      width: 19.0cm;
      min-height: 27.6cm;
      padding: 0;
      margin: 0 auto;
      background: #ffffff;
    }
    .a4-page.page-break {
      page-break-after: always;
      break-after: page;
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(${dimensions.cols}, ${dimensions.cardWidthCm}cm);
      gap: ${dimensions.gapCm}cm;
      justify-content: center;
      align-content: start;
    }
    .qr-card {
      width: ${dimensions.cardWidthCm}cm;
      height: ${dimensions.cardHeightCm}cm;
      border: ${showCutLines ? '1px dashed #94a3b8' : '1px solid transparent'};
      border-radius: 0.16cm;
      padding: ${dimensions.isCompactCard ? '0.14cm 0.12cm' : '0.2cm 0.18cm'};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .qr-box {
      width: ${dimensions.qrSizeCm}cm;
      height: ${dimensions.qrSizeCm}cm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #ffffff;
    }
    .qr-box img {
      width: ${dimensions.qrSizeCm}cm;
      height: ${dimensions.qrSizeCm}cm;
      display: block;
      image-rendering: pixelated;
    }
    .qr-meta {
      width: 100%;
      text-align: center;
      margin-top: ${dimensions.isCompactCard ? '0.06cm' : '0.12cm'};
      line-height: 1.18;
      overflow: hidden;
    }
    .qr-name {
      font-size: ${dimensions.isCompactCard ? '6.5pt' : '8.5pt'};
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-code {
      font-size: ${dimensions.isCompactCard ? '5.8pt' : '7.5pt'};
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #334155;
      margin-top: 0.03cm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-sub {
      font-size: ${dimensions.isCompactCard ? '5.2pt' : '6.8pt'};
      color: #475569;
      margin-top: 0.02cm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  ${cardsHtmlForPages}
</body>
</html>`;

    const frame = document.getElementById('printFrame') as HTMLIFrameElement | null;
    if (frame && frame.contentWindow && frame.contentDocument) {
      const doc = frame.contentDocument;
      doc.open();
      doc.write(htmlDoc);
      doc.close();

      setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          notify(`เปิดหน้าต่างสั่งพิมพ์ ${printableCardsList.length} ดวง (${a4Pages.length} หน้า A4)`);
        } catch {
          window.print();
        } finally {
          setIsPrinting(false);
        }
      }, 350);
    } else {
      setIsPrinting(false);
      window.print();
    }
  };

  // Export exact-centimeter A4 PDF using jsPDF + 305-DPI Canvas Thai text rendering
  const handleExportPDF = async () => {
    if (printableCardsList.length === 0) {
      notify('กรุณาเลือกรายชื่ออย่างน้อย 1 คนก่อนส่งออก PDF');
      return;
    }

    if (isGenerating) {
      notify('กำลังสร้างภาพ QR Code ความละเอียดสูง กรุณารอสักครู่...');
      return;
    }

    setIsExportingPdf(true);
    setPdfProgress({ done: 0, total: a4Pages.length });

    try {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await document.fonts.ready.catch(() => {});
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'cm',
        format: 'a4',
        compress: true,
      });

      const pageWidthCm = 21.0;
      const topMarginCm = 1.0;
      const totalGridWidth =
        dimensions.cols * dimensions.cardWidthCm +
        Math.max(0, dimensions.cols - 1) * dimensions.gapCm;
      const startX = Math.max(1.0, (pageWidthCm - totalGridWidth) / 2);
      const startY = topMarginCm;

      // Offscreen canvas for crisp Thai text rendering (~305 DPI = 120 px/cm)
      const pxPerCm = 120;
      const textCanvas = document.createElement('canvas');
      const ctx = textCanvas.getContext('2d');

      const padX = dimensions.isCompactCard ? 0.12 : 0.18;
      const innerWidthCm = Math.max(1.5, dimensions.cardWidthCm - padX * 2);
      const canvasW = Math.round(innerWidthCm * pxPerCm);

      const truncateToWidth = (text: string, maxPx: number): string => {
        if (!ctx) return text;
        if (ctx.measureText(text).width <= maxPx) return text;
        let trimmed = text;
        while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxPx) {
          trimmed = trimmed.slice(0, -1);
        }
        return `${trimmed}…`;
      };

      for (let pageIdx = 0; pageIdx < a4Pages.length; pageIdx++) {
        if (pageIdx > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const pageItems = a4Pages[pageIdx];

        for (let cardIdx = 0; cardIdx < pageItems.length; cardIdx++) {
          const st = pageItems[cardIdx];
          const col = cardIdx % dimensions.cols;
          const row = Math.floor(cardIdx / dimensions.cols);

          const cardX = startX + col * (dimensions.cardWidthCm + dimensions.gapCm);
          const cardY = startY + row * (dimensions.cardHeightCm + dimensions.gapCm);

          // 1. Optional dashed cut line border
          if (showCutLines) {
            pdf.setDrawColor(148, 163, 184);
            pdf.setLineWidth(0.02);
            pdf.setLineDashPattern([0.12, 0.08], 0);
            pdf.roundedRect(
              cardX,
              cardY,
              dimensions.cardWidthCm,
              dimensions.cardHeightCm,
              0.16,
              0.16,
              'S'
            );
            pdf.setLineDashPattern([], 0);
          }

          // 2. Prepare metadata lines
          const empNumber =
            st.seat_number != null
              ? String(st.seat_number)
              : st.seatNumber != null
              ? String(st.seatNumber)
              : st.number
              ? String(st.number)
              : '';
          const codeDisplay = empNumber
            ? `${st.studentCode || st.id} (#${empNumber})`
            : st.studentCode || st.id;
          const deptDisplay = st.className || st.grade || '';
          const busDisplay = st.car_id || st.carID || st.busNumber || '';
          const metaText = [deptDisplay, busDisplay].filter(Boolean).join(' · ');

          const nameLineH = showName ? (dimensions.isCompactCard ? 0.30 : 0.40) : 0;
          const codeLineH = showCode ? (dimensions.isCompactCard ? 0.25 : 0.33) : 0;
          const subLineH =
            showDeptAndBus && metaText ? (dimensions.isCompactCard ? 0.23 : 0.29) : 0;
          const metaHeightCm = nameLineH + codeLineH + subLineH;
          const hasMeta = metaHeightCm > 0;
          const metaGapCm = hasMeta ? (dimensions.isCompactCard ? 0.06 : 0.11) : 0;

          const totalContentH = dimensions.qrSizeCm + metaGapCm + metaHeightCm;
          const contentStartY = cardY + Math.max(0.06, (dimensions.cardHeightCm - totalContentH) / 2);

          // 3. Draw exact physical size QR Code
          const qrX = cardX + (dimensions.cardWidthCm - dimensions.qrSizeCm) / 2;
          const qrY = contentStartY;
          const key = getStudentKey(st);
          const qrDataUrl =
            qrMap[key] ||
            (await QRCode.toDataURL(
              JSON.stringify({
                code: st.studentCode || st.id,
                name: st.name,
                grade: st.className || st.grade,
                bus: st.busNumber || st.carID,
              }),
              { width: 480, margin: 1, errorCorrectionLevel: 'M' }
            ));

          pdf.addImage(
            qrDataUrl,
            'PNG',
            qrX,
            qrY,
            dimensions.qrSizeCm,
            dimensions.qrSizeCm,
            undefined,
            'FAST'
          );

          // 4. Draw crisp Thai metadata via high-DPI offscreen canvas
          if (hasMeta && ctx) {
            const canvasH = Math.max(16, Math.round(metaHeightCm * pxPerCm));
            textCanvas.width = canvasW;
            textCanvas.height = canvasH;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let cursorY = 0;

            if (showName) {
              const fontPx = Math.round((dimensions.isCompactCard ? 0.23 : 0.30) * pxPerCm);
              ctx.font = `700 ${fontPx}px 'Prompt', 'Sarabun', system-ui, sans-serif`;
              ctx.fillStyle = '#0f172a';
              const safeName = truncateToWidth(st.name || '', canvasW - 6);
              const boxPx = nameLineH * pxPerCm;
              ctx.fillText(safeName, canvasW / 2, cursorY + boxPx / 2);
              cursorY += boxPx;
            }

            if (showCode) {
              const fontPx = Math.round((dimensions.isCompactCard ? 0.19 : 0.25) * pxPerCm);
              ctx.font = `600 ${fontPx}px ui-monospace, 'Prompt', monospace`;
              ctx.fillStyle = '#334155';
              const safeCode = truncateToWidth(codeDisplay, canvasW - 6);
              const boxPx = codeLineH * pxPerCm;
              ctx.fillText(safeCode, canvasW / 2, cursorY + boxPx / 2);
              cursorY += boxPx;
            }

            if (showDeptAndBus && metaText) {
              const fontPx = Math.round((dimensions.isCompactCard ? 0.175 : 0.225) * pxPerCm);
              ctx.font = `400 ${fontPx}px 'Prompt', 'Sarabun', system-ui, sans-serif`;
              ctx.fillStyle = '#475569';
              const safeSub = truncateToWidth(metaText, canvasW - 6);
              const boxPx = subLineH * pxPerCm;
              ctx.fillText(safeSub, canvasW / 2, cursorY + boxPx / 2);
            }

            const textDataUrl = textCanvas.toDataURL('image/png');
            pdf.addImage(
              textDataUrl,
              'PNG',
              cardX + padX,
              qrY + dimensions.qrSizeCm + metaGapCm,
              innerWidthCm,
              metaHeightCm,
              undefined,
              'FAST'
            );
          }
        }

        setPdfProgress({ done: pageIdx + 1, total: a4Pages.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      const sizeTag = `${dimensions.qrSizeCm.toFixed(1)}x${dimensions.qrSizeCm.toFixed(1)}cm`;
      pdf.save(`qr-codes-${sizeTag}-${dateTag}.pdf`);
      notify(`ส่งออก PDF สำเร็จ ${printableCardsList.length} บัตร (${a4Pages.length} หน้า A4)`);
    } catch (err) {
      console.error('PDF export error:', err);
      notify(`ไม่สามารถสร้างไฟล์ PDF ได้: ${err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'}`);
    } finally {
      setIsExportingPdf(false);
      setPdfProgress(null);
    }
  };

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedIds.has(getStudentKey(s)));

  return (
    <div
      id="qrPrintWorkspace"
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col'
          : 'flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden'
      }`}
    >
      {/* Top Action Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <QrCode className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate">
              หน้าสั่งพิมพ์บัตร QR Code (ขนาดมาตรฐาน 3.5 × 3.5 ซม.)
            </h2>
            <p className="text-xs text-slate-400 font-mono tabular-nums truncate">
              เลือก {selectedStudents.length} คน · {printableCardsList.length} บัตร ·{' '}
              {a4Pages.length || 0} หน้า A4 ({dimensions.cols}×{dimensions.rows} ต่อหน้า)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {preselectedStudentId && onClearPreselection && (
            <button
              type="button"
              onClick={() => {
                onClearPreselection();
                setSelectedIds(new Set(students.map(getStudentKey)));
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>แสดงทุกคน</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            title={isFullscreen ? 'ย่อหน้าต่าง' : 'ขยายเต็มหน้าจอ'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'ย่อหน้าต่าง' : 'เต็มหน้าจอ'}</span>
          </button>

          <button
            type="button"
            id="btnExportQrPdf"
            onClick={handleExportPDF}
            disabled={printableCardsList.length === 0 || isGenerating || isPrinting || isExportingPdf}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap shrink-0"
            title="ดาวน์โหลดเป็นไฟล์ PDF ขนาด A4 (ขนาด QR ตรงตามที่ตั้งไว้)"
          >
            {isExportingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            <span>
              {isExportingPdf
                ? `กำลังสร้าง PDF (${pdfProgress?.done || 0}/${pdfProgress?.total || a4Pages.length})`
                : 'ส่งออก PDF'}
            </span>
          </button>

          <button
            type="button"
            id="btnPrintQrA4"
            onClick={handleExecutePrint}
            disabled={printableCardsList.length === 0 || isGenerating || isPrinting || isExportingPdf}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            {isGenerating || isPrinting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>
              {isGenerating
                ? `กำลังเตรียม QR (${genProgress.done}/${genProgress.total})`
                : `สั่งพิมพ์ A4 (${printableCardsList.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {printToast && (
        <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-5 py-2 text-xs text-emerald-300 flex items-center gap-2 shrink-0">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{printToast}</span>
        </div>
      )}

      {/* Main Split Workspace: Controls Sidebar + A4 Preview Canvas */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 ${
          isFullscreen ? 'flex-1 min-h-0' : 'min-h-[680px]'
        }`}
      >
        {/* LEFT: Print Controls & Roster Checklist */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-slate-900/90 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 space-y-5 overflow-y-auto max-h-[75vh] lg:max-h-full">
          {/* 1. Size Preset Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>ตั้งค่าขนาด QR Code</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums text-amber-400">
                QR {dimensions.qrSizeCm.toFixed(1)}×{dimensions.qrSizeCm.toFixed(1)} cm
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => setPreset('qr-3.5')}
                className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                  preset === 'qr-3.5'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>QR ขนาด 3.5 × 3.5 ซม. (แนะนำ)</span>
                  {preset === 'qr-3.5' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  ภาพ QR เต็ม 3.5 ซม. สแกนง่ายไม่เล็กเกินไป · 20 ใบ/A4
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPreset('card-3.5')}
                className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                  preset === 'card-3.5'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>สติกเกอร์รวมกรอบ 3.5 × 3.5 ซม.</span>
                  {preset === 'card-3.5' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  สี่เหลี่ยมจัตุรัสทั้งใบ 3.5×3.5 ซม. · 35 ดวง/A4
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPreset('qr-4.5')}
                className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                  preset === 'qr-4.5'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>ขนาดใหญ่ QR 4.5 × 4.5 ซม.</span>
                  {preset === 'qr-4.5' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  สำหรับติดป้ายหน้ารถหรือบัตรใหญ่ · 12 ใบ/A4
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPreset('custom')}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                  preset === 'custom'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>กำหนดขนาด QR เอง ({customQrCm.toFixed(1)} ซม.)</span>
                  {preset === 'custom' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
              </button>
            </div>

            {preset === 'custom' && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>ความกว้าง QR Code</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                    {customQrCm.toFixed(1)} × {customQrCm.toFixed(1)} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={2.5}
                  max={5.5}
                  step={0.1}
                  value={customQrCm}
                  onChange={(e) => setCustomQrCm(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="text-xs font-semibold text-slate-200">รายละเอียดบนบัตร & ระยะห่าง</div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">จำนวนชุด / คน</label>
                <select
                  value={copiesPerPerson}
                  onChange={(e) => setCopiesPerPerson(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value={1}>1 ดวง / คน</option>
                  <option value={2}>2 ดวง / คน</option>
                  <option value={3}>3 ดวง / คน</option>
                  <option value={4}>4 ดวง / คน</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ช่องไฟตัดบัตร</label>
                <select
                  value={gapMm}
                  onChange={(e) => setGapMm(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value={2}>2 มม. (ชิด)</option>
                  <option value={3}>3 มม. (มาตรฐาน)</option>
                  <option value={5}>5 มม. (ตัดง่าย)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showName}
                  onChange={(e) => setShowName(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span>แสดงชื่อ-นามสกุล</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCode}
                  onChange={(e) => setShowCode(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span>แสดงรหัส QR / รหัสพนักงาน</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDeptAndBus}
                  onChange={(e) => setShowDeptAndBus(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span>แสดงแผนกและสายรถ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCutLines}
                  onChange={(e) => setShowCutLines(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span>แสดงเส้นประสำหรับตัดบัตร</span>
              </label>
            </div>
          </div>

          {/* 3. Filter & Select Roster */}
          <div className="border-t border-slate-800 pt-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">เลือกรายชื่อที่จะพิมพ์</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {selectedStudents.length}/{filteredStudents.length}
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ, รหัส, แผนก..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="relative">
                <Bus className="w-3 h-3 text-slate-400 absolute left-2 top-2.5 pointer-events-none" />
                <select
                  value={filterCar}
                  onChange={(e) => setFilterCar(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-6 pr-2 py-1.5 text-[11px] text-white"
                >
                  <option value="">ทุกสายรถ</option>
                  {allBuses.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Building2 className="w-3 h-3 text-slate-400 absolute left-2 top-2.5 pointer-events-none" />
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-6 pr-2 py-1.5 text-[11px] text-white"
                >
                  <option value="">ทุกแผนก</option>
                  {allDepartments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{allFilteredSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}</span>
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="py-1.5 px-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] transition-colors"
              >
                ล้างที่เลือก
              </button>
            </div>

            {/* Compact Checklist */}
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60">
              {filteredStudents.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-slate-500">
                  ไม่พบรายชื่อที่ตรงกับตัวกรอง
                </div>
              ) : (
                filteredStudents.map((st) => {
                  const key = getStudentKey(st);
                  const checked = selectedIds.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-900 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(st)}
                        className="rounded border-slate-600 bg-slate-900 text-emerald-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-200 truncate">{st.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {st.studentCode} · {st.className || st.grade || '-'} · {st.car_id || st.carID || st.busNumber || '-'}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: Live A4 Print Sheet Preview */}
        <main className="lg:col-span-8 xl:col-span-9 bg-slate-950 flex flex-col min-h-0">
          {/* Preview Toolbar */}
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="text-slate-300 font-mono tabular-nums flex items-center gap-3">
              <span>ขนาดกระดาษ: A4 (21.0 × 29.7 cm)</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                ขนาดบัตร: {dimensions.cardWidthCm} × {dimensions.cardHeightCm} cm
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-400">
                QR: {dimensions.qrSizeCm.toFixed(1)} × {dimensions.qrSizeCm.toFixed(1)} cm
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="ย่อมุมมอง"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono tabular-nums text-[11px] text-slate-300 w-12 text-center">
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="ขยายมุมมอง"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* A4 Paper Viewport */}
          <div
            ref={printSheetRef}
            className="flex-1 overflow-auto p-6 sm:p-8 flex flex-col items-center gap-8 bg-slate-950"
          >
            {students.length === 0 ? (
              <div className="my-auto max-w-md text-center space-y-3 py-12">
                <QrCode className="w-10 h-10 text-slate-500 mx-auto" />
                <h3 className="text-sm font-semibold text-white">
                  ยังไม่มีรายชื่อในฐานข้อมูลสำหรับพิมพ์ QR Code
                </h3>
                <p className="text-xs text-slate-400">
                  กรุณาเชื่อมต่อ Firebase หรือเพิ่มรายชื่อพนักงานในระบบก่อนสั่งพิมพ์บัตร QR
                </p>
                {onGoToStudents && (
                  <button
                    type="button"
                    onClick={onGoToStudents}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                  >
                    ไปที่รายชื่อพนักงาน
                  </button>
                )}
              </div>
            ) : printableCardsList.length === 0 ? (
              <div className="my-auto max-w-md text-center space-y-3 py-12">
                <CheckSquare className="w-10 h-10 text-slate-500 mx-auto" />
                <h3 className="text-sm font-semibold text-white">
                  ยังไม่ได้เลือกรายชื่อสำหรับพิมพ์
                </h3>
                <p className="text-xs text-slate-400">
                  ติ๊กเลือกรายชื่อจากรายการด้านซ้าย หรือกดปุ่ม &quot;เลือกทั้งหมด&quot; เพื่อแสดงตัวอย่างหน้ากระดาษ A4
                </p>
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                >
                  เลือกทั้งหมด ({filteredStudents.length} คน)
                </button>
              </div>
            ) : (
              a4Pages.map((pageItems, pageIndex) => (
                <div key={`a4-page-${pageIndex}`} className="flex flex-col items-center gap-2 shrink-0">
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 flex items-center gap-2">
                    <span>
                      หน้าที่ {pageIndex + 1} / {a4Pages.length}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{pageItems.length} บัตรในหน้านี้</span>
                  </div>

                  {/* Scaled Wrapper for Visual A4 Sheet */}
                  <div
                    style={{
                      width: `${21 * previewZoom}cm`,
                      height: `${29.7 * previewZoom}cm`,
                    }}
                    className="relative shrink-0"
                  >
                    <div
                      style={{
                        width: '21cm',
                        minHeight: '29.7cm',
                        padding: '1cm',
                        transform: `scale(${previewZoom})`,
                        transformOrigin: 'top left',
                      }}
                      className="bg-white text-slate-900 shadow-2xl border border-slate-300"
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${dimensions.cols}, ${dimensions.cardWidthCm}cm)`,
                          gap: `${dimensions.gapCm}cm`,
                          justifyContent: 'center',
                          alignContent: 'start',
                        }}
                      >
                        {pageItems.map((st, cardIdx) => {
                          const key = getStudentKey(st);
                          const qrSrc = qrMap[key];
                          const empNumber =
                            st.seat_number != null
                              ? String(st.seat_number)
                              : st.seatNumber != null
                              ? String(st.seatNumber)
                              : st.number
                              ? String(st.number)
                              : '';
                          const codeDisplay = empNumber
                            ? `${st.studentCode || st.id} (#${empNumber})`
                            : st.studentCode || st.id;
                          const deptDisplay = st.className || st.grade || '';
                          const busDisplay = st.car_id || st.carID || st.busNumber || '';
                          const metaText = [deptDisplay, busDisplay].filter(Boolean).join(' · ');

                          return (
                            <div
                              key={`${key}-${pageIndex}-${cardIdx}`}
                              style={{
                                width: `${dimensions.cardWidthCm}cm`,
                                height: `${dimensions.cardHeightCm}cm`,
                                padding: dimensions.isCompactCard ? '0.14cm 0.12cm' : '0.2cm 0.18cm',
                                border: showCutLines ? '1px dashed #94a3b8' : '1px solid #f1f5f9',
                                borderRadius: '0.16cm',
                              }}
                              className="bg-white flex flex-col items-center justify-center overflow-hidden"
                            >
                              <div
                                style={{
                                  width: `${dimensions.qrSizeCm}cm`,
                                  height: `${dimensions.qrSizeCm}cm`,
                                }}
                                className="flex items-center justify-center shrink-0 bg-white"
                              >
                                {qrSrc ? (
                                  <img
                                    src={qrSrc}
                                    alt={st.name}
                                    style={{
                                      width: `${dimensions.qrSizeCm}cm`,
                                      height: `${dimensions.qrSizeCm}cm`,
                                    }}
                                    className="block"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-slate-100 animate-pulse rounded" />
                                )}
                              </div>

                              {(showName || showCode || showDeptAndBus) && (
                                <div
                                  style={{
                                    marginTop: dimensions.isCompactCard ? '0.06cm' : '0.12cm',
                                    lineHeight: 1.18,
                                  }}
                                  className="w-full text-center overflow-hidden"
                                >
                                  {showName && (
                                    <div
                                      style={{
                                        fontSize: dimensions.isCompactCard ? '6.5pt' : '8.5pt',
                                      }}
                                      className="font-bold text-slate-900 truncate"
                                    >
                                      {st.name}
                                    </div>
                                  )}
                                  {showCode && (
                                    <div
                                      style={{
                                        fontSize: dimensions.isCompactCard ? '5.8pt' : '7.5pt',
                                      }}
                                      className="font-mono font-semibold text-slate-700 truncate"
                                    >
                                      {codeDisplay}
                                    </div>
                                  )}
                                  {showDeptAndBus && metaText && (
                                    <div
                                      style={{
                                        fontSize: dimensions.isCompactCard ? '5.2pt' : '6.8pt',
                                      }}
                                      className="text-slate-600 truncate"
                                    >
                                      {metaText}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
