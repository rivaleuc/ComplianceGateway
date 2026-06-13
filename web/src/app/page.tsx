"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { vaultAbi, erc20Abi } from "@compliance-gateway/sdk";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` ?? "0x0";
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as `0x${string}` ?? "0x0";

export default function Home() {
  const { address, isConnected } = useAccount();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [screeningKey, setScreeningKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { writeContract: approve } = useWriteContract();
  const { writeContract: deposit } = useWriteContract();

  const handleDeposit = async () => {
    if (!recipient || !amount) return;
    setStatus("Approving...");
    approve({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [VAULT_ADDRESS, parseEther(amount)],
    });
    setStatus("Depositing (pending compliance screening)...");
    deposit({
      address: VAULT_ADDRESS,
      abi: vaultAbi,
      functionName: "deposit",
      args: [recipient as `0x${string}`, parseEther(amount), BigInt(screeningKey || "0")],
    });
    setStatus("Deposit submitted — awaiting GenLayer verdict");
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold">🔐 ComplianceGateway</h1>
          <ConnectButton />
        </div>

        {isConnected ? (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold">Send Tokens (Compliance-Gated)</h2>
              <p className="text-gray-400 text-sm">
                Funds are held in escrow until GenLayer AI validators confirm compliance.
              </p>
              <input
                className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500"
                placeholder="Recipient address (0x...)"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
              <input
                className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500"
                placeholder="Amount (CGT)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500"
                placeholder="Screening key (from GenLayer)"
                value={screeningKey}
                onChange={(e) => setScreeningKey(e.target.value)}
              />
              <button
                onClick={handleDeposit}
                className="w-full bg-green-600 hover:bg-green-700 rounded-lg px-4 py-3 font-semibold transition"
              >
                Deposit & Screen
              </button>
              {status && (
                <p className="text-sm text-yellow-400">{status}</p>
              )}
            </div>

            <div className="bg-gray-900 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-2">How it works</h2>
              <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
                <li>You deposit tokens → locked in ComplianceVault</li>
                <li>GenLayer AI validators screen the recipient against OFAC/sanctions</li>
                <li>If compliant → funds released to recipient</li>
                <li>If non-compliant → funds returned to you</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-xl">Connect your wallet to start</p>
          </div>
        )}
      </div>
    </main>
  );
}
