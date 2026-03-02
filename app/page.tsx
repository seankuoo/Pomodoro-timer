"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, CheckCircle2 } from "lucide-react";

const FOCUS_SECONDS = 25 * 60; // 1500
const STORAGE_KEY = "pomodoro_history"; // JSON array of ISO date strings

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Format a timestamp to "HH:MM" local time */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Safely read history from localStorage (guards against SSR / parse errors) */
function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  // Array of ISO date strings, one entry per completed session
  const [history, setHistory] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate history from localStorage after mount (client-only)
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // Core countdown effect — interval lifecycle tied to isRunning
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);

          // Record this completion
          const now = new Date().toISOString();
          setHistory((h) => {
            const next = [...h, now];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
          });
          setJustFinished(true);

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Cleanup: clears interval when isRunning flips or component unmounts
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const handleStart = useCallback(() => {
    if (timeLeft > 0) {
      setJustFinished(false);
      setIsRunning(true);
    }
  }, [timeLeft]);

  const handlePause = useCallback(() => setIsRunning(false), []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(FOCUS_SECONDS);
    setJustFinished(false);
  }, []);

  const isFinished = timeLeft === 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white pb-16">
      {/* Header */}
      <h1 className="text-sm font-semibold tracking-[0.25em] uppercase text-neutral-400 mb-16 select-none">
        Pomodoro
      </h1>

      {/* Timer Display */}
      <div className="relative flex items-center justify-center mb-16">
        <div
          className={`absolute w-72 h-72 rounded-full border transition-colors duration-500 ${isFinished
            ? "border-emerald-200"
            : isRunning
              ? "border-neutral-300"
              : "border-neutral-100"
            }`}
        />
        <span
          className={`text-[7rem] font-extralight tracking-tight leading-none tabular-nums select-none transition-colors duration-500 ${isFinished ? "text-emerald-500" : "text-neutral-900"
            }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          id="btn-start"
          onClick={handleStart}
          disabled={isRunning || isFinished}
          className="flex items-center gap-2 px-7 py-3 bg-neutral-900 text-white text-sm font-medium tracking-wide rounded-full hover:bg-neutral-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 select-none"
        >
          <Play size={15} strokeWidth={2.5} />
          Start
        </button>

        <button
          id="btn-pause"
          onClick={handlePause}
          disabled={!isRunning}
          className="flex items-center gap-2 px-7 py-3 bg-white text-neutral-700 text-sm font-medium tracking-wide rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 select-none"
        >
          <Pause size={15} strokeWidth={2.5} />
          Pause
        </button>

        <button
          id="btn-reset"
          onClick={handleReset}
          className="flex items-center gap-2 px-7 py-3 bg-white text-neutral-400 text-sm font-medium tracking-wide rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-600 active:scale-95 transition-all duration-150 select-none"
        >
          <RotateCcw size={15} strokeWidth={2.5} />
          Reset
        </button>
      </div>

      {/* Footer: completion banner OR status hint */}
      {justFinished ? (
        <p className="mt-10 text-base font-semibold text-emerald-500 tracking-wide animate-pulse select-none">
          专注完成，休息一下吧 🎉
        </p>
      ) : (
        <p className="mt-10 text-xs text-neutral-300 tracking-widest uppercase select-none">
          {isRunning ? "Stay focused…" : "Focus · 25 min"}
        </p>
      )}

      {/* ─── History Section ─── */}
      {history.length > 0 && (
        <section
          id="history"
          className="mt-16 w-full max-w-xs flex flex-col items-center gap-1"
        >
          <p className="text-xs text-neutral-400 tracking-[0.2em] uppercase mb-3 select-none">
            历史记录 · 共{history.length}次
          </p>
          <ul className="w-full flex flex-col gap-2">
            {[...history].reverse().map((iso, idx) => (
              <li
                key={`${idx}-${iso}`}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-600">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  完成了一次专注
                </span>
                <span className="text-xs text-neutral-400 tabular-nums">
                  {history.length - idx} · {formatTimestamp(iso)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
