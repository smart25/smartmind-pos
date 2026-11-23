import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Scan,
  Camera,
  Barcode,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Zap,
} from 'lucide-react';

interface BarcodeCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeCaptured: (barcode: string) => void;
  currentBarcode?: string;
  productName?: string;
  initialTab?: 'gun' | 'camera';
  title?: string;
  subtitle?: string;
  continuous?: boolean;
}

/**
 * Synthesizes POS audio feedback using Web Audio API:
 * - 'success': crisp high-frequency chirp (1760 Hz, A6)
 * - 'error': double low buzz (320 Hz -> 240 Hz)
 */
export function playPosBeep(type: 'success' | 'error' = 'success') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // AudioContext not allowed or unsupported
  }
}

export const BarcodeCaptureModal: React.FC<BarcodeCaptureModalProps> = ({
  isOpen,
  onClose,
  onBarcodeCaptured,
  currentBarcode = '',
  productName,
  initialTab = 'gun',
  title,
  subtitle,
  continuous = false,
}) => {
  const [activeTab, setActiveTab] = useState<'gun' | 'camera'>(initialTab);
  const [scannedValue, setScannedValue] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>(currentBarcode);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState<boolean>(false);

  const gunInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleCaptureComplete = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    playPosBeep('success');
    setScannedValue(cleanCode);
    setJustScanned(true);
    onBarcodeCaptured(cleanCode);

    if (continuous) {
      // Keep scanner alive for rapid successive items
      setTimeout(() => {
        setJustScanned(false);
        setScannedValue('');
        if (activeTab === 'camera') {
          startBarcodeDetection();
        }
      }, 1200);
    } else {
      setTimeout(() => {
        onClose();
      }, 450);
    }
  };

  // Automatically focus gun input on open and keep it focused in Gun mode
  useEffect(() => {
    if (isOpen && activeTab === 'gun') {
      const timer = setTimeout(() => {
        gunInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab]);

  // Handle hardware barcode scanner gun input (rapid keystrokes followed by Enter)
  const handleGunKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = gunInputRef.current?.value || '';
      if (value.trim()) {
        handleCaptureComplete(value);
      }
    }
  };

  // Camera Barcode Scanning logic
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported on this device/browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        startBarcodeDetection();
      }
    } catch (err: unknown) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your system settings.'
          : 'Unable to access camera. Please ensure your webcam is connected or use Scanner Gun mode.'
      );
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startBarcodeDetection = () => {
    // Check if Chromium / Browser native BarcodeDetector is available
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as unknown as {
          BarcodeDetector: new (options?: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        const scanLoop = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            animFrameRef.current = requestAnimationFrame(scanLoop);
            return;
          }

          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
              const detected = barcodes[0].rawValue;
              handleCaptureComplete(detected);
              return; // Stop scanning loop on detection
            }
          } catch {
            // Frame detection skipped
          }

          animFrameRef.current = requestAnimationFrame(scanLoop);
        };

        animFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.warn('BarcodeDetector instantiation failed:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-capture-modal-title"
      className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-2xl space-y-0 my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 id="barcode-capture-modal-title" className="text-base font-display font-bold">
                {title || 'Scan Product Barcode'}
              </h3>
              <p className="text-xs text-slate-300">
                {subtitle ||
                  (productName
                    ? `Scanning for: ${productName}`
                    : 'Position item to scan manufacturer barcode')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close barcode scanner modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {continuous && (
          <div className="bg-emerald-950/40 border-b border-emerald-800/40 px-5 py-2 text-[11px] text-emerald-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Continuous Scan Mode: Items are added to the cart instantly on detection.
            </span>
            <span className="font-semibold text-emerald-400">Keep scanning</span>
          </div>
        )}

        {/* Tab Selection: Scanner Gun vs Camera */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('gun')}
            className={`pb-2.5 px-3.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'gun'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Barcode className="w-4 h-4 text-emerald-600" />
            <span>Scanner Gun (USB / Bluetooth)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 px-3.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'camera'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-4 h-4 text-emerald-600" />
            <span>Laptop / Webcam Camera</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* TAB 1: SCANNER GUN */}
          {activeTab === 'gun' && (
            <div className="space-y-4 text-center">
              {/* Visual Scanner Target Box */}
              <div
                onClick={() => gunInputRef.current?.focus()}
                className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer relative overflow-hidden ${
                  justScanned
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/30'
                }`}
              >
                {/* Red Laser Sweep Line Animation */}
                {!justScanned && (
                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
                )}

                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-white shadow-xs border border-slate-200">
                    {justScanned ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-bounce" />
                    ) : (
                      <Barcode className="w-8 h-8 text-slate-700" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {justScanned ? 'Barcode Captured!' : 'Ready to Scan'}
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-0.5">
                      {justScanned
                        ? `Scanned: ${scannedValue}`
                        : 'Point your USB or Bluetooth barcode scanner gun at the product packaging and pull the trigger.'}
                    </p>
                  </div>
                </div>

                {/* Hidden focused input listening to scanner keystrokes */}
                <input
                  ref={gunInputRef}
                  type="text"
                  onKeyDown={handleGunKeyDown}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                  autoComplete="off"
                  aria-label="Scan barcode input"
                />
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span>Scanner listener active. Click box to refocus if needed.</span>
              </div>
            </div>
          )}

          {/* TAB 2: WEBCAM CAMERA */}
          {activeTab === 'camera' && (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{cameraError}</p>
                    <p className="text-[11px] text-amber-700">
                      You can switch to the <strong>Scanner Gun</strong> tab to scan using a handheld barcode reader, or type the number below.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Camera Viewport Framing Overlay */}
                  <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-lg pointer-events-none shadow-[0_0_15px_rgba(52,211,153,0.3)] flex items-center justify-center">
                    {/* Laser line */}
                    <div className="w-full h-0.5 bg-red-500 shadow-[0_0_10px_red] animate-pulse" />
                  </div>

                  <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
                    <span className="bg-black/60 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-full">
                      Hold barcode steady inside the frame
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Input Fallback */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
              <span className="font-semibold">Or enter barcode digits manually:</span>
              <span className="text-[11px] text-slate-400">EAN-13 / UPC / Code-128</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (manualInput.trim()) {
                      handleCaptureComplete(manualInput);
                    }
                  }
                }}
                placeholder="e.g. 61599000101 or 8901030384732"
                className="flex-1 px-3 py-2 font-mono border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="button"
                disabled={!manualInput.trim()}
                onClick={() => handleCaptureComplete(manualInput)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Volume2 className="w-4 h-4 text-emerald-600" />
            <span>Beep sound confirmed on scan</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
              continuous
                ? 'bg-slate-900 hover:bg-slate-800 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-white'
            }`}
          >
            {continuous ? 'Done Scanning' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
