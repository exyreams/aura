/**
 * @file motionCache.ts
 * @description Performance optimization layer for the Scntix Icon System.
 * Caches motion-enhanced components and animation variants to prevent redundant processing.
 *
 * @license Scntix
 */
import type { Variants } from "motion/react";
import { motion } from "motion/react";
import * as React from "react";

/**
 * Global caches to avoid redundant creation of motion components
 * and recalculation of animation variants.
 */
const motionComponentCache = new WeakMap<
  React.ComponentType<unknown>,
  React.ElementType
>();
const htmlComponentCache = new Map<string, React.ElementType>();

/**
 * Type-safe cache entry that includes type metadata for runtime validation
 */
interface CacheEntry<T extends Record<string, Variants>> {
  data: T;
  typeId: string;
  keys: string[];
}

type VariantsCacheBucket = Map<string, CacheEntry<Record<string, Variants>>>;

let variantsCache = new WeakMap<object, VariantsCacheBucket>();
// WeakMap entries can be garbage-collected at any time, so this is only an
// approximate upper bound of entries we've inserted since the last reset.
let variantsCacheEntryCount = 0;

const SUPPORTED_HTML_TAGS = new Set<keyof React.JSX.IntrinsicElements>([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "g",
  "defs",
  "clipPath",
  "button",
  "input",
  "form",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "ul",
  "ol",
  "li",
  "a",
  "img",
]);

/** Returns a motion-enhanced version of the provided component, using cache to prevent re-creation. */
function getMotionComponent(
  Component: React.ElementType,
  isAlreadyMotion: boolean = false,
): React.ElementType {
  if (isAlreadyMotion) {
    return Component;
  }

  if (typeof Component === "string") {
    return getMotionHTMLComponent(Component);
  }

  return getMotionReactComponent(Component);
}

/**
 * Resolves a motion component for standard HTML tags.
 * Checks for built-in motion support or creates a custom motion wrapper.
 */
function getMotionHTMLComponent(tagName: string): React.ElementType {
  if (htmlComponentCache.has(tagName)) {
    const cached = htmlComponentCache.get(tagName);
    if (cached) {
      return cached;
    }
  }

  try {
    let motionComponent: React.ElementType;

    if (isValidHTMLTag(tagName) && tagName in motion) {
      const motionTag = motion[tagName as keyof typeof motion];
      if (typeof motionTag === "function") {
        motionComponent = motionTag as React.ElementType;
      } else {
        motionComponent = motion.create(
          tagName as keyof React.JSX.IntrinsicElements,
        );
      }
    } else if (isValidHTMLTag(tagName)) {
      motionComponent = motion.create(
        tagName as keyof React.JSX.IntrinsicElements,
      );
    } else {
      motionComponent = motion.div;
    }

    // Cache the result
    htmlComponentCache.set(tagName, motionComponent);
    return motionComponent;
  } catch (_error) {
    const fallback = motion.div;
    htmlComponentCache.set(tagName, fallback);
    return fallback;
  }
}

/**
 * Enhances a React component with Framer Motion capabilities.
 * If the component is not motion-compatible, it wraps it in a forwardRef fallback.
 */
function getMotionReactComponent(
  Component: React.ElementType,
): React.ElementType {
  if (typeof Component === "string") {
    throw new Error(
      "String components should be handled by getMotionHTMLComponent",
    );
  }

  if (motionComponentCache.has(Component)) {
    const cached = motionComponentCache.get(Component);
    if (cached) {
      return cached;
    }
  }

  try {
    if (!isValidReactComponent(Component)) {
      throw new Error("Invalid React component provided");
    }

    const motionComponent = motion.create(
      Component as React.ComponentType<Record<string, unknown>>,
    );

    motionComponentCache.set(Component, motionComponent);

    return motionComponent;
  } catch (_error) {
    const FallbackComponent = React.forwardRef<
      HTMLElement,
      Record<string, unknown>
    >((props, ref) => {
      return React.createElement(Component, { ...props, ref });
    });

    FallbackComponent.displayName = `MotionFallback(${getComponentName(Component)})`;

    motionComponentCache.set(Component, FallbackComponent);

    return FallbackComponent;
  }
}

function isValidHTMLTag(
  tagName: string,
): tagName is keyof React.JSX.IntrinsicElements {
  return SUPPORTED_HTML_TAGS.has(tagName as keyof React.JSX.IntrinsicElements);
}

