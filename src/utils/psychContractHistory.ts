import {
  loadData,
  saveData,
  normalizePsychContractHistory,
  MAX_HISTORY_CONTRACT_RECORDS,
  MAX_HISTORY_SCENARIO_RECORDS,
  MAX_HISTORY_SCENARIOS_PER_CONTRACT,
} from './storage';
import { cloudSync } from './cloudSync';
import type { NastiaData, PsychContractHistory } from '../types';

const EMPTY_HISTORY: PsychContractHistory = {
  contracts: [],
  scenarios: [],
};

let historyCache: PsychContractHistory | null = null;
let pendingCloudSync = false;
let queuedCloudSync = false;
let latestSyncPayload: NastiaData | null = null;

function cloneHistory(history: PsychContractHistory): PsychContractHistory {
  return {
    contracts: history.contracts.map(item => ({ ...item })),
    scenarios: history.scenarios.map(item => ({ ...item })),
  };
}

function createDefaultData(): NastiaData {
  return {
    cycles: [],
    settings: {
      averageCycleLength: 28,
      periodLength: 5,
      notifications: true,
    },
    horoscopeMemory: [],
    psychContractHistory: cloneHistory(EMPTY_HISTORY),
  };
}

function ensureHistory(): PsychContractHistory {
  if (historyCache) {
    return historyCache;
  }

  const stored = loadData();
  const normalized = normalizePsychContractHistory(stored?.psychContractHistory);
  historyCache = cloneHistory(normalized);
  return historyCache;
}

function buildSyncPayload(data: NastiaData): NastiaData {
  return {
    ...data,
    cycles: data.cycles.map(cycle => ({ ...cycle })),
    settings: { ...data.settings },
    horoscopeMemory: data.horoscopeMemory ?? [],
    psychContractHistory: cloneHistory(data.psychContractHistory ?? EMPTY_HISTORY),
  };
}

function scheduleCloudSync(data: NastiaData): void {
  if (!cloudSync.isConfigured()) {
    return;
  }

  latestSyncPayload = buildSyncPayload(data);

  if (pendingCloudSync) {
    queuedCloudSync = true;
    return;
  }

  const payload = latestSyncPayload;
  if (!payload) {
    return;
  }

  pendingCloudSync = true;
  void (async () => {
    try {
      await cloudSync.uploadToCloud(payload);
    } catch (error) {
      console.warn('[psychContractHistory] Failed to sync with cloud', error);
    } finally {
      pendingCloudSync = false;
      if (queuedCloudSync && latestSyncPayload) {
        queuedCloudSync = false;
        scheduleCloudSync(latestSyncPayload);
      }
    }
  })();
}

function persistHistory(history: PsychContractHistory, options?: { skipCloud?: boolean }) {
  historyCache = cloneHistory(history);
  const stored = loadData();
  const baseData: NastiaData = stored
    ? {
        ...stored,
        horoscopeMemory: stored.horoscopeMemory ?? [],
        psychContractHistory: historyCache,
      }
    : createDefaultData();

  baseData.psychContractHistory = cloneHistory(historyCache);
  saveData(baseData);

  if (!options?.skipCloud) {
    scheduleCloudSync(baseData);
  }
}

function limitScenarios(
  entries: PsychContractHistory['scenarios'],
  added?: { contractId: string; scenarioId: string; usedAt: string },
): PsychContractHistory['scenarios'] {
  const pool = [...entries];
  if (added) {
    pool.unshift(added);
  }

  const result: PsychContractHistory['scenarios'] = [];
  const perContract = new Map<string, number>();

  for (const entry of pool) {
    const key = `${entry.contractId}:${entry.scenarioId}`;
    const alreadyIncluded = result.some(
      stored => stored.contractId === entry.contractId && stored.scenarioId === entry.scenarioId,
    );
    if (alreadyIncluded) {
      continue;
    }

    const count = perContract.get(entry.contractId) ?? 0;
    if (count >= MAX_HISTORY_SCENARIOS_PER_CONTRACT) {
      continue;
    }

    result.push({ ...entry });
    perContract.set(entry.contractId, count + 1);

    if (result.length >= MAX_HISTORY_SCENARIO_RECORDS) {
      break;
    }
  }

  return result;
}

export function hydratePsychContractHistory(raw?: PsychContractHistory | null): void {
  const normalized = normalizePsychContractHistory(raw);
  persistHistory(normalized, { skipCloud: true });
}

export function getRecentContractIds(limit = 5): string[] {
  const history = ensureHistory();
  return history.contracts.slice(0, limit).map(entry => entry.id);
}

export function getRecentScenarioIds(contractId: string, limit = 3): string[] {
  if (!contractId) {
    return [];
  }
  const history = ensureHistory();
  return history.scenarios
    .filter(entry => entry.contractId === contractId)
    .slice(0, limit)
    .map(entry => entry.scenarioId);
}

export function getPsychContractHistorySnapshot(): PsychContractHistory {
  return cloneHistory(ensureHistory());
}

export function rememberContractUsage(contractId: string, scenarioId?: string): void {
  if (!contractId) {
    return;
  }

  const history = ensureHistory();
  const nowIso = new Date().toISOString();

  const contracts = [
    { id: contractId, usedAt: nowIso },
    ...history.contracts.filter(entry => entry.id !== contractId),
  ].slice(0, MAX_HISTORY_CONTRACT_RECORDS);

  let scenarios = history.scenarios.filter(
    entry => !(entry.contractId === contractId && entry.scenarioId === scenarioId),
  );

  if (scenarioId) {
    scenarios = limitScenarios(scenarios, {
      contractId,
      scenarioId,
      usedAt: nowIso,
    });
  } else {
    scenarios = limitScenarios(scenarios);
  }

  persistHistory({ contracts, scenarios });
}

export function resetContractHistory(): void {
  persistHistory(cloneHistory(EMPTY_HISTORY));
}
