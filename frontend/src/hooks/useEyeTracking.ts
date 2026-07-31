import { useEffect, useRef, useCallback, useState } from "react";

interface EyeTrackingEvent {
  event_type: string;
  severity: string;
  confidence: number;
  details?: Record<string, unknown>;
  timestamp_seconds: number;
}

interface UseEyeTrackingOptions {
  /** Existing camera preview — avoids a second getUserMedia call. */
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  startTime: number;
  onEvent: (event: EyeTrackingEvent) => void;
  /** Seconds gaze must stay off-screen before firing an alert (default: 3) */
  offScreenThresholdSec?: number;
  /** How often to analyse a frame in ms (default: 500) */
  intervalMs?: number;
}

interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface FaceMeshResults {
  multiFaceLandmarks?: Landmark[][];
}

declare global {
  interface Window {
    FaceMesh?: new (config: { locateFile: (f: string) => string }) => {
      setOptions: (opts: {
        maxNumFaces: number;
        refineLandmarks: boolean;
        minDetectionConfidence: number;
        minTrackingConfidence: number;
      }) => void;
      onResults: (cb: (results: FaceMeshResults) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
      close: () => void;
    };
  }
}

const FACE_MESH_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4";

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

async function loadFaceMesh() {
  await loadScript(`${FACE_MESH_CDN}/face_mesh.js`, "mediapipe-face-mesh");
}

/** Estimate whether the user is looking at the screen from face-mesh landmarks. */
function isLookingAtScreen(landmarks: Landmark[]): boolean {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  if (!nose || !leftCheek || !rightCheek) return true;

  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (faceWidth < 0.01) return true;

  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const yaw = (nose.x - faceCenterX) / faceWidth;

  const leftEyeTop = landmarks[159];
  const leftEyeBottom = landmarks[145];
  const pitch =
    leftEyeTop && leftEyeBottom
      ? nose.y - (leftEyeTop.y + leftEyeBottom.y) / 2
      : 0;

  const YAW_THRESHOLD = 0.14;
  const PITCH_MIN = 0.06;
  const PITCH_MAX = 0.38;

  if (Math.abs(yaw) > YAW_THRESHOLD) return false;
  if (pitch < PITCH_MIN || pitch > PITCH_MAX) return false;

  // Refined iris landmarks (requires refineLandmarks: true)
  const leftIris = landmarks[468];
  const rightIris = landmarks[473];
  const leftInner = landmarks[133];
  const leftOuter = landmarks[33];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];

  if (leftIris && rightIris && leftInner && leftOuter && rightInner && rightOuter) {
    const leftWidth = Math.abs(leftOuter.x - leftInner.x);
    const rightWidth = Math.abs(rightOuter.x - rightInner.x);
    if (leftWidth > 0.001 && rightWidth > 0.001) {
      const leftCenter = (leftInner.x + leftOuter.x) / 2;
      const rightCenter = (rightInner.x + rightOuter.x) / 2;
      const leftOffset = Math.abs(leftIris.x - leftCenter) / leftWidth;
      const rightOffset = Math.abs(rightIris.x - rightCenter) / rightWidth;
      if (leftOffset > 0.42 || rightOffset > 0.42) return false;
    }
  }

  return true;
}

/**
 * Tracks gaze / head pose using MediaPipe Face Mesh on the existing camera
 * stream (no second getUserMedia — WebGazer conflicted with ProctoringBar).
 */
export function useEyeTracking({
  videoRef,
  enabled,
  startTime,
  onEvent,
  offScreenThresholdSec = 3,
  intervalMs = 500,
}: UseEyeTrackingOptions) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offScreenSinceRef = useRef<number | null>(null);
  const alertedRef = useRef(false);
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  const meshRef = useRef<InstanceType<NonNullable<Window["FaceMesh"]>> | null>(
    null
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lookingAtScreenRef = useRef(true);

  const getTimestamp = useCallback(
    () => (Date.now() - startTimeRef.current) / 1000,
    []
  );

  const handleGazeState = useCallback(
    (lookingAtScreen: boolean) => {
      lookingAtScreenRef.current = lookingAtScreen;

      if (!lookingAtScreen) {
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
              confidence: 0.8,
              details: { duration_sec: Math.round(elapsed) },
              timestamp_seconds: getTimestamp(),
            });
          }
        }
      } else if (offScreenSinceRef.current !== null) {
        offScreenSinceRef.current = null;
        alertedRef.current = false;
      }
    },
    [offScreenThresholdSec, onEvent, getTimestamp]
  );

  const analyzeFrame = useCallback(async () => {
    const video = videoRef.current;
    const mesh = meshRef.current;
    if (!video || !mesh || video.readyState < 2) return;

    try {
      await mesh.send({ image: video });
    } catch {
      // onResults handles state; ignore send errors
    }
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const setup = async () => {
      try {
        await loadFaceMesh();
        if (cancelled || !window.FaceMesh) {
          throw new Error("MediaPipe Face Mesh not available");
        }

        const mesh = new window.FaceMesh({
          locateFile: (f) => `${FACE_MESH_CDN}/${f}`,
        });

        mesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        mesh.onResults((results) => {
          if (cancelled) return;
          const landmarks = results.multiFaceLandmarks?.[0];
          if (!landmarks) {
            handleGazeState(false);
            return;
          }
          handleGazeState(isLookingAtScreen(landmarks));
        });

        meshRef.current = mesh;

        if (!cancelled) {
          setIsReady(true);
          intervalRef.current = setInterval(analyzeFrame, intervalMs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Eye tracking unavailable"
          );
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try {
        meshRef.current?.close();
      } catch {
        // ignore
      }
      meshRef.current = null;
      setIsReady(false);
    };
  }, [enabled, analyzeFrame, intervalMs, handleGazeState]);

  return { isReady, error };
}
