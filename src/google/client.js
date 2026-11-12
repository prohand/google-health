// -----------------------------------------------------------------------------
// Google Health API client (https://health.googleapis.com/v4), read-only.
//
// Plain `fetch`, no dependency. The access token comes from the caller
// (`getAccessToken`), which refreshes it: on a 401 the client asks for a new
// one, once, and retries.
// -----------------------------------------------------------------------------

export const API_BASE_URL = 'https://health.googleapis.com/v4';

const REQUEST_TIMEOUT_MS = 20 * 1000;

/** An error answered by the Google Health API. */
export class HealthApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message message of the API
   * @param {object} [details]
   * @param {string} [details.code] canonical status, e.g. PERMISSION_DENIED
   * @param {string} [details.reason] ErrorInfo reason, e.g. ACCOUNT_NOT_LINKED
   */
  constructor(status, message, { code, reason } = {}) {
    super(message);
    this.name = 'HealthApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

async function toApiError(response) {
  const body = await response.json().catch(() => ({}));
  const error = body?.error ?? {};
  const info = (error.details ?? []).find((detail) => typeof detail?.reason === 'string');
  return new HealthApiError(response.status, error.message || `HTTP ${response.status}`, {
    code: error.status,
    reason: info?.reason,
  });
}

/** `2026-03-04` -> `{ year: 2026, month: 3, day: 4 }` (JSON integers). */
function civilDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

const MIDNIGHT = { hours: 0, minutes: 0, seconds: 0, nanos: 0 };

/**
 * @param {object} options
 * @param {(force?: boolean) => Promise<string>} options.getAccessToken
 *   resolves a valid access token; `force` asks for a brand new one
 * @param {typeof fetch} [options.fetch]
 */
export function createHealthClient({ getAccessToken, fetch: fetchImpl = fetch }) {
  async function send(method, path, { query, body } = {}, force = false) {
    const token = await getAccessToken(force);
    const url = new URL(`${API_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Google Health API unreachable: ${err.message}`, { cause: err });
    }
    if (response.status === 401 && !force) {
      // The token expired earlier than announced, or was revoked.
      return send(method, path, { query, body }, true);
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    return response.json();
  }

  return {
    /** `{ healthUserId, legacyUserId }`: who the token belongs to. */
    getIdentity() {
      return send('GET', '/users/me/identity');
    },

    /**
     * Data points of one type, newest first.
     * @param {string} dataType kebab-case, e.g. `heart-rate`
     * @param {object} [options]
     * @param {string} [options.filter] AIP-160 filter
     * @param {number} [options.pageSize]
     * @returns {Promise<object[]>} the data points of the first page
     */
    async listDataPoints(dataType, { filter, pageSize } = {}) {
      const body = await send('GET', `/users/me/dataTypes/${dataType}/dataPoints`, {
        query: { filter, pageSize },
      });
      return Array.isArray(body.dataPoints) ? body.dataPoints : [];
    },

    /**
     * One value per civil day, from `startDate` to `endDate` included.
     * @param {string} dataType kebab-case
     * @param {string} startDate `YYYY-MM-DD`, first day
     * @param {string} endDateExclusive `YYYY-MM-DD`, the day AFTER the last one
     * @returns {Promise<object[]>} the roll-up points
     */
    async dailyRollUp(dataType, startDate, endDateExclusive) {
      const body = await send('POST', `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
        body: {
          range: {
            start: { date: civilDate(startDate), time: MIDNIGHT },
            end: { date: civilDate(endDateExclusive), time: MIDNIGHT },
          },
          windowSizeDays: 1,
        },
      });
      return Array.isArray(body.rollupDataPoints) ? body.rollupDataPoints : [];
    },
  };
}
