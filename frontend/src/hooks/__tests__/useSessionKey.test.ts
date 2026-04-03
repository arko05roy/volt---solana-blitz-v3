import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { PublicKey } from "@solana/web3.js";

// Mock MagicBlock gum-react-sdk
const mockCreateSession = vi.fn().mockResolvedValue(undefined);
const mockRevokeSession = vi.fn().mockResolvedValue(undefined);

let mockSessionState = {
  sessionToken: null as string | null,
  publicKey: null as PublicKey | null,
  ownerPublicKey: null as PublicKey | null,
  isLoading: false,
  createSession: mockCreateSession,
  revokeSession: mockRevokeSession,
  signAndSendTransaction: vi.fn(),
};

vi.mock("@magicblock-labs/gum-react-sdk", () => ({
  useSessionWallet: () => mockSessionState,
  SessionWalletProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  useSessionKeyManager: () => mockSessionState,
}));

vi.mock("@/lib/constants", () => ({
  PROGRAM_ID: "BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi",
  ER_RPC: "https://devnet-router.magicblock.app",
}));

import { useSessionKey } from "../useSessionKey";

describe("useSessionKey (MagicBlock SDK)", () => {
  beforeEach(() => {
    mockSessionState = {
      sessionToken: null,
      publicKey: null,
      ownerPublicKey: null,
      isLoading: false,
      createSession: mockCreateSession,
      revokeSession: mockRevokeSession,
      signAndSendTransaction: vi.fn(),
    };
    mockCreateSession.mockClear();
    mockRevokeSession.mockClear();
  });

  it("isActive is false when no session token", () => {
    const { result } = renderHook(() => useSessionKey());
    expect(result.current.isActive).toBe(false);
  });

  it("isActive is true when sessionToken and publicKey are present", () => {
    mockSessionState.sessionToken = "mock-session-token";
    mockSessionState.publicKey = new PublicKey("BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi");
    const { result } = renderHook(() => useSessionKey());
    expect(result.current.isActive).toBe(true);
  });

  it("isExpired is false when no session has ever been created", () => {
    const { result } = renderHook(() => useSessionKey());
    expect(result.current.isExpired).toBe(false);
  });

  it("createSession calls SDK with program ID, topUp=false, 60 minutes", async () => {
    const { result } = renderHook(() => useSessionKey());
    await act(async () => {
      await result.current.createSession();
    });
    expect(mockCreateSession).toHaveBeenCalledOnce();
    const [targetProgram, topUp, minutes] = mockCreateSession.mock.calls[0];
    expect(targetProgram.toBase58()).toBe("BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi");
    expect(topUp).toBe(false); // ER is gasless — no SOL top-up needed
    expect(minutes).toBe(60);
  });

  it("revokeSession calls SDK revokeSession", async () => {
    const { result } = renderHook(() => useSessionKey());
    await act(async () => {
      await result.current.revokeSession();
    });
    expect(mockRevokeSession).toHaveBeenCalledOnce();
  });
});
