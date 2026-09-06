# PRECEDENCE contracts
#
# IMPORTANT: on this machine bare `forge` on PATH is an unrelated AI tool ("forge code"), NOT
# Foundry. Every target below uses the absolute Foundry path. Never call bare `forge`.
# $(HOME), not an absolute path — this was pinned to one machine's home directory and broke
# on every other clone. Still pinned to ~/.foundry rather than PATH: `forge` on PATH is an
# unrelated AI tool on the original author's machine, and picking that up produces errors
# that look like Solidity problems.
FORGE := $(HOME)/.foundry/bin/forge
CAST  := $(HOME)/.foundry/bin/cast
ENV   := ../.env.local

.PHONY: help build test test-fork gas sizes fmt clean deploy-sepolia deploy-creditcoin verify-precompile

help: ## show targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-20s\033[0m %s\n",$$1,$$2}'

build: ## compile (via_ir; required by the precompile's calldata shape)
	$(FORGE) build

test: ## unit + integration tests
	$(FORGE) test

gas: ## gas report
	$(FORGE) test --gas-report

sizes: ## contract sizes vs the 24KB limit
	$(FORGE) build --sizes

test-fork: ## fork tests against live CC3 (needs CREDITCOIN_RPC)
	@set -a; . $(ENV); set +a; FOUNDRY_PROFILE=fork $(FORGE) test --match-path 'test/fork/*' -vv

verify-precompile: ## verify the LIVE precompiles by RPC (a fork cannot: no EVM bytecode)
	@cd .. && bun run ops/verify-precompile.ts

fmt: ## format
	$(FORGE) fmt

clean: ## remove build artifacts
	$(FORGE) clean

# ── deployment (kept last, per plan) ───────────────────────────────────────
deploy-sepolia: ## deploy PUSD + PriorityVault to Sepolia
	@set -a; . $(ENV); set +a; $(FORGE) script script/DeploySepolia.s.sol:DeploySepolia \
		--rpc-url $$SEPOLIA_RPC --broadcast --verify --etherscan-api-key $$ETHERSCAN_API_KEY -vvv

deploy-creditcoin: ## deploy the CC3 contract set and wire permissions
	@set -a; . $(ENV); set +a; $(FORGE) script script/DeployCreditcoin.s.sol:DeployCreditcoin \
		--rpc-url $$CREDITCOIN_RPC --broadcast -vvv
