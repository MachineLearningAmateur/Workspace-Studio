import type { ActivityInput, ActivityRow } from "../types/tracker";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }

  return response.json();
}

export function getActivityRows() {
  return request<ActivityRow[]>("/api/tracker");
}

export function addActivityRow(input: ActivityInput) {
  return request<ActivityRow>("/api/tracker", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateActivityRow(rowIndex: number, input: ActivityInput) {
  return request<ActivityRow>(`/api/tracker/${rowIndex}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
