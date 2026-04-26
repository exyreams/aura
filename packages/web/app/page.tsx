"use client";

import { Ecosystem } from "@/components/landing/Ecosystem";
import { FAQ } from "@/components/landing/FAQ";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { Navbar } from "@/components/landing/Navbar";
import { Problem } from "@/components/landing/Problem";
import { Steps } from "@/components/landing/Steps";
import { Technology } from "@/components/landing/Technology";
import { Waitlist } from "@/components/landing/Waitlist";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen font-sans bg-(--bg) text-(--text-main) overflow-x-hidden selection:bg-slate-400 selection:text-(--bg) cursor-default">
      {/* Grid Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="w-full h-full"
          style={{
            backgroundSize: "40px 40px",
            backgroundImage:
              "linear-gradient(to right, var(--grid) 1px, transparent 1px), linear-gradient(to bottom, var(--grid) 1px, transparent 1px)",
          }}
        />
      </div>

      {/* Glow Orbs */}
      <div
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{
          top: "-10%",
          right: "-10%",
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.03) 0%, transparent 70%)",
        }}
      />
      <div
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{
          bottom: "-10%",
          left: "-10%",
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.03) 0%, transparent 70%)",
        }}
      />

      <Navbar />
      <main className="relative z-10">
        <Hero />
        <Problem />
        <Technology />
        <Features />
        <Ecosystem />
        <Steps />
        <FAQ />
        <Waitlist />
      </main>
      <Footer />
    </div>
  );
}
