/**
 * Crane Context Worker - Request Validation
 *
 * JSON Schema validation using Ajv for all API endpoints.
 * Implements validation patterns from ADR 025.
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { ValidateFunction } from 'ajv'
import type { ValidationErrorResponse } from './types'
import { schemas, type EndpointPath } from './schemas'
import { validationErrorResponse } from './utils'

// ============================================================================
// Ajv Instance Setup
// ============================================================================

/**
 * Create and configure Ajv instance
 * Singleton pattern - created once and reused
 */
let ajvInstance: Ajv | null = null

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true, // Return all validation errors, not just first
      removeAdditional: false, // Don't remove additional properties (we use additionalProperties: false)
      useDefaults: true, // Apply default values from schema
      coerceTypes: false, // Don't coerce types (strict validation)
      strict: true, // Enable strict mode for schema compilation
    })

    // Add format validators (date-time, email, uri, etc.)
    addFormats(ajvInstance)
  }

  return ajvInstance
}

// ============================================================================
// Validator Cache
// ============================================================================

/**
 * Cache of compiled validators by endpoint
 * Validators are compiled once and reused for performance
 */
const validatorCache: Map<EndpointPath, ValidateFunction> = new Map()

/**
 * Get or create validator for an endpoint
 *
 * @param endpoint - API endpoint path
 * @returns Compiled Ajv validator function
 */
function getValidator(endpoint: EndpointPath): ValidateFunction {
  if (!validatorCache.has(endpoint)) {
    const ajv = getAjv()
    const schema = schemas[endpoint]
    const validator = ajv.compile(schema)
    validatorCache.set(endpoint, validator)
  }

  return validatorCache.get(endpoint)!
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate request body against schema
 *
 * @param endpoint - API endpoint path
 * @param body - Parsed request body (should be unknown type from JSON.parse)
 * @param correlationId - Correlation ID for error responses
 * @returns null if valid, Response with validation errors if invalid
 */
export function validateRequestBody(
  endpoint: EndpointPath,
  body: unknown,
  correlationId: string
): Response | null {
  const validator = getValidator(endpoint)

  // Run validation
  const valid = validator(body)

  if (!valid && validator.errors) {
    // Transform Ajv errors into our validation error format
    const details = validator.errors.map((err) => {
      // Build field path
      const field = err.instancePath
        ? err.instancePath.substring(1).replace(/\//g, '.')
        : err.params.missingProperty || 'body'

      // Build error message
      let message = err.message || 'Validation failed'

      // Enhance message for common error types
      if (err.keyword === 'required') {
        message = `Required field: ${err.params.missingProperty}`
      } else if (err.keyword === 'type') {
        message = `Must be of type ${err.params.type}`
      } else if (err.keyword === 'pattern') {
        message = `Does not match required pattern`
      } else if (err.keyword === 'enum') {
        message = `Must be one of: ${err.params.allowedValues.join(', ')}`
      } else if (err.keyword === 'minLength') {
        message = `Must be at least ${err.params.limit} characters`
      } else if (err.keyword === 'maxLength') {
        message = `Must be at most ${err.params.limit} characters`
      } else if (err.keyword === 'minimum') {
        message = `Must be at least ${err.params.limit}`
      } else if (err.keyword === 'maximum') {
        message = `Must be at most ${err.params.limit}`
      } else if (err.keyword === 'additionalProperties') {
        message = `Unexpected field: ${err.params.additionalProperty}`
      }

      return { field, message }
    })

    return validationErrorResponse(details, correlationId)
  }

  return null // Validation passed
}

/**
 * Validate and parse JSON request body
 * Returns parsed body if valid, or Response with error if invalid
 *
 * @param request - Incoming request
 * @param endpoint - API endpoint path
 * @param correlationId - Correlation ID for error responses
 * @returns Parsed body (typed) or Response with error
 */
export async function parseAndValidate<T>(
  request: Request,
  endpoint: EndpointPath,
  correlationId: string
): Promise<T | Response> {
  try {
    // Parse JSON body
    const body = await request.json()

    // Validate against schema
    const validationError = validateRequestBody(endpoint, body, correlationId)

    if (validationError) {
      return validationError
    }

    // Return validated body (now safe to cast to expected type)
    return body as T
  } catch (error) {
    // JSON parse error
    if (error instanceof SyntaxError) {
      return validationErrorResponse([{ field: 'body', message: 'Invalid JSON' }], correlationId)
    }

    throw error // Re-throw unexpected errors
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if value is a Response (for type narrowing)
 *
 * @param value - Value to check
 * @returns True if value is a Response
 */
export function isValidationError(value: unknown): value is Response {
  return value instanceof Response
}

/**
 * Validate query parameter as integer
 *
 * @param value - Query parameter value
 * @param fieldName - Field name for error messages
 * @param options - Validation options
 * @returns Parsed integer or null if invalid
 */
export function parseIntParam(
  value: string | null,
  fieldName: string,
  options: { min?: number; max?: number; required?: boolean } = {}
): number | null | { error: string } {
  if (value === null) {
    if (options.required) {
      return { error: `${fieldName} is required` }
    }
    return null
  }

  const parsed = parseInt(value, 10)

  if (isNaN(parsed)) {
    return { error: `${fieldName} must be a valid integer` }
  }

  if (options.min !== undefined && parsed < options.min) {
    return { error: `${fieldName} must be at least ${options.min}` }
  }

  if (options.max !== undefined && parsed > options.max) {
    return { error: `${fieldName} must be at most ${options.max}` }
  }

  return parsed
}

/**
 * Validate required query parameter
 *
 * @param value - Query parameter value
 * @param fieldName - Field name for error messages
 * @returns Value or error object
 */
export function requireParam(value: string | null, fieldName: string): string | { error: string } {
  if (!value) {
    return { error: `${fieldName} is required` }
  }
  return value
}
