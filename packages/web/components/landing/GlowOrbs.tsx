"use client";

import { useEffect, useRef } from "react";

export const GlowOrbs = () => {
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      if (orb1Ref.current) {
        orb1Ref.current.style.transform = `translate(${x * 100}px, ${-y * 50}px)`;
      }
      if (orb2Ref.current) {
        orb2Ref.current.style.transform = `translate(${-x * 50}px, ${y * 25}px)`;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <div
        ref={orb1Ref}
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0 transition-transform duration-1000 ease-out"
        style={{
          top: "-10%",
          right: "-10%",
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.08) 0%, transparent 70%)",
        }}
      />
      <div
        ref={orb2Ref}
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0 transition-transform duration-1000 ease-out"
        style={{
          bottom: "-10%",
          left: "-10%",
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.08) 0%, transparent 70%)",
        }}
      />
    </>
  );
};
