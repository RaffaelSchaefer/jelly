import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { displayError, listEvents, listLobbies, listMemberships, listUsers, pb } from "./api";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { MembershipRecord, UserRecord } from "./types";

export const keys = {
  events: ["events"] as const,
  attendees: ["event_attendees"] as const,
  lobbies: ["lobbies"] as const,
  participants: ["lobby_participants"] as const,
  users: ["users"] as const,
};

export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: listEvents });
export const useLobbies = () => useQuery({ queryKey: keys.lobbies, queryFn: listLobbies });
export const useAttendees = () =>
  useQuery({ queryKey: keys.attendees, queryFn: () => listMemberships("event_attendees") });
export const useParticipants = () =>
  useQuery({ queryKey: keys.participants, queryFn: () => listMemberships("lobby_participants") });
// Nachschlagewerk fuer Teilnehmerlisten: Discord-ID -> Profil
export const useUsers = () =>
  useQuery({
    queryKey: keys.users,
    queryFn: listUsers,
    select: (users: UserRecord[]) => new Map(users.map((user) => [user.discordId, user])),
  });

export function optimisticMemberships(
  records: MembershipRecord[],
  parentId: string,
  discordUserId: string,
  join: boolean,
): MembershipRecord[] {
  const matches = (record: MembershipRecord) =>
    record.lobby === parentId && record.discordUserId === discordUserId;
  if (!join) return records.filter((record) => !matches(record));
  if (records.some(matches)) return records;
  return [...records, { id: `optimistic-lobby-${parentId}`, lobby: parentId, discordUserId }];
}

// Teilnahme an Events wird ausschließlich über Discord verwaltet — Join/Leave
// gibt es im Web nur für Lobbys.
export function useMembership(parentId: string) {
  const queryKey = keys.participants;
  const participants = useParticipants();
  const queryClient = useQueryClient();
  const { user, openLogin } = useAuth();
  const toast = useToast();
  const joined = Boolean(
    user?.discordId &&
    participants.data?.some(
      (record) => record.lobby === parentId && record.discordUserId === user.discordId,
    ),
  );
  const count = participants.data?.filter((record) => record.lobby === parentId).length ?? 0;

  const mutation = useMutation({
    mutationFn: async (join: boolean) => {
      if (!user?.discordId) throw new Error("Deinem Konto fehlt die Discord-Verknüpfung.");
      if (join) {
        await pb.collection("lobby_participants").create({ lobby: parentId, discordUserId: user.discordId });
        return;
      }
      try {
        const filter = pb.filter(`lobby = {:parentId} && discordUserId = {:discordUserId}`, {
          parentId,
          discordUserId: user.discordId,
        });
        const own = await pb.collection("lobby_participants").getFirstListItem(filter);
        await pb.collection("lobby_participants").delete(own.id);
      } catch (error) {
        if (typeof error === "object" && error && "status" in error && error.status === 404) return;
        throw error;
      }
    },
    onMutate: async (join) => {
      if (!user?.discordId) return;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MembershipRecord[]>(queryKey) ?? [];
      queryClient.setQueryData(
        queryKey,
        optimisticMemberships(previous, parentId, user.discordId, join),
      );
      return { previous };
    },
    onError: (error, _join, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast(displayError(error), "error");
    },
    onSuccess: (_data, join) => toast(join ? "Du bist dabei!" : "Du hast dich zurückgezogen."),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    count,
    joined,
    busy: mutation.isPending,
    toggle: () => {
      if (!user) return openLogin();
      mutation.mutate(!joined);
    },
  };
}

const realtimeKeys = {
  events: keys.events,
  event_attendees: keys.attendees,
  lobbies: keys.lobbies,
  lobby_participants: keys.participants,
  games: ["games"],
} as const;

export function RealtimeSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    for (const [collection, queryKey] of Object.entries(realtimeKeys)) {
      void pb.collection(collection).subscribe("*", () => {
        void queryClient.invalidateQueries({ queryKey });
      });
    }
    const refetch = () => {
      if (document.visibilityState === "visible") void queryClient.invalidateQueries();
    };
    document.addEventListener("visibilitychange", refetch);
    return () => {
      document.removeEventListener("visibilitychange", refetch);
      for (const collection of Object.keys(realtimeKeys))
        void pb.collection(collection).unsubscribe("*");
    };
  }, [queryClient]);
  return null;
}
