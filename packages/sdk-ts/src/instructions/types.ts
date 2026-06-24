import type { Program } from "@coral-xyz/anchor";
import type { AuraCore } from "../generated/aura_core.js";

type Methods = Program<AuraCore>["methods"];

/** Helper to get the argument tuple of a Program method */
export type MethodArgs<K extends keyof Methods> = Parameters<Methods[K]>;

/** Helper to get the accounts parameter of a Program method */
export type MethodAccounts<K extends keyof Methods> = Parameters<
  ReturnType<Methods[K]>["accountsStrict"]
>[0];
