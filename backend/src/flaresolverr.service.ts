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

  async get(
    url: string,
    _headers: Record<string, string> = {},
    timeoutMs = 20000,
  ): Promise<FlareSolverrResult | undefined> {
    if (!this.baseUrl) return;

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/v1`;
    const payload = {
      cmd: 'request.get',
      url,
      maxTimeout: timeoutMs,
    };

    try {
      const res = await axios.post(endpoint, payload, { timeout: timeoutMs + 2000 });
      const solution = res.data?.solution;
      if (!solution) {
        throw new Error('FlareSolverr returned no solution');
      }
      return {
        url: solution.url || url,
        status: solution.status,
        headers: solution.headers || {},
        data: solution.response || '',
      };
    } catch (err: any) {
      const message = err?.message || 'Unknown FlareSolverr error';
      this.logger.warn(`FlareSolverr request failed: ${message}`);
      throw err;
    }
  }
}
