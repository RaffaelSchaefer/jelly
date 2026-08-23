import assert from "node:assert/strict";
import test from "node:test";
import type { Client, GuildScheduledEventCreateOptions, GuildTextBasedChannel } from "discord.js";
import {
  command as eventCommand,
  downloadBanner,
  eventChoiceLabel,
  persistEventAfterGuildCreate,
  validateBannerUpload,
} from "./commands/event";
import { eventToEmbed } from "./embeds";
import { env } from "./env";
import { diffAttendeeIds, normalizeGameDestination, type JointEvent } from "./events";
import {
  closeGameThread,
  createGameThread,
  createGuildEvent,
  reconcileGameThreadMembers,
  shouldAutoStart,
  syncGameThreadMember,
} from "./guild-events";

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
  game: "",
  gameUrl: "",
  playersWanted: 0,
  discordThreadId: "",
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
    assert.equal(options?.image, image);
    assert.equal(options?.description, undefined);

    await createGuildEvent(client, {
      ...event,
      type: "game",
      game: "Counter-Strike 2",
      gameUrl: "https://store.steampowered.com/app/730/",
      playersWanted: 4,
      location: "",
    });
    assert.equal(options?.entityMetadata?.location, "Online · Counter-Strike 2");
    assert.match(options?.description ?? "", /4 Mitspieler/);
  } finally {
    env.guildId = previousGuildId;
  }
});

test("event embeds include a banner only when one is stored", () => {
  assert.equal(eventToEmbed(event).toJSON().image, undefined);
  assert.equal(
    eventToEmbed({ ...event, bannerUrl: "https://pb.test/banner.png" }).toJSON().image?.url,
    "https://pb.test/banner.png",
  );
});

test("game destinations normalize Steam IDs and accept safe web URLs", () => {
  assert.equal(normalizeGameDestination("730"), "https://store.steampowered.com/app/730/");
  assert.equal(
    normalizeGameDestination("https://store.steampowered.com/app/730/CounterStrike/?l=german"),
    "https://store.steampowered.com/app/730/",
  );
  assert.equal(
    normalizeGameDestination("https://example.test/play?room=joint"),
    "https://example.test/play?room=joint",
  );
  assert.throws(() => normalizeGameDestination("steam://run/730"), /HTTPS/);
  assert.throws(() => normalizeGameDestination("https://user:pass@example.test/play"), /Zugang/);
  assert.throws(
    () => normalizeGameDestination("https://store.steampowered.com/search/"),
    /App-Seite/,
  );
});

test("event autocomplete labels mark past and canceled events", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");

  const upcoming = eventChoiceLabel(event, now);
  assert.doesNotMatch(upcoming, /vorbei|abgesagt/);
  assert.match(upcoming, /\(\d{2}\.\d{2}\. · \d{2}:\d{2} Uhr\)$/);

  assert.match(eventChoiceLabel({ ...event, startsAt: "2026-08-01T18:00:00.000Z" }, now), /vorbei/);
  assert.match(eventChoiceLabel({ ...event, isCanceled: true }, now), /abgesagt/);
});

test("event autocomplete labels respect Discord's 100 character limit", () => {
  const label = eventChoiceLabel({ ...event, title: "L".repeat(120) });
  assert.equal(label.length, 100);
  assert.ok(label.endsWith("..."));
});

test("event create no longer offers the game type or game inputs", () => {
  const json = eventCommand.data.toJSON() as {
    options?: Array<{
      name: string;
      options?: Array<{ name: string; choices?: Array<{ value: string | number }> }>;
    }>;
  };
  const create = json.options?.find((option) => option.name === "create");
  const createOptions = create?.options ?? [];
  const type = createOptions?.find((option) => option.name === "typ");
  assert.ok(type?.choices?.length);
  assert.ok(type?.choices?.every((choice) => choice.value !== "game"));
  for (const removed of ["spiel", "ziel", "mitspieler"]) {
    assert.ok(!createOptions?.some((option) => option.name === removed));
  }
});

test("game embeds expose destination and player target without a hard-cap calculation", () => {
  const embed = eventToEmbed({
    ...event,
    type: "game",
    game: "Counter-Strike 2",
    gameUrl: "https://store.steampowered.com/app/730/",
    playersWanted: 4,
  }).toJSON();
  assert.match(embed.title ?? "", /🎮/);
  assert.match(embed.fields?.find((field) => field.name === "Spiel")?.value ?? "", /Steam/);
  assert.equal(embed.fields?.find((field) => field.name === "Mitspieler gesucht")?.value, "4");
  assert.equal(embed.fields?.find((field) => field.name === "Interessiert")?.value, "0");
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

test("Game thread creation adds the creator and cleans partial resources", async () => {
  const calls: string[] = [];
  const thread = {
    id: "333333333333333333",
    members: { add: async (id: string) => calls.push(`add:${id}`) },
    send: async () => calls.push("intro"),
    delete: async () => calls.push("delete thread"),
  };
  const message = {
    id: "222222222222222222",
    startThread: async () => thread,
    delete: async () => calls.push("delete message"),
  };
  const channel = {
    send: async () => message,
  } as unknown as GuildTextBasedChannel;
  const game = {
    ...event,
    type: "game" as const,
    game: "Counter-Strike 2",
    playersWanted: 4,
  };

  const resources = await createGameThread(channel, game);
  assert.equal(resources.thread.id, thread.id);
  assert.deepEqual(calls, ["add:creator", "intro"]);

  calls.length = 0;
  thread.members.add = async () => {
    throw new Error("member failed");
  };
  await assert.rejects(createGameThread(channel, game), /member failed/);
  assert.deepEqual(calls, ["delete thread", "delete message"]);
});

test("Interested users sync to Game threads and cancellation closes them", async () => {
  const calls: string[] = [];
  const thread = {
    archived: true,
    locked: false,
    isThread: () => true,
    setArchived: async (value: boolean) => {
      calls.push(`archived:${value}`);
      thread.archived = value;
    },
    setLocked: async (value: boolean) => {
      calls.push(`locked:${value}`);
      thread.locked = value;
    },
    members: {
      add: async (id: string) => calls.push(`add:${id}`),
      remove: async (id: string) => calls.push(`remove:${id}`),
      fetch: async () => new Map<string, unknown>(),
    },
  };
  const client = {
    channels: { fetch: async () => thread },
  } as unknown as Client;
  const game = {
    ...event,
    type: "game" as const,
    game: "Counter-Strike 2",
    discordThreadId: "333333333333333333",
  };

  await syncGameThreadMember(client, game, "player", true);
  await syncGameThreadMember(client, game, "player", false);
  await syncGameThreadMember(client, game, game.discordCreatorId, false);
  assert.deepEqual(calls, ["archived:false", "add:player", "remove:player", "add:creator"]);
  calls.length = 0;
  thread.members.fetch = async () =>
    new Map([
      ["bot", {}],
      ["creator", {}],
      ["stale", {}],
    ]);
  const reconcileClient = {
    user: { id: "bot" },
    channels: { fetch: async () => thread },
  } as unknown as Client;
  await reconcileGameThreadMembers(reconcileClient, game, ["player"]);
  assert.deepEqual(calls, ["add:player", "remove:stale"]);

  calls.length = 0;
  await closeGameThread(client, game);
  assert.deepEqual(calls, ["locked:true", "archived:true"]);
});
