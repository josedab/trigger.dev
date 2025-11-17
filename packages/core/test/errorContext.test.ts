import {
  TaskError,
  isTaskError,
  createTaskErrorContext,
  serializeError,
  deserializeError,
  type TaskErrorContext,
  type SerializedErrorData,
} from "../src/v3/errors.js";

describe("TaskError", () => {
  const mockContext: TaskErrorContext = {
    runId: "run_abc123",
    taskId: "process-video",
    attemptNumber: 2,
    environment: "production",
    checkpointName: "downloaded",
    traceId: "trace_xyz789",
    spanId: "span_123456",
    userId: "user_789",
    organizationSlug: "acme-corp",
    projectRef: "my-project",
  };

  it("should create a TaskError with context", () => {
    const error = new TaskError("Task execution failed", mockContext);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TaskError");
    expect(error.message).toBe("Task execution failed");
    expect(error.context).toEqual(mockContext);
  });

  it("should format error with full context in toString()", () => {
    const error = new TaskError("Network timeout", mockContext);
    const errorString = error.toString();

    expect(errorString).toContain("TaskError: Network timeout");
    expect(errorString).toContain("Run ID: run_abc123");
    expect(errorString).toContain("Task ID: process-video");
    expect(errorString).toContain("Attempt: #2");
    expect(errorString).toContain("Checkpoint: downloaded");
    expect(errorString).toContain("Environment: production");
    expect(errorString).toContain("Trace ID: trace_xyz789");
    expect(errorString).toContain("Span ID: span_123456");
    expect(errorString).toContain("User ID: user_789");
    expect(errorString).toContain(
      "View run: /orgs/acme-corp/projects/my-project/runs/run_abc123"
    );
  });

  it("should format error without optional fields", () => {
    const minimalContext: TaskErrorContext = {
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 1,
      environment: "development",
    };

    const error = new TaskError("Simple error", minimalContext);
    const errorString = error.toString();

    expect(errorString).toContain("Run ID: run_123");
    expect(errorString).toContain("Task ID: task_456");
    expect(errorString).toContain("Attempt: #1");
    expect(errorString).toContain("Environment: development");
    expect(errorString).not.toContain("Checkpoint:");
    expect(errorString).not.toContain("Trace ID:");
    expect(errorString).not.toContain("View run:");
  });

  it("should include stack trace in toString()", () => {
    const error = new TaskError("Error with stack", mockContext);
    const errorString = error.toString();

    expect(errorString).toContain("Stack:");
    expect(errorString).toContain("TaskError"); // Stack trace should contain error name
  });
});

describe("isTaskError", () => {
  it("should return true for TaskError instances", () => {
    const error = new TaskError("test", {
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 1,
      environment: "test",
    });

    expect(isTaskError(error)).toBe(true);
  });

  it("should return false for regular Error instances", () => {
    const error = new Error("regular error");
    expect(isTaskError(error)).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isTaskError("string")).toBe(false);
    expect(isTaskError(null)).toBe(false);
    expect(isTaskError(undefined)).toBe(false);
    expect(isTaskError({})).toBe(false);
  });
});

describe("createTaskErrorContext", () => {
  it("should create a TaskErrorContext with all fields", () => {
    const context = createTaskErrorContext({
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 3,
      environment: "staging",
      checkpointName: "checkpoint1",
      traceId: "trace_123",
      spanId: "span_456",
      userId: "user_789",
      organizationSlug: "org-slug",
      projectRef: "project-ref",
    });

    expect(context).toEqual({
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 3,
      environment: "staging",
      checkpointName: "checkpoint1",
      traceId: "trace_123",
      spanId: "span_456",
      userId: "user_789",
      organizationSlug: "org-slug",
      projectRef: "project-ref",
    });
  });

  it("should create a TaskErrorContext with minimal fields", () => {
    const context = createTaskErrorContext({
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 1,
      environment: "production",
    });

    expect(context).toEqual({
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 1,
      environment: "production",
      checkpointName: undefined,
      traceId: undefined,
      spanId: undefined,
      userId: undefined,
      organizationSlug: undefined,
      projectRef: undefined,
    });
  });
});

