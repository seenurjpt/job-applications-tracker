"use client";

// Lightweight product tour: spotlight overlay + positioned tooltip, no
// dependencies. Auto-starts once for new users (persisted per user in
// Mongo via markTourSeen); restartable anytime from the navbar ? button,
// which dispatches the "apptour:start" event.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export const TOUR_START_EVENT = "apptour:start";

interface TourStep {
  target: string; // [data-tour="..."] id
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: "nav",
    title: "Get around",
    body: "Dashboard shows your pipeline at a glance, Applications holds the full list, and Settings manages your API key, follow-up timing, and connected Gmail.",
  },
  {
    target: "sync",
    title: "Sync your sent mail",
    body: "Pick a time range and hit Sync — AI finds the job applications you actually sent. Use Estimate cost first to see roughly how many requests it will make on your key. Sync runs on the server: refresh or log out freely, and cancel anytime.",
  },
  {
    target: "stats",
    title: "Your pipeline at a glance",
    body: "Statuses are derived automatically from real thread activity — replies flip applications to Replied or Interviewing, silence surfaces Needs follow-up and Ghosted.",
  },
  {
    target: "view-all",
    title: "Dig into applications",
    body: "Search, filter, and sort every application. The Mailed-for badge tells you what your last email did, and you can generate follow-up drafts — one at a time or in bulk — written in your own style.",
  },
  {
    target: "account",
    title: "Your account",
    body: "Your Google profile and sign out live here. You can rerun this tour anytime from the ? button in the navbar.",
  },
];

function findTarget(step: TourStep): HTMLElement | null {
  // Some anchors render twice (desktop + mobile nav) — pick the visible one.
  const candidates = document.querySelectorAll<HTMLElement>(
    `[data-tour="${step.target}"]`
  );
  for (const el of candidates) {
    if (el.offsetParent !== null && el.getBoundingClientRect().width > 0) {
      return el;
    }
  }
  return null;
}

export function AppTour({
  autoStart,
  markSeenAction,
}: {
  autoStart: boolean;
  markSeenAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [idx, setIdx] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const autoStarted = useRef(false);
  const seenMarked = useRef(!autoStart);

  const start = useCallback(() => {
    const available = STEPS.filter((s) => findTarget(s));
    if (available.length === 0) return;
    setSteps(available);
    setIdx(0);
  }, []);

  const finish = useCallback(() => {
    setIdx(null);
    setRect(null);
    if (!seenMarked.current) {
      seenMarked.current = true;
      void markSeenAction();
    }
  }, [markSeenAction]);

  // Navbar button (and anything else) can start the tour via a window event.
  useEffect(() => {
    const onStart = () => {
      if (pathname !== "/dashboard") {
        router.push("/dashboard");
        // Elements need a moment to exist after navigation.
        setTimeout(start, 700);
      } else {
        start();
      }
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [pathname, router, start]);

  // First-visit auto start, on the dashboard only.
  useEffect(() => {
    if (autoStart && !autoStarted.current && pathname === "/dashboard") {
      autoStarted.current = true;
      const t = setTimeout(start, 800);
      return () => clearTimeout(t);
    }
  }, [autoStart, pathname, start]);

  // Measure the current step's target; keep measuring on resize/scroll.
  useEffect(() => {
    if (idx === null) return;
    const step = steps[idx];
    if (!step) return;
    const el = findTarget(step);
    if (!el) {
      setIdx(idx + 1 < steps.length ? idx + 1 : null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [idx, steps]);

  if (idx === null || !steps[idx] || !rect) return null;
  const step = steps[idx];
  const last = idx === steps.length - 1;

  const PAD = 6;
  const below = rect.bottom + 190 < window.innerHeight;
  const tooltipTop = below ? rect.bottom + PAD + 10 : undefined;
  const tooltipBottom = below
    ? undefined
    : window.innerHeight - rect.top + PAD + 10;
  const tooltipLeft = Math.max(
    12,
    Math.min(rect.left, window.innerWidth - 332)
  );

  return (
    <div className="fixed inset-0 z-[100]" data-testid="app-tour">
      {/* Spotlight: everything but the target is dimmed. */}
      <div
        className="absolute rounded-lg transition-all duration-300"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(23, 23, 42, 0.55)",
        }}
      />
      {/* Click-catcher so clicks outside the card do nothing while touring. */}
      <div className="absolute inset-0" onClick={finish} />

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-xl border border-indigo-100 bg-white p-4 shadow-2xl"
        style={{ top: tooltipTop, bottom: tooltipBottom, left: tooltipLeft }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-indigo-900">{step.title}</p>
        <p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.target}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-4 bg-indigo-600" : "w-1.5 bg-neutral-300"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
              onClick={finish}
              data-testid="tour-skip"
            >
              Skip
            </button>
            {idx > 0 ? (
              <button
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                onClick={() => setIdx(idx - 1)}
              >
                Back
              </button>
            ) : null}
            <button
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              onClick={() => (last ? finish() : setIdx(idx + 1))}
              data-testid="tour-next"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Navbar button: (re)starts the tour from anywhere in the app. */
export function TourButton() {
  return (
    <button
      title="Take a tour"
      aria-label="Take a tour of the app"
      onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))}
      className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
      data-testid="start-tour"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    </button>
  );
}
