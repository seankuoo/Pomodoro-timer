"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, CheckCircle2, Sun, Moon, Settings } from "lucide-react";

const STORAGE_KEY = "pomodoro_history";
const THEME_KEY = "pomodoro_theme";
const SETTINGS_KEY = "pomodoro_settings";

const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

type Mode = "focus" | "break";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

/** Returns the clamped integer, or null if invalid (not 1–120 integer). */
function clampMinutes(val: string): number | null {
  const n = parseInt(val, 10);
  if (!isFinite(n) || n < 1 || n > 120) return null;
  return n;
}

export default function Home() {
  // ─── Settings ──────────────────────────────────────────────────────────────
  const [focusMin, setFocusMin] = useState(DEFAULT_FOCUS_MIN);
  const [breakMin, setBreakMin] = useState(DEFAULT_BREAK_MIN);
  const [showSettings, setShowSettings] = useState(false);
  const [draftFocus, setDraftFocus] = useState(String(DEFAULT_FOCUS_MIN));
  const [draftBreak, setDraftBreak] = useState(String(DEFAULT_BREAK_MIN));

  // ─── Timer ─────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(DEFAULT_FOCUS_MIN * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [justFinished, setJustFinished] = useState<"none" | "focus" | "break">("none");
  const [history, setHistory] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Flag set by the interval when countdown hits 0 — read by a sibling effect.
  const justCompletedRef = useRef(false);

  // ─── Dark Mode ─────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);

  // ─── Web Audio API ─────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
  }, []);

  const playBell = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.6);
  }, []);

  // ─── Mount: load persisted settings & history ───────────────────────────────
  useEffect(() => {
    setHistory(readHistory());
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const fm = Number(parsed.focusMin);
        const bm = Number(parsed.breakMin);
        if (fm >= 1 && fm <= 120) { setFocusMin(fm); setTimeLeft(fm * 60); }
        if (bm >= 1 && bm <= 120) setBreakMin(bm);
      }
    } catch { /* ignore */ }
  }, []);

  // ─── Dark Mode init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const applyDark = (dark: boolean) => {
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    };
    applyDark(stored !== null ? stored === "dark" : mq.matches);
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

  // ─── Countdown interval ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          // Signal the transition effect
          justCompletedRef.current = true;
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
  }, [isRunning]);

  // ─── Transition handler — fires when timeLeft hits 0 ───────────────────────
  useEffect(() => {
    if (timeLeft !== 0 || !justCompletedRef.current) return;
    justCompletedRef.current = false;

    setIsRunning(false);
    playBell();

    if (mode === "focus") {
      // Log this focus session
      const now = new Date().toISOString();
      setHistory((h) => {
        const next = [...h, now];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setJustFinished("focus");
      setMode("break");
      setTimeLeft(breakMin * 60);
    } else {
      // Break is over — reset to focus, wait for user to start
      setJustFinished("break");
      setMode("focus");
      setTimeLeft(focusMin * 60);
    }
  }, [timeLeft, mode, focusMin, breakMin, playBell]);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (timeLeft > 0) {
      initAudio();
      setJustFinished("none");
      setIsRunning(true);
    }
  }, [timeLeft, initAudio]);

  const handlePause = useCallback(() => setIsRunning(false), []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(focusMin * 60);
    setJustFinished("none");
  }, [focusMin]);

  // ─── Settings modal ─────────────────────────────────────────────────────────
  const openSettings = useCallback(() => {
    setDraftFocus(String(focusMin));
    setDraftBreak(String(breakMin));
    setShowSettings(true);
  }, [focusMin, breakMin]);

  const handleCancel = useCallback(() => setShowSettings(false), []);

  const draftFocusValid = clampMinutes(draftFocus) !== null;
  const draftBreakValid = clampMinutes(draftBreak) !== null;
  const canSave = draftFocusValid && draftBreakValid;

  const handleSave = useCallback(() => {
    const fm = clampMinutes(draftFocus);
    const bm = clampMinutes(draftBreak);
    if (!fm || !bm) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ focusMin: fm, breakMin: bm }));
    setFocusMin(fm);
    setBreakMin(bm);
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(fm * 60);
    setJustFinished("none");
    setShowSettings(false);
  }, [draftFocus, draftBreak]);

  // ─── Derived display values ─────────────────────────────────────────────────
  const isFinished = timeLeft === 0;
  const isBreak = mode === "break";

  const statusText = (() => {
    if (isRunning) return isBreak ? "Take a break…" : "Stay focused…";
    if (justFinished === "focus") return "专注完成！点击 Start 开始休息 ☕";
    if (justFinished === "break") return "休息结束！准备好了吗？";
    return isBreak ? `Break · ${breakMin} min` : `Focus · ${focusMin} min`;
  })();

  const statusHighlight = justFinished !== "none";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 pb-16 transition-colors duration-300">

      {/* ─── Top-right buttons ─── */}
      <div className="fixed top-4 right-4 flex items-center gap-1">
        <button
          id="btn-settings"
          onClick={openSettings}
          aria-label="Open settings"
          className="p-2 rounded-full text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 select-none"
        >
          <Settings size={18} strokeWidth={2} />
        </button>
        <button
          id="btn-theme"
          onClick={toggleDark}
          aria-label="Toggle dark mode"
          className="p-2 rounded-full text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 select-none"
        >
          {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
        </button>
      </div>

      {/* ─── Header ─── */}
      <h1 className="text-sm font-semibold tracking-[0.25em] uppercase text-neutral-400 dark:text-neutral-500 mb-4 select-none">
        Pomodoro
      </h1>

      {/* ─── Mode Chip ─── */}
      <div className={`mb-10 px-3 py-0.5 rounded-full text-[0.65rem] font-semibold tracking-[0.2em] uppercase select-none transition-colors duration-500 ${isBreak
          ? "bg-sky-100 dark:bg-sky-900/40 text-sky-500 dark:text-sky-400"
          : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400"
        }`}>
        {isBreak ? "Break" : "Focus"}
      </div>

      {/* ─── Timer Display ─── */}
      <div className="relative flex items-center justify-center mb-16">
        <div className={`absolute w-72 h-72 rounded-full border transition-colors duration-500 ${isFinished
            ? isBreak ? "border-sky-200 dark:border-sky-900" : "border-emerald-200 dark:border-emerald-900"
            : isRunning
              ? isBreak ? "border-sky-300 dark:border-sky-700" : "border-neutral-300 dark:border-neutral-700"
              : isBreak ? "border-sky-100 dark:border-sky-900/50" : "border-neutral-100 dark:border-neutral-800"
          }`} />
        <span
          className={`text-[7rem] font-extralight tracking-tight leading-none tabular-nums select-none transition-colors duration-500 ${isFinished
              ? isBreak ? "text-sky-500" : "text-emerald-500"
              : isBreak
                ? "text-sky-500 dark:text-sky-400"
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

      {/* ─── Status ─── */}
      <p className={`mt-10 select-none transition-all duration-300 ${statusHighlight
          ? `text-base font-semibold tracking-wide animate-pulse ${justFinished === "focus" ? "text-emerald-500" : "text-sky-500"}`
          : "text-xs text-neutral-300 dark:text-neutral-600 tracking-widest uppercase"
        }`}>
        {statusText}
      </p>

      {/* ─── History ─── */}
      {history.length > 0 && (
        <section id="history" className="mt-16 w-full max-w-xs flex flex-col items-center gap-1">
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

      {/* ─── Settings Modal ─── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
            onClick={handleCancel}
          />
          {/* Panel — stop propagation so clicks inside don't close the modal */}
          <div
            className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-100 dark:border-neutral-800 p-8 w-80 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold tracking-[0.15em] uppercase text-neutral-700 dark:text-neutral-200 select-none">
              Settings
            </h2>

            {/* Focus Time */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="input-focus" className="text-xs text-neutral-500 dark:text-neutral-400 font-medium select-none">
                Focus Time (minutes)
              </label>
              <input
                id="input-focus"
                type="number"
                min={1}
                max={120}
                value={draftFocus}
                onChange={(e) => setDraftFocus(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm text-neutral-900 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-800 outline-none transition-colors ${draftFocusValid
                    ? "border-neutral-200 dark:border-neutral-700 focus:border-neutral-400 dark:focus:border-neutral-500"
                    : "border-red-300 dark:border-red-800 focus:border-red-400"
                  }`}
              />
              {!draftFocusValid && (
                <p className="text-xs text-red-400 dark:text-red-500 select-none">Enter a number between 1 and 120</p>
              )}
            </div>

            {/* Break Time */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="input-break" className="text-xs text-neutral-500 dark:text-neutral-400 font-medium select-none">
                Break Time (minutes)
              </label>
              <input
                id="input-break"
                type="number"
                min={1}
                max={120}
                value={draftBreak}
                onChange={(e) => setDraftBreak(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm text-neutral-900 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-800 outline-none transition-colors ${draftBreakValid
                    ? "border-neutral-200 dark:border-neutral-700 focus:border-neutral-400 dark:focus:border-neutral-500"
                    : "border-red-300 dark:border-red-800 focus:border-red-400"
                  }`}
              />
              {!draftBreakValid && (
                <p className="text-xs text-red-400 dark:text-red-500 select-none">Enter a number between 1 and 120</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                id="btn-save"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium rounded-xl hover:bg-neutral-700 dark:hover:bg-neutral-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 select-none"
              >
                Save
              </button>
              <button
                id="btn-cancel"
                onClick={handleCancel}
                className="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-sm font-medium rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 transition-all duration-150 select-none"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
