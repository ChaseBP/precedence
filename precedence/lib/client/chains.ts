import { defineChain } from "viem";
import { sepolia } from "viem/chains";

/**
 * Creditcoin CC3 testnet, as a first-class wagmi chain.
 *
 * @remarks Not in viem's registry, so it is defined here. Declaring it properly is what lets the
 * connector ADD it to a wallet automatically — CC3 is in nobody's MetaMask by default, and asking
 * a judge to paste RPC details by hand would end the demo.
 */
export const creditcoinCc3 = defineChain({
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

export { sepolia };

/**
 * What each chain is FOR.
 *
 * @remarks The two-chain shape is the product, not an accident. Attestcoin's readability
 * precompile proves that a transaction happened on a DIFFERENT chain; if capital locked on
 * Creditcoin there would be nothing foreign to prove and no reason for the precompile to exist. So
 * capital locks on Sepolia and priority settles on Creditcoin, and the UI explains which is which
 * rather than leaving a user to guess why a network changed.
 */
export const CHAIN_PURPOSE: Record<number, string> = {
  [sepolia.id]: "where capital locks — the source chain being proven",
  [creditcoinCc3.id]: "where collateral registers and priority settles",
};

export const CHAIN_LABEL: Record<number, string> = {
  [sepolia.id]: "Ethereum Sepolia",
  [creditcoinCc3.id]: "Creditcoin CC3",
};
