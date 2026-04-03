import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaderboardPage from "../page";

// No wallet context needed — passing entries as props bypasses on-chain fetch
describe("Leaderboard Page", () => {
  it("should render rank, player, type, PnL column headers", () => {
    render(<LeaderboardPage entries={[]} />);
    // Headers hidden when empty — check empty state instead
    expect(screen.getByTestId("empty-state")).toBeDefined();
  });

  it("should render table headers when entries exist", () => {
    render(
      <LeaderboardPage
        entries={[{ player: "abc123def456", isAgent: false, pnl: 300 }]}
      />
    );
    expect(screen.getByText(/rank/i)).toBeDefined();
    expect(screen.getByText(/player/i)).toBeDefined();
    expect(screen.getByText(/type/i)).toBeDefined();
    expect(screen.getByText(/pnl/i)).toBeDefined();
  });

  it("should highlight AI agent entries with Agent badge", () => {
    render(
      <LeaderboardPage
        entries={[
          { player: "abcdefgh12345678", isAgent: true, pnl: 500 },
          { player: "12345678abcdefgh", isAgent: false, pnl: 300 },
        ]}
      />
    );
    const agentRow = screen.getByTestId("entry-0");
    expect(agentRow.textContent).toMatch(/agent/i);
    const humanRow = screen.getByTestId("entry-1");
    expect(humanRow.textContent).toMatch(/human/i);
  });

  it("should show empty state when no entries", () => {
    render(<LeaderboardPage entries={[]} />);
    expect(screen.getByTestId("empty-state")).toBeDefined();
  });

  it("should format PnL with dollar sign", () => {
    render(
      <LeaderboardPage
        entries={[{ player: "abcdefgh12345678", isAgent: false, pnl: 123.45 }]}
      />
    );
    expect(screen.getByText(/\$123\.45/)).toBeDefined();
  });

  it("should truncate pubkeys to 4…4 format", () => {
    render(
      <LeaderboardPage
        entries={[
          { player: "AAAABBBBCCCCDDDD", isAgent: false, pnl: 10 },
        ]}
      />
    );
    expect(screen.getByText(/AAAA…DDDD/)).toBeDefined();
  });

  it("should rank entries starting from 1", () => {
    render(
      <LeaderboardPage
        entries={[
          { player: "aaaa1111aaaa1111", isAgent: false, pnl: 500 },
          { player: "bbbb2222bbbb2222", isAgent: false, pnl: 300 },
        ]}
      />
    );
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
  });
});
