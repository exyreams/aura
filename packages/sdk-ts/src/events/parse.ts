/** Generated event parsing utilities. Do not edit. */
import { EventParser } from "@coral-xyz/anchor";
import type { AuraClient } from "../client.js";
import type { AuraEvents } from "./types.js";

export function parseAuraEvents(
  client: AuraClient,
  logs: string[],
): AuraEvents[keyof AuraEvents][] {
  const parser = new EventParser(client.programId, client.program.coder);
  const events: AuraEvents[keyof AuraEvents][] = [];
  for (const event of parser.parseLogs(logs)) {
    events.push(event.data as AuraEvents[keyof AuraEvents]);
  }
  return events;
}

export function matchesEventDiscriminator(
  data: Buffer,
  discriminator: Buffer,
): boolean {
  return (
    data.length >= discriminator.length &&
    data.subarray(0, discriminator.length).equals(discriminator)
  );
}
