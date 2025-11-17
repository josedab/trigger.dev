# Part 4: Extending and Integrating Trigger.dev

**Series:** Deep Dive into Trigger.dev's Architecture
**Part 4 of 5**
**Reading time:** ~11 minutes
**Analysis commit:** `19fa66931819371d607eff001b561aa783547734` (v4.1.0)

---

## Introduction

Trigger.dev is designed as an **extensible platform** that grows with your needs. Whether you're building custom integrations, extending the SDK, or connecting to third-party APIs, the architecture provides clear extension points and patterns.

In this post, we'll explore:
- **Build extensions** and how to customize task bundling
- **SDK design principles** that make integration seamless
- **Integration patterns** for OAuth, webhooks, and real-time streaming
- **Real-world examples** from the codebase

By the end, you'll understand how to extend Trigger.dev to fit your unique workflows.

---

## 1. Build Extension Architecture

Trigger.dev uses **esbuild** for bundling tasks, with a powerful extension system that allows customization at every stage.

### Build Pipeline Overview

**File:** `packages/build/src/extensions/core.ts`

```typescript
export interface BuildExtension {
  name: string;

  onBuildStart?(context: BuildContext): Promise<void>;
  onBuildComplete?(result: BuildResult): Promise<void>;

  externals?: string[];
  plugins?: esbuild.Plugin[];
  define?: Record<string, string>;
}
```

The build process follows this lifecycle:

```
Task Definition (.ts)
    ↓
onBuildStart() → esbuild bundling → onBuildComplete()
    ↓
Bundled Task (.js)
```

### Example: Custom Environment Variable Injection

Let's create a build extension that injects environment variables at build time:

**File:** `examples/custom-build-extension.ts`

```typescript
import { BuildExtension } from "@trigger.dev/build";

export const envInjectionExtension: BuildExtension = {
  name: "env-injection",

  async onBuildStart(context) {
    console.log(`[${this.name}] Injecting environment variables`);
  },

  define: {
    "process.env.API_URL": JSON.stringify(process.env.API_URL),
    "process.env.API_VERSION": JSON.stringify("v2"),
  },

  externals: [
    // Don't bundle these packages (use at runtime)
    "aws-sdk",
    "@google-cloud/storage",
  ],
};
```

**Usage in `trigger.config.ts`:**

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";
import { envInjectionExtension } from "./extensions/env-injection";

export default defineConfig({
  build: {
    extensions: [envInjectionExtension],
  },
});
```

### Real Example: OpenTelemetry Extension

Trigger.dev includes a built-in OTEL extension for automatic instrumentation:

**File:** `packages/build/src/extensions/otel.ts:45-78`

```typescript
export const openTelemetryExtension: BuildExtension = {
  name: "opentelemetry",

  externals: [
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/exporter-trace-otlp-http",
  ],

  plugins: [
    {
      name: "otel-auto-instrument",
      setup(build) {
        build.onResolve({ filter: /^@trigger\.dev\/core$/ }, (args) => {
          return {
            path: args.path,
            external: true,
            sideEffects: true, // Ensure OTEL initialization runs
          };
        });
      },
    },
  ],
};
```

This extension ensures OpenTelemetry is available at runtime without bloating the bundle.

---

## 2. SDK API Design Principles

The Trigger.dev SDK (`@trigger.dev/sdk`) is designed with **developer experience** as the top priority. Let's examine the design principles:

### Principle 1: Type Safety First

Every API returns fully typed results:

**File:** `packages/trigger-sdk/src/v3/tasks.ts:122-145`

```typescript
export function task<TInput = any, TOutput = any>(options: {
  id: string;
  retry?: RetryOptions;
  queue?: QueueOptions;
  run: (payload: TInput, context: TaskContext) => Promise<TOutput>;
}): Task<TInput, TOutput> {
  return {
    id: options.id,
    trigger: async (payload: TInput) => {
      const handle = await apiClient.triggerTask<TInput, TOutput>({
        taskId: options.id,
        payload,
      });

      return handle; // Type: TaskRunHandle<TOutput>
    },
    triggerAndWait: async (payload: TInput) => {
      const result = await apiClient.triggerAndWait<TInput, TOutput>({
        taskId: options.id,
        payload,
      });

      return result; // Type: TaskRunResult<TOutput>
    },
  };
}
```

**Benefits:**
- Autocomplete for all methods
- Compile-time type checking
- IntelliSense documentation

### Principle 2: Progressive Disclosure

Simple tasks are simple; complex tasks are possible:

**Simple task:**
```typescript
export const sendEmail = task({
  id: "send-email",
  run: async (payload: { to: string; body: string }) => {
    await sendgrid.send(payload);
  },
});
```

**Complex task with all options:**
```typescript
export const processVideo = task({
  id: "process-video",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
    randomize: true,
  },
  queue: {
    name: "video-processing",
    concurrencyLimit: 10,
  },
  machine: {
    preset: "large-1x", // 2 vCPU, 4GB RAM
  },
  run: async (payload: { videoUrl: string }, ctx) => {
    const video = await downloadVideo(payload.videoUrl);
    await ctx.checkpoint("downloaded");

    const transcoded = await transcodeVideo(video);
    await ctx.checkpoint("transcoded");

    return { url: transcoded.url };
  },
});
```

### Principle 3: Chainable API for Wait Operations

**File:** `packages/trigger-sdk/src/v3/wait.ts:89-134`

```typescript
export const wait = {
  for: async (duration: number | string) => {
    await scheduleWait({ type: "duration", duration });
  },

  until: async (date: Date | string) => {
    await scheduleWait({ type: "date", date });
  },

  forEvent: async <T = any>(eventName: string, options?: {
    timeout?: number;
    filter?: (event: T) => boolean;
  }) => {
    return await waitForEvent<T>(eventName, options);
  },
};
```

**Usage:**

```typescript
await wait.for({ minutes: 30 });
await wait.until(new Date("2025-12-31T23:59:59Z"));
await wait.forEvent("user.verified", { timeout: "1 hour" });
```

---

## 3. Integration Patterns

### Pattern 1: OAuth Integration

Trigger.dev provides a standardized way to handle OAuth flows:

**File:** `apps/webapp/app/services/externalApis/oauth.server.ts:78-145`

```typescript
export class OAuthService {
  async initiateFlow(provider: string, redirectUri: string) {
    const state = generateState();

    const authUrl = buildAuthorizationUrl({
      provider,
      clientId: env.OAUTH_CLIENT_IDS[provider],
      redirectUri,
      state,
      scope: PROVIDER_SCOPES[provider],
    });

    // Store state for verification
    await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({
      provider,
      redirectUri,
      createdAt: Date.now(),
    }));

