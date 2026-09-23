export const TOKEN_KEY = "sit313.hd1.token";
export const SESSION_ENDED = "sit313-hd1-session-ended";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      "Could not confirm the result. Check the current state before retrying.",
      0,
    );
  }
  const data = await response
    .json()
    .catch(() => ({ message: "Unexpected server response." }));
  if (
    response.status === 401 &&
    token &&
    path !== "/auth/login" &&
    localStorage.getItem(TOKEN_KEY) === token
  ) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event(SESSION_ENDED));
  }
  if (!response.ok)
    throw new ApiError(
      data.message || "Request failed.",
      response.status,
      data.errors,
    );
  return data;
}
export const json = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
});
