/**
 * @file AnimationWrapper.tsx
 * @description Core animation orchestration for the Scntix Icon System.
 * Manages global triggers (hover, tap, view), animation context, and state lifecycle.
 * @license Scntix
 */
import {
  type HTMLMotionProps,
  motion,
  type SVGMotionProps,
  type UseInViewOptions,
  useAnimation,
  type Variants,
} from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { getVariantsFromCache, setVariantsInCache } from "./motionCache";
import { Renderer, type WithAsChild } from "./Renderer";
import { useViewportDetection } from "./useViewportDetection";

const builtInAnimations = {
  "stroke-draw": {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [0.05, 1],
      transition: {
        duration: 0.8,
        ease: "easeInOut",
      },
    },
  } as Variants,
  "stroke-loop": {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [1, 0.05, 1],
      transition: {
        duration: 1.6,
        ease: "easeInOut",
      },
    },
  } as Variants,
} as const;

type BuiltInAnimations = keyof typeof builtInAnimations;
type TriggerProp<T = string> = boolean | BuiltInAnimations | T;
type Trigger = TriggerProp<string>;

type AnimationWrapperContextValue = {
  controls: ReturnType<typeof useAnimation> | undefined;
  animation: BuiltInAnimations | string;
  loop: boolean;
  loopDelay: number;
  active: boolean;
  animate?: Trigger;
  initialOnAnimateEnd?: boolean;
  completeOnStop?: boolean;
  persistOnAnimateEnd?: boolean;
  delay?: number;
};

type DefaultIconProps<T = string> = {
  animate?: TriggerProp<T>;
  animateOnHover?: TriggerProp<T>;
  animateOnTap?: TriggerProp<T>;
  animateOnView?: TriggerProp<T>;
  animateOnViewMargin?: UseInViewOptions["margin"];
  animateOnViewOnce?: boolean;
  animation?: T | BuiltInAnimations;
  loop?: boolean;
  loopDelay?: number;
  initialOnAnimateEnd?: boolean;
  completeOnStop?: boolean;
  persistOnAnimateEnd?: boolean;
  delay?: number;
};

type AnimationWrapperProps<T = string> = WithAsChild<
  HTMLMotionProps<"span"> &
    DefaultIconProps<T> & {
      children: React.ReactNode;
      asChild?: boolean;
    }
>;

type IconProps<T> = DefaultIconProps<T> &
  Omit<SVGMotionProps<SVGSVGElement>, "animate"> & {
    size?: number;
  };

type IconWrapperProps<T> = IconProps<T> & {
  icon: React.ComponentType<IconProps<T>>;
};

/** Context and Hooks for managing icon animation state */
const AnimationWrapperContext =
  React.createContext<AnimationWrapperContextValue | null>(null);

/**
 * Custom hook to access the animation wrapper's context.
 * Provides access to controls, animation state, and configuration.
 *
 * @returns {AnimationWrapperContextValue} The animation context, or default values if used outside a provider.
 */
function useAnimationWrapperContext() {
  const context = React.useContext(AnimationWrapperContext);
  if (!context)
    return {
      controls: undefined,
      animation: "default",
      loop: false,
      loopDelay: 0,
      active: false,
      animate: false,
      initialOnAnimateEnd: false,
      completeOnStop: false,
      persistOnAnimateEnd: false,
      delay: 0,
    };
  return context;
}

/**
 * Composes multiple event handlers into a single handler.
 * Useful for merging user-provided props with internal logic.
 *
 * @param theirs - The event handler provided by the user via props.
 * @param ours - The internal event handler for animation logic.
 * @returns A single function that calls both handlers sequentially.
 */
function composeEventHandlers<E extends React.SyntheticEvent<unknown>>(
  theirs?: (event: E) => void,
  ours?: (event: E) => void,
) {
  return (event: E) => {
    theirs?.(event);
    ours?.(event);
  };
}

