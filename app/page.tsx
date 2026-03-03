"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, CheckCircle2, Sun, Moon } from "lucide-react";

const FOCUS_SECONDS = 25 * 60; // 1500
const STORAGE_KEY = "pomodoro_history"; // JSON array of ISO date strings
const THEME_KEY = "pomodoro_theme";

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
  const [history, setHistory] = useState<string[]>([]);
  const [isDark, setIsDark] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Web Audio API ─────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);

  /** Lazily create AudioContext — MUST be called from a user gesture to satisfy
   *  browser autoplay policy (called inside handleStart). */
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    // Resume in case it was suspended (e.g. re-focused tab)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  /** Synthesise a short bell: 880 Hz sine wave with exponential decay (~1.5 s) */
  const playBell = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    // Attack → peak, then exponential decay to silence
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 1.6);
  }, []);

  // ─── Dark Mode ─────────────────────────────────────────────────────────────
  // Hydrate from localStorage; fall back to OS preference if no manual override
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const applyDark = (dark: boolean) => {
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    };

    // Stored preference always wins; otherwise follow the OS
    applyDark(stored !== null ? stored === "dark" : mq.matches);

    // React to live OS theme changes (only when the user hasn't set a manual override)
    const onMqChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY) === null) applyDark(e.matches);
    };
    mq.addEventListener("change", onMqChange);
    return () => mq.removeEventListener("change", onMqChange);
  }, []);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  }, []);

  // ─── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // ─── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);

          // Play bell
          playBell();

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

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, playBell]);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (timeLeft > 0) {
      initAudio(); // satisfy autoplay policy before timer starts
      setJustFinished(false);
      setIsRunning(true);
    }
  }, [timeLeft, initAudio]);

  const handlePause = useCallback(() => setIsRunning(false), []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(FOCUS_SECONDS);
    setJustFinished(false);
  }, []);

  const isFinished = timeLeft === 0;

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 pb-16 transition-colors duration-300">

      {/* ─── Theme Toggle ─── */}
      <button
        id="btn-theme"
        onClick={toggleDark}
        aria-label="Toggle dark mode"
        className="fixed top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 select-none"
      >
        {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
      </button>

      {/* ─── Header ─── */}
      <h1 className="text-sm font-semibold tracking-[0.25em] uppercase text-neutral-400 dark:text-neutral-500 mb-16 select-none">
        Pomodoro
      </h1>

      {/* ─── Timer Display ─── */}
      <div className="relative flex items-center justify-center mb-16">
        <div
          className={`absolute w-72 h-72 rounded-full border transition-colors duration-500 ${isFinished
            ? "border-emerald-200 dark:border-emerald-900"
            : isRunning
              ? "border-neutral-300 dark:border-neutral-700"
              : "border-neutral-100 dark:border-neutral-800"
            }`}
        />
        <span
          className={`text-[7rem] font-extralight tracking-tight leading-none tabular-nums select-none transition-colors duration-500 ${isFinished
            ? "text-emerald-500"
            : "text-neutral-900 dark:text-neutral-100"
            }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* ─── Controls ─── */}
      <div className="flex items-center gap-4">
        <button
          id="btn-start"
          onClick={handleStart}
          disabled={isRunning || isFinished}
          className="flex items-center gap-2 px-7 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium tracking-wide rounded-full hover:bg-neutral-700 dark:hover:bg-neutral-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 select-none"
        >
          <Play size={15} strokeWidth={2.5} />
          Start
        </button>

        <button
          id="btn-pause"
          onClick={handlePause}
          disabled={!isRunning}
          className="flex items-center gap-2 px-7 py-3 bg-white dark:bg-transparent text-neutral-700 dark:text-neutral-300 text-sm font-medium tracking-wide rounded-full border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 select-none"
        >
          <Pause size={15} strokeWidth={2.5} />
          Pause
        </button>

        <button
          id="btn-reset"
          onClick={handleReset}
          className="flex items-center gap-2 px-7 py-3 bg-white dark:bg-transparent text-neutral-400 dark:text-neutral-500 text-sm font-medium tracking-wide rounded-full border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-all duration-150 select-none"
        >
          <RotateCcw size={15} strokeWidth={2.5} />
          Reset
        </button>
      </div>

      {/* ─── Footer: completion banner OR status hint ─── */}
      {justFinished ? (
        <p className="mt-10 text-base font-semibold text-emerald-500 tracking-wide animate-pulse select-none">
          专注完成，休息一下吧 🎉
        </p>
      ) : (
        <p className="mt-10 text-xs text-neutral-300 dark:text-neutral-600 tracking-widest uppercase select-none">
          {isRunning ? "Stay focused…" : "Focus · 25 min"}
        </p>
      )}

      {/* ─── History Section ─── */}
      {history.length > 0 && (
        <section
          id="history"
          className="mt-16 w-full max-w-xs flex flex-col items-center gap-1"
        >
          <p className="text-xs text-neutral-400 dark:text-neutral-500 tracking-[0.2em] uppercase mb-3 select-none">
            历史记录 · 共{history.length}次
          </p>
          <ul className="w-full flex flex-col gap-2">
            {[...history].reverse().map((iso, idx) => (
              <li
                key={`${idx}-${iso}`}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  完成了一次专注
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
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
