import { flushSync } from "react-dom";
import type { NavigateFunction, To } from "react-router-dom";

type ViewTransition = {
  finished?: Promise<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransition;
};

let active: Promise<unknown> | null = null;

export function runViewTransition(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (document as ViewTransitionDocument).startViewTransition?.bind(document);
  if (!start || reduced || active) {
    update();
    return;
  }
  try {
    const vt = start(() => {
      flushSync(update);
    });
    active = Promise.race([
      Promise.resolve(vt.finished ?? undefined),
      new Promise((resolve) => window.setTimeout(resolve, 800)),
    ])
      .catch(() => undefined)
      .finally(() => {
        active = null;
      });
  } catch {
    active = null;
    update();
  }
}

export function transitionNavigate(navigate: NavigateFunction, to: To) {
  runViewTransition(() => {
    navigate(to, { flushSync: true });
  });
}
