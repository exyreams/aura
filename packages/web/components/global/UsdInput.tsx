"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface UsdInputProps {
  /** Label shown above the input */
  label?: string;
  /** Current value in USD cents (integer) */
  valueCents: number | string;
  /** Called with the new value in USD cents as a string */
  onChangeCents: (cents: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
}

/**
 * A dollar-denominated input that stores and emits values in USD cents.
 *
 * - User types in dollars (e.g. "950.00")
 * - Component converts to cents on blur and emits via onChangeCents
 * - Displays a live "$X.XX" preview below the field while typing
 * - Accepts the current cents value and converts back to dollars for display
 */
function centsToDisplay(cents: number | string): string {
  const n = Number(cents);
  if (!Number.isFinite(n) || n === 0) return "";
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

export const UsdInput = ({
  label,
  valueCents,
  onChangeCents,
  error,
  disabled,
  required,
  id,
  placeholder = "0.00",
  className,
  ref,
}: UsdInputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const inputId =
    id || `usd-input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

  const [displayValue, setDisplayValue] = useState(() =>
    centsToDisplay(valueCents),
  );

  // Sync display when external cents value changes (e.g. form reset)
  useEffect(() => {
    setDisplayValue(centsToDisplay(valueCents));
  }, [valueCents]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    // Live-convert to cents as user types
    const dollars = Number.parseFloat(raw);
    if (Number.isFinite(dollars) && dollars >= 0) {
      onChangeCents(String(Math.round(dollars * 100)));
    } else if (raw === "" || raw === ".") {
      onChangeCents("0");
    }
  };

  const handleBlur = () => {
    // On blur, clean up the display but don't force decimal places
    const dollars = Number.parseFloat(displayValue);
    if (Number.isFinite(dollars) && dollars >= 0) {
      const cents = Math.round(dollars * 100);
      // Only show decimals if there are non-zero cents
      const normalised =
        cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
      setDisplayValue(normalised);
      onChangeCents(String(cents));
    } else {
      setDisplayValue("");
      onChangeCents("0");
    }
  };

  // Live preview in cents for the hint line
  const previewCents = Number(valueCents);
  const _previewDollars = Number.isFinite(previewCents)
    ? previewCents / 100
    : 0;

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="mono text-[10px] uppercase text-(--text-muted) font-bold"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {/* Dollar sign prefix */}
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) mono text-sm select-none">
          $
        </span>
        <input
          ref={ref}
          id={inputId}
          type="number"
          min="0"
          step="0.01"
          value={displayValue}
          onChange={handleAmountChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={cn(
            "bg-(--input-bg) border border-border rounded-sm pl-7 pr-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main)",
            "focus:border-(--text-muted)",
            error && "border-danger focus:border-danger",
            className,
          )}
        />
      </div>
      {/* Hint: shows cents value so user knows what's being stored */}
      <p className="text-[11px] text-(--text-muted) mono">
        {previewCents > 0
          ? `${previewCents.toLocaleString()} cents`
          : "Enter amount in dollars"}
      </p>
      {error && <span className="text-[10px] text-danger mono">{error}</span>}
    </div>
  );
};

UsdInput.displayName = "UsdInput";
