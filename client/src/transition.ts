import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function runViewTransition(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (document as ViewTransitionDocument).startViewTransition?.bind(document);
  if (!start || reduced) {
    update();
    return;
  }
  start(() => {
    flushSync(update);
  });
}
