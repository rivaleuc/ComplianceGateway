"use client";

import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = getDefaultConfig({
  appName: "ComplianceGateway",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
  chains: [base, baseSepolia],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
