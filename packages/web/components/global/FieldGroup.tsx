import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FieldGroupProps
  extends Omit<ComponentPropsWithoutRef<"fieldset">, "children"> {
  label: string;
  description?: string;
  children: ReactNode;
}

export function FieldGroup({
  label,
  description,
  children,
  className,
  ...props
}: FieldGroupProps) {
  return (
    <fieldset className={cn("grid content-start gap-2", className)} {...props}>
      <legend className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </legend>
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}
