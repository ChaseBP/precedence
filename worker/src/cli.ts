/**
 * PRECEDENCE worker CLI.
 *
 *   bun run src/cli.ts status                      # chain + attestation + deployment health
 *   bun run src/cli.ts stage <collateralId>        # stage a race on Sepolia (register/open/lock/close)
 *   bun run src/cli.ts locks <collateralId>        # read a race's locks from the vault
 *   bun run src/cli.ts prove <collateralId> <tx…>  # prove and settle a race
 *   bun run src/cli.ts repay <collateralId> <tx>   # prove a repayment, release the lien
 *   bun run src/cli.ts watch <collateralId…>       # watch and auto-settle
 *   bun run src/cli.ts facility <collateralId>     # facility + next keeper poke
 *   bun run src/cli.ts poke <collateralId>         # call the next available poke
 *   bun run src/cli.ts unwind <collateralId>       # drive the whole failure branch
 *   bun run src/cli.ts keeper <collateralId…>      # run the keeper loop
 */
import {
  attestationStatus,
  chainInfo,
  estimateVerifyCostCtc,
} from "./proof";
import {
  CREDITCOIN_CHAIN_ID,
  MAX_BATCH_SIZE,
  SEPOLIA_CHAIN_KEY,
  creditcoinProvider,
  deploymentsExist,
  explorers,
  keeperSigner,
  loadDeployments,
  proofBuilderUrl,
  proverSigner,
  sepoliaProvider,
} from "./config";
import { settleRace, settleRepayment } from "./settle-race";
import { collectRaceLocks, runWatchLoop, validateLockSet } from "./watch";
import { driveUnwind, facilityStatus, pokeNext, runKeeperLoop } from "./keeper";
import { ethers } from "ethers";
import { probeProof } from "./probe-proof";
import { stageRace, type Bid, type TrancheName } from "./stage-race";

