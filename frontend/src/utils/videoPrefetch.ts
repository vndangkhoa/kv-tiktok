import { videoCache } from './videoCache';
import type { Video } from '../types';

interface PrefetchConfig {
  lookahead: number;
  concurrency: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: PrefetchConfig = {
  lookahead: 3,        // Increased from 2 for better buffering
  concurrency: 2,      // Increased from 1 for parallel downloads
  timeoutMs: 30000
};

class VideoPrefetcher {
  private prefetchQueue: Set<string> = new Set();
  private config: PrefetchConfig;
  private isInitialized = false;

  constructor(config: Partial<PrefetchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await videoCache.init();
    this.isInitialized = true;
  }

  async prefetchNext(
    videos: Video[],
    currentIndex: number
  ): Promise<void> {
    if (!this.isInitialized) await this.init();

    const endIndex = Math.min(
      currentIndex + this.config.lookahead,
      videos.length
    );

    const toPrefetch = videos
      .slice(currentIndex + 1, endIndex)
      .filter((v) => v.url && !this.prefetchQueue.has(v.id));

    for (const video of toPrefetch) {
      this.prefetchQueue.add(video.id);
      this.prefetchVideo(video).catch(console.error);
    }
  }

  /**
   * Prefetch initial batch of videos immediately after feed loads.
   * This ensures first few videos are ready before user starts scrolling.
   */
  async prefetchInitialBatch(
    videos: Video[],
    count: number = 3
  ): Promise<void> {
    if (!this.isInitialized) await this.init();
    if (videos.length === 0) return;

    console.log(`PREFETCH: Starting initial batch of ${Math.min(count, videos.length)} videos...`);

    const toPrefetch = videos
      .slice(0, count)
      .filter((v) => v.url && !this.prefetchQueue.has(v.id));

    // Start all prefetches in parallel (respects concurrency via browser limits)
    const promises = toPrefetch.map((video) => {
      this.prefetchQueue.add(video.id);
      return this.prefetchVideo(video);
    });

    await Promise.allSettled(promises);
    console.log(`PREFETCH: Initial batch complete (${toPrefetch.length} videos buffered)`);
  }

  private async prefetchVideo(video: Video): Promise<void> {
    if (!video.url) return;

    const cached = await videoCache.get(video.url);
    if (cached) {
      this.prefetchQueue.delete(video.id);
      return;
    }

    const API_BASE_URL_CONFIG = (await import('../config')).API_BASE_URL;
    const API_BASE_URL = API_BASE_URL_CONFIG || 'http://localhost:8002/api'; // Fallback if import fails
    const fullProxyUrl = `${API_BASE_URL}/feed/proxy?url=${encodeURIComponent(video.url)}`;
    // Use thin proxy if available for better performance
    const thinProxyUrl = video.cdn_url ? `${API_BASE_URL}/feed/thin-proxy?cdn_url=${encodeURIComponent(video.cdn_url)}` : null;
    const targetUrl = thinProxyUrl || fullProxyUrl;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs
      );

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { Range: 'bytes=0-1048576' }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const blob = await response.blob();
        await videoCache.set(video.url, blob);
      }
    } catch (error) {
      console.debug(`Prefetch failed for ${video.id}:`, error);
    } finally {
      this.prefetchQueue.delete(video.id);
    }
  }

  clearQueue(): void {
    this.prefetchQueue.clear();
  }

  getQueueSize(): number {
    return this.prefetchQueue.size;
  }
}

export const videoPrefetcher = new VideoPrefetcher();
