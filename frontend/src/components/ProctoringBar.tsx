import { useState, useEffect, useRef, useCallback } from "react";
import { logProctoringEvent } from "@/api/resume";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Shield,
  AlertTriangle,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef(Date.now());
  const prevFrameRef = useRef<ImageData | null>(null);

  // Check microphone permission state (read-only — user already granted it in lobby)
  useEffect(() => {
    if (!enabled) return;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        setMicActive(result.state === "granted");
        result.onchange = () => setMicActive(result.state === "granted");
      })
      .catch(() => {
        // Permissions API not supported; optimistically mark as active
        setMicActive(true);
      });
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
        // silently fail
      }
    },
    [interviewId]
  );

  // Auto-start camera when proctoring is enabled
  useEffect(() => {
    if (!enabled) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setCameraError(null);
      } catch {
        setCameraError("Camera access lost");
        setCameraActive(false);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
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
    const CHECK_INTERVAL = 2000; // check every 2s

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-4">
      {/* Camera preview */}
      <div className="relative">
        {cameraActive ? (
          <div className="w-20 h-15 rounded-lg overflow-hidden bg-gray-900 border border-gray-300">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        ) : (
          <div className="w-20 h-15 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-center">
            <CameraOff size={20} className="text-gray-400" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Camera status indicator (no toggle — camera is always required) */}
      <div className="flex items-center gap-1.5 text-xs font-medium">
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

        {/* Mic status pill */}
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
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 ml-auto text-xs">
        <div className="flex items-center gap-1.5 text-green-600">
          <Shield size={14} />
          <span>Proctoring Active</span>
        </div>

        {eventCount > 0 && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={12} />
            <span>{eventCount} event{eventCount !== 1 ? "s" : ""}</span>
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
