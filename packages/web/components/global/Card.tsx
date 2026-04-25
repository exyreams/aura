import type React from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  hover = true,
}) => {
  return (
    <div
      className={cn(
        "bg-(--card-bg) border border-border rounded p-8 transition-all relative z-10",
        hover && "hover:border-primary",
        className,
      )}
    >
      {children}
    </div>
  );
};
