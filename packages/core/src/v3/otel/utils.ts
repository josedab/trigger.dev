import { type Span, SpanStatusCode, context, propagation, Attributes } from "@opentelemetry/api";

export function recordSpanException(span: Span, error: unknown, additionalAttributes?: Attributes) {
  if (error instanceof Error) {
    span.recordException(sanitizeSpanError(error));

    // Record error-specific attributes for better debugging
    const errorAttributes: Attributes = {
      "error.type": error.name,
      "error.message": error.message,
    };

    if (error.stack) {
      errorAttributes["error.stack_trace"] = error.stack;
    }

    // Merge with any additional attributes provided
    if (additionalAttributes) {
      Object.assign(errorAttributes, additionalAttributes);
    }

    span.setAttributes(errorAttributes);
  } else if (typeof error === "string") {
    span.recordException(error.replace(/\0/g, ""));
    span.setAttributes({
      "error.type": "string",
      "error.message": error,
      ...additionalAttributes,
    });
  } else {
    const errorString = JSON.stringify(error).replace(/\0/g, "");
    span.recordException(errorString);
    span.setAttributes({
      "error.type": "unknown",
      "error.message": errorString,
      ...additionalAttributes,
    });
  }

  span.setStatus({ code: SpanStatusCode.ERROR });
}

function sanitizeSpanError(error: Error) {
  // Create a new error object with the same name, message and stack trace
  const sanitizedError = new Error(error.message.replace(/\0/g, ""));
  sanitizedError.name = error.name.replace(/\0/g, "");
  sanitizedError.stack = error.stack?.replace(/\0/g, "");

  return sanitizedError;
}

export function carrierFromContext(): Record<string, string> {
  const carrier = {};
  propagation.inject(context.active(), carrier);

  return carrier;
}
