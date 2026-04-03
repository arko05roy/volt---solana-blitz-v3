"use client";

import { ConnectionProvider, WalletProvider, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo, ReactNode } from "react";
import { SessionWalletProvider, useSessionKeyManager } from "@magicblock-labs/gum-react-sdk";
import { BASE_RPC, ER_RPC } from "@/lib/constants";
import { Connection } from "@solana/web3.js";

function SessionProvider({ children }: { children: React.ReactNode }) {
  // Session keys are created on base Solana devnet, NOT the ER.
  // Using the ER RPC here causes "Blockhash not found" because the ER router
  // returns blockhashes that are invalid for base-layer transactions.
  const baseConnection = useMemo(() => new Connection(BASE_RPC, "confirmed"), []);
  const anchorWallet = useAnchorWallet();
  const sessionWallet = useSessionKeyManager(anchorWallet, baseConnection, "devnet");

  return (
    <SessionWalletProvider sessionWallet={sessionWallet}>
      {children}
    </SessionWalletProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={ER_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
