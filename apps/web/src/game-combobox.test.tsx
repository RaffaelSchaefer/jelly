import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GameCombobox } from "./components";

const searchGames = vi.hoisted(() => vi.fn());
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  searchGames,
}));

function Harness() {
  const [value, setValue] = useState("");
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GameCombobox value={value} selected={null} onChange={setValue} onSelect={() => {}} />
    </QueryClientProvider>
  );
}

describe("GameCombobox", () => {
  afterEach(() => {
    vi.useRealTimers();
    searchGames.mockReset();
  });

  test("unterdrückt kurze Suchen und debounced gültige Eingaben", async () => {
    vi.useFakeTimers();
    searchGames.mockResolvedValue([
      { id: "1", name: "Portal 2", steamAppId: "620", headerUrl: "", capsuleUrl: "" },
    ]);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "p" } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(searchGames).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "portal" } });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(searchGames).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    expect(searchGames).toHaveBeenCalledWith("portal");
  });
});
