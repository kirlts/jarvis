import { DataProvider, BaseRecord, CreateResponse, DeleteOneResponse, GetListResponse, GetOneResponse, UpdateResponse, HttpError } from "@refinedev/core";
import { API_URL, getAuthHeaders } from "./constants";

export const dataProvider: DataProvider = {
  getList: async ({ resource, pagination, filters, sorters, meta }) => {
    let url = `${API_URL}/admin/${resource}`;
    const params = new URLSearchParams();

    if (pagination) {
      if (pagination.current) params.append("page", String(pagination.current));
      if (pagination.pageSize) params.append("limit", String(pagination.pageSize));
    }

    if (filters) {
      filters.forEach((filter) => {
        if ("field" in filter && filter.value !== undefined) {
          if (filter.field === 'q') params.append('search', filter.value);
          else params.append(filter.field, filter.value);
        }
      });
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, { headers: getAuthHeaders() });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw {
            message: err.message || response.statusText,
            statusCode: response.status
        } as HttpError;
    }

    const data = await response.json();

    if (resource === 'whatsapp/status' || resource === 'dashboard/summary' || resource.includes('metrics') || resource.includes('queues')) {
         return {
            data: data.data || data,
            total: (data.data || data).length
        } as GetListResponse<any>;
    }

    if (data.data) {
        return {
            data: data.data,
            total: data.meta?.total || data.data.length,
        };
    }

    // For direct array responses
    return {
        data: data,
        total: data.length,
    };
  },
  getOne: async ({ resource, id, meta }) => {
    const response = await fetch(`${API_URL}/admin/${resource}/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw {
            message: err.message || response.statusText,
            statusCode: response.status
        } as HttpError;
    }
    const data = await response.json();
    return { data };
  },
  create: async ({ resource, variables, meta }) => {
    const response = await fetch(`${API_URL}/admin/${resource}`, {
      method: "POST",
      body: JSON.stringify(variables),
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw {
            message: err.message || response.statusText,
            statusCode: response.status
        } as HttpError;
    }
    const data = await response.json();
    return { data } as CreateResponse<any>;
  },
  update: async ({ resource, id, variables, meta }) => {
    const response = await fetch(`${API_URL}/admin/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(variables),
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw {
            message: err.message || response.statusText,
            statusCode: response.status
        } as HttpError;
    }
    const data = await response.json();
    return { data } as UpdateResponse<any>;
  },
  deleteOne: async ({ resource, id, variables, meta }) => {
    const response = await fetch(`${API_URL}/admin/${resource}/${id}?confirm=true`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw {
            message: err.message || response.statusText,
            statusCode: response.status
        } as HttpError;
    }
    const data = await response.json();
    return { data } as DeleteOneResponse<any>;
  },
  custom: async ({ url, method, filters, sorters, payload, query, headers }) => {
      let requestUrl = `${API_URL}/admin/${url}`;

      if (query) {
        const params = new URLSearchParams();
        Object.keys(query).forEach((key) => {
            params.append(key, query[key]);
        });
        requestUrl += `?${params.toString()}`;
      }

      const response = await fetch(requestUrl, {
          method: method,
          body: payload ? JSON.stringify(payload) : undefined,
          headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
              ...headers
          }
      });

      if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw {
              message: err.message || response.statusText,
              statusCode: response.status
          } as HttpError;
      }

      const data = await response.json();
      return { data };
  },
  getApiUrl: () => API_URL,
};
