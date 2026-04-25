"use client";

import { motion } from "motion/react";
import Image from "next/image";
import type React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeClasses = {
  small: "w-6 h-6 text-[9px]",
  medium: "w-8 h-8 text-[10px]",
  large: "w-10 h-10 text-xs",
};

const sizePixels = {
  small: 24,
  medium: 32,
  large: 40,
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = "medium",
  className,
}) => {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (src) {
    return (
      <div
        className={cn(
          "relative rounded-sm overflow-hidden border border-border",
          sizeClasses[size],
          className,
        )}
      >
        <Image
          src={src}
          alt={name}
          width={sizePixels[size]}
          height={sizePixels[size]}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-sm bg-(--card-bg) flex items-center justify-center text-(--text-muted) font-bold border border-border",
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </div>
  );
};

export interface AvatarGroupProps {
  avatars: Array<{ name: string; src?: string }>;
  max?: number;
  size?: "small" | "medium" | "large";
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  avatars,
  max = 3,
  size = "medium",
  className,
}) => {
  const displayAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  // Cycle through different background colors for visual variety
  const bgColors = ["bg-slate-700", "bg-slate-600", "bg-slate-800"];

  return (
    <div className={cn("flex items-center", className)}>
      {displayAvatars.map((avatar) => {
        const initials = avatar.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        // Use avatar name as unique key
        const avatarKey = `avatar-${avatar.name.toLowerCase().replace(/\s+/g, "-")}`;
        const index = displayAvatars.indexOf(avatar);
        // Calculate z-index dynamically
        const zIndex = displayAvatars.length - index;

        return (
          <motion.div
            key={avatarKey}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.15 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={cn(
              "rounded-full border-2 border-(--bg) flex items-center justify-center text-(--text-muted) font-bold mono cursor-pointer select-none relative",
              bgColors[index % bgColors.length],
              size === "small" && "w-6 h-6 text-[9px]",
              size === "medium" && "w-8 h-8 text-[10px]",
              size === "large" && "w-10 h-10 text-xs",
              index > 0 && "-ml-3",
              "hover:z-50",
              // Dynamic z-index classes
              zIndex === 1 && "z-1",
              zIndex === 2 && "z-2",
              zIndex === 3 && "z-3",
              zIndex === 4 && "z-4",
              zIndex === 5 && "z-5",
            )}
          >
            {initials}
          </motion.div>
        );
      })}
      {remaining > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.15 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn(
            "rounded-full bg-slate-800 border-2 border-(--bg) flex items-center justify-center text-slate-500 font-bold mono -ml-3 cursor-pointer select-none relative hover:z-50 z-0",
            size === "small" && "w-6 h-6 text-[9px]",
            size === "medium" && "w-8 h-8 text-[10px]",
            size === "large" && "w-10 h-10 text-xs",
          )}
        >
          +{remaining}
        </motion.div>
      )}
    </div>
  );
};

export interface NotificationBadgeProps {
  count: number;
  icon?: React.ReactNode;
  className?: string;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  icon,
  className,
}) => {
  return (
    <div className={cn("relative", className)}>
      <div className="w-10 h-10 bg-(--card-bg) border border-border rounded-sm flex items-center justify-center text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors cursor-pointer">
        {icon}
      </div>
      {count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[9px] text-(--bg) font-bold border-2 border-(--bg)"
        >
          {count}
        </motion.span>
      )}
    </div>
  );
};
