import { useEffect, useRef, useCallback, useState } from "react";
import * as ort from "onnxruntime-web";

interface FaceDetectionEvent {
  event_type: string;
  severity: string;
  confidence: number;
  details?: Record<string, unknown>;
  timestamp_seconds: number;
}

interface UseYoloDetectionOptions {
  /** The <video> element to analyse. Must be playing before detection starts. */
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  startTime: number;
  onEvent: (event: FaceDetectionEvent) => void;
  /** How often to run inference in ms (default: 1500) */
  intervalMs?: number;
  /** Minimum score to count a detection as a real person (default: 0.5) */
  minScore?: number;
}

/** Normalized (0-1) bounding box relative to the (non-mirrored) video frame */
export interface DetectedFace {
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

interface YoloBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

const MODEL_URL = `${import.meta.env.BASE_URL}weights/yolov8n.onnx`;
const MODEL_SIZE = 640;
const PERSON_CLASS = 0;
const NMS_IOU_THRESHOLD = 0.45;

ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort-wasm/`;
// Single-threaded — the app is not COOP/COEP isolated, so SharedArrayBuffer
// (needed for threaded wasm) is unavailable.
ort.env.wasm.numThreads = 1;

function createInputTensor(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): ort.Tensor | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  // Letterbox: scale the frame to fit 640x640, pad the rest with grey
  const scale = Math.min(MODEL_SIZE / vw, MODEL_SIZE / vh);
  const dw = (MODEL_SIZE - vw * scale) / 2;
  const dh = (MODEL_SIZE - vh * scale) / 2;

  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  ctx.drawImage(video, dw, dh, vw * scale, vh * scale);

  const { data } = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
  // RGB interleaved → CHW float32 [1, 3, 640, 640] normalized to [0, 1]
  const input = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
  for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
    input[i] = data[i * 4] / 255;
    input[MODEL_SIZE * MODEL_SIZE + i] = data[i * 4 + 1] / 255;
    input[2 * MODEL_SIZE * MODEL_SIZE + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

/** Greedy NMS, returns kept box indices */
function nonMaxSuppression(boxes: YoloBox[], iouThreshold: number): number[] {
  const order = boxes
    .map((b, i) => ({ i, score: b.score }))
    .sort((a, b) => b.score - a.score)
    .map((o) => o.i);
  const keep: number[] = [];

  const area = (b: YoloBox) => (b.x2 - b.x1) * (b.y2 - b.y1);
  const iou = (a: YoloBox, b: YoloBox) => {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = area(a) + area(b) - inter;
    return union <= 0 ? 0 : inter / union;
  };

  while (order.length > 0) {
    const best = order.shift()!;
    keep.push(best);
    const bestBox = boxes[best];
    for (let i = order.length - 1; i >= 0; i--) {
      if (iou(bestBox, boxes[order[i]]) > iouThreshold) order.splice(i, 1);
    }
  }
  return keep;
}

/**
 * Person detection via YOLOv8n (ONNX Runtime Web).
 *
 * Runs the model on a low-res letterboxed copy of the camera frame, filters
 * COCO class 0 (person), then derives the face region from each person box.
 *
 * Fires a proctoring event when:
 *  - More than 1 person is detected (multi_face_detected)
 *  - No person is detected for > 3 consecutive checks (no_face_detected)
 */
export function useYoloDetection({
  videoRef,
  enabled,
  startTime,
  onEvent,
  intervalMs = 1500,
  minScore = 0.5,
}: UseYoloDetectionOptions) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personCount, setPersonCount] = useState(0);
  const [detections, setDetections] = useState<DetectedFace[]>([]);

  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const noFaceCountRef = useRef(0);
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  const getTimestamp = useCallback(
    () => (Date.now() - startTimeRef.current) / 1000,
    []
  );

  const analyzeFrame = useCallback(async () => {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (!video || !session || video.readyState < 2) return;
    if (runningRef.current) return; // skip if previous inference still going
    runningRef.current = true;

    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const input = createInputTensor(video, canvas, ctx);
      if (!input) return;

      const outputs = await session.run({ images: input });
      const pred = outputs[session.outputNames[0]]?.data as
        | Float32Array
        | undefined;
      if (!pred) return;

      // Output layout: [1, 84, 8400] → per anchor: cx, cy, w, h + 80 class scores
      const anchors = pred.length / 84;
      const boxes: YoloBox[] = [];
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      for (let i = 0; i < anchors; i++) {
        const personScore = pred[84 * i + 4 + PERSON_CLASS];
        if (personScore < minScore) continue;

        const cx = pred[84 * i];
        const cy = pred[84 * i + 1];
        const w = pred[84 * i + 2];
        const h = pred[84 * i + 3];

        boxes.push({
          x1: cx - w / 2,
          y1: cy - h / 2,
          x2: cx + w / 2,
          y2: cy + h / 2,
          score: personScore,
        });
      }

      const kept = nonMaxSuppression(boxes, NMS_IOU_THRESHOLD)
        .map((idx) => boxes[idx])
        .sort((a, b) => a.x1 - b.x1);
      setPersonCount(kept.length);

      // Derive the face region (top-center of the person box), then convert
      // from 640-space back to normalized video-frame coordinates.
      const scale = Math.min(MODEL_SIZE / vw, MODEL_SIZE / vh);
      const dw = (MODEL_SIZE - vw * scale) / 2;
      const dh = (MODEL_SIZE - vh * scale) / 2;

      setDetections(
        kept.map((b) => {
          const faceW = (b.x2 - b.x1) * 0.42;
          const faceH = (b.y2 - b.y1) * 0.3;
          const faceCx = (b.x1 + b.x2) / 2;
          const faceCy = b.y1 + (b.y2 - b.y1) * 0.2;

          const inv = (v: number, d: number, s: number) => (v - d) / s / vw;
          const invY = (v: number, d: number, s: number) => (v - d) / s / vh;

          return {
            xCenter: inv(faceCx, dw, scale),
            yCenter: invY(faceCy, dh, scale),
            width: faceW / scale / vw,
            height: faceH / scale / vh,
          };
        })
      );

      const count = kept.length;
      if (count > 1) {
        noFaceCountRef.current = 0;
        onEvent({
          event_type: "multi_face_detected",
          severity: "critical",
          confidence: Math.max(...kept.map((b) => b.score)),
          details: { person_count: count },
          timestamp_seconds: getTimestamp(),
        });
      } else if (count === 0) {
        noFaceCountRef.current += 1;
        // Fire after 3 consecutive empty checks (= ~4.5 s at 1.5 s interval)
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
    } catch {
      // transient inference failure — try again next tick
    } finally {
      runningRef.current = false;
    }
  }, [videoRef, minScore, onEvent, getTimestamp]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const setup = async () => {
      try {
        const session = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ["webgl", "wasm"],
        });
        if (cancelled) {
          session.release?.();
          return;
        }
        sessionRef.current = session;
        setIsReady(true);
        intervalRef.current = setInterval(analyzeFrame, intervalMs);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "YOLO model failed to load"
          );
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try {
        sessionRef.current?.release?.();
      } catch {
        // ignore
      }
      sessionRef.current = null;
      setIsReady(false);
    };
  }, [enabled, analyzeFrame, intervalMs]);

  return { isReady, error, count: personCount, detections };
}
