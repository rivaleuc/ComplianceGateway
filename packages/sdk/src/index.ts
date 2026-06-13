import { keccak256, toHex, type Address } from "viem";

/** Screening verdict as returned by the GenLayer contract. */
export interface Verdict {
  exists: boolean;
  subject: string;
  is_compliant: boolean;
  risk_level: "low" | "medium" | "high";
  reasoning: string;
  appealed: boolean;
}

/** Deployment addresses for a ComplianceGateway instance. */
export interface CGDeployment {
  chainId: number;
  token: Address;
  vault: Address;
  genlayerContract: string;
}

/** Derive EVM transfer id from screening key (matches vault storage). */
export function screeningKeyToId(key: string): bigint {
  return BigInt(keccak256(toHex(key)));
}

export const vaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "screeningKey", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingAmount",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfers",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "screeningKey", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "screeningKey", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [{ name: "id", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "Rejected",
    inputs: [{ name: "id", type: "uint256", indexed: true }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
