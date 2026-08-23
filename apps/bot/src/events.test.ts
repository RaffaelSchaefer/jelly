import assert from "node:assert/strict";
import test from "node:test";
import type { Client, GuildScheduledEventCreateOptions } from "discord.js";
import {
  downloadBanner,
  persistEventAfterGuildCreate,
  validateBannerUpload,
} from "./commands/event";
import { eventToEmbed } from "./embeds";
import { env } from "./env";
import { diffAttendeeIds, type JointEvent } from "./events";
import { createGuildEvent, shouldAutoStart } from "./guild-events";

const event: JointEvent = {
  id: "event",
  title: "LAN",
  description: "",
  bannerUrl: "",
  type: "other",
  location: "123456789012345678",
  startsAt: "2026-08-23T18:00:00.000Z",
  endsAt: "2026-08-23T20:00:00.000Z",
  pinned: false,
  isCanceled: false,
  discordCreatorId: "creator",
  discordGuildEventId: "987654321098765432",
};

test("diffAttendeeIds adds and removes only changed Discord subscribers", () => {
  assert.deepEqual(diffAttendeeIds(["1", "2"], ["2", "3", "3"]), {
    add: ["3"],
    remove: ["1"],
  });
});

test("shouldAutoStart accepts only a live voice-event window", () => {
  assert.equal(shouldAutoStart(event, new Date("2026-08-23T19:00:00.000Z")), true);
  assert.equal(shouldAutoStart(event, new Date("2026-08-23T20:00:00.000Z")), false);
  assert.equal(
    shouldAutoStart({ ...event, location: "Messehalle" }, new Date("2026-08-23T19:00:00.000Z")),
    false,
  );
  assert.equal(
    shouldAutoStart({ ...event, isCanceled: true }, new Date("2026-08-23T19:00:00.000Z")),
    false,
  );
});

test("event banners accept only supported images up to 5 MiB", async (t) => {
  assert.equal(validateBannerUpload("image/png", 5 * 1024 * 1024), null);
  assert.match(validateBannerUpload("image/gif", 1) ?? "", /PNG/);
  assert.match(validateBannerUpload("image/webp", 5 * 1024 * 1024 + 1) ?? "", /5 MiB/);

  t.mock.method(globalThis, "fetch", async () => new Response(new Blob(["banner"])));
  const banner = await downloadBanner({
    contentType: "image/png",
    name: "banner.png",
    size: 6,
    url: "https://cdn.discord.test/banner.png",
  });
  assert.deepEqual(banner.buffer, Buffer.from(await banner.file.arrayBuffer()));
});

test("Discord receives the downloaded banner buffer unchanged", async () => {
  const previousGuildId = env.guildId;
  const image = Buffer.from("banner");
  let options: GuildScheduledEventCreateOptions | undefined;
  const client = {
    guilds: {
      fetch: async () => ({
        scheduledEvents: {
          create: async (value: GuildScheduledEventCreateOptions) => {
            options = value;
            return { id: "guild-event" };
          },
        },
      }),
    },
  } as unknown as Client;

  env.guildId = "guild";
  try {
    assert.equal(await createGuildEvent(client, event, image), "guild-event");
  } finally {
    env.guildId = previousGuildId;
  }
  assert.equal(options?.image, image);
  assert.equal(options?.description, undefined);
});

test("event embeds include a banner only when one is stored", () => {
  assert.equal(eventToEmbed(event).toJSON().image, undefined);
  assert.equal(
    eventToEmbed({ ...event, bannerUrl: "https://pb.test/banner.png" }).toJSON().image?.url,
    "https://pb.test/banner.png",
  );
});

test("event persistence requires Discord and rolls Discord back on failure", async () => {
  let persisted = false;
  const withoutDiscord = await persistEventAfterGuildCreate(
    null,
    async () => {
      persisted = true;
    },
    async () => true,
  );
  assert.equal(withoutDiscord, null);
  assert.equal(persisted, false);

  let rolledBack = "";
  await assert.rejects(
    persistEventAfterGuildCreate(
      "guild-event",
      async () => {
        throw new Error("PocketBase failed");
      },
      async (id) => {
        rolledBack = id;
        return true;
      },
    ),
    /PocketBase failed/,
  );
  assert.equal(rolledBack, "guild-event");
});
