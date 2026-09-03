// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PrecedenceTypes as T} from "./PrecedenceTypes.sol";

/// @title AllocationLib — tranche allocation and the strict seniority waterfall
///
/// @notice Two rules, both of which the protocol's value proposition rests on directly.
///
/// **Allocation.** A declared tranche is a preference, not an entitlement. Within a tranche, the
/// earliest PROVEN position wins it. A bid that loses its declared tranche is REFUNDED, not quietly
/// demoted — someone who bid senior did not consent to subordinate risk, and silently repricing
/// their risk would be worse than rejecting them.
///
/// **Waterfall.** Strictly by rank. Senior is satisfied in full — principal AND interest — before
/// junior receives anything at all. Pro-rata sharing would make priority decorative, which is the
/// opposite of what this protocol sells.
library AllocationLib {
    struct Award {
        address financier;
        T.Tranche tranche;
        uint8 rank;
        uint256 amount;
        uint64 height;
        uint64 txIndex;
        uint64 seq;
    }

    struct Refund {
        address financier;
        T.Tranche declared;
        uint256 amount;
    }

    struct WaterfallLine {
        address holder;
        T.Tranche tranche;
        uint8 rank;
        uint256 principal;
        uint256 interestDue;
        uint256 interestPaid;
        uint256 principalReturned;
        uint256 loss;
        uint256 payout;
        bool satisfiedInFull;
    }

    /// @notice Allocate locks to tranches by proven order.
    /// @dev `locks` MUST already be validated and in proven order — `PriorityProofLib.validateSet`
    /// guarantees both. Walking them in that order is what makes the earliest proven lock win.
    /// @param locks proven locks in proven order; each carries its own `allowDemotion` consent
    /// @param sizing the per-tranche caps the obligor posted
    ///
    /// @dev Consent is read from the lock rather than passed alongside it. As a parallel array it
    /// was supplied by whoever proved the race, which let a third party consent on a financier's
    /// behalf to holding riskier paper.
    function allocate(T.VerifiedLock[] memory locks, T.TrancheSizing memory sizing)
        internal
        pure
        returns (Award[] memory awards, Refund[] memory refunds)
    {
        uint256 n = locks.length;
        Award[] memory aBuf = new Award[](n * 3); // a demoted lock can span at most 3 tranches
        Refund[] memory rBuf = new Refund[](n);
        uint256 aCount;
        uint256 rCount;

        uint256[3] memory remaining = [sizing.senior, sizing.junior, sizing.subordinate];

        for (uint256 i = 0; i < n; ++i) {
            T.VerifiedLock memory l = locks[i];
            uint256 unseated = l.amount;
            uint8 startIdx = uint8(l.tranche);

            // Seat in the declared tranche first.
            uint256 seated = _seat(aBuf, aCount, remaining, l, startIdx, unseated);
            if (seated > 0) {
                aCount += 1;
                unseated -= seated;
            }

            // Lower tranches only if this financier explicitly consented.
            if (unseated > 0 && l.allowDemotion) {
                for (uint8 t = startIdx + 1; t < 3 && unseated > 0; ++t) {
                    uint256 more = _seat(aBuf, aCount, remaining, l, t, unseated);
                    if (more > 0) {
                        aCount += 1;
                        unseated -= more;
                    }
                }
            }

            if (unseated > 0) {
                rBuf[rCount++] = Refund({financier: l.financier, declared: l.tranche, amount: unseated});
            }
        }

        awards = new Award[](aCount);
        for (uint256 i = 0; i < aCount; ++i) {
            awards[i] = aBuf[i];
        }
        refunds = new Refund[](rCount);
        for (uint256 i = 0; i < rCount; ++i) {
            refunds[i] = rBuf[i];
        }
    }

    function _seat(
        Award[] memory buf,
        uint256 at,
        uint256[3] memory remaining,
        T.VerifiedLock memory l,
        uint8 trancheIdx,
        uint256 want
    ) private pure returns (uint256 seated) {
        uint256 cap = remaining[trancheIdx];
        if (cap == 0 || want == 0) return 0;
        seated = want > cap ? cap : want;
        remaining[trancheIdx] = cap - seated;

        buf[at] = Award({
            financier: l.financier,
            tranche: T.Tranche(trancheIdx),
            rank: trancheIdx + 1,
            amount: seated,
            height: l.height,
            txIndex: l.txIndex,
            seq: l.seq
        });
    }

    /// @notice Run the strict seniority waterfall over a realised amount.
    ///
    /// @param awards        the priority stack
    /// @param realised      proven repayment, or liquidation proceeds
    /// @param protocolFeeBps taken off the top
    /// @param proverFeeBps   taken off the top
    /// @param termDays      accrual period
    /// @param ratesBps      per-rank coupon, index 0 = SENIOR
    /// @param liquidation   true to recover principal only (no interest is earned on a default)
    ///
    /// @dev Awards are processed in rank order, and each rank must be paid its full principal AND
    /// interest before the next receives a single unit. `assertSeniorityRespected` in the
    /// TypeScript orchestrator checks the same invariant on the same numbers.
    function waterfall(
        Award[] memory awards,
        uint256 realised,
        uint256 protocolFeeBps,
        uint256 proverFeeBps,
        uint256 termDays,
        uint256[3] memory ratesBps,
        bool liquidation
    )
        internal
        pure
        returns (WaterfallLine[] memory lines, uint256 protocolFee, uint256 proverFee, uint256 unallocated)
    {
        protocolFee = (realised * protocolFeeBps) / 10_000;
        proverFee = (realised * proverFeeBps) / 10_000;
        uint256 distributable = realised - protocolFee - proverFee;

        Award[] memory ordered = _sortByRank(awards);
        lines = new WaterfallLine[](ordered.length);
        uint256 remaining = distributable;

        for (uint256 i = 0; i < ordered.length; ++i) {
            Award memory a = ordered[i];
            uint256 interestDue =
                liquidation ? 0 : (a.amount * ratesBps[a.rank - 1] * termDays) / (10_000 * 365);
            uint256 due = a.amount + interestDue;

            uint256 payout = remaining >= due ? due : remaining;
            uint256 principalReturned = payout >= a.amount ? a.amount : payout;

            lines[i] = WaterfallLine({
                holder: a.financier,
                tranche: a.tranche,
                rank: a.rank,
                principal: a.amount,
                interestDue: interestDue,
                interestPaid: payout - principalReturned,
                principalReturned: principalReturned,
                loss: a.amount - principalReturned,
                payout: payout,
                satisfiedInFull: payout >= due
            });

            remaining -= payout;
        }
        unallocated = remaining;
    }

    /// @dev Insertion sort by rank, stable so that equal ranks keep proven order. n <= 30.
    function _sortByRank(Award[] memory a) private pure returns (Award[] memory) {
        Award[] memory out = new Award[](a.length);
        for (uint256 i = 0; i < a.length; ++i) {
            out[i] = a[i];
        }
        for (uint256 i = 1; i < out.length; ++i) {
            Award memory key = out[i];
            uint256 j = i;
            while (j > 0 && out[j - 1].rank > key.rank) {
                out[j] = out[j - 1];
                unchecked {
                    --j;
                }
            }
            out[j] = key;
        }
        return out;
    }

    /// @notice Assert the waterfall respected seniority. Cheap, so check it rather than trust it.
    /// @dev If a junior line was paid while a senior line was short, the protocol's central claim is
    /// false for that settlement and it must not be recorded.
    function seniorityRespected(WaterfallLine[] memory lines) internal pure returns (bool) {
        for (uint256 i = 1; i < lines.length; ++i) {
            if (!lines[i - 1].satisfiedInFull && lines[i].payout > 0) return false;
        }
        return true;
    }
}
