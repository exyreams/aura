"use client";

export const SystemGrid = () => {
  return (
    <div
      className="fixed top-0 left-0 w-screen h-screen pointer-events-none z-1"
      style={{
        backgroundSize: "50px 50px",
        backgroundImage: `
          linear-gradient(to right, var(--grid) 1px, transparent 1px),
          linear-gradient(to bottom, var(--grid) 1px, transparent 1px)
        `,
      }}
    />
  );
};
