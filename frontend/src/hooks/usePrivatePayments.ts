"use client";

import { Connection, Transaction } from "@solana/web3.js";
import { BASE_RPC, ER_RPC } from "@/lib/constants";

export function resolveEndpoint(sendTo: "ephemeral" | "base"): string {
  return sendTo === "ephemeral" ? ER_RPC : BASE_RPC;
}

interface TxResponse {
  transactionBase64: string;
  sendTo: "ephemeral" | "base";
}

interface WalletAdapter {
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  publicKey: { toBytes(): Uint8Array };
}

export async function signAndSend(
  txResponse: TxResponse,
  wallet: WalletAdapter,
  connection: Connection
): Promise<string> {
  const endpoint = resolveEndpoint(txResponse.sendTo);
  const sendConnection = new Connection(endpoint, "confirmed");

  const tx = Transaction.from(Buffer.from(txResponse.transactionBase64, "base64"));
  const signed = await wallet.signTransaction(tx);
  const rawTx = signed.serialize();

  const signature = await sendConnection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await sendConnection.confirmTransaction(signature, "confirmed");
  return signature;
}
