import { listAgents } from "@/lib/precedence/store/repositories";
import { getDeps } from "@/lib/precedence/config";
import type { Hex } from "@precedence/sdk/types";

export async function GET() {
  const agents = await listAgents();
  const { creditcoin } = getDeps();
  return Response.json({
    ok: true,
    agents,
    registries: {
      identity: ("0xSAMPLE_REGISTRY_" + "11".repeat(20)) as Hex,
      reputation: ("0xSAMPLE_REGISTRY_" + "22".repeat(20)) as Hex,
    },
    creditcoinLive: creditcoin.isLive(),
  });
}