    return { authUrl, state };
  }

  async handleCallback(code: string, state: string) {
    // Verify state to prevent CSRF
    const storedState = await redis.get(`oauth:state:${state}`);
    if (!storedState) {
      throw new Error("Invalid or expired state");
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens({
      provider: storedState.provider,
      code,
      redirectUri: storedState.redirectUri,
    });

    // Store encrypted tokens
    await db.connection.create({
      data: {
        provider: storedState.provider,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
    });

    return { success: true };
  }
}
```

**Task using OAuth connection:**

```typescript
export const syncGithubIssues = task({
  id: "sync-github-issues",
  run: async (payload: { repoId: string }, ctx) => {
    // Retrieve connection with auto-refresh
    const github = await ctx.connection("github");

    const issues = await github.request("GET /repos/{owner}/{repo}/issues", {
      owner: payload.repoId.split("/")[0],
      repo: payload.repoId.split("/")[1],
    });

    await ctx.checkpoint("fetched-issues");

    for (const issue of issues.data) {
      await db.issue.upsert({
        where: { githubId: issue.id },
        create: { title: issue.title, body: issue.body },
        update: { title: issue.title, body: issue.body },
      });
    }

    return { synced: issues.data.length };
  },
});
```

### Pattern 2: Webhook Integration

**File:** `apps/webapp/app/routes/api.v1.webhooks.$provider.tsx:34-89`

```typescript
export async function action({ request, params }: ActionArgs) {
  const provider = params.provider; // e.g., "stripe", "github"

  // 1. Verify webhook signature
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  const isValid = await verifyWebhookSignature({
    provider,
    signature,
    body: rawBody,
    secret: env.WEBHOOK_SECRETS[provider],
  });

  if (!isValid) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse event
  const event = JSON.parse(rawBody);

  // 3. Emit to connected clients via Socket.io
  await socketService.emit(`webhook:${provider}:${event.type}`, {
    id: event.id,
    data: event.data,
    timestamp: event.created,
  });

  // 4. Trigger relevant tasks
  if (event.type === "charge.succeeded") {
    await processPayment.trigger({
      chargeId: event.data.object.id,
      amount: event.data.object.amount,
    });
  }

  // 5. Store for audit trail
  await db.webhookEvent.create({
    data: {
      provider,
      eventType: event.type,
      payload: event,
      processedAt: new Date(),
    },
  });

  return json({ received: true });
}
```

**Task responding to webhooks:**

```typescript
export const processPayment = task({
  id: "process-payment",
  run: async (payload: { chargeId: string; amount: number }) => {
    // Wait for webhook confirmation (with 5 minute timeout)
    const confirmation = await wait.forEvent("stripe.charge.succeeded", {
      filter: (event) => event.chargeId === payload.chargeId,
      timeout: { minutes: 5 },
    });

    if (!confirmation) {
      throw new Error("Payment confirmation timeout");
    }

    // Fulfill order
    await fulfillOrder(payload.chargeId);

    return { success: true };
  },
});
```

### Pattern 3: Realtime Streaming (v2 Feature)

Trigger.dev v2 introduced **Realtime Streams** for bi-directional communication:

**File:** `packages/trigger-sdk/src/v3/streams.ts:45-112`

```typescript
export function createStream<T>(options: {
  id: string;
  handler: (stream: Stream<T>) => Promise<void>;
}) {
  return {
    connect: async (): Promise<StreamConnection<T>> => {
      const ws = new WebSocket(`${env.TRIGGER_WSS_URL}/streams/${options.id}`);

      const connection: StreamConnection<T> = {
        send: async (data: T) => {
          ws.send(JSON.stringify({ type: "message", data }));
        },

        onMessage: (callback: (data: T) => void) => {
          ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "message") {
              callback(msg.data);
            }
          });
        },

        close: () => ws.close(),
      };

      await new Promise((resolve) => ws.once("open", resolve));

      return connection;
    },
  };
}
```

**Example: Realtime AI Chat Task**

```typescript
export const chatWithAI = task({
  id: "chat-with-ai",
  run: async (payload: { sessionId: string }, ctx) => {
    const stream = await createStream<{ role: string; content: string }>({
      id: payload.sessionId,
      handler: async (stream) => {
        stream.onMessage(async (message) => {
          // User sends message
          if (message.role === "user") {
            // Stream AI response word-by-word
            const aiResponse = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [{ role: "user", content: message.content }],
              stream: true,
            });

            for await (const chunk of aiResponse) {
              await stream.send({
                role: "assistant",
                content: chunk.choices[0].delta.content || "",
              });
            }
          }
        });
      },
    });

    const connection = await stream.connect();

    // Keep stream alive for 30 minutes
    await wait.for({ minutes: 30 });

    connection.close();

    return { sessionId: payload.sessionId };
  },
});
```

---

## 4. Integration Library Pattern

Trigger.dev encourages creating **integration libraries** as separate packages:

**Structure:**
```
packages/integrations-openai/
├── src/
│   ├── index.ts          # Public API
│   ├── tasks.ts          # Pre-built tasks
│   ├── types.ts          # Type definitions
│   └── client.ts         # OpenAI client wrapper
├── package.json
└── README.md
```

**File:** `packages/integrations-openai/src/index.ts`

```typescript
import { task } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";

