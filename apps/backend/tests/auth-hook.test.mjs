import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

// Laedt den Hook in einer Sandbox und liefert den OAuth2-Handler samt
// Aufzeichnung der $app.save()-Aufrufe zurueck.
function loadAuthHook() {
  let authHandler
  const saved = []
  vm.runInNewContext(
    readFileSync(new URL("../pb_hooks/auth.pb.js", import.meta.url), "utf8"),
    {
      BadRequestError: Error,
      Object,
      String,
      $app: {
        save(record) {
          saved.push(record)
        },
      },
      onBootstrap() {},
      onRecordAuthWithOAuth2Request(handler) {
        authHandler = handler
      },
    },
  )
  return { authHandler, saved }
}

// Minimaler Record-Stub mit getString/set wie in PocketBase.
function mockRecord(data) {
  return {
    data,
    getString(key) {
      return data[key] || ""
    },
    set(key, value) {
      data[key] = value
    },
  }
}

test("Discord OAuth initialisiert Profildaten bei der ersten Anmeldung", () => {
  const { authHandler } = loadAuthHook()

  const event = {
    providerName: "discord",
    oAuth2User: {
      id: "123456789",
      username: "raff",
      name: "Raffael",
      avatarURL: "https://cdn.discordapp.com/avatars/123456789/abc.png",
    },
    createData: null,
    isNewRecord: true,
    next() {},
  }
  authHandler(event)

  assert.equal(event.createData.nickname, "Raffael")
  assert.equal(event.createData.discordUsername, "raff")
  assert.equal(event.createData.discordId, "123456789")
  assert.equal(
    event.createData.discordAvatar,
    "https://cdn.discordapp.com/avatars/123456789/abc.png",
  )
})

test("Discord OAuth aktualisiert und speichert Profildaten bei bestehenden Benutzern", () => {
  const { authHandler, saved } = loadAuthHook()

  const record = mockRecord({ nickname: "", discordUsername: "", discordId: "", discordAvatar: "" })
  const event = {
    providerName: "discord",
    oAuth2User: {
      id: "987654321",
      username: "raffael",
      avatarURL: "https://cdn.discordapp.com/avatars/987654321/neu.png",
    },
    createData: null,
    isNewRecord: false,
    record,
    next() {},
  }
  authHandler(event)

  assert.equal(record.data.discordId, "987654321")
  assert.equal(record.data.discordUsername, "raffael")
  assert.equal(record.data.nickname, "raffael")
  assert.equal(record.data.discordAvatar, "https://cdn.discordapp.com/avatars/987654321/neu.png")
  assert.deepEqual(saved, [record])
})

test("Selbst gesetzter Nickname bleibt beim Login erhalten", () => {
  const { authHandler, saved } = loadAuthHook()

  const record = mockRecord({
    nickname: "Eigener Name",
    discordUsername: "raff",
    discordId: "123",
    discordAvatar: "https://cdn.discordapp.com/avatars/123/alt.png",
  })
  const event = {
    providerName: "discord",
    oAuth2User: {
      id: "123",
      username: "raff",
      name: "Raffael",
      avatarURL: "https://cdn.discordapp.com/avatars/123/neu.png",
    },
    createData: null,
    isNewRecord: false,
    record,
    next() {},
  }
  authHandler(event)

  assert.equal(record.data.nickname, "Eigener Name")
  assert.equal(record.data.discordAvatar, "https://cdn.discordapp.com/avatars/123/neu.png")
  assert.deepEqual(saved, [record])
})

test("Entfernter Discord-Avatar leert das gespeicherte Bild", () => {
  const { authHandler, saved } = loadAuthHook()

  const record = mockRecord({
    nickname: "Raff",
    discordUsername: "raff",
    discordId: "123",
    discordAvatar: "https://cdn.discordapp.com/avatars/123/alt.png",
  })
  const event = {
    providerName: "discord",
    oAuth2User: { id: "123", username: "raff" },
    createData: null,
    isNewRecord: false,
    record,
    next() {},
  }
  authHandler(event)

  assert.equal(record.data.discordAvatar, "")
  assert.deepEqual(saved, [record])
})

test("Ohne Aenderungen wird der Benutzer nicht gespeichert", () => {
  const { authHandler, saved } = loadAuthHook()

  const record = mockRecord({
    nickname: "Raff",
    discordUsername: "raff",
    discordId: "123",
    discordAvatar: "https://cdn.discordapp.com/avatars/123/alt.png",
  })
  const event = {
    providerName: "discord",
    oAuth2User: {
      id: "123",
      username: "raff",
      avatarURL: "https://cdn.discordapp.com/avatars/123/alt.png",
    },
    createData: null,
    isNewRecord: false,
    record,
    next() {},
  }
  authHandler(event)

  assert.deepEqual(saved, [])
})

test("Andere OAuth2-Provider werden abgewiesen", () => {
  const { authHandler } = loadAuthHook()

  assert.throws(
    () => authHandler({ providerName: "google", oAuth2User: {}, next() {} }),
    /Nur Discord-Login ist erlaubt\./,
  )
})
