"use client";

import { useSessionWallet } from "@magicblock-labs/gum-react-sdk";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/constants";

const SESSION_DURATION_MINUTES = 60;

export function useSessionKey() {
  const sessionWallet = useSessionWallet();

  const isActive =
    !!sessionWallet.sessionToken &&
    !!sessionWallet.publicKey &&
    !sessionWallet.isLoading;

  // Only mark expired if a session token was previously issued but is no longer valid.
  // ownerPublicKey alone just means a wallet is connected — not that a session existed.
  const isExpired = !isActive && !!sessionWallet.sessionToken && !!sessionWallet.ownerPublicKey;

  async function createSession() {
    const targetProgram = new PublicKey(PROGRAM_ID);
    // topUp = false (session key doesn't need SOL — ER is gasless)
    await sessionWallet.createSession(targetProgram, false, SESSION_DURATION_MINUTES);
  }

  async function revokeSession() {
    await sessionWallet.revokeSession();
  }

  return {
    sessionWallet,          // full SDK object for signing txs
    sessionToken: sessionWallet.sessionToken,
    publicKey: sessionWallet.publicKey,
    isActive,
    isExpired,
    isLoading: sessionWallet.isLoading,
    createSession,
    revokeSession,
  };
}
