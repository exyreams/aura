"use client";

import { motion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { width: 28, height: 16, thumb: 12, padding: 2 },
  md: { width: 40, height: 22, thumb: 16, padding: 3 },
  lg: { width: 48, height: 26, thumb: 20, padding: 3 },
} as const;

type Size = keyof typeof SIZES;

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  ref?: Ref<HTMLButtonElement>;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  size?: Size;
  name?: string;
  value?: string;
  required?: boolean;
}

export function Switch({
  ref,
  checked: checkedProp,
  defaultChecked,
  onCheckedChange,
  label,
  disabled = false,
  size = "md",
  name,
  value = "on",
  required,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SwitchProps) {
  const isControlled = checkedProp !== undefined;
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const checked = isControlled ? checkedProp : internal;

  const reactId = useId();
  const switchId = id ?? reactId;
  const labelId = `${switchId}-label`;

  const dim = SIZES[size];
  const offX = dim.padding;
  const onX = dim.width - dim.thumb - dim.padding;

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !checked;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  }, [checked, disabled, isControlled, onCheckedChange]);

  const switchEl = (
    <button
      ref={ref}
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={!label && !ariaLabelledBy ? ariaLabel : undefined}
      aria-labelledby={ariaLabelledBy ?? (label ? labelId : undefined)}
      data-state={checked ? "checked" : "unchecked"}
      data-disabled={disabled || undefined}
      disabled={disabled}
      onClick={toggle}
      style={{ width: dim.width, height: dim.height }}
      className={cn(
        "relative inline-flex flex-shrink-0 cursor-pointer rounded-sm transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-(--primary)" : "bg-(--hover-bg) border border-(--border)",
        !label && className,
      )}
      {...props}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: checked ? onX : offX }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        className="absolute rounded-sm bg-white pointer-events-none"
        style={{
          top: dim.padding,
          width: dim.thumb,
          height: dim.thumb,
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );

  const hiddenFormInput = name ? (
    <input
      type="checkbox"
      aria-hidden
      tabIndex={-1}
      name={name}
      value={value}
      checked={checked}
      required={required}
      disabled={disabled}
      readOnly
      style={{
        position: "absolute",
        pointerEvents: "none",
        opacity: 0,
        margin: 0,
        width: 0,
        height: 0,
      }}
    />
  ) : null;

  if (!label) {
    return (
      <>
        {switchEl}
        {hiddenFormInput}
      </>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      {switchEl}
      {hiddenFormInput}
      <button
        type="button"
        id={labelId}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "text-xs text-(--text-muted) select-none transition-colors bg-transparent border-0 p-0 m-0",
          disabled
            ? "cursor-not-allowed"
            : "cursor-pointer hover:text-(--text-main)",
        )}
      >
        {label}
      </button>
    </div>
  );
}
