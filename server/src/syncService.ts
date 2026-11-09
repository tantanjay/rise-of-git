import { DeveloperKingdom, ActivityEvent } from "./types.js";
import { config } from "./env.js";
import { countHarvests, executeResourceAllocation, getLastHarvestTime } from "./db.js";
import { chargeMercUpkeep } from "./mercenaries.js";
import { chargeArmoryUpkeep } from "./armory.js";
import { syncNethergardeSpires, runWarTick, regenerateSpireGarrisons, resetOverseers, chargeGateDuty } from "./warEngine.js";
import { harvestNpcKingdoms, pruneNpcKingdoms, pruneWorldNpcState } from "./worldNpcs.js";
import { MARCH } from "./warConfig.js";

/** How often the clock checks whether a harvest is due */
const TICK_MS = 30_000;

/**
 * The single resource-harvest clock. Exactly one harvest per interval:
 * - the last harvest time is read from SQLite, so restarts never trigger an extra harvest
 * - after downtime it catches up with one harvest, not one per missed interval
 * Git data refreshes (scheduled or "Sync Now") never harvest on their own.
 */
export class SyncService {
  private syncIntervalMinutes = config.syncIntervalMinutes;
  private intervalMs = this.syncIntervalMinutes * 60 * 1000;
  private lastHarvestAt = Date.now();
  private kingdomsRef: DeveloperKingdom[] = [];
  private logCallback: (text: string, type: ActivityEvent["type"]) => void = () => {};

  init(kingdoms: DeveloperKingdom[], logCallback: (text: string, type: ActivityEvent["type"]) => void) {
    this.kingdomsRef = kingdoms;
    this.logCallback = logCallback;
    this.lastHarvestAt = getLastHarvestTime() ?? Date.now();

    // Special Overseers start at full strength with their preset treasury
    try {
      resetOverseers();
    } catch (err) {
      console.error("Failed to reset Special Overseers:", err);
    }

    // Initial sync of Nethergarde contested spires
    try {
      syncNethergardeSpires(this.kingdomsRef);
    } catch (err) {
      console.error("Failed to initialize Nethergarde spires:", err);
    }

    // Fast war tick: battles resolve as soon as an army arrives
    setInterval(() => {
      try {
        runWarTick(this.kingdomsRef, this.logCallback);
      } catch (err) {
        console.error("Error during war resolution tick:", err);
      }
    }, MARCH.RESOLVE_TICK_MS);

    // Harvest clock interval
    setInterval(() => {
      // Automated resource harvest. A harvest that fails waits for the next interval rather than retrying: part of it may already be paid
      try {
        if (Date.now() - this.lastHarvestAt >= this.intervalMs) this.runAutomatedSync();
      } catch (err) {
        console.error("Error during the realm harvest:", err);
      }
    }, TICK_MS);
  }

  getSyncStatus() {
    const nextSyncSeconds = Math.max(0, Math.ceil((this.lastHarvestAt + this.intervalMs - Date.now()) / 1000));
    return {
      lastSyncTime: new Date(this.lastHarvestAt).toLocaleTimeString(),
      nextSyncSeconds,
      syncIntervalMinutes: this.syncIntervalMinutes
    };
  }

  /** The harvest window running now: day or night by how many harvests came before it (GAME_GUIDE §7) */
  currentWindow() {
    return { startedAt: this.lastHarvestAt, lengthMs: this.intervalMs, harvestsSoFar: countHarvests() };
  }

  /**
   * Resource harvest: shares the fixed pool (Gold 1k, Iron 25k, Lumber 100k, Food 250k + one
   * scarce drop) by the past week of Git activity, with remainders handed out round-robin.
   */
  runAutomatedSync() {
    this.lastHarvestAt = Date.now();
    if (this.kingdomsRef.length === 0) {
      return { success: false, totalHarvested: 0, timestamp: new Date().toISOString() };
    }

    const result = executeResourceAllocation(this.kingdomsRef);
    regenerateSpireGarrisons();
    // NPC kingdoms regrow by births and refill their treasury; Overseers respawn (and their Resolve resets on a new week)
    harvestNpcKingdoms();
    // Troops on frontier-gate duty cost their rulers food, lumber, stone and iron each harvest
    chargeGateDuty();
    // 🪙 Mercenary bands cost their upkeep (unpaid twice running, a band deserts)
    chargeMercUpkeep();
    // 🗡️ Forged sets cost their upkeep (what the treasury can't pay rusts back to the stock pile)
    chargeArmoryUpkeep();
    resetOverseers();
    pruneWorldNpcState();
    // Realms that moved on or crumbled away leave no row behind
    pruneNpcKingdoms(this.kingdomsRef);
    if (!result) {
      return { success: false, totalHarvested: 0, timestamp: new Date().toISOString() };
    }

    const { pool, scarceDef } = result;
    const totalHarvested = pool.gold + pool.iron + pool.stone + pool.lumber + pool.food + (scarceDef?.pool ?? 0);

    this.logCallback(
      `🌾 ${this.syncIntervalMinutes}-Minute Realm Harvest: Distributed Base Pool (Gold, Iron, Stone, Lumber, Food) + Rare Scarce Drop: ${scarceDef.emblem} ${scarceDef.name} (${scarceDef.pool.toLocaleString()} pool, min 1/dev)!`,
      "harvest"
    );

    return { success: true, pool, scarceDef, totalHarvested, timestamp: new Date().toISOString() };
  }

  executeHarvest() {
    return this.runAutomatedSync();
  }
}

export const syncService = new SyncService();
