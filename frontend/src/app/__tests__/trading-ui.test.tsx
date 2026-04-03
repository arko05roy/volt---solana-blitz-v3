import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null }),
  useConnection: () => ({ connection: null }),
  useAnchorWallet: () => null,
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  WalletModalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));

vi.mock("../../hooks/useOraclePrice", () => ({
  useOraclePrice: () => ({ price: 150.0, loading: false }),
}));

vi.mock("../../hooks/useSessionKey", () => ({
  useSessionKey: () => ({
    sessionWallet: null,
    sessionToken: null,
    publicKey: null,
    isActive: false,
    isExpired: false,
    isLoading: false,
    createSession: vi.fn(),
    revokeSession: vi.fn(),
  }),
}));

vi.mock("../../hooks/useRoundManager", () => ({
  useRoundManager: () => ({
    round: {
      roundNumber: null,
      roundPda: null,
      startPrice: 0,
      endPrice: 0,
      startTime: 0,
      endTime: 0,
      phase: "idle",
      totalLong: 0,
      totalShort: 0,
    },
    startRound: vi.fn(),
    settleRound: vi.fn(),
    getPoolPda: vi.fn(),
    getRoundPda: vi.fn(),
    getErProgram: vi.fn(),
  }),
}));

import TradingPage from "../page";

describe("TradingPage UI", () => {
  it("renders VOLT header", () => {
    render(<TradingPage />);
    expect(screen.getByText("VOLT")).toBeTruthy();
  });

  it("shows live price", () => {
    render(<TradingPage />);
    const el = screen.getByTestId("live-price");
    expect(el.textContent).toContain("150.00");
  });

  it("shows round timer area", () => {
    render(<TradingPage />);
    expect(screen.getByTestId("round-timer")).toBeTruthy();
  });

  it("shows leverage options", () => {
    render(<TradingPage />);
    const options = screen.getAllByTestId("leverage-option");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual(["2x", "5x", "10x"]);
  });

  it("shows market selector with SOL, BTC, ETH", () => {
    render(<TradingPage />);
    expect(screen.getByText("SOL")).toBeTruthy();
    expect(screen.getByText("BTC")).toBeTruthy();
    expect(screen.getByText("ETH")).toBeTruthy();
  });

  it("shows session status", () => {
    render(<TradingPage />);
    expect(screen.getByTestId("session-status")).toBeTruthy();
  });
});
