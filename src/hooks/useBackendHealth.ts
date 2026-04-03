/**
 * useBackendHealth.ts — [FE #10]
 *
 * Polls the FastAPI backend /health endpoint on mount and periodically.
 * Returns `isOnline` (true = backend reachable) and `isChecking` (first check in progress).
 *
 * Usage in any component:
 *   const { isOnline, isChecking } = useBackendHealth();
 *   if (!isOnline && !isChecking) return <BackendOfflineBanner />;
 */

import { useEffect, useState, useRef } from "react";
import { engineeringApiUrl } from "@/lib/api-base";

const POLL_INTERVAL_MS = 30_000; // re-check every 30 s
const TIMEOUT_MS = 5_000;        // consider offline if no response in 5 s

export function useBackendHealth() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(engineeringApiUrl("/health"), {
        signal: controller.signal,
      });
      clearTimeout(id);
      setIsOnline(res.ok);
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    check();
    timerRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { isOnline, isChecking };
}
