export interface MiniGameBuildOptions {
  outDir?: string;
  appId?: string;
  apiBaseUrl?: string;
  voiceEnabled?: boolean;
  maxBytes?: number;
}
export function buildMiniGame(options?: MiniGameBuildOptions): Promise<{ outDir: string; size: number; appId: string; apiBaseUrl: string; voiceEnabled: boolean }>;