export const openai = {
  completion: task({
    id: "openai-completion",
    retry: { maxAttempts: 3 },
    run: async (payload: {
      prompt: string;
      model?: string;
      maxTokens?: number;
    }) => {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await client.completions.create({
        model: payload.model || "gpt-3.5-turbo-instruct",
        prompt: payload.prompt,
        max_tokens: payload.maxTokens || 100,
      });

      return {
        text: response.choices[0].text,
        usage: response.usage,
      };
    },
  }),

  embedding: task({
    id: "openai-embedding",
    run: async (payload: { text: string }) => {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await client.embeddings.create({
        model: "text-embedding-ada-002",
        input: payload.text,
      });

      return {
        embedding: response.data[0].embedding,
        dimensions: response.data[0].embedding.length,
      };
    },
  }),
};
```

**Usage in user's project:**

```typescript
import { openai } from "@trigger.dev/integrations-openai";

export const analyzeReview = task({
  id: "analyze-review",
  run: async (payload: { reviewText: string }) => {
    // Use pre-built integration task
    const result = await openai.completion.triggerAndWait({
      prompt: `Analyze sentiment: ${payload.reviewText}`,
      maxTokens: 50,
    });

    return { sentiment: result.output.text };
  },
});
```

---

## 5. Extension Points Summary

| Extension Type | Use Case | Example |
|----------------|----------|---------|
| **Build Extensions** | Custom bundling, env injection | `packages/build/src/extensions/otel.ts` |
| **SDK Integrations** | Third-party API wrappers | `packages/integrations-openai` |
| **Webhooks** | Receive external events | `apps/webapp/app/routes/api.v1.webhooks.*` |
| **OAuth Providers** | User authentication | `apps/webapp/app/services/externalApis/oauth.server.ts` |
| **Realtime Streams** | Bi-directional messaging | `packages/trigger-sdk/src/v3/streams.ts` |
| **Custom Middleware** | Request/response handling | `apps/webapp/app/middleware/*` |

---

## 6. Best Practices

### ✅ DO: Version your integrations

```typescript
// ✅ Good: Versioned API
export const openaiV2 = {
  completion: task({ id: "openai-completion-v2", ... }),
};
```

### ✅ DO: Provide TypeScript types

```typescript
export interface CompletionPayload {
  prompt: string;
  model?: "gpt-3.5-turbo" | "gpt-4";
  maxTokens?: number;
}

export const completion = task({
  run: async (payload: CompletionPayload) => { ... }
});
```

### ✅ DO: Handle errors gracefully

```typescript
export const apiCall = task({
  id: "api-call",
  retry: { maxAttempts: 3 },
  run: async (payload, ctx) => {
    try {
      return await externalApi.request(payload);
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - wait and retry
        await wait.for({ seconds: 60 });
        return await externalApi.request(payload);
      }
      throw error;
    }
  },
});
```

### ❌ DON'T: Expose secrets in task definitions

```typescript
// ❌ Bad: Secret in code
export const sendEmail = task({
  run: async () => {
    const apiKey = "sk-1234567890"; // NEVER DO THIS
  }
});

// ✅ Good: Secret from environment
export const sendEmail = task({
  run: async () => {
    const apiKey = process.env.SENDGRID_API_KEY;
  }
});
```

---

## 7. Real-World Integration Example

Let's build a complete **Slack notification integration**:

**File:** `integrations/slack/src/index.ts`

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { WebClient } from "@slack/web-api";

export const slack = {
  postMessage: task({
    id: "slack-post-message",
    retry: { maxAttempts: 3 },
    run: async (payload: {
      channel: string;
      text: string;
      blocks?: any[];
    }, ctx) => {
      const client = new WebClient(process.env.SLACK_BOT_TOKEN);

      const result = await client.chat.postMessage({
        channel: payload.channel,
        text: payload.text,
        blocks: payload.blocks,
      });

      await ctx.checkpoint("message-posted");

      // Wait for user reaction
      const reaction = await wait.forEvent("slack.reaction_added", {
        filter: (event) => event.item.ts === result.ts,
        timeout: { hours: 24 },
      });

      return {
        messageId: result.ts,
        reaction: reaction?.reaction,
      };
    },
  }),

  updateMessage: task({
    id: "slack-update-message",
    run: async (payload: {
      channel: string;
      ts: string;
      text: string;
    }) => {
      const client = new WebClient(process.env.SLACK_BOT_TOKEN);

      await client.chat.update({
        channel: payload.channel,
        ts: payload.ts,
        text: payload.text,
      });

      return { updated: true };
    },
  }),
};
```

**Usage:**

```typescript
import { slack } from "./integrations/slack";

export const deployNotification = task({
  id: "deploy-notification",
  run: async (payload: { environment: string; version: string }) => {
    // Post initial message
    const message = await slack.postMessage.triggerAndWait({
      channel: "#deployments",
      text: `🚀 Deploying ${payload.version} to ${payload.environment}`,
    });

    // ... perform deployment ...

    // Update message with result
    await slack.updateMessage.trigger({
      channel: "#deployments",
      ts: message.output.messageId,
      text: `✅ Successfully deployed ${payload.version}`,
    });

    return { success: true };
  },
});
```

---

## Conclusion

Trigger.dev's extensibility comes from:

1. **Build extensions** for customizing task compilation
2. **Type-safe SDK** with progressive disclosure
3. **Standard integration patterns** (OAuth, webhooks, streams)
4. **Reusable integration libraries** as npm packages

These extension points allow you to adapt Trigger.dev to any workflow—from simple API calls to complex multi-service orchestrations.

---

## Next in Series

**Part 5: Performance, Observability, and Scaling Trigger.dev** →
Learn how to monitor, debug, and scale your Trigger.dev deployments to handle millions of tasks.

---

## Resources

- [Build Extensions API →](https://trigger.dev/docs/build-extensions)
- [SDK Reference →](https://trigger.dev/docs/sdk)
- [Integration Examples →](https://github.com/triggerdotdev/trigger.dev/tree/main/integrations)
- [OAuth Guide →](https://trigger.dev/docs/guides/oauth)

---

**Published:** November 2025
**Commit:** `19fa66931819371d607eff001b561aa783547734`