const [cmd, ...args] = process.argv.slice(2);
const usd = (v: bigint) => `$${(Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

async function status() {
  console.log("\nPRECEDENCE worker — health\n");

  const cc3 = creditcoinProvider();
  const net = await cc3.getNetwork();
  const head = await cc3.getBlockNumber();
  const blk = await cc3.getBlock(head);
  console.log(`Creditcoin CC3   chainId ${net.chainId} · head ${head} · gasLimit ${blk?.gasLimit} · baseFee ${blk?.baseFeePerGas} wei`);

  const sepolia = sepoliaProvider();
  const snet = await sepolia.getNetwork();
  console.log(`Sepolia          chainId ${snet.chainId} · head ${await sepolia.getBlockNumber()}`);
  console.log(`proof builder    ${proofBuilderUrl()}`);

  // The honest two-stage story, measured right now.
  const att = await attestationStatus(sepolia);
  console.log(
    `\nattestation      height ${att.latestAttestedHeight} · ${att.lagBlocks} blocks / ` +
      `${att.lagMinutes} min behind head`,
  );
  console.log(`                 proofs are NOT instant; this lag is the wait, and it sawtooths`);

  const chains = await chainInfo().getSupportedChains();
  console.log(
    `supported chains ${chains.map((c) => `key ${c.chainKey}=chainId ${c.chainId}`).join(" · ")}`,
  );
  console.log(`                 Sepolia is chainKey ${SEPOLIA_CHAIN_KEY}, per the chain itself`);

  // Signers, and the fact they hold no privileges.
  const prover = proverSigner();
  const keeper = keeperSigner();
  console.log(
    `\nprover           ${prover.address} · ${ethers.formatEther(await cc3.getBalance(prover.address))} CTC`,
  );
  console.log(
    `keeper           ${keeper.address} · ${ethers.formatEther(await cc3.getBalance(keeper.address))} CTC`,
  );
  console.log(`                 neither is the deployer — that is what makes "permissionless" checkable`);

  if (!deploymentsExist()) {
    console.log(`\ndeployments      NOT FOUND`);
    console.log(`                 run: cd contracts && make deploy-sepolia && make deploy-creditcoin`);
    return;
  }
  const d = loadDeployments();
  console.log(`\ndeployments`);
  console.log(`  PriorityVault      ${d.sepolia.PriorityVault}  ${explorers.sepoliaAddr(d.sepolia.PriorityVault)}`);
  console.log(`  PUSD               ${d.sepolia.PUSD}`);
  console.log(`  AttestationGate    ${d.creditcoin.AttestationGate}  ${explorers.cc3Addr(d.creditcoin.AttestationGate)}`);
  console.log(`  PriorityEngine     ${d.creditcoin.PriorityEngine}`);
  console.log(`  CollateralRegistry ${d.creditcoin.CollateralRegistry}`);
  console.log(`  ClaimToken         ${d.creditcoin.ClaimToken}`);
  console.log(`  RefinanceEngine    ${d.creditcoin.RefinanceEngine}`);
  console.log(`\nverification cost at 10 continuity roots: ~${estimateVerifyCostCtc(10).toExponential(2)} CTC`);
  console.log(`(grows with proof AGE — prove promptly)\n`);
}

async function locks(collateralId: string) {
  const found = await collectRaceLocks(collateralId);
  if (found.length === 0) {
    console.log("no locks found in the recent block range");
    return;
  }
  console.log(`\n${found.length} lock(s) for ${collateralId}, in proven order:\n`);
  console.log("  #  seq  block      txIndex  tranche      amount        financier");
  found.forEach((l, i) => {
    const tr = ["SENIOR", "JUNIOR", "SUBORDINATE"][l.tranche];
    console.log(
      `  ${String(i + 1).padStart(2)}  ${String(l.seq).padStart(3)}  ${l.blockNumber}  ` +
        `${String(l.txIndex).padStart(7)}  ${tr.padEnd(11)}  ${usd(l.amount).padStart(12)}  ${l.financier}`,
    );
  });

  const byBlock = new Map<number, number>();
  for (const l of found) byBlock.set(l.blockNumber, (byBlock.get(l.blockNumber) ?? 0) + 1);
  const tied = [...byBlock.entries()].filter(([, n]) => n > 1);
  if (tied.length) {
    console.log(
      `\nsame-block contention in ${tied.map(([b, n]) => `block ${b} (${n} locks)`).join(", ")} — ` +
        `block height alone cannot order these; calculateTxIndex resolves it on-chain`,
    );
  }

  const check = validateLockSet(found);
  console.log(check.ok ? "\nlock set is settleable" : `\nNOT settleable: ${check.problems.join("; ")}`);
}

async function main() {
  switch (cmd) {
    case "status":
      await status();
      break;

    case "probe": {
      // End-to-end proof-path probe against real, pre-existing Sepolia transactions. Needs no
      // deployment, so it isolates the Attestcoin integration from our own contracts.
      if (args.length === 0) throw new Error("usage: probe <txHash…>");
      const r = await probeProof(args);
      process.exit(r.ok ? 0 : 1);
    }

    case "locks":
      if (!args[0]) throw new Error("usage: locks <collateralId>");
      await locks(args[0]);
      break;

    case "prove": {
      // `--json` prints one machine-readable line on the last line of stdout and suppresses the
      // evidence markdown. It exists so the web app can offer a "submit the proof" button and
      // still have exactly ONE implementation of proving — this one. Scraping the human output
      // for a transaction hash would have been the alternative, and a log line is not an API.
      const json = args.includes("--json");
      const rest = args.filter((a) => a !== "--json");
      const [collateralId, ...txHashes] = rest;
      if (!collateralId || txHashes.length === 0) {
        throw new Error("usage: prove <collateralId> <txHash…>  (or `prove <collateralId> --from-vault`)");
      }
      let hashes = txHashes;
      if (txHashes[0] === "--from-vault") {
        const found = await collectRaceLocks(collateralId);
        const check = validateLockSet(found);
        if (!check.ok) throw new Error(`lock set not settleable: ${check.problems.join("; ")}`);
        hashes = found.map((l) => l.txHash);
        console.log(`read ${hashes.length} lock(s) from the vault`);
      }
      const r = await settleRace({ collateralId, txHashes: hashes });
      console.log(`\nsettled: ${r.explorerUrl}`);
      console.log(`gas: ${r.gasUsed} · evidence: ${r.evidencePath}`);
      if (json) {
        console.log(
          `PRECEDENCE_RESULT ${JSON.stringify({
            settleTxHash: r.settleTxHash,
            blockNumber: r.blockNumber,
            gasUsed: r.gasUsed.toString(),
            explorerUrl: r.explorerUrl,
            evidencePath: r.evidencePath,
            crossCheckAgrees: r.crossCheckAgrees,
          })}`,
        );
      } else {
        console.log(`\n${r.markdown}\n`);
      }
      if (!r.crossCheckAgrees) process.exit(1);
      break;
    }

    case "repay": {
      const [collateralId, txHash] = args;
      if (!collateralId || !txHash) throw new Error("usage: repay <collateralId> <txHash>");
      const r = await settleRepayment(collateralId, txHash);
      console.log(`\nrepayment proven at ${r.provenAmount} · ${r.explorerUrl}`);
      break;
    }

    case "watch": {
      if (args.length === 0) throw new Error("usage: watch <collateralId…>");
      await runWatchLoop({
        collateralIds: args,
        autoSettle: process.env.AUTO_SETTLE !== "0",
      });
      break;
    }

    case "stage": {
      if (!args[0]) {
        throw new Error(
          'usage: stage <collateralId> [--facility <usd>] [--caps <s>/<j>/<sub>] [--window <sec>] [--contend] ' +
            '[--bid <LABEL>:<TRANCHE>:<usd>[:demote] …]',
        );
      }
      const flag = (name: string) => {
        const i = args.indexOf(`--${name}`);
        return i >= 0 ? args[i + 1] : undefined;
      };
      const bids: Bid[] = [];
      args.forEach((a, i) => {
        if (a !== "--bid") return;
        const [label, tranche, amt, demote] = (args[i + 1] ?? "").split(":");
        if (!label || !tranche || !amt) {
          throw new Error(`bad --bid "${args[i + 1]}" (LABEL:TRANCHE:USD[:demote])`);
        }
        bids.push({
          label,
          tranche: tranche.toUpperCase() as TrancheName,
          amountUsd: Number(amt),
          allowDemotion: demote === "demote",
        });
      });
      if (bids.length === 0) {
        // The seeded coffee-receipt facility: two rivals for SENIOR, so contention is real.
        bids.push(
          { label: "MERIDIAN", tranche: "SENIOR", amountUsd: 5_100 },
          { label: "VECTOR", tranche: "SENIOR", amountUsd: 5_100 },
          { label: "NOVUM", tranche: "JUNIOR", amountUsd: 2_550 },
          { label: "REFINANCER", tranche: "SUBORDINATE", amountUsd: 850 },
        );
      }
      if (bids.length > MAX_BATCH_SIZE) {
        throw new Error(`${bids.length} bids exceeds MAX_BATCH_SIZE ${MAX_BATCH_SIZE} — one proof cannot cover them`);
      }
      console.log("");
      const capsFlag = flag("caps");
      await stageRace({
        collateralId: args[0],
        facilityUsd: Number(flag("facility") ?? 8_500),
        caps: capsFlag
          ? (capsFlag.split("/").map(Number) as [number, number, number])
          : undefined,
        windowSec: Number(flag("window") ?? 150),
        contend: args.includes("--contend"),
        bids,
      });
      console.log("");
      break;
    }

    case "facility": {
      if (!args[0]) throw new Error("usage: facility <collateralId>");
      const s = await facilityStatus(args[0]);
      console.log(`\nstate        ${s.state}`);
      console.log(`activeLiens  ${s.activeLiens}`);
      console.log(`principal    ${s.principal}`);
      console.log(`PCR          ${s.pcrBps === Number.POSITIVE_INFINITY ? "n/a" : `${(s.pcrBps / 100).toFixed(2)}%`} (threshold 110%)`);
      if (s.nextPoke) {
        console.log(`next poke    ${s.nextPoke} — ${s.pokeReady ? "GATE OPEN, callable now" : `blocked: ${s.pokeBlockedBy}`}`);
      } else {
        console.log(`next poke    none applicable in this state`);
      }
      console.log("");
      break;
    }

    case "poke": {
      if (!args[0]) throw new Error("usage: poke <collateralId>");
      const r = await pokeNext(args[0]);
      if (!r) {
        console.log("no poke available — no gate is currently open. That is the healthy case.");
        break;
      }
      console.log(`\n${r.fn} → ${r.newState}`);
      console.log(`tx    ${r.explorerUrl}`);
      console.log(`gas   ${r.gasUsed} · bounty ${r.bountyPaidCtc} CTC\n`);
      break;
    }

    case "unwind": {
      if (!args[0]) throw new Error("usage: unwind <collateralId>");
      console.log("driving the failure branch with an UNPRIVILEGED keeper key\n");
      const done = await driveUnwind(args[0], {
        onPoke: (r) =>
          console.log(`  ${r.fn.padEnd(24)} → ${r.newState.padEnd(20)} ${r.gasUsed} gas · ${r.explorerUrl}`),
      });
      console.log(`\n${done.length} poke(s) executed`);
      if (done.length === 0) console.log("nothing was open to poke");
      break;
    }

    case "keeper": {
      if (args.length === 0) throw new Error("usage: keeper <collateralId…>");
      await runKeeperLoop(args);
      break;
    }

    default:
      console.log(readFileHeader());
      process.exit(cmd ? 1 : 0);
  }
}

function readFileHeader(): string {
  return `PRECEDENCE worker

  status                        chain + attestation + deployment health
  probe <txHash…>               prove real Sepolia txs end-to-end (no deployment needed)
  stage <collateralId>          stage a race on Sepolia: register, open, lock, close
                                --caps <s>/<j>/<sub> must sum to --facility
  locks <collateralId>          read a race's locks from the vault, in proven order
  prove <collateralId> <tx…>    prove and settle a race (or --from-vault to read them)
  repay <collateralId> <tx>     prove a repayment and release the lien
  watch <collateralId…>         watch for closed races and auto-settle
  facility <collateralId>       facility state + which keeper poke is next
  poke <collateralId>           call the next available poke
  unwind <collateralId>         drive the whole failure branch
  keeper <collateralId…>        run the keeper loop

Env comes from ../.env.local. Addresses come from contracts/deployments/*.json.`;
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
