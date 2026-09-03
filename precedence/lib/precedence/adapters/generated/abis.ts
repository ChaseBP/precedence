/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by `bun run ops/sync-abis.ts` from the Foundry build in `contracts/out`.
 * Regenerate after any contract change; a stale ABI fails in ways that look like proof errors.
 *
 * Generated: 2026-09-03T12:32:54.236Z
 */

export const PUSD_ABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_MINT_PER_CALL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "mintDollars",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "dollars",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Minted",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const PriorityVault_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DRAW_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_RACE_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allocatedAmount",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "capsOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[3]",
        "internalType": "uint256[3]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "closeRace",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "collateral",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "obligor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "registered",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "raceOpen",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "raceNonce",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lockCount",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "facilitySize",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "raceDeadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "drawDeadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalLocked",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalDrawn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalRepaid",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "draw",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getCollateral",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PriorityVault.Collateral",
        "components": [
          {
            "name": "obligor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "registered",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "raceOpen",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "raceNonce",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lockCount",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "facilitySize",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "caps",
            "type": "uint256[3]",
            "internalType": "uint256[3]"
          },
          {
            "name": "raceDeadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "drawDeadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalLocked",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalDrawn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalRepaid",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAbandoned",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lock",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PriorityVault.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "lockAt",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PriorityVault.Lock",
        "components": [
          {
            "name": "financier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PriorityVault.Tranche"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "refunded",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "raceNonce",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "seq",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lockAtRace",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "raceNonce",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PriorityVault.Lock",
        "components": [
          {
            "name": "financier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PriorityVault.Tranche"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "refunded",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "raceNonce",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "seq",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lockCountOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lockEventSignature",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "openRace",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "facilitySize",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caps",
        "type": "uint256[3]",
        "internalType": "uint256[3]"
      },
      {
        "name": "window",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerCollateral",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "repay",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "repaymentEventSignature",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "settlementToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalAllocated",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "CollateralRegistered",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "obligor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Draw",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "obligor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Lock_",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "financier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "raceNonce",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "seq",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "blockNumber",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RaceClosed",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "raceNonce",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "lockCount",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "totalLocked",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RaceOpened",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "raceNonce",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "facilitySize",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refund",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "financier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "seq",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Repayment",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "obligor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CapsMustSumToFacility",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotLockOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotObligor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToRefund",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OverDraw",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RaceAlreadyOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RaceNotOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RaceStillOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "WindowTooShort",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;

export const CollateralRegistry_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "collateralIdOfToken",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "exists",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "facilitySizing",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "sizing",
        "type": "tuple",
        "internalType": "struct PrecedenceTypes.TrancheSizing",
        "components": [
          {
            "name": "senior",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "junior",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "subordinate",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "maxAdvance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "facilityTerms",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CollateralRegistry.FacilityTerms",
        "components": [
          {
            "name": "set",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "seniorCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "juniorCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "subordinateCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "seniorRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "juniorRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "subordinateRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "termDays",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getApproved",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCollateral",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CollateralRegistry.Collateral",
        "components": [
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "obligor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "assetType",
            "type": "uint8",
            "internalType": "enum CollateralRegistry.AssetType"
          },
          {
            "name": "faceValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "haircutBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "termDays",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "custodian",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.EncumbranceState"
          },
          {
            "name": "activeLiens",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEncumbrance",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "state",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      },
      {
        "name": "activeLiens",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasFacilityTerms",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isApprovedForAll",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isClearTitle",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isStateWriter",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxAdvanceOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ownerOf",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "postFacilityTerms",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "seniorCap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "juniorCap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "subordinateCap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seniorRateBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "juniorRateBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "subordinateRateBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rateBpsOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "rates",
        "type": "uint256[3]",
        "internalType": "uint256[3]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerCollateral",
    "inputs": [
      {
        "name": "docHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "assetType",
        "type": "uint8",
        "internalType": "enum CollateralRegistry.AssetType"
      },
      {
        "name": "faceValue",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "haircutBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "termDays",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "custodian",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "metadataURI",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setActiveLiens",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "count",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setApprovalForAll",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setState",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "next",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setStateWriter",
    "inputs": [
      {
        "name": "writer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenURI",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateVault",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "newVault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vaultOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ApprovalForAll",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CollateralRegistered",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "obligor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assetType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum CollateralRegistry.AssetType"
      },
      {
        "name": "faceValue",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EncumbranceChanged",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "from",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      },
      {
        "name": "to",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FacilityTermsPosted",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "seniorCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "juniorCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "subordinateCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "seniorRateBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "juniorRateBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "subordinateRateBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "termDays",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StateWriterSet",
    "inputs": [
      {
        "name": "writer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultUpdated",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "oldVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "newVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyRegistered",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "CapsExceedAdvance",
    "inputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxAdvance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721IncorrectOwner",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InsufficientApproval",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOperator",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721NonexistentToken",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidHaircut",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotObligor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotStateWriter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "RateTooHigh",
    "inputs": [
      {
        "name": "bps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "RatesNotOrdinal",
    "inputs": [
      {
        "name": "senior",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "junior",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "subordinate",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "TermsLockedWhileEncumbered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TermsNotSet",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownCollateral",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultLockedWhileEncumbered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroFacility",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroVault",
    "inputs": []
  }
] as const;

export const ClaimToken_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "uri_",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOfBatch",
    "inputs": [
      {
        "name": "accounts",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "burnAll",
    "inputs": [
      {
        "name": "holder",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      }
    ],
    "outputs": [
      {
        "name": "burned",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "burnClaim",
    "inputs": [
      {
        "name": "holder",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimId",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "isApprovedForAll",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isMinter",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mintClaim",
    "inputs": [
      {
        "name": "holder",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "height",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "seq",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "provenanceOf",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "rank",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "height",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "seq",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "settledAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeBatchTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "values",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setApprovalForAll",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinter",
    "inputs": [
      {
        "name": "minter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setURI",
    "inputs": [
      {
        "name": "uri_",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "uri",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ApprovalForAll",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimBurned",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "holder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimMinted",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "holder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "height",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MinterSet",
    "inputs": [
      {
        "name": "minter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TransferBatch",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "ids",
        "type": "uint256[]",
        "indexed": false,
        "internalType": "uint256[]"
      },
      {
        "name": "values",
        "type": "uint256[]",
        "indexed": false,
        "internalType": "uint256[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TransferSingle",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "id",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "URI",
    "inputs": [
      {
        "name": "value",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC1155InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155InvalidArrayLength",
    "inputs": [
      {
        "name": "idsLength",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "valuesLength",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155InvalidOperator",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1155MissingApprovalForAll",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotMinter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const PriorityEngine_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "registry_",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      },
      {
        "name": "claims_",
        "type": "address",
        "internalType": "contract ClaimToken"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "AUCTION_DECAY_BPS_PER_BLOCK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUCTION_FLOOR_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUCTION_START_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GRACE_PERIOD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KEEPER_BOUNTY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PCR_THRESHOLD_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PCR_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attestationGate",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionFloorPrice",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionPrice",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionStartPrice",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bidLiquidation",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "bountyPool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claims",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ClaimToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "facility",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "exists",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "settledAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maturity",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "graceExpiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "pcrWindowExpiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "auctionStartBlock",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "principal",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "provenRepaid",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "auctionProceeds",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "topUpPosted",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "state",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      },
      {
        "name": "drawn",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fundBountyPool",
    "inputs": [],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "getPriorityState",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "state",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      },
      {
        "name": "senior",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "junior",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "principal",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasDefaulted",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markDrawn",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pcrBps",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pokeDutchLiquidation",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pokeFreezeDraw",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pokeGracePeriod",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pokePcrStabilization",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pokeTerminateDefault",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "postTopUp",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "priorityStack",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AllocationLib.Award[]",
        "components": [
          {
            "name": "financier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.Tranche"
          },
          {
            "name": "rank",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "height",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "txIndex",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "seq",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proverFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refinanceEngine",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refundsOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AllocationLib.Refund[]",
        "components": [
          {
            "name": "financier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "declared",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.Tranche"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "releaseLien",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "provenRepaid",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reportBreach",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "detail",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAttestationGate",
    "inputs": [
      {
        "name": "gate",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRefinanceEngine",
    "inputs": [
      {
        "name": "engine",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlePriority",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "locks",
        "type": "tuple[]",
        "internalType": "struct PrecedenceTypes.VerifiedLock[]",
        "components": [
          {
            "name": "financier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.Tranche"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "emittedBy",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "height",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "txIndex",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "seq",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "raceNonce",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "receiptStatus",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      },
      {
        "name": "allowDemotion",
        "type": "bool[]",
        "internalType": "bool[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "waterfallOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AllocationLib.WaterfallLine[]",
        "components": [
          {
            "name": "holder",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.Tranche"
          },
          {
            "name": "rank",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "principal",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "interestDue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "interestPaid",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "principalReturned",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "loss",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "payout",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "satisfiedInFull",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "BountyPaid",
    "inputs": [
      {
        "name": "keeper",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fn",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BountyPoolFunded",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Breached",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "detail",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "claimsFrozen",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "reporter",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CapitalDrawn",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimAwarded",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "financier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "rank",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "height",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "seq",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DoublePledgePrevented",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "blockedFinancier",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "refundedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DrawFrozen",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "bounty",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DutchAuctionCleared",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "winner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "clearingPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DutchAuctionOpened",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "startPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "floorPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "startBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GracePeriodOpened",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "cureAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LienReleased",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "provenRepaid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "distributed",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PcrCured",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "topUpPosted",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PcrStabilizationOpened",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "pcrBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shortfall",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "windowExpiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PrioritySettled",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "awardCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "principal",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "refundCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TerminatedDefault",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "obligor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "proceeds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalLoss",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WaterfallPaid",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "holder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "rank",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "payout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "loss",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AuctionNotOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GateNotOpen",
    "inputs": [
      {
        "name": "gate",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientBid",
    "inputs": [
      {
        "name": "sent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotGate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SeniorityViolated",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownFacility",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongState",
    "inputs": [
      {
        "name": "actual",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.EncumbranceState"
      }
    ]
  }
] as const;

export const AttestationGate_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "registry_",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      },
      {
        "name": "engine_",
        "type": "address",
        "internalType": "contract PriorityEngine"
      },
      {
        "name": "settlementToken_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DRAW_EVENT_SIG",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LOCK_EVENT_SIG",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "REPAYMENT_EVENT_SIG",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SEPOLIA_CHAIN_KEY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "derivePositions",
    "inputs": [
      {
        "name": "merkleProofs",
        "type": "tuple[]",
        "internalType": "struct INativeQueryVerifier.MerkleProof[]",
        "components": [
          {
            "name": "root",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "siblings",
            "type": "tuple[]",
            "internalType": "struct INativeQueryVerifier.MerkleProofEntry[]",
            "components": [
              {
                "name": "hash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "isLeft",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "txIndices",
        "type": "uint64[]",
        "internalType": "uint64[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "engine",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PriorityEngine"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isProcessed",
    "inputs": [
      {
        "name": "height",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "precompileAvailable",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "preflightBatch",
    "inputs": [
      {
        "name": "proof",
        "type": "tuple",
        "internalType": "struct AttestationGate.RaceProof",
        "components": [
          {
            "name": "heights",
            "type": "uint64[]",
            "internalType": "uint64[]"
          },
          {
            "name": "encodedTxs",
            "type": "bytes[]",
            "internalType": "bytes[]"
          },
          {
            "name": "merkleProofs",
            "type": "tuple[]",
            "internalType": "struct INativeQueryVerifier.MerkleProof[]",
            "components": [
              {
                "name": "root",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "siblings",
                "type": "tuple[]",
                "internalType": "struct INativeQueryVerifier.MerkleProofEntry[]",
                "components": [
                  {
                    "name": "hash",
                    "type": "bytes32",
                    "internalType": "bytes32"
                  },
                  {
                    "name": "isLeft",
                    "type": "bool",
                    "internalType": "bool"
                  }
                ]
              }
            ]
          },
          {
            "name": "sharedProof",
            "type": "tuple",
            "internalType": "struct INativeQueryVerifier.ContinuityProof",
            "components": [
              {
                "name": "lowerEndpointDigest",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "roots",
                "type": "bytes32[]",
                "internalType": "bytes32[]"
              }
            ]
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "processedQueries",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleRace",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "proof",
        "type": "tuple",
        "internalType": "struct AttestationGate.RaceProof",
        "components": [
          {
            "name": "heights",
            "type": "uint64[]",
            "internalType": "uint64[]"
          },
          {
            "name": "encodedTxs",
            "type": "bytes[]",
            "internalType": "bytes[]"
          },
          {
            "name": "merkleProofs",
            "type": "tuple[]",
            "internalType": "struct INativeQueryVerifier.MerkleProof[]",
            "components": [
              {
                "name": "root",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "siblings",
                "type": "tuple[]",
                "internalType": "struct INativeQueryVerifier.MerkleProofEntry[]",
                "components": [
                  {
                    "name": "hash",
                    "type": "bytes32",
                    "internalType": "bytes32"
                  },
                  {
                    "name": "isLeft",
                    "type": "bool",
                    "internalType": "bool"
                  }
                ]
              }
            ]
          },
          {
            "name": "sharedProof",
            "type": "tuple",
            "internalType": "struct INativeQueryVerifier.ContinuityProof",
            "components": [
              {
                "name": "lowerEndpointDigest",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "roots",
                "type": "bytes32[]",
                "internalType": "bytes32[]"
              }
            ]
          }
        ]
      },
      {
        "name": "allowDemotion",
        "type": "bool[]",
        "internalType": "bool[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlementToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "verifyDraw",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "height",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "encodedTx",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "merkleProof",
        "type": "tuple",
        "internalType": "struct INativeQueryVerifier.MerkleProof",
        "components": [
          {
            "name": "root",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "siblings",
            "type": "tuple[]",
            "internalType": "struct INativeQueryVerifier.MerkleProofEntry[]",
            "components": [
              {
                "name": "hash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "isLeft",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          }
        ]
      },
      {
        "name": "continuityProof",
        "type": "tuple",
        "internalType": "struct INativeQueryVerifier.ContinuityProof",
        "components": [
          {
            "name": "lowerEndpointDigest",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "roots",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verifyRepayment",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "height",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "encodedTx",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "merkleProof",
        "type": "tuple",
        "internalType": "struct INativeQueryVerifier.MerkleProof",
        "components": [
          {
            "name": "root",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "siblings",
            "type": "tuple[]",
            "internalType": "struct INativeQueryVerifier.MerkleProofEntry[]",
            "components": [
              {
                "name": "hash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "isLeft",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          }
        ]
      },
      {
        "name": "continuityProof",
        "type": "tuple",
        "internalType": "struct INativeQueryVerifier.ContinuityProof",
        "components": [
          {
            "name": "lowerEndpointDigest",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "roots",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BreachVerified",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "detail",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DrawVerified",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "height",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LockVerified",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "financier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "height",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "seq",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RaceSettled",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "lockCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "lowestHeight",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "highestHeight",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RepaymentVerified",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "height",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "txIndex",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "provenAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyProcessed",
    "inputs": [
      {
        "name": "queryId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "BatchTooLarge",
    "inputs": [
      {
        "name": "given",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CollateralMismatch",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ContinuityWindowExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyBatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LengthMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MixedRaceNonce",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "MultipleLockEvents",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoLockEvent",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoRepaymentEvent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotStrictlyOrdered",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PrecompileUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RevertedSourceTx",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SeqContradictsProof",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SeqGap",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "got",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "expected",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "VerificationFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongToken",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongVault",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "emittedBy",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const RefinanceEngine_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "registry_",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      },
      {
        "name": "claims_",
        "type": "address",
        "internalType": "contract ClaimToken"
      },
      {
        "name": "engine_",
        "type": "address",
        "internalType": "contract PriorityEngine"
      },
      {
        "name": "gate",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "REFINANCE_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attestationGate",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claims",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ClaimToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "engine",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PriorityEngine"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeAtomic",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "oldFinancier",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "newFinancier",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "oldRateBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "newRateBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "newHeight",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "newTxIndex",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "historyOf",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct RefinanceEngine.Refinance[]",
        "components": [
          {
            "name": "collateralId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "oldFinancier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "newFinancier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tranche",
            "type": "uint8",
            "internalType": "enum PrecedenceTypes.Tranche"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oldRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "newRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "executedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "newHeight",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "newTxIndex",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refinanceCount",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "RefinanceExecuted",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "oldFinancier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newFinancier",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PrecedenceTypes.Tranche"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "oldRateBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "newRateBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "annualSavings",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AmountMismatch",
    "inputs": [
      {
        "name": "held",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offered",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoSuchPosition",
    "inputs": [
      {
        "name": "collateralId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "enum PrecedenceTypes.Tranche"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAnImprovement",
    "inputs": [
      {
        "name": "oldRateBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "newRateBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotGate",
    "inputs": []
  }
] as const;

