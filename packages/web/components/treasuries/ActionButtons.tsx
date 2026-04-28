"use client";

import { ChevronDown, Send, Shield, Users, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { cn } from "@/lib/utils";

interface ActionOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export const ActionButtons = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const actionOptions: ActionOption[] = [
    {
      label: "Propose Transaction",
      icon: <Send size={16} />,
      onClick: () => console.log("Propose Transaction"),
    },
    {
      label: "Configure Confidential Guardrails",
      icon: <Shield size={16} />,
      onClick: () => console.log("Configure Guardrails"),
    },
    {
      label: "Configure Governance",
      icon: <Users size={16} />,
      onClick: () => console.log("Configure Governance"),
    },
    {
      label: "Cancel Pending",
      icon: <XCircle size={16} />,
      onClick: () => console.log("Cancel Pending"),
      disabled: true,
    },
  ];

  const handleActionClick = (action: ActionOption) => {
    if (!action.disabled) {
      action.onClick();
      setIsDropdownOpen(false);
    }
  };

  return (
    <Card className="lg:col-span-4 h-full" hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Quick Actions
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Submit real program instructions to manage this treasury.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button variant="primary" className="w-full justify-center px-6">
          Register dWallet
        </Button>

        <div ref={dropdownRef} className="relative">
          <Button
            variant="secondary"
            icon={<ChevronDown size={16} />}
            iconPosition="right"
            className="w-full justify-center px-6"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            More Actions
          </Button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-full left-0 w-full mt-2 bg-(--bg) border border-border rounded-sm shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-2 space-y-1">
                  {actionOptions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => handleActionClick(action)}
                      disabled={action.disabled}
                      className={cn(
                        "w-full text-left px-4 py-3 text-sm rounded-sm flex items-center gap-3 transition-colors",
                        action.disabled
                          ? "text-(--text-muted) opacity-50 cursor-not-allowed"
                          : "text-(--text-main) hover:bg-(--hover-bg) cursor-pointer",
                      )}
                    >
                      <span className="shrink-0">{action.icon}</span>
                      <span className="flex-1">{action.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
};
