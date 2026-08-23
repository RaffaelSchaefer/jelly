import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Gamepad2,
  MapPin,
  Pencil,
  UserRound,
  XCircle,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  countBy,
  avatarUrl,
  discordEventUrl,
  discordThreadUrl,
  displayError,
  eventBanner,
  pb,
} from "./api";
import { useAuth } from "./auth";
import {
  DiscordLink,
  EmptyState,
  EventCard,
  GameCombobox,
  inputClass,
  JoinButton,
  LoadingCards,
  LobbyCard,
  PageHeading,
  ParticipantAvatars,
  buttonClass,
} from "./components";
import { keys, useAttendees, useEvents, useLobbies, useParticipants } from "./queries";
import { useToast } from "./toast";
import type { EventRecord, EventType, GameSuggestion, LobbyRecord } from "./types";
import { errorsOf, eventFormSchema, lobbyFormSchema, type FormErrors } from "./validation";

const eventTypeLabels: Record<EventType, string> = {
  announcement: "Ankündigung",
  food: "Food",
  giveaway: "Giveaway",
  tournament: "Turnier",
  workshop: "Workshop",
  game: "Game Night",
  other: "Sonstiges",
};

const plainText = (html: string) => {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.textContent?.trim() || "Keine Beschreibung hinterlegt.";
};

