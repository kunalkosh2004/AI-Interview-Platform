import { useEffect, useRef, useCallback, useState } from "react";

interface EyeTrackingEvent {
  event_type: string;
  severity: string;
  confidence: number;
  details?: Record<string, unknown>;
  timestamp_seconds: number;
}

interface UseEyeTrackingOptions {
  enabled: boolean;
  startTime: number;
  onEvent: (event: EyeTrackingEvent) => void;
  /** Seconds the gaze must stay off-screen before firing an alert (default: 3) */
  offScreenThresholdSec?: number;
}

interface WebGazerInstance {
  setGazeListener: (
    cb: ((data: { x: number; y: number } | null) => void) | null
  ) => WebGazerInstance;
  begin: () => Promise<WebGazerInstance>;
  end: () => void;
  showVideoPreview: (show: boolean) => WebGazerInstance;
  showPredictionPoints: (show: boolean) => WebGazerInstance;
  applyKalmanFilter: (apply: boolean) => WebGazerInstance;
  pause: () => WebGazerInstance;
  resume: () => WebGazerInstance;
}

declare global {
  interface Window {
    webgazer?: WebGazerInstance;
  }
}

const WEBGAZER_CDN =
  "https://webgazer.cs.brown.edu/webgazer.js";

/** Dynamically loads WebGazer from CDN once and resolves when ready */
function loadWebGazer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.webgazer) {
      resolve();
      return;
    }
    const existing = document.getElementById("webgazer-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "webgazer-script";
    script.src = WEBGAZER_CDN;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load WebGazer.js from CDN"));
    document.head.appendChild(script);
  });
}

/**
 * Tracks eye gaze using WebGazer.js (browser-only, no server).
 * Fires a proctoring event when the user's gaze leaves the viewport
 * for longer than `offScreenThresholdSec`.
 */
export function useEyeTracking({
  enabled,
  startTime,
  onEvent,
  offScreenThresholdSec = 3,
}: UseEyeTrackingOptions) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track when gaze first went off-screen
  const offScreenSinceRef = useRef<number | null>(null);
  // Avoid spamming repeated events — wait until gaze returns before re-alerting
  const alertedRef = useRef(false);
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  const getTimestamp = useCallback(
    () => (Date.now() - startTimeRef.current) / 1000,
    []
  );

  /** Returns true when the gaze point is outside the visible viewport */
  const isOffScreen = useCallback((x: number, y: number) => {
    return (
      x < 0 ||
      y < 0 ||
      x > window.innerWidth ||
      y > window.innerHeight
    );
  }, []);

  const gazeListener = useCallback(
    (data: { x: number; y: number } | null) => {
      if (!data) {
        // No face detected / gaze lost
        if (offScreenSinceRef.current === null) {
          offScreenSinceRef.current = Date.now();
        }
        return;
      }

      const off = isOffScreen(data.x, data.y);

      if (off) {
        if (offScreenSinceRef.current === null) {
          offScreenSinceRef.current = Date.now();
          alertedRef.current = false;
        } else {
          const elapsed = (Date.now() - offScreenSinceRef.current) / 1000;
          if (elapsed >= offScreenThresholdSec && !alertedRef.current) {
            alertedRef.current = true;
            onEvent({
              event_type: "gaze_off_screen",
              severity: "medium",
              confidence: 0.75,
              details: {
                gaze_x: Math.round(data.x),
                gaze_y: Math.round(data.y),
                duration_sec: Math.round(elapsed),
              },
              timestamp_seconds: getTimestamp(),
            });
          }
        }
      } else {
        // Gaze returned to screen
        if (offScreenSinceRef.current !== null) {
          offScreenSinceRef.current = null;
          alertedRef.current = false;
        }
      }
    },
    [isOffScreen, offScreenThresholdSec, onEvent, getTimestamp]
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const init = async () => {
      try {
        await loadWebGazer();
        if (cancelled || !window.webgazer) return;

        const wg = window.webgazer;
        if (!wg) throw new Error("WebGazer not loaded");

        await wg
          .showVideoPreview(false)
          .showPredictionPoints(false)
          .applyKalmanFilter(true)
          .setGazeListener(gazeListener)
          .begin();

        if (!cancelled) setIsReady(true);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Eye tracking unavailable";
          setError(msg);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        window.webgazer?.end();
      } catch {
        // ignore cleanup errors
      }
      setIsReady(false);
    };
  }, [enabled, gazeListener]);

  return { isReady, error };
}
