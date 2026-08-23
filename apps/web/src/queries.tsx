import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { displayError, listEvents, listLobbies, listMemberships, pb } from "./api";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { MembershipRecord } from "./types";

export const keys = {
  events: ["events"] as const,
  attendees: ["event_attendees"] as const,
  lobbies: ["lobbies"] as const,
  participants: ["lobby_participants"] as const,
};

export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: listEvents });
export const useLobbies = () => useQuery({ queryKey: keys.lobbies, queryFn: listLobbies });
export const useAttendees = () =>
  useQuery({ queryKey: keys.attendees, queryFn: () => listMemberships("event_attendees") });
export const useParticipants = () =>
  useQuery({ queryKey: keys.participants, queryFn: () => listMemberships("lobby_participants") });

export function optimisticMemberships(
  records: MembershipRecord[],
  kind: "event" | "lobby",
  parentId: string,
  discordUserId: string,
  join: boolean,
): MembershipRecord[] {
  const matches = (record: MembershipRecord) =>
    record[kind] === parentId && record.discordUserId === discordUserId;
  if (!join) return records.filter((record) => !matches(record));
  if (records.some(matches)) return records;
  return [...records, { id: `optimistic-${kind}-${parentId}`, [kind]: parentId, discordUserId }];
}

export function useMembership(kind: "event" | "lobby", parentId: string) {
  const collection = kind === "event" ? "event_attendees" : "lobby_participants";
  const queryKey = kind === "event" ? keys.attendees : keys.participants;
  const attendees = useAttendees();
  const participants = useParticipants();
  const query = kind === "event" ? attendees : participants;
  const queryClient = useQueryClient();
  const { user, openLogin } = useAuth();
  const toast = useToast();
  const joined = Boolean(
    user?.discordId &&
    query.data?.some(
      (record) => record[kind] === parentId && record.discordUserId === user.discordId,
    ),
  );
  const count = query.data?.filter((record) => record[kind] === parentId).length ?? 0;

  const mutation = useMutation({
    mutationFn: async (join: boolean) => {
      if (!user?.discordId) throw new Error("Deinem Konto fehlt die Discord-Verknüpfung.");
      if (join) {
        await pb.collection(collection).create({ [kind]: parentId, discordUserId: user.discordId });
        return;
      }
      try {
        const filter = pb.filter(`${kind} = {:parentId} && discordUserId = {:discordUserId}`, {
          parentId,
          discordUserId: user.discordId,
        });
        const own = await pb.collection(collection).getFirstListItem(filter);
        await pb.collection(collection).delete(own.id);
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
        optimisticMemberships(previous, kind, parentId, user.discordId, join),
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
