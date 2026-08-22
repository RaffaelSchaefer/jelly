/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
  e.next()

  console.log("[joint] PocketBase ready - admin UI: http://127.0.0.1:8090/_/")
})

routerAdd("GET", "/api/joint/health", (e) => {
  return e.json(200, {
    service: "joint-backend",
    status: "ok",
  })
})
