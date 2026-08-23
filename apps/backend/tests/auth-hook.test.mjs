import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

test("Discord OAuth initialisiert Profildaten bei der ersten Anmeldung", () => {
  let authHandler
  vm.runInNewContext(
    readFileSync(new URL("../pb_hooks/auth.pb.js", import.meta.url), "utf8"),
    {
      BadRequestError: Error,
      onBootstrap() {},
      onRecordAuthWithOAuth2Request(handler) {
        authHandler = handler
      },
    },
  )

  const event = {
    providerName: "discord",
    oauth2User: { id: "123456789", username: "Raff" },
    createData: null,
    isNewRecord: true,
    next() {},
  }
  authHandler(event)

  assert.equal(event.createData.nickname, "Raff")
  assert.equal(event.createData.discordUsername, "Raff")
  assert.equal(event.createData.discordId, "123456789")
})