function isValidReactComponent(
  component: unknown,
): component is React.ComponentType<Record<string, unknown>> {
  if (typeof component === "function") {
    return true;
  }

  if (typeof component === "object" && component !== null) {
    const reactComponent = component as Record<string, unknown>;
    return (
      reactComponent.$$typeof === Symbol.for("react.forward_ref") ||
      reactComponent.$$typeof === Symbol.for("react.memo")
    );
  }

  return false;
}

function getComponentName(Component: React.ElementType): string {
  if (typeof Component === "string") {
    return Component;
  }

  if (typeof Component === "function") {
    return Component.displayName || Component.name || "Anonymous";
  }

  return "Unknown";
}

function clearMotionCache(): void {
  htmlComponentCache.clear();
}

function clearVariantsCache(): void {
  variantsCache = new WeakMap<object, VariantsCacheBucket>();
  variantsCacheEntryCount = 0;
}

function getCacheStats(): {
  htmlCacheSize: number;
  variantsCacheSize: number;
  weakMapInfo: string;
} {
  return {
    htmlCacheSize: htmlComponentCache.size,
    variantsCacheSize: variantsCacheEntryCount,
    weakMapInfo:
      "variantsCacheSize is an approximate upper bound because WeakMap entries may be garbage-collected",
  };
}

/**
 * Retrieves cached animation variants with type safety validation.
 *
 * IMPORTANT: Cache keys must be unique per expected type T. The function performs
 * runtime validation to ensure the cached data matches the expected shape.
 *
 * @param cacheKey - Unique identifier for the cached variants. Must be unique per type T.
 * @param typeId - Type identifier to validate cached data matches expected type
 * @param expectedKeys - Array of expected keys in the variants object for validation
 * @returns The cached variants of type T, or undefined if not found or validation fails
 *
 * @example
 * ```typescript
 * // Good: unique keys per type
 * const iconVariants = getVariantsFromCache<IconVariants>('icon-fade-in', 'IconVariants', ['path', 'group']);
 * const buttonVariants = getVariantsFromCache<ButtonVariants>('button-slide', 'ButtonVariants', ['container']);
 *
 * // Bad: reusing same key for different types
 * const iconVariants = getVariantsFromCache<IconVariants>('animation-key', 'IconVariants', ['path']);
 * const buttonVariants = getVariantsFromCache<ButtonVariants>('animation-key', 'ButtonVariants', ['container']); // Will fail validation
 * ```
 */
function getVariantsFromCache<T extends Record<string, Variants>>(
  sourceKey: object,
  cacheKey: string,
  typeId: string,
  expectedKeys: string[],
): T | undefined {
  const bucket = variantsCache.get(sourceKey);

  if (!bucket) {
    return undefined;
  }

  const entry = bucket.get(cacheKey);

  if (!entry) {
    return undefined;
  }

  // Validate type identifier matches
  if (entry.typeId !== typeId) {
    console.warn(
      `Type mismatch in variants cache for key "${cacheKey}". Expected "${typeId}", got "${entry.typeId}". ` +
        `Cache keys must be unique per type to avoid runtime errors.`,
    );
    return undefined;
  }

  // Validate expected keys match exactly independent of order
  const dataKeys = entry.keys;
  const strictMatch =
    dataKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => dataKeys.includes(key));

  if (!strictMatch) {
    console.warn(
      `Shape mismatch in variants cache for key "${cacheKey}". Expected keys: [${expectedKeys.join(", ")}], ` +
        `got keys: [${dataKeys.join(", ")}]. Cache may be corrupted.`,
    );
    return undefined;
  }

  return entry.data as T;
}

/**
 * Stores animation variants in cache with type safety metadata.
 *
 * @param cacheKey - Unique identifier for the variants. Must be unique per type T.
 * @param variants - The variants object to cache
 * @param typeId - Type identifier for runtime validation
 *
 * @example
 * ```typescript
 * setVariantsInCache('icon-fade-in', iconVariants, 'IconVariants');
 * ```
 */
function setVariantsInCache<T extends Record<string, Variants>>(
  sourceKey: object,
  cacheKey: string,
  variants: T,
  typeId: string,
): void {
  const entry: CacheEntry<T> = {
    data: variants,
    typeId,
    keys: Object.keys(variants),
  };

  let bucket = variantsCache.get(sourceKey);
  if (!bucket) {
    bucket = new Map();
    variantsCache.set(sourceKey, bucket);
  }

  if (!bucket.has(cacheKey)) {
    variantsCacheEntryCount++;
  }

  bucket.set(cacheKey, entry);
}

export {
  clearMotionCache,
  clearVariantsCache,
  getCacheStats,
  getMotionComponent,
  getVariantsFromCache,
  SUPPORTED_HTML_TAGS,
  setVariantsInCache,
};
