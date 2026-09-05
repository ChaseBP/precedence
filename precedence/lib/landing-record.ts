/**
 * The settled race the landing page is built around.
 *
 * @remarks Every value here is transcribed from `evidence/race-88857090.json`, a real settlement:
 * capital locked on Sepolia, the locks proven at the Attestcoin precompile `0x0FD2`, priority
 * settled on Creditcoin CC3. Nothing is synthetic, and each hash resolves on a public explorer —
 * which is the entire point of leading with it. If this record is ever replaced, replace it from
 * the evidence file, never by hand.
 *
 * The two winning locks share one Sepolia block. Only the transaction index separates them, and
 * that is the claim the protocol exists to make: an oracle can assert an order, it cannot commit
 * to one.
 */

export interface ProvenLock {
  txIndex: number;
  tranche: "SENIOR" | "JUNIOR";
  amount: string;
  txHash: string;
}

export const SETTLEMENT = {
  sourceChain: "Ethereum Sepolia",
  /** Both winning locks are in this one block. */
  block: 11_626_711,
  locks: [
    {
      txIndex: 71,
      tranche: "SENIOR",
      amount: "$5,100",
      txHash: "0x9608373046677f7a5c5b2cfd591fc944961934d9d4f4267e86d7c25fd173ae30",
    },
    {
      txIndex: 72,
      tranche: "JUNIOR",
      amount: "$2,550",
      txHash: "0x704abae3ed3d61e4c9897dbd2d9f0d0140a9796ff1e04a8883aeea60ae18cc1b",
    },
  ] satisfies ProvenLock[],
  /** Capital that arrived after the caps were filled, returned rather than silently demoted. */
  refunded: 2,
  settledOn: {
    chain: "Creditcoin CC3",
    block: 5_423_422,
    txHash: "0x1a61728c7fa29f1ec97736c7e4cbdbf4f0659ddf79e5c924d96ef60152163870",
  },
  /** Minutes from the source block being mined to it being attested. Measured, not documented. */
  attestation: { minMinutes: 6.5, maxMinutes: 9.3, p50Minutes: 7.8, samples: 239 },
} as const;

export const EXPLORER = {
  sepoliaTx: (h: string) => `https://sepolia.etherscan.io/tx/${h}`,
  sepoliaBlock: (n: number) => `https://sepolia.etherscan.io/block/${n}`,
  creditcoinTx: (h: string) => `https://creditcoin-testnet.blockscout.com/tx/${h}`,
  creditcoinBlock: (n: number) => `https://creditcoin-testnet.blockscout.com/block/${n}`,
  creditcoinAddress: (a: string) => `https://creditcoin-testnet.blockscout.com/address/${a}`,
  sepoliaAddress: (a: string) => `https://sepolia.etherscan.io/address/${a}`,
};

/** Deployed and verifiable. Addresses come from `contracts/deployments/*.json`. */
export const DEPLOYED = {
  creditcoin: [
    { name: "AttestationGate", address: "0x1E6713DdF4a2D90fb871EF545941b3f190099153" },
    { name: "PriorityEngine", address: "0x16FD8A1b7fb4525eFa2D3801F642c84fbb982714" },
    { name: "CollateralRegistry", address: "0x39E984ed4875FfC41634e8495B8e45Cc01Ae79b5" },
    { name: "ClaimToken", address: "0xFc1547aFeb6D69a525780918b3fa40A062372D45" },
    { name: "RefinanceEngine", address: "0x07A5b91f866A70D70C3164E3394286E1cB90A433" },
  ],
  sepolia: [
    { name: "PriorityVault", address: "0x000d8d9C5Ab3b3d98A574eCEB34136e885C16656" },
    { name: "pUSD", address: "0xAfA914EF2CF2D754647dc83175Aad6AcF42a9670" },
  ],
  precompiles: [
    { name: "BlockProver", address: "0x0000000000000000000000000000000000000FD2" },
    { name: "ChainInfo", address: "0x0000000000000000000000000000000000000fD3" },
  ],
} as const;
