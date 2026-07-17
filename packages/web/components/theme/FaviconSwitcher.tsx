"use client";

import { useEffect } from "react";

export function FaviconSwitcher() {
  useEffect(() => {
    const updateFavicon = (isDark: boolean) => {
      const favicon = document.querySelector(
        "link[rel='icon']",
      ) as HTMLLinkElement;

      if (favicon) {
        favicon.href = isDark ? "/favicon-dark.ico" : "/favicon-light.ico";
      } else {
        const newFavicon = document.createElement("link");
        newFavicon.rel = "icon";
        newFavicon.href = isDark ? "/favicon-dark.ico" : "/favicon-light.ico";
        document.head.appendChild(newFavicon);
      }
    };

    // Check system preference
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Set initial favicon based on system preference
    updateFavicon(darkModeQuery.matches);

    // Listen for system theme changes
    const handleChange = (e: MediaQueryListEvent) => {
      updateFavicon(e.matches);
    };

    darkModeQuery.addEventListener("change", handleChange);

    return () => {
      darkModeQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return null; // This component doesn't render anything
}
