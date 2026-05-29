/**
 * Custom dataProvider for Jarvis Admin API.
 *
 * Translates Refine's CRUD conventions to the Admin API contract
 * defined in specs/admin-api.yaml (v0.2.0).
 *
 * Response shape: GET /admin/tenants → { data: [...], meta: { total, page, limit } }
 * Auth: Bearer JWT RS256 injected via getAuthHeader().
 */
import type { DataProvider } from "@refinedev/core";
import { API_URL } from "./constants";
import { getAuthHeader, getStoredToken } from "./auth";

// Central fetch wrapper with auth injection and error handling.
async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...(options.headers as Record<string, string>),
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as Record<string, string>).error ||
      (body as Record<string, string>).message ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return response;
}

// Map Refine resource names to Admin API paths.
function getResourcePath(resource: string): string {
  const map: Record<string, string> = {
    tenants: "/admin/tenants",
    jobs: "/admin/jobs",
    whatsapp: "/admin/whatsapp/status",
    audit: "/admin/audit",
    storage: "/admin/storage",
    config: "/admin/config",
    logs: "/admin/logs",
    tokens: "/admin/tokens/revoked",
    health: "/admin/health",
  };
  return map[resource] || `/admin/${resource}`;
}

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  getList: async ({ resource, pagination, filters }) => {
    const path = getResourcePath(resource);
    const params = new URLSearchParams();

    // Pagination: Refine sends { current, pageSize }
    const current = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 20;
    params.set("page", String(current));
    params.set("limit", String(pageSize));

    // Filters: translate CrudFilters to query params
    // Admin API accepts flat query params (e.g. state=active, tenant_id=...)
    if (filters) {
      for (const filter of filters) {
        if ("field" in filter && filter.operator === "eq") {
          params.set(filter.field, String(filter.value));
        }
      }
    }

    const url = `${API_URL}${path}?${params.toString()}`;
    const response = await fetchWithAuth(url);
    const json = await response.json();

    // Admin API returns { data: [...], meta: { total, page, limit } }
    // Jobs and WhatsApp return plain arrays
    if (Array.isArray(json)) {
      return { data: json, total: json.length };
    }

    return {
      data: json.data,
      total: json.meta?.total ?? json.data.length,
    };
  },

  getOne: async ({ resource, id }) => {
    const path = getResourcePath(resource);
    const url = `${API_URL}${path}/${id}`;
    const response = await fetchWithAuth(url);
    const data = await response.json();
    return { data };
  },

  create: async ({ resource, variables }) => {
    const path = getResourcePath(resource);
    const url = `${API_URL}${path}`;
    const response = await fetchWithAuth(url, {
      method: "POST",
      body: JSON.stringify(variables),
    });
    const data = await response.json();
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const path = getResourcePath(resource);
    const url = `${API_URL}${path}/${id}`;
    const response = await fetchWithAuth(url, {
      method: "PATCH",
      body: JSON.stringify(variables),
    });
    const data = await response.json();
    return { data };
  },

  deleteOne: async ({ resource, id, meta }) => {
    const path = getResourcePath(resource);
    // Admin API requires ?confirm=true for destructive operations
    let url = `${API_URL}${path}/${id}?confirm=true`;
    if (meta?.purge) {
      url += "&purge=true";
    }
    const response = await fetchWithAuth(url, { method: "DELETE" });
    const data = await response.json();
    return { data };
  },

  getMany: async ({ resource, ids }) => {
    // Admin API has no batch endpoint; fan out individual requests
    const results = await Promise.all(
      ids.map(async (id) => {
        const path = getResourcePath(resource);
        const url = `${API_URL}${path}/${id}`;
        const response = await fetchWithAuth(url);
        return response.json();
      })
    );
    return { data: results };
  },

  // Not implemented — Admin API does not support batch mutations
  createMany: undefined as never,
  updateMany: undefined as never,
  deleteMany: undefined as never,

  custom: async ({ url, method, meta, payload, query }) => {
    // Use meta.rawUrl for non-CRUD endpoints (e.g., /admin/dashboard/summary)
    const targetUrl = meta?.rawUrl
      ? `${API_URL}${meta.rawUrl}`
      : url;

    const params = query ? `?${new URLSearchParams(query as Record<string, string>).toString()}` : '';
    const fullUrl = `${targetUrl}${params}`;

    const options: RequestInit = {
      method: (method || 'get').toUpperCase(),
    };

    if (payload && method !== 'get') {
      options.body = JSON.stringify(payload);
    }

    const response = await fetchWithAuth(fullUrl, options);
    const data = await response.json();
    return { data };
  },
};
