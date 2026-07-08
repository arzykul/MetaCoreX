import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { GetPlatformCashbackParams, GetPlatformCashbackResponse } from "@workspace/api-zod";
import { contractService } from "../services/contractService.js";

// Platform/referrer routes for the ReportVerification cashback mechanic.
// Mounted at /api/platforms/*. Read-only — platforms claim their own
// cashback on-chain via claimRewards(), the API only ever reports the
// currently claimable balance.

const router: IRouter = Router();

router.get("/platforms/:address/cashback", async (req, res): Promise<void> => {
  const params = GetPlatformCashbackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!ethers.isAddress(params.data.address)) {
    res.status(400).json({ error: "address must be a valid Ethereum address" });
    return;
  }
  if (!contractService.reportVerificationConnected) {
    res.status(503).json({ error: "ReportVerification contract not connected" });
    return;
  }

  const claimableArzyg = await contractService.getClaimableCashback(params.data.address);

  res.json(
    GetPlatformCashbackResponse.parse({
      address: params.data.address.toLowerCase(),
      claimableArzyg: claimableArzyg ?? "0",
    })
  );
});

export default router;
