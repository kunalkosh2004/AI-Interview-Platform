import { useEffect, useRef, useCallback, useState } from "react";

interface FaceDetectionEvent {
  event_type: string;
  severity: string;
  confidence: number;
  details?: Record<string, unknown>;
  timestamp_seconds: number;
}

interface UseMultiFaceDetectionOptions {
  /** The <video> element to analyse. Must be playing before detection starts. */
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  startTime: number;
  onEvent: (event: FaceDetectionEvent) => void;
  /** How often to run detection in ms (default: 2000) */
  intervalMs?: number;
  /** Minimum score to count a detection as a real face (default: 0.7) */
  minScore?: number;
}

// ---- MediaPipe type stubs (CDN-loaded, no npm package needed) ----
declare global {
  interface Window {
    FaceDetection?: new (config: { locateFile: (f: string) => string }) => {
      setOptions: (opts: {
        model: "short" | "full";
        minDetectionConfidence: number;
      }) => void;
      onResults: (
        cb: (results: { detections: Array<{ score: number[] }> }) => void
      ) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
      close: () => void;
    };
  }
}

const CDN_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4";

/** Load a script once; resolve immediately if already present */
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadMediaPipe() {
  await loadScript(`${CDN_BASE}/face_detection.js`, "mediapipe-face-detection");
}

/**
 * Detects the number of faces visible in a video stream.
 * Uses MediaPipe Face Detection (CDN, no server required).
 *
 * Fires a proctoring event when:
 *  - More than 1 face is detected (multi_face_detected)
 *  - No face is detected for > 5 consecutive checks (no_face_detected)
 */
export function useMultiFaceDetection({
  videoRef,
  enabled,
  startTime,
  onEvent,
  intervalMs = 2000,
  minScore = 0.7,
}: UseMultiFaceDetectionOptions) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState(0);

  const detectorRef = useRef<InstanceType<NonNullable<Window["FaceDetection"]>> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noFaceCountRef = useRef(0);
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  const getTimestamp = useCallback(
    () => (Date.now() - startTimeRef.current) / 1000,
    []
  );

  const analyzeFrame = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) return;

    try {
      await detector.send({ image: video });
    } catch {
      // send() already calls onResults; ignore errors here
    }
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const setup = async () => {
      try {
        await loadMediaPipe();
        if (cancelled || !window.FaceDetection) {
          setError("MediaPipe not available");
          return;
        }

        const det = new window.FaceDetection({
          locateFile: (f) => `${CDN_BASE}/${f}`,
        });

        det.setOptions({ model: "short", minDetectionConfidence: minScore });

        det.onResults((results) => {
          if (cancelled) return;

          const faces = (results.detections ?? []).filter(
            (d) => (d.score?.[0] ?? 0) >= minScore
          );
          const count = faces.length;
          setFaceCount(count);

          if (count > 1) {
            noFaceCountRef.current = 0;
            onEvent({
              event_type: "multi_face_detected",
              severity: "critical",
              confidence: faces[0].score?.[0] ?? 0.9,
              details: { face_count: count },
              timestamp_seconds: getTimestamp(),
            });
          } else if (count === 0) {
            noFaceCountRef.current += 1;
            // Fire after 3 consecutive empty checks (= ~6 s at 2 s interval)
            if (noFaceCountRef.current === 3) {
              onEvent({
                event_type: "no_face_detected",
                severity: "high",
                confidence: 0.9,
                details: { consecutive_empty_checks: noFaceCountRef.current },
                timestamp_seconds: getTimestamp(),
              });
            }
          } else {
            noFaceCountRef.current = 0;
          }
        });

        detectorRef.current = det;

        if (!cancelled) {
          setIsReady(true);
          intervalRef.current = setInterval(analyzeFrame, intervalMs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Face detection failed");
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try {
        detectorRef.current?.close();
      } catch {
        // ignore
      }
      detectorRef.current = null;
      setIsReady(false);
    };
  }, [enabled, analyzeFrame, intervalMs, minScore, onEvent, getTimestamp]);

  return { isReady, error, faceCount };
}
