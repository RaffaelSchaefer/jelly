/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findRecordsByFilter("users", "discordId = ''", "", 0, 0)
    for (const user of users) {
      const externalAuths = app.findAllExternalAuthsByRecord(user)
      for (const auth of externalAuths) {
        const provider = auth.getString ? auth.getString("provider") : auth.get("provider")
        const providerId = auth.getString ? auth.getString("providerId") : auth.get("providerId")
        if (provider === "discord" && providerId) {
          user.set("discordId", providerId)
          app.save(user)
          break
        }
      }
    }
  },
  (app) => {},
)
