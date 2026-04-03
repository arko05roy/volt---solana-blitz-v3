import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null }),
  useConnection: () => ({ connection: null }),
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

import TradingPage from "../page";

describe("TradingPage UI", () => {
  it("renders VOLT header", () => {
    render(<TradingPage roundStatus="open" />);
    expect(screen.getByText("VOLT")).toBeTruthy();
  });

  it("shows live price", () => {
    render(<TradingPage roundStatus="open" />);
    const el = screen.getByTestId("live-price");
    expect(el.textContent).toContain("150.00");
  });

  it("shows round timer", () => {
    render(<TradingPage roundStatus="open" />);
    expect(screen.getByTestId("round-timer")).toBeTruthy();
  });

  it("shows leverage options", () => {
    render(<TradingPage roundStatus="open" />);
    const options = screen.getAllByTestId("leverage-option");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual(["2x", "5x", "10x"]);
  });

  it("disables LONG/SHORT when round is closed", () => {
    render(<TradingPage roundStatus="closed" />);
    const longBtn = screen.getByText("LONG");
    const shortBtn = screen.getByText("SHORT");
    expect(longBtn).toBeDisabled();
    expect(shortBtn).toBeDisabled();
  });

  it("shows session status", () => {
    render(<TradingPage roundStatus="open" sessionActive={false} />);
    expect(screen.getByTestId("session-status")).toBeTruthy();
  });

  it("shows 'Create session' message when no session and trade clicked", () => {
    render(<TradingPage roundStatus="open" sessionActive={false} />);
    fireEvent.click(screen.getByText("LONG"));
    const matches = screen.getAllByText("Create session");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'Insufficient balance' when margin > 10000", () => {
    render(<TradingPage roundStatus="open" sessionActive={true} />);
    const input = screen.getByPlaceholderText("margin");
    fireEvent.change(input, { target: { value: "10001" } });
    fireEvent.click(screen.getByText("LONG"));
    expect(screen.getByText("Insufficient balance")).toBeTruthy();
  });

  it("should not allow negative margin input", () => {
    render(<TradingPage roundStatus="open" sessionActive={true} />);
    const input = screen.getByPlaceholderText("margin") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    expect(input.value).toBe("");
  });
});
