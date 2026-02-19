import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const chainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID)
  : 8453;

export const config = createConfig({
  chains: [base],
  connectors: [injected()],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});
