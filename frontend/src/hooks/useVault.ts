"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PROGRAM_ID, BASE_RPC } from "@/lib/constants";
import { getVaultPda, getLpPositionPda } from "./useRoundManager";
import idl from "@/idl/volt.json";

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);

export interface VaultState {
  totalDeposits: number;    // USDC (6 decimals → human)
  reservedAmount: number;
  protocolFees: number;
  vlpSupply: number;
  vlpPrice: number;         // USDC per VLP share
  userVlpShares: number;
  userDepositedUsdc: number;
  loading: boolean;
}

export function useVault() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();

  const [vault, setVault] = useState<VaultState>({
    totalDeposits: 0,
    reservedAmount: 0,
    protocolFees: 0,
    vlpSupply: 0,
    vlpPrice: 1,
    userVlpShares: 0,
    userDepositedUsdc: 0,
    loading: true,
  });

  const getProgram = useCallback(() => {
    if (!wallet) return null;
    const baseConn = new Connection(BASE_RPC, "confirmed");
    const provider = new AnchorProvider(baseConn, wallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, provider);
  }, [wallet]);

  const fetchVault = useCallback(async () => {
    const program = getProgram();
    if (!program || !wallet) return;

    try {
      const vaultPda = getVaultPda();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultData: any = await (program.account as any).vault.fetch(vaultPda);

      const totalDeposits = vaultData.totalDeposits.toNumber() / 1e6;
      const vlpSupply = vaultData.vlpSupply.toNumber() / 1e6;
      const vlpPrice = vlpSupply > 0 ? totalDeposits / vlpSupply : 1;

      let userVlpShares = 0;
      let userDepositedUsdc = 0;
      try {
        const lpPda = getLpPositionPda(vaultPda, wallet.publicKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lpData: any = await (program.account as any).lpPosition.fetch(lpPda);
        userVlpShares = lpData.vlpShares.toNumber() / 1e6;
        userDepositedUsdc = lpData.deposited.toNumber() / 1e6;
      } catch {
        // LP position doesn't exist yet
      }

      setVault({
        totalDeposits,
        reservedAmount: vaultData.reservedAmount.toNumber() / 1e6,
        protocolFees: vaultData.protocolFees.toNumber() / 1e6,
        vlpSupply,
        vlpPrice,
        userVlpShares,
        userDepositedUsdc,
        loading: false,
      });
    } catch {
      setVault((prev) => ({ ...prev, loading: false }));
    }
  }, [getProgram, wallet]);

  const depositLiquidity = useCallback(
    async (amountUsdc: number) => {
      const program = getProgram();
      if (!program || !wallet) return;

      const vaultPda = getVaultPda();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultData: any = await (program.account as any).vault.fetch(vaultPda);
      const usdcMint = vaultData.usdcMint as PublicKey;
      const vaultTokenAccount = vaultData.tokenAccount as PublicKey;

      const userAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      const lpPda = getLpPositionPda(vaultPda, wallet.publicKey);
      const amount = new BN(Math.floor(amountUsdc * 1e6));

      await program.methods
        .depositLiquidity(amount)
        .accounts({
          vault: vaultPda,
          lpPosition: lpPda,
          vaultTokenAccount,
          userTokenAccount: userAta,
          user: wallet.publicKey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: PublicKey.default,
        })
        .rpc();

      await fetchVault();
    },
    [getProgram, wallet, fetchVault]
  );

  const withdrawLiquidity = useCallback(
    async (vlpAmount: number) => {
      const program = getProgram();
      if (!program || !wallet) return;

      const vaultPda = getVaultPda();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultData: any = await (program.account as any).vault.fetch(vaultPda);
      const usdcMint = vaultData.usdcMint as PublicKey;
      const vaultTokenAccount = vaultData.tokenAccount as PublicKey;

      const userAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      const lpPda = getLpPositionPda(vaultPda, wallet.publicKey);
      const amount = new BN(Math.floor(vlpAmount * 1e6));

      await program.methods
        .withdrawLiquidity(amount)
        .accounts({
          vault: vaultPda,
          lpPosition: lpPda,
          vaultTokenAccount,
          userTokenAccount: userAta,
          user: wallet.publicKey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();

      await fetchVault();
    },
    [getProgram, wallet, fetchVault]
  );

  const depositMargin = useCallback(
    async (amountUsdc: number) => {
      const program = getProgram();
      if (!program || !wallet) return;

      const vaultPda = getVaultPda();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultData: any = await (program.account as any).vault.fetch(vaultPda);
      const usdcMint = vaultData.usdcMint as PublicKey;
      const vaultTokenAccount = vaultData.tokenAccount as PublicKey;

      const userAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      const amount = new BN(Math.floor(amountUsdc * 1e6));

      await program.methods
        .depositMargin(amount)
        .accounts({
          vault: vaultPda,
          vaultTokenAccount,
          userTokenAccount: userAta,
          user: wallet.publicKey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();

      await fetchVault();
    },
    [getProgram, wallet, fetchVault]
  );

  useEffect(() => {
    fetchVault();
    const interval = setInterval(fetchVault, 10000);
    return () => clearInterval(interval);
  }, [fetchVault]);

  return {
    vault,
    fetchVault,
    depositLiquidity,
    withdrawLiquidity,
    depositMargin,
  };
}
