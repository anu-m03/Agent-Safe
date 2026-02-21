/**
 * App Agent API — Init, run-cycle, generate, validate, deploy, status.
 * Base-native: low-fee monitoring, session-key automation, Base mini-app ecosystem, ERC-8021 attribution (stub).
 *
 * GUARDRAILS (before any deploy / execution — each throws or returns BLOCK on failure):
 * ─────────────────────────────────────────────────────────────────────────────────
 * | Guardrail                    | Where enforced
 * | Allowlisted tokens/contracts | appAgent/safetyPipeline (template + capabilities);
 * |                              | execution: callDataBuilder isTokenAllowed, config allowedTokens/allowedTargets
 * | Max budget per app           | appAgent/budgetGovernor (canAllocate/recordSpend); safetyPipeline + deployer
 * | Max slippage                 | routes/agentExecute (session.limits.maxSlippageBps); execution path only
 * | ChainId validation           | executionService.executeIntent, callDataBuilder (validateChainId)
 * | Deadline sanity              | services/execution/guardrails.validateDeadline (swap calldata builders)
 * | User balance check           | routes/agentExecute (balance cap, zero-balance BLOCK); portfolio/execution
 * ─────────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { scanTrends } from '../appAgent/trendScanner.js';
import { generateIdea } from '../appAgent/ideaGenerator.js';
import { runAppSafetyPipeline } from '../appAgent/safetyPipeline.js';
import { deployApp } from '../appAgent/deployer.js';
import { getBudgetState, estimateRunway } from '../appAgent/budgetGovernor.js';
import { saveApp, getApp, listApps } from '../appAgent/appAgentStore.js';
import { evaluateAppPerformance } from '../appAgent/incubator.js';
import { executeRunCycle } from '../appAgent/runCycle.js';
import { verifyYieldEngineProtection } from '../appAgent/yieldEngineProtection.js';
import {
  createSession,
  getSessionByWallet,
  createApp,
  getApp as getStateApp,
} from '../state/appAgentStore.js';
import { APP_STATUS } from '../appAgent/types.js';
import {
  generateAppSpatialMemory,
} from '../services/appSpatialService.js';
import {
  loadAppSpatialMemory,
  listAllAppSpatialMemories,
  getEvolutionContext,
} from '../stores/appSpatialStore.js';

export const appAgentRouter = Router();

const TRANSFER_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)')).toLowerCase();
const DEMO_MEME_DEPLOY_TEMPLATE =
  '0xbd66e4360000000000000000000000000000000000000000000000000000000000000060662ae76b42279b99660bc37e1264859e185f0f13b0c0187c4fd15a1b8903265e0000000000000000000000002e2da4311ea87cfa31c372d59b4a0d567c15d76000000000000000000000000000000000000000000000000000000000000010e560c060405234801562000010575f80fd5b5060405162000fc538038062000fc5833981016040819052620000339162000415565b8484600362000043838262000532565b50600462000052828262000532565b5050506103e882111562000089576040516358e4a91360e01b8152600481018390526103e860248201526044015b60405180910390fd5b6001600160a01b038116620000b1576040516333fe7c6560e21b815260040160405180910390fd5b60a08290526001600160a01b038116608052620000cf3384620000da565b50505050506200067e565b6001600160a01b038216620001055760405163ec442f0560e01b81525f600482015260240162000080565b620001125f838362000116565b5050565b6001600160a01b03831615806200013457506001600160a01b038216155b156200014c576200014783838362000225565b505050565b6080516001600160a01b0316826001600160a01b03160362000175576200014783838362000225565b5f61271060a0518362000189919062000612565b62000195919062000632565b90505f620001a4828462000652565b905081156200021157620001c285608051846200022560201b60201c565b836001600160a01b0316856001600160a01b03167f5d37fd68fe66745a199f8c603e00ae02183f4aabb8ec0089589b0b40c4ead5e1846040516200020891815260200190565b60405180910390a35b6200021e85858362000225565b5050505050565b6001600160a01b03831662000253578060025f82825462000247919062000668565b90915550620002c59050565b6001600160a01b0383165f9081526020819052604090205481811015620002a75760405163391434e360e21b81526001600160a01b0385166004820152602481018290526044810183905260640162000080565b6001600160a01b0384165f9081526020819052604090209082900390555b6001600160a01b038216620002e35760028054829003905562000301565b6001600160a01b0382165f9081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040516200034791815260200190565b60405180910390a3505050565b634e487b7160e01b5f52604160045260245ffd5b5f82601f83011262000378575f80fd5b81516001600160401b038082111562000395576200039562000354565b604051601f8301601f19908116603f01168101908282118183101715620003c057620003c062000354565b8160405283815260209250866020858801011115620003dd575f80fd5b5f91505b83821015620004005785820183015181830184015290820190620003e1565b5f602085830101528094505050505092915050565b5f805f805f60a086880312156200042a575f80fd5b85516001600160401b038082111562000441575f80fd5b6200044f89838a0162000368565b9650602088015191508082111562000465575f80fd5b50620004748882890162000368565b6040880151606089015160808a0151929750909550935090506001600160a01b0381168114620004a2575f80fd5b809150509295509295909350565b600181811c90821680620004c557607f821691505b602082108103620004e457634e487b7160e01b5f52602260045260245ffd5b50919050565b601f8211156200014757805f5260205f20601f840160051c81016020851015620005115750805b601f840160051c820191505b818110156200021e575f81556001016200051d565b81516001600160401b038111156200054e576200054e62000354565b62000566816200055f8454620004b0565b84620004ea565b602080601f8311600181146200059c575f8415620005845750858301515b5f19600386901b1c1916600185901b178555620005f6565b5f85815260208120601f198616915b82811015620005cc57888601518255948401946001909101908401620005ab565b5085821015620005ea57878501515f19600388901b60f8161c191681555b505060018460011b0185555b505050505050565b634e487b7160e01b5f52601160045260245ffd5b80820281158282048414176200062c576200062c620005fe565b92915050565b5f826200064d57634e487b7160e01b5f52601260045260245ffd5b500490565b818103818111156200062c576200062c620005fe565b808201808211156200062c576200062c620005fe565b60805160a051610910620006b55f395f8181610124015261052401525f818161014b015281816104d9015261056e01526109105ff3fe608060405234801561000f575f80fd5b50600436106100a6575f3560e01c80633eacd2f81161006e5780633eacd2f81461011f578063469048401461014657806370a082311461018557806395d89b41146101ad578063a9059cbb146101b5578063dd62ed3e146101c8575f80fd5b806306fdde03146100aa578063095ea7b3146100c857806318160ddd146100eb57806323b872dd146100fd578063313ce56714610110575b5f80fd5b6100b2610200565b6040516100bf9190610719565b60405180910390f35b6100db6100d6366004610780565b610290565b60405190151581526020016100bf565b6002545b6040519081526020016100bf565b6100db61010b3660046107a8565b6102a9565b604051601281526020016100bf565b6100ef7f000000000000000000000000000000000000000000000000000000000000000081565b61016d7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b0390911681526020016100bf565b6100ef6101933660046107e1565b6001600160a01b03165f9081526020819052604090205490565b6100b26102cc565b6100db6101c3366004610780565b6102db565b6100ef6101d6366004610801565b6001600160a01b039182165f90815260016020908152604080832093909416825291909152205490565b60606003805461020f90610832565b80601f016020809104026020016040519081016040528092919081815260200182805461023b90610832565b80156102865780601f1061025d57610100808354040283529160200191610286565b820191905f5260205f20905b81548152906001019060200180831161026957829003601f168201915b5050505050905090565b5f3361029d8185856102e8565b60019150505b92915050565b5f336102b68582856102fa565b6102c185858561037b565b506001949350505050565b60606004805461020f90610832565b5f3361029d81858561037b565b6102f583838360016103d8565b505050565b6001600160a01b038381165f908152600160209081526040808320938616835292905220545f19811015610375578181101561036757604051637dc7a0d960e11b81526001600160a01b038416600482015260248101829052604481018390526064015b60405180910390fd5b61037584848484035f6103d8565b50505050565b6001600160a01b0383166103a457604051634b637e8f60e11b81525f600482015260240161035e565b6001600160a01b0382166103cd5760405163ec442f0560e01b81525f600482015260240161035e565b6102f58383836104aa565b6001600160a01b0384166104015760405163e602df0560e01b81525f600482015260240161035e565b6001600160a01b03831661042a57604051634a1406b160e11b81525f600482015260240161035e565b6001600160a01b038085165f908152600160209081526040808320938716835292905220829055801561037557826001600160a01b0316846001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161049c91815260200190565b60405180910390a350505050565b6001600160a01b03831615806104c757506001600160a01b038216155b156104d7576102f58383836105f3565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316826001600160a01b03160361051b576102f58383836105f3565b5f6127106105497f00000000000000000000000000000000000000000000000000000000000000008461087e565b6105539190610895565b90505f61056082846108b4565b905081156105e157610593857f0000000000000000000000000000000000000000000000000000000000000000846105f3565b836001600160a01b0316856001600160a01b03167f5d37fd68fe66745a199f8c603e00ae02183f4aabb8ec0089589b0b40c4ead5e1846040516105d891815260200190565b60405180910390a35b6105ec8585836105f3565b5050505050565b6001600160a01b03831661061d578060025f82825461061291906108c7565b9091555061068d9050565b6001600160a01b0383165f908152602081905260409020548181101561066f5760405163391434e360e21b81526001600160a01b0385166004820152602481018290526044810183905260640161035e565b6001600160a01b0384165f9081526020819052604090209082900390555b6001600160a01b0382166106a9576002805482900390556106c7565b6001600160a01b0382165f9081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8360405161070c91815260200190565b60405180910390a3505050565b5f602080835283518060208501525f5b8181101561074557858101830151858201604001528201610729565b505f604082860101526040601f19601f8301168501019250505092915050565b80356001600160a01b038116811461077b575f80fd5b919050565b5f8060408385031215610791575f80fd5b61079a83610765565b946020939093013593505050565b5f805f606084860312156107ba575f80fd5b6107c384610765565b92506107d160208501610765565b9150604084013590509250925092565b5f602082840312156107f1575f80fd5b6107fa82610765565b9392505050565b5f8060408385031215610812575f80fd5b61081b83610765565b915061082960208401610765565b90509250929050565b600181811c9082168061084657607f821691505b60208210810361086457634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b80820281158282048414176102a3576102a361086a565b5f826108af57634e487b7160e01b5f52601260045260245ffd5b500490565b818103818111156102a3576102a361086a565b808201808211156102a3576102a361086a56fea2646970667358221220cea1c942547eef100d7f37ee1c54533f1eda340e132624bcca88bf2562f6353364736f6c6343000818003300000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000d3c21bcecceda1000000000000000000000000000000000000000000000000000000000000000000012c0000000000000000000000002e2da4311ea87cfa31c372d59b4a0d567c15d76000000000000000000000000000000000000000000000000000000000000000104261736564204167656e7420436f696e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006424147454e540000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

function setWord(data: Hex, wordIndex: number, wordHexNoPrefix: string): Hex {
  const clean = data.slice(2);
  const paddedWord = wordHexNoPrefix.toLowerCase().padStart(64, '0');
  const start = 8 + wordIndex * 64; // skip function selector (4 bytes = 8 hex chars)
  const end = start + 64;
  return (`0x${clean.slice(0, start)}${paddedWord}${clean.slice(end)}`) as Hex;
}

function randomBytes32Hex(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── POST /api/app-agent/seed-test ───────────────────────
// Creates a synthetic GeneratedApp from the provided (or default) idea params
// and immediately fires Blockade Labs spatial generation — no wallet or budget
// gate required. Designed for local dev / demo testing.
appAgentRouter.post('/seed-test', async (req, res) => {
  try {
    const body = req.body ?? {};
    const tags: string[] = Array.isArray(body.trendTags)
      ? body.trendTags
      : ['defi', 'swap', 'base-miniapp'];
    const caps: string[] = Array.isArray(body.capabilities)
      ? body.capabilities
      : ['uniswap_swap', 'erc20_transfer'];
    const title: string = typeof body.title === 'string'
      ? body.title
      : 'DeFi Yield Optimizer Mini-App';
    const status: string = typeof body.status === 'string'
      ? body.status
      : 'SUPPORTED';

    const appId = `seed-${Date.now()}`;
    const ideaId = `idea-${appId}`;

    // Build a GeneratedApp-shaped object
    const app = {
      id: appId,
      ideaId,
      templateId: 'base-miniapp-v1',
      status,
      metrics: {
        users: body.users ?? 42,
        revenueUsd: body.revenueUsd ?? 120,
        impressions: body.impressions ?? 800,
      },
    } as unknown as import('../appAgent/types.js').GeneratedApp;

    const idea: Record<string, unknown> = {
      id: ideaId,
      title,
      trendTags: tags,
      capabilities: caps,
      userIntent: body.userIntent ?? 'test spatial generation',
    };

    // Save to app store so GET /apps includes it
    saveApp(app);

    // Fire spatial generation (async — client polls GET /:appId/space)
    const evolutionCtx = getEvolutionContext(8).filter((e) => e.appId !== appId);
    generateAppSpatialMemory(app, idea, evolutionCtx).catch((err) =>
      console.error('[seed-test] spatial error:', err),
    );

    res.status(202).json({
      ok: true,
      appId,
      title,
      trendTags: tags,
      capabilities: caps,
      status,
      message: 'Seeded — poll GET /api/app-agent/:appId/space or GET /api/app-agent/atlas for result',
    });
  } catch (err) {
    console.error('[app-agent] seed-test:', err);
    res.status(500).json({ error: 'Seed failed', detail: String(err) });
  }
});

// ─── POST /api/app-agent/init ────────────────────────────
appAgentRouter.post('/init', (req, res) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }
    const intent = typeof req.body?.intent === 'string' ? req.body.intent : undefined;
    const existing = getSessionByWallet(walletAddress);
    if (existing) {
      return res.json({
        sessionId: existing.sessionId,
        budget: existing.budgetEnvelope,
        intent: existing.intent,
        createdAt: existing.createdAt,
        alreadyInitialized: true,
      });
    }
    const session = createSession(walletAddress, intent);
    res.status(201).json({
      sessionId: session.sessionId,
      budget: session.budgetEnvelope,
      intent: session.intent,
      createdAt: session.createdAt,
    });
  } catch (err) {
    console.error('[app-agent] init:', err);
    res.status(500).json({ error: 'Init failed' });
  }
});

// ─── POST /api/app-agent/run-cycle ────────────────────────
appAgentRouter.post('/run-cycle', async (req, res) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }
    const result = await executeRunCycle(walletAddress, req.body?.intent);
    if (result.status === 'DEPLOYED') {
      createApp({
        appId: result.appId,
        status: result.status,
        idea: result.idea as Record<string, unknown>,
      });
    }
    res.json({
      appId: result.appId,
      status: result.status,
      idea: result.idea,
      budgetRemaining: result.budgetRemaining,
      pipelineLogs: result.pipelineLogs,
      baseNative: result.baseNative,
      // The agent's creative history — spatial context fed back from appSpatialStore
      evolutionContext: result.evolutionContext,
    });
  } catch (err) {
    console.error('[app-agent] run-cycle:', err);
    res.status(500).json({ error: 'Run-cycle failed' });
  }
});

// ─── POST /api/app-agent/generate ────────────────────────
appAgentRouter.post('/generate', async (req, res) => {
  try {
    const userIntent = typeof req.body?.userIntent === 'string' ? req.body.userIntent : undefined;
    const scan = await scanTrends(userIntent);
    const idea = generateIdea(scan, userIntent);
    res.json(idea);
  } catch (err) {
    console.error('[app-agent] generate:', err);
    res.status(500).json({ error: 'Generate failed' });
  }
});

// ─── POST /api/app-agent/validate ─────────────────────────
appAgentRouter.post('/validate', async (req, res) => {
  try {
    const idea = req.body;
    if (!idea?.id || !idea?.templateId || !Array.isArray(idea?.capabilities)) {
      return res.status(400).json({ error: 'Invalid AppIdea (id, templateId, capabilities required)' });
    }
    const result = await runAppSafetyPipeline(idea);
    res.json(result);
  } catch (err) {
    console.error('[app-agent] validate:', err);
    res.status(500).json({ error: 'Validate failed' });
  }
});

// ─── POST /api/app-agent/deploy ───────────────────────────
appAgentRouter.post('/deploy', async (req, res) => {
  try {
    const idea = req.body?.idea ?? req.body;
    const ownerWallet = req.body?.ownerWallet ?? '0x0000000000000000000000000000000000000000';
    if (!idea?.id || !idea?.templateId) {
      return res.status(400).json({ error: 'Invalid idea (id, templateId required)' });
    }
    const out = await deployApp(idea, ownerWallet);
    if (!out.ok) {
      return res.status(400).json({ ok: false, error: out.reason });
    }
    saveApp(out.app);

    // ─── Auto-trigger Blockade Labs skybox (fire-and-forget) ───
    // Kicks off background generation of the 360° spatial memory for
    // this app so the evolution atlas is populated automatically.
    const evolutionCtx = getEvolutionContext(8).filter((e) => e.appId !== out.app.id);
    generateAppSpatialMemory(out.app, idea as Record<string, unknown>, evolutionCtx).catch(
      (spatialErr) => console.error('[app-agent/deploy] spatial generation error:', spatialErr),
    );

    res.json({ ok: true, app: out.app, spatialStatus: 'generating' });
  } catch (err) {
    console.error('[app-agent] deploy:', err);
    res.status(500).json({ error: 'Deploy failed' });
  }
});

// ─── POST /api/app-agent/demo-meme-deploy ─────────────────
// Demo-only fast path: creates a synthetic "meme token template" deployed app
// without any LLM, provenance, or external service dependency.
appAgentRouter.post('/demo-meme-deploy', async (req, res) => {
  try {
    const walletAddress = typeof req.body?.walletAddress === 'string'
      ? req.body.walletAddress
      : '0x0000000000000000000000000000000000000001';

    const rpcUrl =
      process.env.BASE_SEPOLIA_RPC_URL ??
      process.env.BASE_RPC_URL ??
      process.env.RPC_URL ??
      'https://sepolia.base.org';
    const factoryAddress = (process.env.FACTORY_ADDRESS ??
      '0x3CA7b29aDB5BaA6d4D6De3B190129e2fCfF698A7') as `0x${string}`;
    const signerPk =
      process.env.SWARM_SIGNER_PRIVATE_KEY ??
      process.env.EXECUTION_SIGNER_PRIVATE_KEY;
    if (!signerPk) {
      return res.status(500).json({ ok: false, error: 'Missing signer private key in backend env' });
    }

    const signer = privateKeyToAccount(
      (signerPk.startsWith('0x') ? signerPk : `0x${signerPk}`) as `0x${string}`,
    );

    // Build calldata from a known-good factory call and randomize salt (word index 1).
    const freshSalt = randomBytes32Hex();
    const deployData = setWord(DEMO_MEME_DEPLOY_TEMPLATE as Hex, 1, freshSalt);

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
      account: signer,
    });

    const txHash = await walletClient.sendTransaction({
      to: factoryAddress,
      data: deployData,
      account: signer,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });
    const deployedTokenAddress =
      receipt.logs.find(
        (l) =>
          l.address.toLowerCase() !== factoryAddress.toLowerCase() &&
          (l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC),
      )?.address ??
      receipt.logs.find((l) => l.address.toLowerCase() !== factoryAddress.toLowerCase())?.address ??
      null;

    const now = Date.now();
    const appId = `meme-${crypto.randomUUID()}`;
    const idea = {
      id: `idea-${appId}`,
      title: 'Based Agent Coin',
      description: 'Demo MEME template deployment created from frontend trigger.',
      templateId: 'meme-token-v1',
      capabilities: ['erc20_transfer'],
      trendTags: ['base', 'meme', 'demo'],
      createdAt: now,
    };

    const app = {
      id: appId,
      ideaId: idea.id,
      deploymentUrl: deployedTokenAddress
        ? `https://sepolia.basescan.org/token/${deployedTokenAddress}`
        : `https://sepolia.basescan.org/tx/${txHash}`,
      status: APP_STATUS.INCUBATING,
      ownerWallet: walletAddress,
      createdAt: now,
      incubationStartedAt: now,
      deployedAt: new Date(now).toISOString(),
      title: idea.title,
      templateId: idea.templateId,
      idea,
      txHash,
      tokenAddress: deployedTokenAddress,
      chainId: 84532,
      metrics: {
        users: 12,
        revenueUsd: 2.5,
        impressions: 180,
        updatedAt: now,
      },
      revenueShareBps: 500,
    } as import('../appAgent/types.js').GeneratedApp & Record<string, unknown>;

    saveApp(app);

    createApp({
      appId,
      status: 'DEPLOYED',
      idea: idea as unknown as Record<string, unknown>,
    });

    return res.status(201).json({
      ok: true,
      app,
      txHash,
      tokenAddress: deployedTokenAddress,
      blockNumber: Number(receipt.blockNumber),
      message: 'Demo meme token deployed on Base Sepolia.',
    });
  } catch (err) {
    console.error('[app-agent] demo-meme-deploy:', err);
    return res.status(500).json({ ok: false, error: 'Demo meme deploy failed' });
  }
});

// ─── POST /api/app-agent/verify-budget (yield engine protection) ───────
// Receives LLM deployment proposal; returns structured JSON with checks and finalDecision (deploy true/false).
appAgentRouter.post('/verify-budget', (req, res) => {
  try {
    const body = req.body ?? {};
    const appName = typeof body.appName === 'string' ? body.appName : '';
    const requestedBudget = typeof body.requestedBudget === 'number' ? body.requestedBudget : Number(body.requestedBudget);
    const userBalance = typeof body.userBalance === 'number' ? body.userBalance : Number(body.userBalance);
    const token = typeof body.token === 'string' ? body.token : '';
    const slippage = typeof body.slippage === 'number' ? body.slippage : Number(body.slippage);
    const chainId = typeof body.chainId === 'number' ? body.chainId : Number(body.chainId);
    const currentDailyBurn = typeof body.currentDailyBurn === 'number' ? body.currentDailyBurn : undefined;

    if (Number.isNaN(requestedBudget)) {
      return res.status(400).json({ error: 'requestedBudget must be a number' });
    }

    const result = verifyYieldEngineProtection({
      appName,
      requestedBudget,
      userBalance: Number.isNaN(userBalance) ? 0 : userBalance,
      token,
      slippage: Number.isNaN(slippage) ? 0 : slippage,
      chainId: Number.isNaN(chainId) ? 0 : chainId,
      currentDailyBurn,
    });

    return res.json({
      appName: result.appName,
      requestedBudget: result.requestedBudget,
      checks: result.checks,
      finalDecision: result.finalDecision,
      blockReasons: result.blockReasons.length ? result.blockReasons : undefined,
    });
  } catch (err) {
    console.error('[app-agent] verify-budget:', err);
    res.status(500).json({ error: 'Verify-budget failed' });
  }
});

// ─── GET /api/app-agent/budget (runway + state) ───────────
appAgentRouter.get('/budget', (_req, res) => {
  const state = getBudgetState();
  const runway = estimateRunway(state.treasuryUsd, state.dailyBurnUsd);
  res.json({ ...state, runwayDays: runway });
});

// ─── GET /api/app-agent/apps (list) ───────────────────────
appAgentRouter.get('/apps', (_req, res) => {
  res.json({ apps: listApps() });
});

// ─── GET /api/app-agent/:appId/status ─────────────────────
appAgentRouter.get('/:appId/status', (req, res) => {
  const id = req.params.appId;
  const stateApp = getStateApp(id);
  if (stateApp) {
    return res.json({
      appId: stateApp.appId,
      status: stateApp.status,
      metrics: stateApp.metrics,
      supportStatus: stateApp.supportStatus,
    });
  }
  const app = getApp(id);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }
  const decision = evaluateAppPerformance(app, app.metrics);
  const supportStatus =
    app.status === APP_STATUS.HANDED_TO_USER
      ? 'HANDED_TO_USER'
      : app.status === APP_STATUS.DROPPED
        ? 'SUNSET'
        : 'ACTIVE';
  res.json({
    appId: app.id,
    status: app.status,
    metrics: {
      users: app.metrics.users,
      revenue: app.metrics.revenueUsd,
      impressions: app.metrics.impressions,
    },
    supportStatus,
    app,
    incubationDecision: decision,
  });
});

// ─── GET /api/app-agent/atlas ─────────────────────────────
// Returns the full evolution atlas: all spatial memories of past app creations.
// Used by the frontend to render the Blockade Labs 360° evolution map.
appAgentRouter.get('/atlas', (_req, res) => {
  try {
    const memories = listAllAppSpatialMemories();
    res.json({
      count: memories.length,
      atlas: memories,
      // Compact context view for LLM prompt injection
      evolutionContext: getEvolutionContext(10),
    });
  } catch (err) {
    console.error('[app-agent] atlas:', err);
    res.status(500).json({ error: 'Atlas retrieval failed' });
  }
});

// ─── GET /api/app-agent/:appId/space ────────────────────
// Returns the spatial memory for a specific app (if it exists).
appAgentRouter.get('/:appId/space', (req, res) => {
  try {
    const memory = loadAppSpatialMemory(req.params.appId);
    if (!memory) {
      return res.status(404).json({ error: 'No spatial memory for this app — generate one first.' });
    }
    res.json(memory);
  } catch (err) {
    console.error('[app-agent] space GET:', err);
    res.status(500).json({ error: 'Spatial memory retrieval failed' });
  }
});

// ─── POST /api/app-agent/:appId/space ───────────────────
// Generate (or regenerate) the Blockade Labs 360° skybox + spatial reasoning
// for the specified deployed app. Response is async — poll GET /:appId/space
// for status. Set { regenerate: true } in body to force regeneration.
appAgentRouter.post('/:appId/space', async (req, res) => {
  try {
    const id = req.params.appId;
    const regenerate = req.body?.regenerate === true;

    // Check existing (return immediately if cached and not forcing regeneration)
    const existing = loadAppSpatialMemory(id);
    if (existing && existing.status_spatial === 'complete' && !regenerate) {
      return res.json({ cached: true, memory: existing });
    }

    // Resolve the app record — try full GeneratedApp first, fall back to state record
    const app = getApp(id);
    const stateRecord = getStateApp(id);

    if (!app && !stateRecord) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Retrieve the raw idea from the state store (populated by run-cycle / deploy routes)
    const ideaRaw: Record<string, unknown> = stateRecord?.idea ?? {};

    // Build a minimal GeneratedApp if only state record is available (run-cycle path)
    const resolvedApp = app ?? {
      id,
      ideaId: (ideaRaw.id as string) ?? id,
      deploymentUrl: '',
      status: (stateRecord?.supportStatus === 'HANDED_TO_USER'
        ? APP_STATUS.HANDED_TO_USER
        : stateRecord?.supportStatus === 'SUNSET'
          ? APP_STATUS.DROPPED
          : APP_STATUS.INCUBATING),
      ownerWallet: '0x0',
      createdAt: stateRecord?.createdAt ?? Date.now(),
      incubationStartedAt: stateRecord?.createdAt ?? Date.now(),
      metrics: {
        users: stateRecord?.metrics.users ?? 0,
        revenueUsd: stateRecord?.metrics.revenue ?? 0,
        impressions: stateRecord?.metrics.impressions ?? 0,
        updatedAt: Date.now(),
      },
      revenueShareBps: 500,
    };

    // Pull evolution context for LLM 
    const evolutionCtx = getEvolutionContext(8).filter((e) => e.appId !== id);

    // Kick off generation (async — fire-and-forget, client polls GET /:appId/space)
    generateAppSpatialMemory(resolvedApp, ideaRaw, evolutionCtx).catch((err) => {
      console.error('[app-agent] space POST background error:', err);
    });

    res.status(202).json({
      status: 'processing',
      appId: id,
      message: 'Skybox generation started — poll GET /api/app-agent/:appId/space for result',
    });
  } catch (err) {
    console.error('[app-agent] space POST:', err);
    res.status(500).json({ error: 'Spatial generation failed' });
  }
});