/**
 * Core wrapper component that manages the animation lifecycle for icons.
 * Provides an `AnimationWrapperContext` to children and coordinates transitions
 * based on hover, tap, viewport, or manual triggers.
 *
 * @param props - Configuration and children for the animation wrapper.
 */
function AnimationWrapper({
  asChild = false,
  animate = false,
  animateOnHover = false,
  animateOnTap = false,
  animateOnView = false,
  animateOnViewMargin = "0px",
  animateOnViewOnce = true,
  animation = "default",
  loop = false,
  loopDelay = 0,
  initialOnAnimateEnd = false,
  completeOnStop = false,
  persistOnAnimateEnd = false,
  delay = 0,
  children,
  ...props
}: AnimationWrapperProps) {
  const controls = useAnimation();

  const [localAnimate, setLocalAnimate] = React.useState<boolean>(() => {
    if (animate === undefined || animate === false) return false;
    return delay <= 0;
  });
  const [currentAnimation, setCurrentAnimation] = React.useState<
    string | BuiltInAnimations
  >(typeof animate === "string" ? animate : animation);
  const [status, setStatus] = React.useState<"initial" | "animate">("initial");

  const delayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopDelayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimateInProgressRef = React.useRef<boolean>(false);
  const animateEndPromiseRef = React.useRef<Promise<void> | null>(null);
  const resolveAnimateEndRef = React.useRef<(() => void) | null>(null);
  const activeRef = React.useRef<boolean>(localAnimate);
  const statusRef = React.useRef<"initial" | "animate">(status);

  const runGenRef = React.useRef(0);
  const cancelledRef = React.useRef(false);

  const bumpGeneration = React.useCallback(() => {
    runGenRef.current++;
  }, []);

  const startAnimation = React.useCallback(
    (trigger: TriggerProp) => {
      const next = typeof trigger === "string" ? trigger : animation;
      bumpGeneration();
      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }
      setCurrentAnimation(next);
      if (delay > 0) {
        setLocalAnimate(false);
        delayRef.current = setTimeout(() => {
          setLocalAnimate(true);
        }, delay);
      } else {
        setLocalAnimate(true);
      }
    },
    [animation, delay, bumpGeneration],
  );

  const stopAnimation = React.useCallback(() => {
    bumpGeneration();
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (loopDelayRef.current) {
      clearTimeout(loopDelayRef.current);
      loopDelayRef.current = null;
    }
    setLocalAnimate(false);
  }, [bumpGeneration]);

  React.useEffect(() => {
    activeRef.current = localAnimate;
  }, [localAnimate]);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  React.useEffect(() => {
    if (animate === undefined) return;
    setCurrentAnimation(typeof animate === "string" ? animate : animation);
    if (animate) startAnimation(animate as TriggerProp);
    else stopAnimation();
  }, [animate, animation, startAnimation, stopAnimation]);

  React.useEffect(() => {
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
      if (loopDelayRef.current) clearTimeout(loopDelayRef.current);
    };
  }, []);

  const viewOuterRef = React.useRef<HTMLElement>(null);
  const { ref: inViewRef, isInView } = useViewportDetection(viewOuterRef, {
    enableViewportDetection: !!animateOnView,
    inViewOnce: animateOnViewOnce,
    inViewMargin: animateOnViewMargin,
  });

  const startAnim = React.useCallback(
    async (anim: "initial" | "animate", method: "start" | "set" = "start") => {
      try {
        await controls[method](anim);
        setStatus(anim);
      } catch {
        return;
      }
    },
    [controls],
  );

  React.useEffect(() => {
    if (!animateOnView) return;
    if (isInView) startAnimation(animateOnView);
    else stopAnimation();
  }, [isInView, animateOnView, startAnimation, stopAnimation]);

  React.useEffect(() => {
    const gen = ++runGenRef.current;
    cancelledRef.current = false;

    async function run() {
      if (cancelledRef.current || gen !== runGenRef.current) {
        await startAnim("initial");
        return;
      }

      if (!localAnimate) {
        if (
          completeOnStop &&
          isAnimateInProgressRef.current &&
          animateEndPromiseRef.current
        ) {
          try {
            await animateEndPromiseRef.current;
          } catch {
            // Empty catch block - intentional (Don't Remove)
          }
        }
        if (!persistOnAnimateEnd) {
          if (cancelledRef.current || gen !== runGenRef.current) {
            await startAnim("initial");
            return;
          }
          await startAnim("initial");
        }
        return;
      }

      if (loop) {
        if (cancelledRef.current || gen !== runGenRef.current) {
          await startAnim("initial");
          return;
        }
        await startAnim("initial", "set");
      }

      isAnimateInProgressRef.current = true;
      animateEndPromiseRef.current = new Promise<void>((resolve) => {
        resolveAnimateEndRef.current = resolve;
      });

      if (cancelledRef.current || gen !== runGenRef.current) {
        isAnimateInProgressRef.current = false;
        resolveAnimateEndRef.current?.();
        resolveAnimateEndRef.current = null;
        animateEndPromiseRef.current = null;
        await startAnim("initial");
        return;
      }

      await startAnim("animate");

      if (cancelledRef.current || gen !== runGenRef.current) {
        isAnimateInProgressRef.current = false;
        resolveAnimateEndRef.current?.();
        resolveAnimateEndRef.current = null;
        animateEndPromiseRef.current = null;
        await startAnim("initial");
        return;
      }

      isAnimateInProgressRef.current = false;
      resolveAnimateEndRef.current?.();
      resolveAnimateEndRef.current = null;
      animateEndPromiseRef.current = null;

      if (initialOnAnimateEnd) {
        if (cancelledRef.current || gen !== runGenRef.current) {
          await startAnim("initial");
          return;
        }
        await startAnim("initial", "set");
      }

      if (loop) {
        if (loopDelay > 0) {
          await new Promise<void>((resolve) => {
            loopDelayRef.current = setTimeout(() => {
              loopDelayRef.current = null;
              resolve();
            }, loopDelay);
          });

          if (cancelledRef.current || gen !== runGenRef.current) {
            await startAnim("initial");
            return;
          }
          if (!activeRef.current) {
            if (statusRef.current !== "initial" && !persistOnAnimateEnd)
              await startAnim("initial");
            return;
          }
        } else {
          if (!activeRef.current) {
            if (statusRef.current !== "initial" && !persistOnAnimateEnd)
              await startAnim("initial");
            return;
          }
        }
        if (cancelledRef.current || gen !== runGenRef.current) {
          await startAnim("initial");
          return;
        }
        await run();
      }
    }

    void run();

    return () => {
      cancelledRef.current = true;
      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }
      if (loopDelayRef.current) {
        clearTimeout(loopDelayRef.current);
        loopDelayRef.current = null;
      }
    };
  }, [
    localAnimate,
    loop,
    completeOnStop,
    persistOnAnimateEnd,
    loopDelay,
    initialOnAnimateEnd,
    startAnim,
  ]);

  const childProps = (
    React.isValidElement(children) ? (children as React.ReactElement).props : {}
  ) as Record<string, unknown> & {
    onMouseEnter?: React.MouseEventHandler<HTMLElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLElement>;
    onPointerDown?: React.PointerEventHandler<HTMLElement>;
    onPointerUp?: React.PointerEventHandler<HTMLElement>;
  };

  const handleMouseEnter = composeEventHandlers<React.MouseEvent<HTMLElement>>(
    childProps.onMouseEnter,
    () => {
      if (animateOnHover) startAnimation(animateOnHover);
    },
  );

  const handleMouseLeave = composeEventHandlers<React.MouseEvent<HTMLElement>>(
    childProps.onMouseLeave,
    () => {
      if (animateOnHover || animateOnTap) stopAnimation();
    },
  );

  const handlePointerDown = composeEventHandlers<
    React.PointerEvent<HTMLElement>
  >(childProps.onPointerDown, () => {
    if (animateOnTap) startAnimation(animateOnTap);
  });

  const handlePointerUp = composeEventHandlers<React.PointerEvent<HTMLElement>>(
    childProps.onPointerUp,
    () => {
      if (animateOnTap) stopAnimation();
    },
  );

  const content = asChild ? (
    <Renderer
      ref={inViewRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {children}
    </Renderer>
  ) : (
    <motion.span
      ref={inViewRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {children}
    </motion.span>
  );

  return (
    <AnimationWrapperContext.Provider
      value={{
        controls,
        animation: currentAnimation,
        loop,
        loopDelay,
        active: localAnimate,
        animate: localAnimate ? currentAnimation : false,
        initialOnAnimateEnd,
        completeOnStop,
        persistOnAnimateEnd,
        delay,
      }}
    >
      {content}
    </AnimationWrapperContext.Provider>
  );
}

const pathClassName =
  "[&_[stroke-dasharray='1px_1px']]:![stroke-dasharray:1px_0px]";

/**
 * A Higher-Order Component (HOC) that wraps an icon component with animation logic.
 * It handles inheritance from parent wrappers and applies the default design system
 * constants like `pathClassName`.
 *
 * @param props - Icon properties including size, animation choice, and triggers.
 */
const IconWrapper = React.memo(
  <T extends string>({
    size = 28,
    animation: animationProp,
    animate,
    animateOnHover,
    animateOnTap,
    animateOnView,
    animateOnViewMargin,
    animateOnViewOnce,
    icon: IconComponent,
    loop,
    loopDelay,
    persistOnAnimateEnd,
    initialOnAnimateEnd,
    delay,
    completeOnStop,
    className,
    ...props
  }: IconWrapperProps<T>) => {
    const context = React.useContext(AnimationWrapperContext);

    if (context) {
      const {
        controls,
        animation: parentAnimation,
        loop: parentLoop,
        loopDelay: parentLoopDelay,
        active: parentActive,
        persistOnAnimateEnd: parentPersistOnAnimateEnd,
        initialOnAnimateEnd: parentInitialOnAnimateEnd,
        delay: parentDelay,
        completeOnStop: parentCompleteOnStop,
      } = context;

      const hasOverrides =
        animate !== undefined ||
        animateOnHover !== undefined ||
        animateOnTap !== undefined ||
        animateOnView !== undefined ||
        loop !== undefined ||
        loopDelay !== undefined ||
        initialOnAnimateEnd !== undefined ||
        persistOnAnimateEnd !== undefined ||
        delay !== undefined ||
        completeOnStop !== undefined;

      if (hasOverrides) {
        const inheritedAnimate: Trigger = parentActive
          ? (animationProp ?? parentAnimation ?? "default")
          : false;

        const finalAnimate: Trigger = (animate ?? inheritedAnimate) as Trigger;

        return (
          <AnimationWrapper
            animate={finalAnimate}
            animateOnHover={animateOnHover}
            animateOnTap={animateOnTap}
            animateOnView={animateOnView}
            animateOnViewMargin={animateOnViewMargin}
            animateOnViewOnce={animateOnViewOnce}
            animation={animationProp ?? parentAnimation}
            loop={loop ?? parentLoop}
            loopDelay={loopDelay ?? parentLoopDelay}
            persistOnAnimateEnd={
              persistOnAnimateEnd ?? parentPersistOnAnimateEnd
            }
            initialOnAnimateEnd={
              initialOnAnimateEnd ?? parentInitialOnAnimateEnd
            }
            delay={delay ?? parentDelay}
            completeOnStop={completeOnStop ?? parentCompleteOnStop}
            asChild
          >
            <IconComponent
              size={size}
              className={cn(
                className,
                ((animationProp ?? parentAnimation) === "stroke-draw" ||
                  (animationProp ?? parentAnimation) === "stroke-loop") &&
                  pathClassName,
              )}
              {...props}
            />
          </AnimationWrapper>
        );
      }

      const animationToUse = animationProp ?? parentAnimation;
      const loopToUse = parentLoop;
      const loopDelayToUse = parentLoopDelay;

      return (
        <AnimationWrapperContext.Provider
          value={{
            controls,
            animation: animationToUse,
            loop: loopToUse,
            loopDelay: loopDelayToUse,
            active: parentActive,
            animate: parentActive ? animationToUse : false,
            initialOnAnimateEnd: parentInitialOnAnimateEnd,
            delay: parentDelay,
            completeOnStop: parentCompleteOnStop,
            persistOnAnimateEnd: parentPersistOnAnimateEnd,
          }}
        >
          <IconComponent
            size={size}
            className={cn(
              className,
              (animationToUse === "stroke-draw" ||
                animationToUse === "stroke-loop") &&
                pathClassName,
            )}
            {...props}
          />
        </AnimationWrapperContext.Provider>
      );
    }

    if (
      animate !== undefined ||
      animateOnHover !== undefined ||
      animateOnTap !== undefined ||
      animateOnView !== undefined ||
      animationProp !== undefined
    ) {
      return (
        <AnimationWrapper
          animate={animate}
          animateOnHover={animateOnHover}
          animateOnTap={animateOnTap}
          animateOnView={animateOnView}
          animateOnViewMargin={animateOnViewMargin}
          animateOnViewOnce={animateOnViewOnce}
          animation={animationProp}
          loop={loop}
          loopDelay={loopDelay}
          delay={delay}
          completeOnStop={completeOnStop}
          asChild
        >
          <IconComponent
            size={size}
            className={cn(
              className,
              (animationProp === "stroke-draw" ||
                animationProp === "stroke-loop") &&
                pathClassName,
            )}
            {...props}
          />
        </AnimationWrapper>
      );
    }

    return (
      <IconComponent
        size={size}
        className={cn(
          className,
          (animationProp === "stroke-draw" ||
            animationProp === "stroke-loop") &&
            pathClassName,
        )}
        {...props}
      />
    );
  },
);

IconWrapper.displayName = "IconWrapper";

/**
 * A custom hook used inside icon components to resolve the correct animation variants.
 * It automatically switches between default variants and built-in stroke animations
 * based on the current context, and caches the result for performance.
 *
 * @param animations - An object containing a 'default' variant set and optional custom sets.
 * @returns The resolved variants to be passed to motion components.
 */
function useVariants<
  V extends { default: T; [key: string]: T },
  T extends Record<string, Variants>,
>(animations: V): T {
  const { animation: animationType } = useAnimationWrapperContext();

  // Fast path for default animation
  if (animationType === "default") {
    return animations.default;
  }

  const expectedKeys =
    animationType === "stroke-draw" || animationType === "stroke-loop"
      ? Object.keys(animations.default).filter((key) => !key.includes("group"))
      : Object.keys(
          (animations[animationType as keyof V] as T | undefined) ??
            animations.default,
        );

  // Create cache key based on animation type and available animation keys
  const cacheKey = `${animationType}-${expectedKeys.join(",")}`;
  const typeId = `Variants-${expectedKeys.length}-${expectedKeys.join(",")}`;

  // Check cache first
  const cached = getVariantsFromCache<T>(
    animations,
    cacheKey,
    typeId,
    expectedKeys,
  );
  if (cached) {
    return cached;
  }

  let result: T;

  // Handle built-in animations
  if (animationType in builtInAnimations) {
    const variant = builtInAnimations[animationType as BuiltInAnimations];
    const builtInResult: Record<string, Variants> = {};

    for (const key of expectedKeys) {
      builtInResult[key] = variant;
    }

    result = builtInResult as T;
  } else {
    // Handle custom animations or fallback to default
    result = (animations[animationType as keyof V] as T) ?? animations.default;
  }

  // Cache the result for future use
  setVariantsInCache(animations, cacheKey, result, typeId);

  return result;
}

export {
  AnimationWrapper,
  type AnimationWrapperContextValue,
  type AnimationWrapperProps,
  builtInAnimations,
  type IconProps,
  IconWrapper,
  type IconWrapperProps,
  pathClassName,
  useAnimationWrapperContext,
  useVariants,
};