describe("serializeError", () => {
  it("should serialize a TaskError with full context", () => {
    const context: TaskErrorContext = {
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 2,
      environment: "production",
      checkpointName: "processing",
    };

    const error = new TaskError("Serialization test", context);
    const serialized = serializeError(error);

    expect(serialized).toMatchObject({
      name: "TaskError",
      message: "Serialization test",
      context: context,
    });
    expect(serialized.stack).toBeDefined();
  });

  it("should serialize a regular Error", () => {
    const error = new Error("Regular error");
    error.name = "CustomError";

    const serialized = serializeError(error);

    expect(serialized).toMatchObject({
      name: "CustomError",
      message: "Regular error",
    });
    expect(serialized.stack).toBeDefined();
    expect(serialized.context).toBeUndefined();
  });

  it("should preserve custom properties on errors", () => {
    const error = new Error("Error with custom props") as any;
    error.customProp = "custom value";
    error.numericProp = 42;

    const serialized = serializeError(error);

    expect(serialized.customProperties).toBeDefined();
    expect(serialized.customProperties?.customProp).toBe("custom value");
    expect(serialized.customProperties?.numericProp).toBe(42);
  });

  it("should not duplicate standard error properties in customProperties", () => {
    const error = new Error("Test error");
    const serialized = serializeError(error);

    // customProperties should not exist if there are no custom props
    expect(serialized.customProperties).toBeUndefined();
  });
});

describe("deserializeError", () => {
  it("should deserialize a TaskError with context", () => {
    const context: TaskErrorContext = {
      runId: "run_123",
      taskId: "task_456",
      attemptNumber: 1,
      environment: "test",
    };

    const serialized: SerializedErrorData = {
      name: "TaskError",
      message: "Deserialization test",
      stack: "Error: test\n  at test.ts:1:1",
      context: context,
    };

    const error = deserializeError(serialized);

    expect(error).toBeInstanceOf(TaskError);
    expect(error.name).toBe("TaskError");
    expect(error.message).toBe("Deserialization test");
    expect(error.stack).toBe("Error: test\n  at test.ts:1:1");

    if (isTaskError(error)) {
      expect(error.context).toEqual(context);
    }
  });

  it("should deserialize a regular Error", () => {
    const serialized: SerializedErrorData = {
      name: "CustomError",
      message: "Custom error message",
      stack: "Error: custom\n  at file.ts:10:5",
    };

    const error = deserializeError(serialized);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CustomError");
    expect(error.message).toBe("Custom error message");
    expect(error.stack).toBe("Error: custom\n  at file.ts:10:5");
    expect(isTaskError(error)).toBe(false);
  });

  it("should restore custom properties", () => {
    const serialized: SerializedErrorData = {
      name: "Error",
      message: "Error with custom props",
      customProperties: {
        code: "ERR_001",
        details: { foo: "bar" },
      },
    };

    const error = deserializeError(serialized) as any;

    expect(error.code).toBe("ERR_001");
    expect(error.details).toEqual({ foo: "bar" });
  });

  it("should handle missing stack trace", () => {
    const serialized: SerializedErrorData = {
      name: "Error",
      message: "No stack",
    };

    const error = deserializeError(serialized);

    expect(error.name).toBe("Error");
    expect(error.message).toBe("No stack");
  });
});

describe("Error serialization round-trip", () => {
  it("should preserve TaskError through serialization and deserialization", () => {
    const originalContext: TaskErrorContext = {
      runId: "run_roundtrip",
      taskId: "task_roundtrip",
      attemptNumber: 5,
      environment: "production",
      checkpointName: "final",
      traceId: "trace_roundtrip",
      organizationSlug: "test-org",
      projectRef: "test-project",
    };

    const originalError = new TaskError("Round-trip test", originalContext);
    const serialized = serializeError(originalError);
    const deserialized = deserializeError(serialized);

    expect(isTaskError(deserialized)).toBe(true);
    expect(deserialized.name).toBe("TaskError");
    expect(deserialized.message).toBe("Round-trip test");

    if (isTaskError(deserialized)) {
      expect(deserialized.context).toEqual(originalContext);
    }
  });

  it("should preserve regular errors through serialization and deserialization", () => {
    const originalError = new Error("Regular round-trip") as any;
    originalError.code = "ERR_TEST";
    originalError.statusCode = 500;

    const serialized = serializeError(originalError);
    const deserialized = deserializeError(serialized) as any;

    expect(deserialized.name).toBe("Error");
    expect(deserialized.message).toBe("Regular round-trip");
    expect(deserialized.code).toBe("ERR_TEST");
    expect(deserialized.statusCode).toBe(500);
  });
});
