import { useState, useEffect, useRef, useCallback } from "react";
import { logProctoringEvent } from "@/api/resume";
import { useEyeTracking } from "@/hooks/useEyeTracking";
import { useMultiFaceDetection } from "@/hooks/useMultiFaceDetection";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Shield,
  AlertTriangle,
  Eye,
  Users,
  VideoOff,
} from "lucide-react";

interface ProctoringBarProps {
  interviewId: number;
  enabled?: boolean;
}

export function ProctoringBar({ interviewId, enabled = true }: ProctoringBarProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastAlert, setLastAlert] = useState<string | null>(null);
  const [videoBlack, setVideoBlack] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bboxCanvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef(Date.now());
  const prevFrameRef = useRef<ImageData | null>(null);
  const retryRef = useRef(false);
  const cameraActiveRef = useRef(false);
  cameraActiveRef.current = cameraActive;

  // Check microphone permission state (read-only — user already granted in lobby)
  useEffect(() => {
    if (!enabled) return;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        setMicActive(result.state === "granted");
        result.onchange = () => setMicActive(result.state === "granted");
      })
      .catch(() => setMicActive(true));
  }, [enabled]);

  const sendEvent = useCallback(
    async (eventType: string, details?: Record<string, unknown>) => {
      try {
        await logProctoringEvent(interviewId, {
          event_type: eventType,
          details,
          timestamp_seconds: (Date.now() - startTimeRef.current) / 1000,
        });
        setEventCount((c) => c + 1);
        setLastAlert(eventType.replace(/_/g, " "));
        setTimeout(() => setLastAlert(null), 3000);
      } catch {
        // silently fail — never block the interview
      }
    },
    [interviewId]
  );

  // Generic event adapter so hooks can call sendEvent
  const sendProctoringEvent = useCallback(
    (event: {
      event_type: string;
      severity?: string;
      confidence?: number;
      details?: Record<string, unknown>;
      timestamp_seconds?: number;
    }) => {
      sendEvent(event.event_type, event.details);
    },
    [sendEvent]
  );

  // Auto-start camera — only mark active once video actually has frames.
  // If the feed stays black for too long, retry once with fresh stream.
  useEffect(() => {
    if (!enabled) return;

    const videoEl = videoRef.current;
    let blackWatchdog: ReturnType<typeof setInterval> | null = null;

    const onPlaying = () => {
      setCameraActive(true);
      setCameraError(null);
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.addEventListener("playing", onPlaying);
          videoEl.play().catch(() => {});
        }
      } catch {
        setCameraError("Camera access lost");
        setCameraActive(false);
      }
    };

    startCamera();

    // Watchdog: if the camera is marked active but frames never arrive
    // (all-black / no dimensions), flag it and retry once.
    blackWatchdog = setInterval(() => {
      const v = videoRef.current;
      if (!v || !cameraActiveRef.current) return;
      if (v.videoWidth > 0 && v.videoHeight > 0) return;

      setVideoBlack(true);
      if (!retryRef.current) {
        retryRef.current = true;
        // Stop old stream, grab a fresh one
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        v.removeAttribute("src");
        v.load();
        startCamera();
      }
    }, 2500);

    return () => {
      if (blackWatchdog) clearInterval(blackWatchdog);
      if (videoEl) videoEl.removeEventListener("playing", onPlaying);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      setVideoBlack(false);
      retryRef.current = false;
    };
  }, [enabled]);

  // Browser proctoring events
  useEffect(() => {
    if (!enabled || !interviewId) return;

    const handleVisibilityChange = () => {
      if (document.hidden) sendEvent("tab_switch");
    };
    const handleBlur = () => sendEvent("window_blur");
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent("copy_paste", { action: "copy" });
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent("copy_paste", { action: "paste" });
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      sendEvent("right_click");
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        sendEvent("devtools_open", { key: e.key });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, interviewId, sendEvent]);

  // Camera-based motion detection (frame differencing)
  useEffect(() => {
    if (!cameraActive || !videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastCheck = 0;
    const CHECK_INTERVAL = 2000;

    const detectMotion = () => {
      const now = Date.now();
      if (now - lastCheck < CHECK_INTERVAL) {
        animId = requestAnimationFrame(detectMotion);
        return;
      }
      lastCheck = now;

      if (!videoRef.current || videoRef.current.readyState < 2) {
        animId = requestAnimationFrame(detectMotion);
        return;
      }

      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(videoRef.current, 0, 0, 160, 120);
      const currentFrame = ctx.getImageData(0, 0, 160, 120);

      if (prevFrameRef.current) {
        let diffPixels = 0;
        const threshold = 30;
        const data1 = prevFrameRef.current.data;
        const data2 = currentFrame.data;

        for (let i = 0; i < data1.length; i += 16) {
          const r = Math.abs(data1[i] - data2[i]);
          const g = Math.abs(data1[i + 1] - data2[i + 1]);
          const b = Math.abs(data1[i + 2] - data2[i + 2]);
          if (r + g + b > threshold * 3) diffPixels++;
        }

        const totalSampled = data1.length / 16;
        const motionPercent = (diffPixels / totalSampled) * 100;

        if (motionPercent > 40) {
          sendEvent("excessive_motion", { motion_percent: motionPercent });
        }
      }

      prevFrameRef.current = currentFrame;
      animId = requestAnimationFrame(detectMotion);
    };

    animId = requestAnimationFrame(detectMotion);
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, sendEvent]);

  // ── Eye tracking ──────────────────────────────────────────────────────────
  const { isReady: eyeReady, error: eyeError } = useEyeTracking({
    enabled: enabled && cameraActive,
    startTime: startTimeRef.current,
    onEvent: sendProctoringEvent,
    offScreenThresholdSec: 3,
  });

  // ── Multi-face detection ──────────────────────────────────────────────────
  const { isReady: faceReady, faceCount, detections } = useMultiFaceDetection({
    videoRef,
    enabled: enabled && cameraActive,
    startTime: startTimeRef.current,
    onEvent: sendProctoringEvent,
    intervalMs: 2000,
  });

  // ── Draw face bounding boxes over the camera preview ──────────────────────
  useEffect(() => {
    if (!faceReady || detections.length === 0) return;
    const canvas = bboxCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = faceCount > 1 ? "#ef4444" : "#22c55e";
    ctx.lineWidth = 2;

    for (const d of detections) {
      // bbox is normalized to the (non-mirrored) video frame;
      // preview is mirrored via scaleX(-1), so mirror x back.
      const x = (1 - d.xCenter - d.width / 2) * W;
      const y = (d.yCenter - d.height / 2) * H;
      const w = d.width * W;
      const h = d.height * H;
      ctx.strokeRect(x, y, w, h);
    }
  }, [faceReady, detections, faceCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-4 flex-wrap">
      {/* Camera preview */}
      <div className="relative">
        {cameraActive ? (
          <div className="w-20 rounded-lg overflow-hidden bg-gray-900 border border-gray-300" style={{ height: 60 }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Face bbox overlay */}
            <canvas
              ref={bboxCanvasRef}
              width={80}
              height={60}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Black frame warning */}
            {videoBlack && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-0.5">
                <VideoOff size={14} className="text-red-400" />
                <span className="text-[8px] text-red-300 font-medium leading-none">No feed</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="w-20 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-center"
            style={{ height: 60 }}
          >
            <CameraOff size={20} className="text-gray-400" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {/* Face count badge */}
        {faceReady && (
          <span
            className={`absolute -top-1.5 -right-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${
              faceCount > 1
                ? "bg-red-500 text-white"
                : faceCount === 0
                ? "bg-amber-400 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {faceCount}
          </span>
        )}
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-medium">
        {/* Camera */}
        {cameraActive ? (
          <span className="flex items-center gap-1.5 text-green-700 bg-green-100 px-3 py-1.5 rounded-lg">
            <Camera size={14} />
            Camera Active
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-700 bg-red-100 px-3 py-1.5 rounded-lg">
            <CameraOff size={14} />
            {cameraError ?? "Camera Off"}
          </span>
        )}

        {/* Mic */}
        {micActive ? (
          <span className="flex items-center gap-1.5 text-violet-700 bg-violet-100 px-3 py-1.5 rounded-lg">
            <Mic size={14} />
            Mic Active
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
            <MicOff size={14} />
            Mic Off
          </span>
        )}

        {/* Eye tracking */}
        {!eyeError ? (
          <span
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
              eyeReady
                ? "text-blue-700 bg-blue-100"
                : "text-gray-500 bg-gray-100"
            }`}
          >
            <Eye size={14} />
            {eyeReady ? "Eye Tracking" : "Loading Eye..."}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg" title={eyeError}>
            <Eye size={14} />
            Eye N/A
          </span>
        )}

        {/* Multi-face */}
        {faceReady && faceCount > 1 && (
          <span className="flex items-center gap-1.5 text-red-700 bg-red-100 px-3 py-1.5 rounded-lg animate-pulse">
            <Users size={14} />
            {faceCount} Faces!
          </span>
        )}
      </div>

      {/* Right-side status */}
      <div className="flex items-center gap-3 ml-auto text-xs">
        <div className="flex items-center gap-1.5 text-green-600">
          <Shield size={14} />
          <span>Proctoring Active</span>
        </div>

        {eventCount > 0 && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={12} />
            <span>
              {eventCount} event{eventCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {lastAlert && (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium animate-pulse">
            {lastAlert}
          </span>
        )}
      </div>
    </div>
  );
}
