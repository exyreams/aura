#!/usr/bin/env node

import("../dist/index.js")
  .then((module) => module.main())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
