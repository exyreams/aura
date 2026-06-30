/**
 * Devnet: address-list maintenance (init/manage already covered by limits).
 *
 *   - update_address_list_entry add/remove (+ remove-absent reject)
 *   - manage_address_list bulk replace
 *   - clear_address_list
 *   - close_address_list
 *
 * Owner is the caller, so operatorRole is null. Skips when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveAddressListAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const ADDR_A = "0x00000000000000000000000000000000000000a1";
const ADDR_B = "0x00000000000000000000000000000000000000b2";

let t: ProvisionedTreasury;
let addressList: ReturnType<typeof deriveAddressListAddress>[0];

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "addr-list" });
  [addressList] = deriveAddressListAddress(t.treasury);
  await sendAndConfirm(
    [
      await instructions.addressLists.initAddressList(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          addressList,
          systemProgram: SystemProgram.programId,
        },
        args: { mode: 1, chain: 2, now: nowBN() },
      }),
    ],
    [],
    "initAddressList",
  );
});

test("update_address_list_entry adds and removes a single entry", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.addressLists.updateAddressListEntry(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          addressList,
        },
        args: { address: ADDR_A, add: true, now: nowBN() },
      }),
    ],
    [],
    "updateAddressListEntry(add)",
  );
  let list = await accounts.fetchAddressListAccount(client, addressList);
  assert.equal(list.entryCount, 1);
  assert.ok(list.addresses.includes(ADDR_A));

  await sendAndConfirm(
    [
      await instructions.addressLists.updateAddressListEntry(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          addressList,
        },
        args: { address: ADDR_A, add: false, now: nowBN() },
      }),
    ],
    [],
    "updateAddressListEntry(remove)",
  );
  list = await accounts.fetchAddressListAccount(client, addressList);
  assert.equal(list.entryCount, 0);

  // removing an absent entry reverts
  const ix = await instructions.addressLists.updateAddressListEntry(client, {
    accounts: {
      operator: t.owner,
      treasury: t.treasury,
      operatorRole: null,
      addressList,
    },
    args: { address: ADDR_A, add: false, now: nowBN() },
  });
  await expectSendToFail([ix], "remove absent entry");
});

test("manage_address_list bulk-replaces then clear empties it", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.addressLists.manageAddressList(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          addressList,
        },
        args: { mode: 1, chain: 2, addresses: [ADDR_A, ADDR_B], now: nowBN() },
      }),
    ],
    [],
    "manageAddressList",
  );
  let list = await accounts.fetchAddressListAccount(client, addressList);
  assert.equal(list.entryCount, 2);

  await sendAndConfirm(
    [
      await instructions.addressLists.clearAddressList(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          addressList,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "clearAddressList",
  );
  list = await accounts.fetchAddressListAccount(client, addressList);
  assert.equal(list.entryCount, 0);
});

test("close_address_list closes the account", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.addressLists.closeAddressList(client, {
        accounts: { owner: t.owner, treasury: t.treasury, addressList },
      }),
    ],
    [],
    "closeAddressList",
  );
  assert.equal(
    await accounts.fetchAddressListAccountNullable(client, addressList),
    null,
    "closed address list should be gone",
  );
});
