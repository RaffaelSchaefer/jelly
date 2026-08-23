import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => !value || /^https:\/\//i.test(value), "Bitte eine HTTPS-URL eingeben.");

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(3, "Der Titel braucht mindestens 3 Zeichen.").max(120),
    description: z.string().max(20_000),
    type: z.enum(["announcement", "food", "giveaway", "tournament", "workshop", "game", "other"]),
    startsAt: z.string().min(1, "Bitte einen Start angeben."),
    endsAt: z.string(),
    location: z.string().trim().max(120),
    game: z.string().trim().max(100),
    gameUrl: optionalUrl,
    playersWanted: z.number().int().min(0).max(99),
  })
  .superRefine((value, context) => {
    if (value.type === "game" && !value.game) {
      context.addIssue({
        code: "custom",
        path: ["game"],
        message: "Bitte ein Spiel auswählen oder eingeben.",
      });
    }
    if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Das Ende muss nach dem Start liegen.",
      });
    }
  });

export const lobbyFormSchema = z.object({
  game: z.string().trim().min(1, "Bitte ein Spiel auswählen oder eingeben.").max(100),
  gameUrl: optionalUrl,
  playersWanted: z.number().int().min(1, "Mindestens ein Platz.").max(99),
  startsAt: z.string(),
  location: z.string().trim().max(120),
});

export type FormErrors = Record<string, string>;

export function errorsOf(error: z.ZodError): FormErrors {
  return Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
}
