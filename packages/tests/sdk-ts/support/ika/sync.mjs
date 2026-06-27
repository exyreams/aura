/**
 * Copies the generated Ika dWallet gRPC stubs + BCS types out of the installed
 * `@ika.xyz/pre-alpha-solana-client` package into `support/ika/vendor/` so the
 * thin client wrapper can import them. Mirrors the backend/cli vendor:sync.
 *
 * The copied files are generated code and are gitignored; only the wrapper
 * (`client.ts`) and this script are tracked. Run automatically before the
 * devnet suite.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(
  here,
  "../../node_modules/@ika.xyz/pre-alpha-solana-client",
);
const vendor = path.join(here, "vendor");

const copies = [
  {
    from: path.join(pkg, "src/generated/grpc/ika_dwallet.ts"),
    to: path.join(vendor, "generated/grpc/ika_dwallet.ts"),
  },
  {
    from: path.join(pkg, "src/bcs-types.ts"),
    to: path.join(vendor, "bcs-types.ts"),
  },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    throw new Error(
      `Missing Ika vendor source: ${from}\nRun \`bun install\` first.`,
    );
  }
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
  // Generated code is not held to our strict TS/lint rules.
  writeFileSync(to, `// @ts-nocheck\n${readFileSync(to, "utf8")}`);
  console.log(`synced ${path.relative(here, to)}`);
}
