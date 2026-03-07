import { NextResponse } from 'next/server'

/** Standardized API error with status code */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Return a consistent JSON error response */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.status }
    )
  }

  if (error instanceof Error) {
    const status = (error as any).status || 500
    return NextResponse.json(
      { error: error.message },
      { status }
    )
  }

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}

/** Common error factories */
export const Errors = {
  unauthorized: (msg = 'Authentication required') => new ApiError(msg, 401, 'UNAUTHORIZED'),
  forbidden: (msg = 'Access denied') => new ApiError(msg, 403, 'FORBIDDEN'),
  notFound: (msg = 'Not found') => new ApiError(msg, 404, 'NOT_FOUND'),
  badRequest: (msg = 'Bad request') => new ApiError(msg, 400, 'BAD_REQUEST'),
  conflict: (msg = 'Conflict') => new ApiError(msg, 409, 'CONFLICT'),
  internal: (msg = 'Internal server error') => new ApiError(msg, 500, 'INTERNAL'),
}
