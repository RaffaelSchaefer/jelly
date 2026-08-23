export interface UserRecord {
  id: string;
  nickname: string;
  discordUsername: string;
  discordId: string;
  discordAvatar: string;
  email?: string;
}

export interface GameRecord {
  id: string;
  name: string;
  steamAppId: string;
  headerUrl: string;
  capsuleUrl: string;
  shortDescription: string;
}

export type EventType =
  | "announcement"
  | "food"
  | "giveaway"
  | "tournament"
  | "workshop"
  | "game"
  | "other";

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  banner: string;
  type: EventType;
  location: string;
  startsAt: string;
  endsAt: string;
  pinned: boolean;
  isCanceled: boolean;
  createdBy: string;
  discordCreatorId: string;
  discordGuildEventId: string;
  discordThreadId: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
  gameRef: string;
  expand?: { gameRef?: GameRecord; createdBy?: UserRecord };
}

export interface LobbyRecord {
  id: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
  startsAt: string;
  location: string;
  discordCreatorId: string;
  discordMessageId: string;
  discordThreadId: string;
  isClosed: boolean;
  createdBy: string;
  gameRef: string;
  expand?: { gameRef?: GameRecord; createdBy?: UserRecord };
}

export interface MembershipRecord {
  id: string;
  discordUserId: string;
  event?: string;
  lobby?: string;
}

export interface GameSuggestion {
  id: string;
  name: string;
  steamAppId: string;
  headerUrl: string;
  capsuleUrl: string;
}
