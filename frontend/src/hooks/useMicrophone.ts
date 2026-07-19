import { useState, useRef, useCallback, useEffect } from "react";

export type MicPermissionStatus = "pending" | "checking" | "granted" | "denied";

export interface UseMicrophoneReturn {
  /** Current browser permission state */
  permission: MicPermissionStatus;
  /** True while MediaRecorder is actively recording */
  isRecording: boolean;
  /** Audio level 0–100 (updated ~10 fps while recording) */
  audioLevel: number;
  /** Transcript built up from Web Speech API (if supported) */
  transcript: string;
  /** Request mic permission and open the audio stream */
  requestPermission: () => Promise<boolean>;
  /** Start recording + speech recognition */
  startRecording: () => void;
  /** Stop recording and return the final transcript */
  stopRecording: () => string;
  /** Clear the accumulated transcript */
  clearTranscript: () => void;
}

export function useMicrophone(): UseMicrophoneReturn {
  const [permission, setPermission] = useState<MicPermissionStatus>("pending");
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");

  // ── Level meter ────────────────────────────────────────────────────────────
  const startLevelMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      const avg = buffer.reduce((s, v) => s + v, 0) / buffer.length;
      setAudioLevel(Math.round((avg / 255) * 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // ── Permission ──────────────────────────────────────────────────────────────
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setPermission("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Keep the stream open for reuse; stop video-only tracks if any slip through
      stream.getVideoTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setPermission("granted");
      return true;
    } catch {
      setPermission("denied");
      return false;
    }
  }, []);

  // ── Speech recognition setup ───────────────────────────────────────────────
  const buildRecognition = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }

      finalTranscriptRef.current = final;
      interimTranscriptRef.current = interim;
      setTranscript((final + interim).trim());
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are expected; ignore silently
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("SpeechRecognition error:", event.error);
      }
    };

    return rec;
  }, []);

  // ── Recording controls ─────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    startLevelMeter(streamRef.current);

    const rec = buildRecognition();
    if (rec) {
      recognitionRef.current = rec;
      rec.start();
    }

    setIsRecording(true);
  }, [isRecording, startLevelMeter, buildRecognition]);

  const stopRecording = useCallback((): string => {
    stopLevelMeter();

    recognitionRef.current?.stop();
    recognitionRef.current = null;

    setIsRecording(false);

    const result = (finalTranscriptRef.current + interimTranscriptRef.current).trim();
    // Don't clear transcript here — let the caller decide
    return result;
  }, [stopLevelMeter]);

  const clearTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setTranscript("");
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopLevelMeter();
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopLevelMeter]);

  return {
    permission,
    isRecording,
    audioLevel,
    transcript,
    requestPermission,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}
