#!/usr/bin/env node

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const message = warning instanceof Error ? warning.message : String(warning);
  if (message.includes("Importing JSON modules is an experimental feature")) {
    return;
  }
  originalEmitWarning(warning, ...args);
};

import("../dist/index.js")
  .then((module) => module.main())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
