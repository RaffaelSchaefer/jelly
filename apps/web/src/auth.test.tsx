import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";

const mocks = vi.hoisted(() => ({
  login: vi.fn().mockResolvedValue({}),
  clear: vi.fn(),
  user: null as null | { id: string; nickname: string; discordUsername: string; discordId: string },
}));

vi.mock("./api", () => ({
  currentUser: () => mocks.user,
  displayError: (error: unknown) => String(error),
  pb: {
    authStore: { onChange: () => () => {}, clear: mocks.clear },
    collection: () => ({ authWithOAuth2: mocks.login }),
  },
}));

function Harness() {
  const auth = useAuth();
  return (
    <>
      <button onClick={auth.openLogin}>Öffnen</button>
      <button onClick={auth.logout}>Logout</button>
    </>
  );
}

describe("Discord-Authentifizierung", () => {
  test("startet OAuth aus dem Login-Dialog und meldet lokal ab", async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText("Öffnen"));
    fireEvent.click(screen.getByText("Mit Discord anmelden"));
    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith({ provider: "discord", createData: {} }),
    );
    fireEvent.click(screen.getByText("Logout"));
    expect(mocks.clear).toHaveBeenCalled();
  });
});
