"use client";

import { useEffect } from "react";

/**
 * Stops the mouse wheel changing a number field's value.
 *
 * A focused `<input type="number">` in Chrome and Firefox treats the wheel
 * as a stepper, so scrolling down a form to read the rest of it silently
 * decrements whatever you last clicked into. On a page of tag counts that
 * is a figure quietly going wrong with nothing on screen to say so — you
 * typed 4857, you scrolled, and it is now 4856.
 *
 * CSS hides the arrows (see `.eng-shell input[type=number]` in globals)
 * but cannot stop the event, so it is cancelled here — once, at the
 * document, rather than with an `onWheel` on each of the three dozen
 * number inputs in this module, where the next one added would forget it.
 *
 * The listener has to be non-passive: a passive listener may not call
 * preventDefault, and React's own onWheel is registered passively at the
 * root. It only ever fires on a focused number input, so ordinary page
 * scrolling is untouched — including scrolling with the pointer over a
 * number field that does not have focus.
 */
export function NumberFieldGuard() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        el.type === "number" &&
        el === e.target
      ) {
        e.preventDefault();
      }
    }
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
