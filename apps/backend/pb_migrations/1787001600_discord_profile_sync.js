/// <reference path="../pb_data/types.d.ts" />

// Discord-Profilsync:
// - discordAvatar speichert die fertige CDN-URL aus dem OAuth2-Profil
//   (siehe auth.pb.js), kein Datei-Upload noetig
// - users oeffentlich lesbar, damit Teilnehmerlisten Namen und Avatare
//   zeigen koennen (E-Mails bleiben durch emailVisibility=false verborgen)
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "discordAvatar", max: 255 }));
    users.listRule = "";
    users.viewRule = "";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("discordAvatar");
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    app.save(users);
  },
);
