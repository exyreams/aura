export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function toApiError(error: unknown) {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return new ApiError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }

  return new ApiError(
    500,
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : "Unexpected server error.",
  );
}
