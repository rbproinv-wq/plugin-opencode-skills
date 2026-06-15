import type { ActiveSkillTrack } from "./types.js";

const ACTIVE_KEY = "opencode-skills:active";

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class SkillTracker {
  constructor(private kv: KvStore) {}

  async start(name: string, query: string, sessionID?: string): Promise<void> {
    const tracks = await this.getAll();
    tracks.push({ skillName: name, taskQuery: query, startedAt: Date.now(), messageID: sessionID });
    await this.save(tracks);
  }

  async active(name: string, sessionID?: string): Promise<void> {
    const tracks = await this.getAll();
    const track = tracks.find(t => t.skillName === name && t.messageID === sessionID);
    if (track) track.startedAt = Date.now();
    await this.save(tracks);
  }

  async complete(name: string, sessionID?: string): Promise<void> {
    const tracks = await this.getAll();
    const remaining = tracks.filter(t => !(t.skillName === name && t.messageID === sessionID));
    await this.save(remaining);
  }

  async getAll(): Promise<ActiveSkillTrack[]> {
    try {
      const raw = await this.kv.get(ACTIVE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async save(tracks: ActiveSkillTrack[]): Promise<void> {
    await this.kv.set(ACTIVE_KEY, JSON.stringify(tracks));
  }

  async reset(): Promise<void> {
    await this.kv.set(ACTIVE_KEY, JSON.stringify([]));
  }
}
