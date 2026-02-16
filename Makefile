.PHONY: install dev build clean test lint format docker-up docker-down forge-build forge-test

# ─── Setup ────────────────────────────────────────────────
install:
	pnpm install

# ─── Development ──────────────────────────────────────────
dev:
	pnpm dev

build:
	pnpm build

clean:
	pnpm clean

lint:
	pnpm lint

format:
	pnpm format

# ─── Contracts (Foundry) ─────────────────────────────────
forge-build:
	cd packages/contracts && forge build

forge-test:
	cd packages/contracts && forge test -vvv

forge-deploy-local:
	cd packages/contracts && forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast

forge-deploy-base-sepolia:
	cd packages/contracts && forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify

# ─── Docker ───────────────────────────────────────────────
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# ─── Database ─────────────────────────────────────────────
db-reset:
	docker-compose down -v && docker-compose up -d postgres
	sleep 2
	psql $(DATABASE_URL) -f db/schema.sql
