interface CachedVideo {
  id: string;
  url: string;
  data: Blob;
  timestamp: number;
  size: number;
}

const DB_NAME = 'kvTiktokCache';
const STORE_NAME = 'videos';
const MAX_CACHE_SIZE_MB = 200;
const CACHE_TTL_HOURS = 24;

class VideoCache {
  private db: IDBDatabase | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        this.cleanup();
        resolve();
      };

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async get(url: string): Promise<Blob | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    const videoId = this.getVideoId(url);

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(videoId);

        request.onsuccess = () => {
          const cached = request.result as CachedVideo | undefined;
          if (cached) {
            const ageHours = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
            if (ageHours < CACHE_TTL_HOURS) {
              resolve(cached.data);
              return;
            }
            this.delete(videoId);
          }
          resolve(null);
        };

        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async set(url: string, blob: Blob): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    const videoId = this.getVideoId(url);
    const cached: CachedVideo = {
      id: videoId,
      url,
      data: blob,
      timestamp: Date.now(),
      size: blob.size
    };

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(cached);

        request.onsuccess = () => {
          this.cleanup();
          resolve();
        };

        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async delete(videoId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(videoId);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getStats(): Promise<{ size_mb: number; count: number }> {
    if (!this.db) return { size_mb: 0, count: 0 };

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const cached = request.result as CachedVideo[];
          const totalSize = cached.reduce((sum, v) => sum + v.size, 0);
          resolve({
            size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
            count: cached.length
          });
        };

        request.onerror = () => resolve({ size_mb: 0, count: 0 });
      } catch {
        resolve({ size_mb: 0, count: 0 });
      }
    });
  }

  private async cleanup(): Promise<void> {
    if (!this.db) return;

    const stats = await this.getStats();
    if (stats.size_mb < MAX_CACHE_SIZE_MB) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const cached = (request.result as CachedVideo[]).sort(
            (a, b) => a.timestamp - b.timestamp
          );

          let totalSize = cached.reduce((sum, v) => sum + v.size, 0);
          const targetSize = MAX_CACHE_SIZE_MB * 1024 * 1024 * 0.8;

          for (const video of cached) {
            if (totalSize <= targetSize) break;
            const deleteReq = store.delete(video.id);
            deleteReq.onsuccess = () => {
              totalSize -= video.size;
            };
          }

          resolve();
        };

        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private getVideoId(url: string): string {
    const match = url.match(/video\/(\d+)|id=([^&]+)/);
    return match ? match[1] || match[2] : url.substring(0, 50);
  }
}

export const videoCache = new VideoCache();
