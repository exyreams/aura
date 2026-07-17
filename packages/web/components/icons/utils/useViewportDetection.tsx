/**
 * @file useViewportDetection.tsx
 * @description Specialized hook for the Scntix Icon System.
 * Monitors element visibility within the viewport to trigger 'animateOnView' events.
 * @license Scntix
 */
import { type UseInViewOptions, useInView } from "motion/react";
import * as React from "react";

interface UseViewportDetectionOptions {
  enableViewportDetection?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: UseInViewOptions["margin"];
}

/**
 * Specialized hook for viewport intersection detection.
 * It manages an internal ref and forwards it while monitoring visibility via Framer Motion's useInView.
 *
 * @param ref - The external ref to be merged (usually from forwardRef).
 * @param options - Configuration for viewport detection behavior
 * @param options.enableViewportDetection - Whether to enable viewport detection (default: true when not specified)
 * @param options.inViewOnce - Whether to trigger only once when element comes into view
 * @param options.inViewMargin - Margin around the viewport for detection
 * @returns An object containing the internal ref and the visibility status.
 */
function useViewportDetection<T extends HTMLElement = HTMLElement>(
  ref: React.Ref<T>,
  options: UseViewportDetectionOptions = {},
) {
  const {
    enableViewportDetection = true,
    inViewOnce = false,
    inViewMargin = "0px",
  } = options;
  const localRef = React.useRef<T>(null);
  React.useImperativeHandle(ref, () => localRef.current as T);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !enableViewportDetection || inViewResult;
  return { ref: localRef, isInView };
}

export { type UseViewportDetectionOptions, useViewportDetection };
