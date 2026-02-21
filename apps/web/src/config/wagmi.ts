import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config: ReturnType<typeof createConfig> = createConfig({
  chains: [base],
  connectors: [injected()],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});
