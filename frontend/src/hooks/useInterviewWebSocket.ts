import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/auth";

interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export function useInterviewWebSocket(
  interviewId: number,
  onMessage: (msg: WebSocketMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!token || !interviewId) return;

    const baseUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || "";
    const wsBase = baseUrl
      ? baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : window.location.host;
    const protocol = baseUrl.startsWith("https") || window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${wsBase}/ws/interview/${interviewId}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error("Failed to parse WS message:", e);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [interviewId, token, onMessage]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}