const localInput = (iso: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const upcoming = (event: EventRecord) =>
  !event.isCanceled && Date.parse(event.startsAt) >= Date.now();

export function DiscoverPage() {
  const events = useEvents();
  const lobbies = useLobbies();
  const attendees = useAttendees();
  const participants = useParticipants();
  const [filter, setFilter] = useState("Alle");
  const eventCounts = countBy(attendees.data ?? [], "event");
  const lobbyCounts = countBy(participants.data ?? [], "lobby");
  const now = new Date();
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const visibleEvents = (events.data ?? [])
    .filter(upcoming)
    .filter((event) => filter !== "Heute" || new Date(event.startsAt) <= dayEnd)
    .filter((event) => filter !== "Diese Woche" || new Date(event.startsAt) <= weekEnd)
    .slice(0, 4);
  const visibleLobbies = (lobbies.data ?? []).filter((lobby) => !lobby.isClosed).slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-card px-7 py-12 shadow-2xl shadow-black/20 md:px-12 md:py-16">
        <div className="absolute -right-24 -top-36 size-96 rounded-full bg-blurple/25 blur-3xl" />
        <div className="absolute bottom-0 right-24 size-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <h1 className="text-4xl font-black leading-[1.05] tracking-[-.04em] text-white sm:text-6xl">
            Finde deine <span className="text-gradient">Squad.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">
            Entdecke Community-Events, finde Mitspieler und spring direkt ins nächste gemeinsame
            Abenteuer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className={`${buttonClass} px-5 py-3`} to="/events">
              Events entdecken
            </Link>
            <Link
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white"
              to="/lobbies"
            >
              Offene Lobbys
            </Link>
          </div>
        </div>
      </section>
      <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {["Alle", "Events", "Lobbys", "Heute", "Diese Woche"].map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${filter === item ? "bg-white text-chrome" : "border border-white/8 bg-card text-muted hover:text-white"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {filter !== "Lobbys" && (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-blurple-light">
                  Demnächst
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-white">Community Events</h2>
              </div>
              <Link className="text-sm font-bold text-muted hover:text-white" to="/events">
                Alle ansehen
              </Link>
            </div>
            {events.isLoading ? (
              <LoadingCards />
            ) : visibleEvents.length ? (
              <div className="grid gap-4">
                {visibleEvents.map((event) => (
                  <EventCard key={event.id} event={event} count={eventCounts.get(event.id)} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Noch keine Events geplant"
                text="Sobald die Community etwas plant, erscheint es hier live."
                action={{ to: "/events/new", label: "Event erstellen" }}
              />
            )}
          </section>
        )}
        {filter !== "Events" && (
          <aside className="rounded-2xl border border-white/6 bg-card p-5 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="mt-1 text-xl font-extrabold text-white">Offene Lobbys</h2>
              </div>
              <span className="relative flex size-3">
                <span className="relative inline-flex size-3 rounded-full bg-success" />
              </span>
            </div>
            {lobbies.isLoading ? (
              <div className="mt-5">
                <LoadingCards />
              </div>
            ) : visibleLobbies.length ? (
              <div className="mt-5 space-y-3">
                {visibleLobbies.map((lobby) => (
                  <LobbyCard
                    key={lobby.id}
                    lobby={lobby}
                    count={lobbyCounts.get(lobby.id)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState title="Gerade ist es ruhig" text="Starte die erste offene Lobby." />
              </div>
            )}
            <Link
              className="mt-4 block w-full rounded-xl border border-dashed border-white/15 py-3 text-center text-sm font-bold text-muted transition hover:border-blurple hover:text-white"
              to="/lobbies/neu"
            >
              + Eigene Lobby starten
            </Link>
          </aside>
        )}
      </div>
    </>
  );
}

export function EventsPage() {
  const events = useEvents();
  const attendees = useAttendees();
  const counts = countBy(attendees.data ?? [], "event");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "past" ? "past" : "upcoming";
  const q = (params.get("q") ?? "").toLowerCase();
  const visible = (events.data ?? [])
    .filter((event) => (tab === "upcoming" ? upcoming(event) : !upcoming(event)))
    .filter(
      (event) => !q || `${event.title} ${event.game} ${event.location}`.toLowerCase().includes(q),
    );
  return (
    <>
      <PageHeading
        eyebrow="Kalender"
        title="Events"
        text="Gemeinsame Abende, Turniere und Workshops – alles an einem Ort."
        action={{ to: "/events/new", label: "Event erstellen" }}
      />
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setParams({ ...(q ? { q } : {}), tab: "upcoming" })}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "upcoming" ? "bg-white text-chrome" : "bg-card text-muted"}`}
        >
          Bevorstehend
        </button>
        <button
          onClick={() => setParams({ ...(q ? { q } : {}), tab: "past" })}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "past" ? "bg-white text-chrome" : "bg-card text-muted"}`}
        >
          Vergangen
        </button>
      </div>
      {events.isLoading ? (
        <LoadingCards />
      ) : visible.length ? (
        <div className="grid gap-4">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} count={counts.get(event.id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays />}
          title="Keine passenden Events"
          text="Ändere die Suche oder plane direkt das nächste Community-Event."
          action={{ to: "/events/new", label: "Event erstellen" }}
        />
      )}
    </>
  );
}

export function EventDetailPage() {
  const { id = "" } = useParams();
  const events = useEvents();
  const attendees = useAttendees();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const event = events.data?.find((item) => item.id === id);
  if (events.isLoading) return <LoadingCards />;
  if (!event) return <Navigate to="/404" replace />;
  const ids = (attendees.data ?? [])
    .filter((item) => item.event === id)
    .map((item) => item.discordUserId);
  const full = event.playersWanted > 0 && ids.length >= event.playersWanted;
  const creator = user?.id === event.createdBy;
  const cover =
    eventBanner(event) || event.expand?.gameRef?.headerUrl || event.expand?.gameRef?.capsuleUrl;
  async function cancel() {
    if (!window.confirm(`„${event!.title}“ wirklich absagen?`)) return;
    try {
      await pb.collection("events").update(id, { isCanceled: true });
      await queryClient.invalidateQueries({ queryKey: keys.events });
      toast("Event abgesagt.");
    } catch (error) {
      toast(displayError(error), "error");
    }
  }
  return (
    <>
      <Link
        to="/events"
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-white"
      >
        <ArrowLeft size={17} /> Zurück zu Events
      </Link>
      <article className="overflow-hidden rounded-3xl border border-white/7 bg-card">
        <div className="relative min-h-64 bg-chrome md:min-h-80">
          {cover ? (
            <img src={cover} className="absolute inset-0 size-full object-cover" alt="" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-blurple/35 to-cyan-400/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-7 md:p-10">
            <span className="rounded-full bg-blurple px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
              {event.game || eventTypeLabels[event.type]}
            </span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black text-white md:text-5xl">
              {event.title}
            </h1>
          </div>
        </div>
        <div className="grid gap-8 p-7 md:grid-cols-[1fr_300px] md:p-10">
          <div>
            <div className="flex flex-wrap gap-4 text-sm text-muted">
              <span className="flex items-center gap-2">
                <CalendarDays size={17} />{" "}
                {new Date(event.startsAt).toLocaleDateString("de-DE", { dateStyle: "full" })}
              </span>
              <span className="flex items-center gap-2">
                <Clock3 size={17} />{" "}
                {new Date(event.startsAt).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="flex items-center gap-2">
                <MapPin size={17} /> {event.location || "Discord"}
              </span>
            </div>
            <p className="mt-7 whitespace-pre-line leading-7 text-copy">
              {plainText(event.description)}
            </p>
            {event.gameUrl && (
              <a
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blurple-light"
                href={event.gameUrl}
                target="_blank"
                rel="noreferrer"
              >
                Spiel öffnen
              </a>
            )}
            <div className="mt-8 flex flex-wrap gap-4">
              <DiscordLink href={discordEventUrl(event.discordGuildEventId)}>
                Discord-Event
              </DiscordLink>
              <DiscordLink href={discordThreadUrl(event.discordThreadId)}>
                Discord-Thread
              </DiscordLink>
            </div>
          </div>
          <aside className="rounded-2xl bg-chrome/60 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Teilnehmende</p>
            <p className="mt-1 text-3xl font-black text-white">
              {ids.length}
              {event.playersWanted ? (
                <small className="text-base text-muted"> / {event.playersWanted}</small>
              ) : null}
            </p>
            <div className="mt-4">
              <ParticipantAvatars ids={ids} />
            </div>
            <div className="mt-6">
              <JoinButton kind="event" id={id} disabled={event.isCanceled || full} />
            </div>
            {creator && (
              <div className="mt-4 grid gap-2">
                <button
                  onClick={() => navigate(`/events/${id}/bearbeiten`)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white/6 px-4 py-2.5 text-sm font-bold text-white"
                >
                  <Pencil size={16} /> Bearbeiten
                </button>
                <button
                  onClick={() => void cancel()}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/10"
                >
                  <XCircle size={16} /> Absagen
                </button>
              </div>
            )}
          </aside>
        </div>
      </article>
    </>
  );
}

interface EventFormState {
  title: string;
  description: string;
  type: EventType;
  startsAt: string;
  endsAt: string;
  location: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
}

export function EventFormPage() {
  const { id } = useParams();
  const { user, openLogin } = useAuth();
  const events = useEvents();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const existing = events.data?.find((item) => item.id === id);
  const [form, setForm] = useState<EventFormState>({
    title: "",
    description: "",
    type: "game",
    startsAt: "",
    endsAt: "",
    location: "",
    game: "",
    gameUrl: "",
    playersWanted: 4,
  });
  const [selectedGame, setSelectedGame] = useState<GameSuggestion | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [banner, setBanner] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!existing) return;
    setForm({
      title: existing.title,
      description: plainText(existing.description),
      type: existing.type,
      startsAt: localInput(existing.startsAt),
      endsAt: localInput(existing.endsAt),
      location: existing.location,
      game: existing.game,
      gameUrl: existing.gameUrl,
      playersWanted: existing.playersWanted,
    });
    setSelectedGame(existing.expand?.gameRef ? { ...existing.expand.gameRef } : null);
  }, [existing]);
  if (!user)
    return <AuthRequired title="Melde dich an, um ein Event zu planen." onLogin={openLogin} />;
  if (id && events.isLoading) return <LoadingCards />;
  if (id && !existing) return <Navigate to="/404" replace />;
  if (existing && existing.createdBy !== user.id)
    return <Navigate to={`/events/${existing.id}`} replace />;
  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = eventFormSchema.safeParse(form);
    if (!result.success) return setErrors(errorsOf(result.error));
    if (
      banner &&
      (banner.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(banner.type))
    )
      return setErrors({ banner: "Banner bitte als PNG, JPEG oder WebP bis 5 MiB hochladen." });
    setBusy(true);
    setErrors({});
    const body = new FormData();
    body.set("title", form.title.trim());
    body.set("description", form.description.trim());
    body.set("type", form.type);
    body.set("startsAt", new Date(form.startsAt).toISOString());
    body.set("endsAt", form.endsAt ? new Date(form.endsAt).toISOString() : "");
    body.set("location", form.location.trim());
    body.set("game", form.type === "game" ? form.game.trim() : "");
    body.set("gameUrl", form.type === "game" ? form.gameUrl.trim() : "");
    body.set(
      "playersWanted",
      form.type === "game" && form.playersWanted ? String(form.playersWanted) : "",
    );
    body.set("gameRef", form.type === "game" && selectedGame ? selectedGame.id : "");
    if (banner) body.set("banner", banner);
    try {
      const saved = id
        ? await pb.collection("events").update(id, body)
        : await pb.collection("events").create(body);
      await queryClient.invalidateQueries({ queryKey: keys.events });
      toast(id ? "Event aktualisiert." : "Event erstellt. Discord wird gleich synchronisiert.");
      navigate(`/events/${saved.id}`);
    } catch (error) {
      toast(displayError(error), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={id ? "Bearbeiten" : "Neues Event"}
        title={id ? existing!.title : "Plane etwas Großes"}
        text="Alle Zeiten werden in deiner lokalen Zeitzone angezeigt."
      />
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-6 rounded-3xl border border-white/7 bg-card p-6 md:grid-cols-2 md:p-8"
      >
        <Field label="Titel" error={errors.title}>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Typ">
          <select
            className={inputClass}
            value={form.type}
            onChange={(e) => set("type", e.target.value as EventType)}
          >
            {Object.entries(eventTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start" error={errors.startsAt}>
          <input
            className={inputClass}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
          />
        </Field>
        <Field label="Ende (optional)" error={errors.endsAt}>
          <input
            className={inputClass}
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </Field>
        <Field label="Ort">
          <input
            className={inputClass}
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Discord, Voice-Channel oder Adresse"
          />
        </Field>
        <Field label="Banner (optional)" error={errors.banner}>
          <input
            className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-1 file:text-white`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setBanner(e.target.files?.[0] ?? null)}
          />
        </Field>
        {form.type === "game" && (
          <>
            <Field label="Spiel" error={errors.game}>
              <GameCombobox
                value={form.game}
                selected={selectedGame}
                onChange={(value) => {
                  set("game", value);
                  if (value !== selectedGame?.name) setSelectedGame(null);
                }}
                onSelect={(game) => {
                  setSelectedGame(game);
                  set("game", game.name);
                  set(
                    "gameUrl",
                    game.steamAppId ? `https://store.steampowered.com/app/${game.steamAppId}/` : "",
                  );
                }}
              />
            </Field>
            <Field label="Spiel-Link" error={errors.gameUrl}>
              <input
                className={inputClass}
                value={form.gameUrl}
                onChange={(e) => set("gameUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Gesuchte Plätze">
              <input
                className={inputClass}
                type="number"
                min="1"
                max="99"
                value={form.playersWanted || ""}
                onChange={(e) => set("playersWanted", Number(e.target.value))}
              />
            </Field>
          </>
        )}
        <Field label="Beschreibung" className="md:col-span-2">
          <textarea
            className={`${inputClass} min-h-36 resize-y`}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="flex gap-3 md:col-span-2">
          <button className={buttonClass} disabled={busy}>
            {busy ? "Wird gespeichert …" : id ? "Änderungen speichern" : "Event erstellen"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-bold text-white"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </>
  );
}

export function LobbiesPage() {
  const lobbies = useLobbies();
  const participants = useParticipants();
  const counts = countBy(participants.data ?? [], "lobby");
  const open = (lobbies.data ?? []).filter((lobby) => !lobby.isClosed);
  return (
    <>
      <PageHeading
        eyebrow="Mitspielen"
        title="Offene Lobbys"
        text="Spontane Runden und geplante Sessions aus der Community."
        action={{ to: "/lobbies/neu", label: "Lobby starten" }}
      />
      {lobbies.isLoading ? (
        <LoadingCards />
      ) : open.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((lobby) => (
            <LobbyCard key={lobby.id} lobby={lobby} count={counts.get(lobby.id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Keine offene Lobby"
          text="Das ist deine Chance, die erste Runde zu starten."
          action={{ to: "/lobbies/neu", label: "Lobby starten" }}
        />
      )}
    </>
  );
}

export function LobbyDetailPage() {
  const { id = "" } = useParams();
  const lobbies = useLobbies();
  const participants = useParticipants();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const lobby = lobbies.data?.find((item) => item.id === id);
  if (lobbies.isLoading) return <LoadingCards />;
  if (!lobby) return <Navigate to="/404" replace />;
  const ids = (participants.data ?? [])
    .filter((item) => item.lobby === id)
    .map((item) => item.discordUserId);
  const full = lobby.playersWanted > 0 && ids.length >= lobby.playersWanted;
  const cover = lobby.expand?.gameRef?.headerUrl || lobby.expand?.gameRef?.capsuleUrl;
  const creator = user?.id === lobby.createdBy;
  async function close() {
    if (!window.confirm(`Lobby „${lobby!.game}“ schließen?`)) return;
    try {
      await pb.collection("lobbies").update(id, { isClosed: true });
      await queryClient.invalidateQueries({ queryKey: keys.lobbies });
      toast("Lobby geschlossen.");
    } catch (error) {
      toast(displayError(error), "error");
    }
  }
  return (
    <>
      <Link
        to="/lobbies"
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-white"
      >
        <ArrowLeft size={17} /> Zurück zu Lobbys
      </Link>
      <article className="overflow-hidden rounded-3xl border border-white/7 bg-card">
        <div className="relative h-64 bg-chrome">
          {cover ? (
            <img className="size-full object-cover" src={cover} alt="" />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-blurple/30 to-emerald-400/5">
              <Gamepad2 size={64} className="text-blurple-light" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          <h1 className="absolute bottom-7 left-7 text-3xl font-black text-white sm:text-5xl">
            {lobby.game}
          </h1>
        </div>
        <div className="grid gap-8 p-7 md:grid-cols-[1fr_300px]">
          <div className="grid content-start gap-4">
            <Info
              icon={<Clock3 />}
              label="Start"
              value={
                lobby.startsAt
                  ? new Date(lobby.startsAt).toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Jetzt"
              }
            />
            <Info icon={<MapPin />} label="Treffpunkt" value={lobby.location || "Discord"} />
            <Info
              icon={<UserRound />}
              label="Erstellt von"
              value={
                lobby.expand?.createdBy?.nickname || `Discord #${lobby.discordCreatorId.slice(-4)}`
              }
            />
            {lobby.gameUrl && (
              <a
                href={lobby.gameUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-bold text-blurple-light"
              >
                Spiel öffnen
              </a>
            )}
            <DiscordLink href={discordThreadUrl(lobby.discordThreadId)}>
              Zum Discord-Thread
            </DiscordLink>
          </div>
          <aside className="rounded-2xl bg-chrome/60 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Lobby</p>
            <p className="mt-1 text-3xl font-black text-white">
              {ids.length}
              <small className="text-base text-muted"> / {lobby.playersWanted || "∞"}</small>
            </p>
            <div className="mt-4">
              <ParticipantAvatars ids={ids} />
            </div>
            <div className="mt-6">
              <JoinButton
                kind="lobby"
                id={id}
                label="Lobby beitreten"
                disabled={lobby.isClosed || full}
              />
            </div>
            {creator && !lobby.isClosed && (
              <button
                onClick={() => void close()}
                className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/10"
              >
                Lobby schließen
              </button>
            )}
          </aside>
        </div>
      </article>
    </>
  );
}

export function LobbyFormPage() {
  const { user, openLogin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    game: "",
    gameUrl: "",
    playersWanted: 4,
    startsAt: "",
    location: "",
  });
  const [selectedGame, setSelectedGame] = useState<GameSuggestion | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  if (!user)
    return <AuthRequired title="Melde dich an, um eine Lobby zu starten." onLogin={openLogin} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = lobbyFormSchema.safeParse(form);
    if (!result.success) return setErrors(errorsOf(result.error));
    setBusy(true);
    setErrors({});
    try {
      const saved = await pb.collection("lobbies").create({
        game: form.game.trim(),
        gameRef: selectedGame?.id || "",
        gameUrl: form.gameUrl.trim(),
        playersWanted: form.playersWanted,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
        location: form.location.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: keys.lobbies });
      toast("Lobby erstellt. Der Discord-Post folgt automatisch.");
      navigate(`/lobbies/${saved.id}`);
    } catch (error) {
      toast(displayError(error), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Neue Lobby"
        title="Wer spielt mit?"
        text="Eine Lobby ist in einer Minute online – der Bot kümmert sich um Discord."
      />
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-6 rounded-3xl border border-white/7 bg-card p-6 md:grid-cols-2 md:p-8"
      >
        <Field label="Spiel" error={errors.game}>
          <GameCombobox
            value={form.game}
            selected={selectedGame}
            onChange={(value) => {
              setForm((old) => ({ ...old, game: value }));
              if (value !== selectedGame?.name) setSelectedGame(null);
            }}
            onSelect={(game) => {
              setSelectedGame(game);
              setForm((old) => ({
                ...old,
                game: game.name,
                gameUrl: game.steamAppId
                  ? `https://store.steampowered.com/app/${game.steamAppId}/`
                  : "",
              }));
            }}
          />
        </Field>
        <Field label="Gesuchte Plätze" error={errors.playersWanted}>
          <input
            className={inputClass}
            type="number"
            min="1"
            max="99"
            value={form.playersWanted}
            onChange={(e) => setForm((old) => ({ ...old, playersWanted: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Start (optional)">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((old) => ({ ...old, startsAt: e.target.value }))}
          />
        </Field>
        <Field label="Ort (optional)">
          <input
            className={inputClass}
            value={form.location}
            onChange={(e) => setForm((old) => ({ ...old, location: e.target.value }))}
            placeholder="Voice-Channel oder Treffpunkt"
          />
        </Field>
        <Field label="Spiel-Link (optional)" error={errors.gameUrl} className="md:col-span-2">
          <input
            className={inputClass}
            value={form.gameUrl}
            onChange={(e) => setForm((old) => ({ ...old, gameUrl: e.target.value }))}
            placeholder="https://…"
          />
        </Field>
        <div className="flex gap-3 md:col-span-2">
          <button className={buttonClass} disabled={busy}>
            {busy ? "Wird erstellt …" : "Lobby starten"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-bold text-white"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </>
  );
}

export function ProfilePage() {
  const { user, openLogin } = useAuth();
  const events = useEvents();
  const lobbies = useLobbies();
  const attendees = useAttendees();
  const participants = useParticipants();
  const toast = useToast();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  if (!user) return <AuthRequired title="Dein Profil wartet auf dich." onLogin={openLogin} />;
  const createdEvents = (events.data ?? []).filter((event) => event.createdBy === user.id);
  const createdLobbies = (lobbies.data ?? []).filter((lobby) => lobby.createdBy === user.id);
  const joinedEventIds = new Set(
    (attendees.data ?? [])
      .filter((item) => item.discordUserId === user.discordId)
      .map((item) => item.event),
  );
  const joinedLobbyIds = new Set(
    (participants.data ?? [])
      .filter((item) => item.discordUserId === user.discordId)
      .map((item) => item.lobby),
  );
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    try {
      await pb.collection("users").update(user!.id, { nickname: nickname.trim() });
      toast("Profil gespeichert.");
    } catch (error) {
      toast(displayError(error), "error");
    }
  }
  return (
    <>
      <PageHeading eyebrow="Dein Bereich" title="Profil" />
      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="h-fit rounded-3xl border border-white/7 bg-card p-6 text-center">
          <img
            src={avatarUrl(user.discordId, user.discordAvatar)}
            className="mx-auto size-24 rounded-full ring-4 ring-blurple/20"
            alt="Discord-Avatar"
          />
          <h2 className="mt-4 text-xl font-black text-white">
            {user.nickname || user.discordUsername}
          </h2>
          <p className="mt-1 text-sm text-muted">@{user.discordUsername}</p>
          <form onSubmit={(event) => void saveProfile(event)} className="mt-6 text-left">
            <label className="text-xs font-bold uppercase tracking-wider text-muted">
              Nickname
              <input
                className={`${inputClass} mt-2`}
                value={nickname}
                minLength={2}
                maxLength={32}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
            <button className={`${buttonClass} mt-3 w-full`}>Speichern</button>
          </form>
        </div>
        <div className="space-y-8">
          <ProfileGroup title="Von dir erstellt" events={createdEvents} lobbies={createdLobbies} />
          <ProfileGroup
            title="Du bist dabei"
            events={(events.data ?? []).filter((event) => joinedEventIds.has(event.id))}
            lobbies={(lobbies.data ?? []).filter((lobby) => joinedLobbyIds.has(lobby.id))}
          />
        </div>
      </section>
    </>
  );
}

function ProfileGroup({
  title,
  events,
  lobbies,
}: {
  title: string;
  events: EventRecord[];
  lobbies: LobbyRecord[];
}) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-black text-white">{title}</h2>
      {events.length || lobbies.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((event) => (
            <Link
              key={event.id}
              className="rounded-xl bg-card p-4 font-bold text-white hover:bg-card-hover"
              to={`/events/${event.id}`}
            >
              <CalendarDays className="mb-3 text-blurple-light" size={20} />
              {event.title}
            </Link>
          ))}
          {lobbies.map((lobby) => (
            <Link
              key={lobby.id}
              className="rounded-xl bg-card p-4 font-bold text-white hover:bg-card-hover"
              to={`/lobbies/${lobby.id}`}
            >
              <Gamepad2 className="mb-3 text-success" size={20} />
              {lobby.game}
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-muted">
          Hier ist noch nichts – das lässt sich schnell ändern.
        </p>
      )}
    </section>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState
      title="Diese Seite ist wohl schon in der nächsten Lobby"
      text="Der Link ist ungültig oder der Eintrag wurde entfernt."
      action={{ to: "/", label: "Zur Startseite" }}
    />
  );
}

function AuthRequired({ title, onLogin }: { title: string; onLogin: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-white/7 bg-card p-10 text-center">
      <UserRound className="mx-auto text-blurple-light" size={44} />
      <h1 className="mt-5 text-2xl font-black text-white">{title}</h1>
      <p className="mt-2 text-muted">
        Discord verbindet dein Community-Profil sicher mit deinen Aktionen.
      </p>
      <button onClick={onLogin} className={`${buttonClass} mt-6`}>
        Mit Discord anmelden
      </button>
    </div>
  );
}
function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm font-bold text-copy ${className}`}>
      {label}
      <div className="mt-2">{children}</div>
      {error && <small className="mt-1.5 block text-red-300">{error}</small>}
    </label>
  );
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-white/5 text-blurple-light">
        {icon}
      </span>
      <span>
        <small className="block text-xs font-bold uppercase tracking-wider text-muted">
          {label}
        </small>
        <b className="text-white">{value}</b>
      </span>
    </div>
  );
}
