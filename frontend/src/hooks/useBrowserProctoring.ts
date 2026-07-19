import { useEffect, useRef, useCallback } from "react";

interface ProctoringEvent {
  event_type: string;
  severity: string;
  confidence: number;
  details?: Record<string, unknown>;
  timestamp_seconds: number;
}

export function useBrowserProctoring(
  interviewId: number,
  startTime: number,
  sendProctoringEvent: (event: ProctoringEvent) => void,
  enabled: boolean = true
) {
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  const getTimestamp = useCallback(() => {
    return (Date.now() - startTimeRef.current) / 1000;
  }, []);

  useEffect(() => {
    if (!enabled || !interviewId) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendProctoringEvent({
          event_type: "tab_switch",
          severity: "medium",
          confidence: 1.0,
          timestamp_seconds: getTimestamp(),
        });
      }
    };

    const handleBlur = () => {
      sendProctoringEvent({
        event_type: "window_blur",
        severity: "low",
        confidence: 1.0,
        timestamp_seconds: getTimestamp(),
      });
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      sendProctoringEvent({
        event_type: "copy_paste",
        severity: "high",
        confidence: 1.0,
        details: { action: "copy" },
        timestamp_seconds: getTimestamp(),
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      sendProctoringEvent({
        event_type: "copy_paste",
        severity: "high",
        confidence: 1.0,
        details: { action: "paste" },
        timestamp_seconds: getTimestamp(),
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      sendProctoringEvent({
        event_type: "right_click",
        severity: "low",
        confidence: 1.0,
        timestamp_seconds: getTimestamp(),
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        sendProctoringEvent({
          event_type: "devtools_open",
          severity: "critical",
          confidence: 1.0,
          details: { key: e.key },
          timestamp_seconds: getTimestamp(),
        });
      }
    };

    const handleResize = () => {
      sendProctoringEvent({
        event_type: "screen_resize",
        severity: "low",
        confidence: 0.8,
        details: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        timestamp_seconds: getTimestamp(),
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [enabled, interviewId, sendProctoringEvent, getTimestamp]);
}
