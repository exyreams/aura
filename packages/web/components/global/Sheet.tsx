import { X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/global/Button";
import { cn } from "@/lib/utils";

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  side?: "right" | "left" | "top" | "bottom";
  className?: string;
  resizable?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  floatable?: boolean;
  padding?: number;
  noBackdrop?: boolean;
  /** Whether to lock page scroll when the sheet is open. Defaults to true for modal sheets (noBackdrop=false) and false for floating sheets (noBackdrop=true). */
  lockScroll?: boolean;
  headerActions?: React.ReactNode;
  /** Top offset in px for floatable sheets — use to clear a fixed nav bar. Defaults to 0. */
  topOffset?: number;
}

const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  description,
  side = "right",
  className,
  resizable = false,
  defaultWidth = 480,
  minWidth = 320,
  maxWidth = 1200,
  floatable = false,
  padding = 16,
  noBackdrop = false,
  lockScroll,
  headerActions,
  topOffset = 0,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!resizable) return;
      e.preventDefault();
      setIsResizing(true);
    },
    [resizable],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !resizable) return;
      let newWidth: number;
      if (side === "right") {
        newWidth = window.innerWidth - e.clientX;
      } else if (side === "left") {
        newWidth = e.clientX;
      } else {
        return;
      }
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    },
    [isResizing, resizable, side, minWidth, maxWidth],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      const shouldLock = lockScroll ?? !noBackdrop;
      if (shouldLock) {
        const scrollbarWidth =
          window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "";
    };
  }, [isOpen, onClose, noBackdrop, lockScroll]);

  const getSlideVariants = () => {
    const withOpacity = floatable;
    switch (side) {
      case "right":
        return {
          initial: { x: "100%", ...(withOpacity && { opacity: 0 }) },
          animate: { x: 0, ...(withOpacity && { opacity: 1 }) },
          exit: { x: "100%", ...(withOpacity && { opacity: 0 }) },
        };
      case "left":
        return {
          initial: { x: "-100%", ...(withOpacity && { opacity: 0 }) },
          animate: { x: 0, ...(withOpacity && { opacity: 1 }) },
          exit: { x: "-100%", ...(withOpacity && { opacity: 0 }) },
        };
      case "top":
        return {
          initial: { y: "-100%", ...(withOpacity && { opacity: 0 }) },
          animate: { y: 0, ...(withOpacity && { opacity: 1 }) },
          exit: { y: "-100%", ...(withOpacity && { opacity: 0 }) },
        };
      case "bottom":
        return {
          initial: { y: "100%", ...(withOpacity && { opacity: 0 }) },
          animate: { y: 0, ...(withOpacity && { opacity: 1 }) },
          exit: { y: "100%", ...(withOpacity && { opacity: 0 }) },
        };
    }
  };

  const sheetBase = floatable
    ? "fixed bg-(--card-bg)/90 backdrop-blur-xl border border-border shadow-2xl z-[110] rounded-sm"
    : "fixed bg-(--card-bg) border-border shadow-xl z-[110]";

  const getSheetConfig = () => {
    const widthStyle = resizable ? { width: `${width}px` } : {};
    const floatPad = floatable
      ? {
          top: `${padding + topOffset}px`,
          bottom: `${padding}px`,
          ...(side === "right" ? { right: `${padding}px` } : {}),
          ...(side === "left" ? { left: `${padding}px` } : {}),
          height: `calc(100vh - ${padding * 2 + topOffset}px)`,
        }
      : {};

    if (floatable) {
      if (side === "top") {
        return {
          cls: `${sheetBase} left-4 right-4`,
          style: {
            top: `${padding + topOffset}px`,
            height: "auto",
            maxHeight: `calc(100vh - ${padding * 2 + topOffset}px)`,
          },
          defaultCls: "h-auto",
        };
      }
      if (side === "bottom") {
        return {
          cls: `${sheetBase} left-4 right-4`,
          style: {
            bottom: `${padding}px`,
            height: "auto",
            maxHeight: `calc(100vh - ${padding * 2}px)`,
          },
          defaultCls: "h-auto",
        };
      }
      return {
        cls: sheetBase,
        style: { ...widthStyle, ...floatPad },
        defaultCls: !resizable ? "w-full sm:w-[480px]" : "",
      };
    }

    switch (side) {
      case "right":
        return {
          cls: `${sheetBase} top-1 right-1 bottom-1 h-auto border rounded-xl`,
          style: resizable ? widthStyle : {},
          defaultCls: !resizable ? "w-full sm:w-[480px]" : "",
        };
      case "left":
        return {
          cls: `${sheetBase} top-1 left-1 bottom-1 h-auto border rounded-xl`,
          style: resizable ? widthStyle : {},
          defaultCls: !resizable ? "w-full sm:w-[480px]" : "",
        };
      case "top":
        return {
          cls: `${sheetBase} top-0 left-0 w-full border-b`,
          style: {},
          defaultCls: "h-auto sm:h-96",
        };
      case "bottom":
        return {
          cls: `${sheetBase} bottom-0 left-0 w-full border-t`,
          style: {},
          defaultCls: "h-auto sm:h-96",
        };
    }
  };

  const { cls, style, defaultCls } = getSheetConfig();

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {!noBackdrop && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
              onClick={onClose}
            />
          )}

          <m.div
            variants={getSlideVariants()}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(cls, defaultCls, className)}
            style={style}
          >
            {/* Resize handle */}
            {resizable && (side === "right" || side === "left") && (
              <button
                type="button"
                aria-label="Resize panel"
                className={cn(
                  "absolute top-0 w-4 h-full cursor-col-resize group flex items-center justify-center z-10",
                  side === "right" ? "left-0" : "right-0",
                )}
                onMouseDown={handleMouseDown}
              >
                {/* Grip dots */}
                <div className="flex flex-col gap-[3px] opacity-30 group-hover:opacity-80 transition-opacity">
                  <div className="w-[3px] h-[3px] rounded-full bg-(--text-muted)" />
                  <div className="w-[3px] h-[3px] rounded-full bg-(--text-muted)" />
                  <div className="w-[3px] h-[3px] rounded-full bg-(--text-muted)" />
                  <div className="w-[3px] h-[3px] rounded-full bg-(--text-muted)" />
                  <div className="w-[3px] h-[3px] rounded-full bg-(--text-muted)" />
                </div>
              </button>
            )}

            <div className="flex flex-col h-full">
              {/* Header — only rendered when title or headerActions are provided */}
              {(title || description || headerActions) && (
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                  <div className="min-w-0">
                    {title && (
                      <h2 className="text-base font-semibold text-(--text-main) truncate">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="text-xs text-(--text-muted) mt-0.5 leading-relaxed">
                        {description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {headerActions}
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      onClick={onClose}
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Close button when no header */}
              {!(title || description || headerActions) && (
                <div className="absolute top-3 right-3 z-10">
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : null;
};

export default Sheet;
