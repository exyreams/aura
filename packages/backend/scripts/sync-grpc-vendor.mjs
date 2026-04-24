import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");

const copies = [
  {
    from: path.join(
      pkgDir,
      "node_modules/@encrypt.xyz/pre-alpha-solana-client/src/generated/grpc/encrypt_service.ts",
    ),
    to: path.join(
      pkgDir,
      "src/vendor/encrypt/generated/grpc/encrypt_service.ts",
    ),
  },
  {
    from: path.join(
      pkgDir,
      "node_modules/@ika.xyz/pre-alpha-solana-client/src/generated/grpc/ika_dwallet.ts",
    ),
    to: path.join(pkgDir, "src/vendor/ika/generated/grpc/ika_dwallet.ts"),
  },
  {
    from: path.join(
      pkgDir,
      "node_modules/@ika.xyz/pre-alpha-solana-client/src/bcs-types.ts",
    ),
    to: path.join(pkgDir, "src/vendor/ika/bcs-types.ts"),
  },
];

for (const entry of copies) {
  if (!existsSync(entry.from)) {
    throw new Error(`Missing vendor source: ${entry.from}`);
  }
  mkdirSync(path.dirname(entry.to), { recursive: true });
  cpSync(entry.from, entry.to);
  console.log(`synced ${path.relative(pkgDir, entry.to)}`);
}
