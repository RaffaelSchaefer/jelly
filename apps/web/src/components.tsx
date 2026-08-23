import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  ExternalLink,
  Gamepad2,
  LogOut,
  Menu,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { avatarUrl, eventBanner, searchGames } from "./api";
import { useAuth } from "./auth";
import { useMembership, useUsers } from "./queries";
import type { EventRecord, GameSuggestion, LobbyRecord } from "./types";

export const inputClass =
  "w-full rounded-xl border border-white/8 bg-chrome/70 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-muted focus:border-blurple";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blurple px-4 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#6874f7] disabled:pointer-events-none disabled:opacity-50";

export function AppShell() {
  const { user, logout, openLogin } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  return (
    <div className="min-h-screen bg-canvas text-copy">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-chrome/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-7 px-5 lg:px-8">
          <Link className="flex items-center gap-3 text-lg font-black tracking-tight" to="/">
            <span className="grid size-10 place-items-center rounded-xl bg-blurple text-white shadow-lg shadow-blurple/25">
              <Gamepad2 size={21} />
            </span>
            JOINT
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            {[
              ["/", "Entdecken"],
              ["/events", "Events"],
              ["/lobbies", "Lobbys"],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive ? "text-white" : "transition hover:text-white"
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <form
            className="ml-auto hidden w-64 items-center gap-2 rounded-xl border border-white/5 bg-canvas px-3 py-2.5 text-muted lg:flex"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/events?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-muted"
              placeholder="Events & Spiele suchen"
              aria-label="Events und Spiele suchen"
            />
          </form>
          {user ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="ml-auto flex items-center gap-2 rounded-xl border border-white/8 bg-card px-2.5 py-2 text-sm font-bold lg:ml-0">
                <img
                  className="size-7 rounded-full"
                  src={avatarUrl(user.discordId, user.discordAvatar)}
                  alt=""
                />
                <span className="hidden sm:inline">{user.nickname || user.discordUsername}</span>
                <ChevronDown size={14} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  className="z-50 mt-2 min-w-48 rounded-xl border border-white/10 bg-card p-1.5 text-sm shadow-2xl"
                >
                  <DropdownMenu.Item asChild>
                    <Link
                      to="/me"
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-white outline-none hover:bg-white/6"
                    >
                      <CircleUserRound size={17} /> Profil
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={logout}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-red-200 outline-none hover:bg-red-500/10"
                  >
                    <LogOut size={17} /> Abmelden
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <button onClick={openLogin} className={`${buttonClass} ml-auto lg:ml-0`}>
              Mit Discord anmelden
            </button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="rounded-lg p-2 text-muted md:hidden"
              aria-label="Navigation öffnen"
            >
              <Menu />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-44 rounded-xl border border-white/10 bg-card p-2 shadow-2xl"
              >
                {[
                  ["/", "Entdecken"],
                  ["/events", "Events"],
                  ["/lobbies", "Lobbys"],
                  ["/me", "Profil"],
                ].map(([to, label]) => (
                  <DropdownMenu.Item key={to} asChild>
                    <Link
                      className="block rounded-lg px-3 py-2 text-sm font-bold text-white hover:bg-white/5"
                      to={to}
                    >
                      {label}
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-9 lg:px-8 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

export function EventCard({ event, count = 0 }: { event: EventRecord; count?: number }) {
  const date = new Date(event.startsAt);
  const image =
    eventBanner(event) || event.expand?.gameRef?.headerUrl || event.expand?.gameRef?.capsuleUrl;
  return (
    <Link
      to={`/events/${event.id}`}
      className="group grid overflow-hidden rounded-2xl border border-white/6 bg-card transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-card-hover sm:grid-cols-[190px_1fr_auto]"
    >
      <div className="relative min-h-36 bg-chrome">
        {image ? (
          <img
            src={image}
            className="absolute inset-0 size-full object-cover"
            alt=""
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-blurple/25 to-cyan-400/5 text-blurple-light">
            <Gamepad2 size={42} />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-lg bg-chrome/90 px-2.5 py-1.5 text-center shadow-lg">
          <b className="block text-xl leading-none text-white">{date.getDate()}</b>
          <small className="text-[10px] font-black uppercase tracking-widest text-blurple-light">
            {date.toLocaleString("de-DE", { month: "short" })}
          </small>
        </span>
      </div>
      <div className="p-5">
        <span className="rounded-full bg-blurple/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blurple-light">
          {event.game || event.type}
        </span>
        <h3 className="mt-3 text-xl font-extrabold text-white">{event.title}</h3>
        <p className="mt-2 text-sm text-muted">
          {date.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
          {event.location || "Discord"}
        </p>
      </div>
      <div className="flex items-center gap-2 self-center px-5 pb-5 text-sm font-bold text-muted sm:pb-0">
        <Users size={16} /> {count} dabei{" "}
        <ArrowRight className="ml-1 text-white transition group-hover:translate-x-1" size={18} />
      </div>
    </Link>
  );
}

export function LobbyCard({
  lobby,
  count = 0,
  compact = false,
}: {
  lobby: LobbyRecord;
  count?: number;
  compact?: boolean;
}) {
  const wanted = lobby.playersWanted || Math.max(count, 1);
  const percent = Math.min(100, Math.round((count / wanted) * 100));
  const image = lobby.expand?.gameRef?.capsuleUrl || lobby.expand?.gameRef?.headerUrl;
  return (
    <Link
      to={`/lobbies/${lobby.id}`}
      className={`group block rounded-2xl border border-white/6 bg-card transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-card-hover ${compact ? "p-4" : "overflow-hidden"}`}
    >
      {!compact && (
        <div className="relative h-36 bg-chrome">
          {image ? (
            <img src={image} className="size-full object-cover" alt="" />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-blurple/20 to-emerald-400/5">
              <Gamepad2 className="text-blurple-light" size={40} />
            </div>
          )}
        </div>
      )}
      <div className={compact ? "" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-white">{lobby.game}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <CalendarDays size={13} />{" "}
              {lobby.startsAt
                ? new Date(lobby.startsAt).toLocaleString("de-DE", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Jetzt"}
            </p>
          </div>
          <span className="rounded-lg bg-white/5 px-2 py-1 text-xs font-black text-white">
            {count}/{lobby.playersWanted || "∞"}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/7">
          <div
            className={`h-full rounded-full ${percent >= 100 ? "bg-amber-400" : "bg-success"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

export function ParticipantAvatars({ ids }: { ids: string[] }) {
  const users = useUsers();
  if (!ids.length)
    return <p className="text-sm text-muted">Noch niemand – sei die erste Person.</p>;
  return (
    <div className="flex -space-x-2">
      {ids.slice(0, 8).map((id) => {
        const profile = users.data?.get(id);
        // Ohne Web-Login gibt es kein Profil – dann bleibt der Platzhalter.
        const label =
          profile?.nickname || profile?.discordUsername || `Discord-Mitglied #${id.slice(-4)}`;
        return (
          <Tooltip.Root key={id}>
            <Tooltip.Trigger asChild>
              <img
                className="size-9 rounded-full border-2 border-card"
                src={avatarUrl(id, profile?.discordAvatar)}
                alt={label}
              />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 rounded-lg bg-chrome px-2 py-1 text-xs text-white shadow-xl"
                sideOffset={5}
              >
                {label}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
      {ids.length > 8 && (
        <span className="grid size-9 place-items-center rounded-full border-2 border-card bg-chrome text-xs font-bold">
          +{ids.length - 8}
        </span>
      )}
    </div>
  );
}

export function JoinButton({
  id,
  disabled,
  label = "Teilnehmen",
}: {
  id: string;
  disabled?: boolean;
  label?: string;
}) {
  const membership = useMembership(id);
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span>
          <button
            disabled={disabled || membership.busy}
            onClick={membership.toggle}
            className={
              membership.joined
                ? "rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-extrabold text-white"
                : `${buttonClass} px-5 py-3`
            }
          >
            {membership.busy ? "Einen Moment …" : membership.joined ? "Zurückziehen" : label}
          </button>
        </span>
      </Tooltip.Trigger>
      {disabled && (
        <Tooltip.Portal>
          <Tooltip.Content className="z-50 max-w-64 rounded-lg bg-chrome px-3 py-2 text-xs text-white">
            Diese Runde ist geschlossen oder voll.
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}

export function EmptyState({
  icon = <Gamepad2 />,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-card/60 px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-blurple-light">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-extrabold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{text}</p>
      {action && (
        <Link className={`${buttonClass} mt-5`} to={action.to}>
          <Plus size={17} />
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function LoadingCards() {
  return (
    <div className="space-y-4" aria-label="Wird geladen">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-36 animate-pulse rounded-2xl bg-card" />
      ))}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-blurple-light">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
        {text && <p className="mt-2 max-w-2xl text-muted">{text}</p>}
      </div>
      {action && (
        <Link className={buttonClass} to={action.to}>
          <Plus size={17} />
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function GameCombobox({
  value,
  selected,
  onChange,
  onSelect,
}: {
  value: string;
  selected: GameSuggestion | null;
  onChange: (value: string) => void;
  onSelect: (game: GameSuggestion) => void;
}) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  const query = useQuery({
    queryKey: ["game-search", debounced],
    queryFn: () => searchGames(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 60_000,
  });
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} />
        <input
          className={`${inputClass} pl-10`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Spiel suchen oder frei eingeben"
          role="combobox"
          aria-expanded={open}
          aria-controls="game-options"
        />
      </div>
      {selected && <p className="mt-2 text-xs text-success">Ausgewählt: {selected.name}</p>}
      {open && value.trim().length >= 2 && (
        <div
          id="game-options"
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-chrome p-1.5 shadow-2xl"
        >
          {query.isLoading ? (
            <p className="p-3 text-sm text-muted">Steam wird durchsucht …</p>
          ) : query.data?.length ? (
            query.data.map((game) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === game.id}
                key={game.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(game);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/6"
              >
                <span className="h-11 w-24 overflow-hidden rounded-lg bg-card">
                  {game.capsuleUrl && (
                    <img className="size-full object-cover" src={game.capsuleUrl} alt="" />
                  )}
                </span>
                <span>
                  <b className="block text-sm text-white">{game.name}</b>
                  <small className="text-muted">Steam {game.steamAppId}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">Keine Treffer – Freitext bleibt möglich.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function DiscordLink({ href, children }: { href: string; children: ReactNode }) {
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm font-bold text-blurple-light hover:text-white"
    >
      {children}
      <ExternalLink size={15} />
    </a>
  ) : null;
}
