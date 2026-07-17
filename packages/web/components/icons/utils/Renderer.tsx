/**
 * @file Renderer.tsx
 * @description Logic for the 'asChild' primitive in the Scntix Icon System.
 * Enables seamless merging of motion capabilities into arbitrary child elements.
 * @license Scntix
 */
import { type HTMLMotionProps, isMotionComponent } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { getMotionComponent } from "./motionCache";

type AnyProps = Record<string, unknown>;

type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  "ref"
> & { ref?: React.Ref<T> };

type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined });

type RendererProps<T extends HTMLElement = HTMLElement> = {
  children?: React.ReactNode;
} & DOMMotionProps<T>;

/**
 * Merges child component props with slot-level motion props.
 * Specifically handles cumulative merging for `className` and `style`.
 *
 * @param childProps - Original props from the child element.
 * @param slotProps - Animation and interaction props from the logic layer.
 * @returns Combined props for the final rendered element.
 */
function mergeProps<T extends HTMLElement>(
  childProps: AnyProps,
  slotProps: DOMMotionProps<T>,
): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps };

  if (childProps.className || slotProps.className) {
    merged.className = cn(
      childProps.className as string,
      slotProps.className as string,
    );
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties),
    };
  }

  return merged;
}

/**
 * An 'asChild' primitive that converts a standard element into a Framer Motion component.
 * It intelligently merges refs and handles cases where the child might already be a motion component.
 *
 * @param props - Children and forwarded motion props.
 */
function Renderer<T extends HTMLElement = HTMLElement>({
  children,
  ref,
  ...props
}: RendererProps<T>) {
  const isValid = React.isValidElement(children);
  const childRef = isValid
    ? (children as React.ReactElement & { ref?: React.Ref<T> }).ref
    : null;
  const childProps = isValid ? (children as React.ReactElement).props : {};

  const isAlreadyMotion =
    isValid &&
    typeof children.type === "object" &&
    children.type !== null &&
    isMotionComponent(children.type);

  const Base = React.useMemo(() => {
    if (!isValid) return "div";
    const element = children as React.ReactElement;
    return getMotionComponent(
      element.type as React.ElementType,
      isAlreadyMotion,
    );
  }, [children, isValid, isAlreadyMotion]);

  const mergedRef = React.useCallback(
    (node: T) => {
      if (typeof childRef === "function") {
        childRef(node);
      } else if (childRef) {
        (childRef as React.RefObject<T | null>).current = node;
      }

      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.RefObject<T | null>).current = node;
      }
    },
    [childRef, ref],
  );

  if (!isValid) return null;

  const mergedProps = mergeProps(childProps as AnyProps, props);

  return React.createElement(Base, {
    ...mergedProps,
    ref: mergedRef,
  });
}

export {
  type AnyProps,
  type DOMMotionProps,
  Renderer,
  type RendererProps,
  type WithAsChild,
};
