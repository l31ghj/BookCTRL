import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface FlareSolverrResult {
  url: string;
  status?: number;
  headers: Record<string, string>;
  data: string;
}

@Injectable()
export class FlareSolverrService {
  private readonly baseUrl = process.env.FLARESOLVERR_URL?.trim();
  private readonly logger = new Logger(FlareSolverrService.name);

  isEnabled() {
    return !!this.baseUrl;
  }

  /**
   * Fetch a URL via FlareSolverr, using a short-lived session to keep cookies/UA consistent.
   * Falls back to undefined so caller can try direct fetch.
   */
  async fetch(
    url: string,
    timeoutMs = 30000,
  ): Promise<FlareSolverrResult | undefined> {
    if (!this.baseUrl) return;

    const sessionId = await this.createSession(timeoutMs).catch((err) => {
      this.logger.warn(`FlareSolverr session create failed: ${err?.message || err}`);
      return undefined;
    });
    if (!sessionId) return;

    try {
      const res = await this.request(
        {
          cmd: 'request.get',
          url,
          session: sessionId,
          maxTimeout: timeoutMs,
        },
        timeoutMs,
      );

      if (!res || res.status !== 'ok' || !res.solution) {
        this.logger.debug(`FlareSolverr returned non-ok status: ${res?.status} ${res?.message || ''}`);
        return;
      }

      const solution = res.solution;
      return {
        url: solution.url || url,
        status: solution.status,
        headers: solution.headers || {},
        data: solution.response || '',
      };
    } catch (err: any) {
      const message = err?.message || 'Unknown FlareSolverr error';
      this.logger.debug(`FlareSolverr request failed: ${message}`);
      return;
    } finally {
      await this.destroySession(sessionId).catch((err) => {
        this.logger.warn(`FlareSolverr session destroy failed: ${err?.message || err}`);
      });
    }
  }

  private async createSession(timeoutMs: number): Promise<string> {
    const res = await this.request({ cmd: 'sessions.create' }, timeoutMs);
    if (res?.status !== 'ok' || !res.session) {
      throw new Error(res?.message || 'Failed to create session');
    }
    return res.session;
  }

  private async destroySession(session: string): Promise<void> {
    await this.request({ cmd: 'sessions.destroy', session });
  }

  private async request(
    payload: Record<string, any>,
    timeoutMs = 30000,
  ): Promise<any> {
    const endpoint = `${this.baseUrl?.replace(/\/$/, '')}/v1`;
    try {
      const res = await axios.post(endpoint, payload, { timeout: timeoutMs + 2000 });
      return res.data;
    } catch (err: any) {
      const message = err?.message || 'Unknown FlareSolverr error';
      this.logger.debug(`FlareSolverr HTTP error: ${message}`);
      throw err;
    }
  }
}
