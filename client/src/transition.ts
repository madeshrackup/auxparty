import { flushSync } from "react-dom";

type ViewTransition = {
  finished?: Promise<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
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
