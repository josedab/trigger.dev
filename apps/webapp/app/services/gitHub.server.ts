import { App, type Octokit } from "octokit";
import { env } from "../env.server";
import { prisma } from "~/db.server";
import { logger } from "./logger.server";
import { errAsync, fromPromise, okAsync, type ResultAsync } from "neverthrow";
import { createCircuitBreaker, CircuitBreakerOpenError } from "@trigger.dev/core/v3/circuitBreaker";
import { meter } from "~/v3/tracer.server";

export const githubApp =
  env.GITHUB_APP_ENABLED === "1"
    ? new App({
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        webhooks: {
          secret: env.GITHUB_APP_WEBHOOK_SECRET,
        },
      })
    : null;

// Circuit breaker for GitHub API calls
// Provides an additional layer of protection beyond Octokit's built-in retry logic
const githubApiCircuitBreaker = createCircuitBreaker({
  func: async <T>(operation: () => Promise<T>) => {
    return await operation();
  },
  serviceName: "github-api",
  meter,
});

/**
 * Links a GitHub App installation to a Trigger organization
 */
export async function linkGitHubAppInstallation(
  installationId: number,
  organizationId: string
): Promise<void> {
  if (!githubApp) {
    throw new Error("GitHub App is not enabled");
  }

  try {
    await githubApiCircuitBreaker.fire(async () => {
      const octokit = await githubApp.getInstallationOctokit(installationId);
      const { data: installation } = await octokit.rest.apps.getInstallation({
        installation_id: installationId,
      });

      const repositories = await fetchInstallationRepositories(octokit, installationId);

      const repositorySelection = installation.repository_selection === "all" ? "ALL" : "SELECTED";

      await prisma.githubAppInstallation.create({
        data: {
          appInstallationId: installationId,
          organizationId,
          targetId: installation.target_id,
          targetType: installation.target_type,
          accountHandle: installation.account
            ? "login" in installation.account
              ? installation.account.login
              : "slug" in installation.account
              ? installation.account.slug
              : "-"
            : "-",
          permissions: installation.permissions,
          repositorySelection,
          repositories: {
            create: repositories,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn("GitHub API circuit breaker open", {
        operation: "linkGitHubAppInstallation",
        installationId,
      });
      throw new Error("GitHub API is currently unavailable. Please try again later.");
    }
    throw error;
  }
}

/**
 * Updates a GitHub App installation
 */
export async function updateGitHubAppInstallation(installationId: number): Promise<void> {
  if (!githubApp) {
    throw new Error("GitHub App is not enabled");
  }

  try {
    await githubApiCircuitBreaker.fire(async () => {
      const octokit = await githubApp.getInstallationOctokit(installationId);
      const { data: installation } = await octokit.rest.apps.getInstallation({
        installation_id: installationId,
      });

      const existingInstallation = await prisma.githubAppInstallation.findFirst({
        where: { appInstallationId: installationId },
      });

      if (!existingInstallation) {
        throw new Error("GitHub App installation not found");
      }

      const repositorySelection = installation.repository_selection === "all" ? "ALL" : "SELECTED";

      // repos are updated asynchronously via webhook events
      await prisma.githubAppInstallation.update({
        where: { id: existingInstallation?.id },
        data: {
          appInstallationId: installationId,
          targetId: installation.target_id,
          targetType: installation.target_type,
          accountHandle: installation.account
            ? "login" in installation.account
              ? installation.account.login
              : "slug" in installation.account
              ? installation.account.slug
              : "-"
            : "-",
          permissions: installation.permissions,
          suspendedAt: existingInstallation?.suspendedAt,
          repositorySelection,
        },
      });
    });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn("GitHub API circuit breaker open", {
        operation: "updateGitHubAppInstallation",
        installationId,
      });
      throw new Error("GitHub API is currently unavailable. Please try again later.");
    }
    throw error;
  }
}

async function fetchInstallationRepositories(octokit: Octokit, installationId: number) {
  const iterator = octokit.paginate.iterator(octokit.rest.apps.listReposAccessibleToInstallation, {
    installation_id: installationId,
    per_page: 100,
  });

  const allRepos = [];
  const maxPages = 3;
  let pageCount = 0;

  for await (const { data } of iterator) {
    pageCount++;
    allRepos.push(...data);

    if (maxPages && pageCount >= maxPages) {
      logger.warn("GitHub installation repository fetch truncated", {
        installationId,
        maxPages,
        totalReposFetched: allRepos.length,
      });
      break;
    }
  }

  return allRepos.map((repo) => ({
    githubId: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}

/**
 * Checks if a branch exists in a GitHub repository
 */
export function checkGitHubBranchExists(
  installationId: number,
  fullRepoName: string,
  branch: string
): ResultAsync<boolean, { type: "other" | "github_app_not_enabled" | "circuit_breaker_open"; cause?: unknown }> {
  if (!githubApp) {
    return errAsync({ type: "github_app_not_enabled" as const });
  }

  if (!branch || branch.trim() === "") {
    return okAsync(false);
  }

  const [owner, repo] = fullRepoName.split("/");

  const checkBranchWithCircuitBreaker = () =>
    fromPromise(
      githubApiCircuitBreaker.fire(async () => {
        const octokit = await githubApp.getInstallationOctokit(installationId);
        return await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch,
        });
      }),
      (error) => {
        if (error instanceof CircuitBreakerOpenError) {
          logger.warn("GitHub API circuit breaker open", {
            operation: "checkGitHubBranchExists",
            installationId,
            fullRepoName,
            branch,
          });
          return {
            type: "circuit_breaker_open" as const,
            cause: error,
          };
        }
        return {
          type: "other" as const,
          cause: error,
        };
      }
    );

  return checkBranchWithCircuitBreaker()
    .map(() => true)
    .orElse((error) => {
      if (
        error.cause &&
        error.cause instanceof Error &&
        "status" in error.cause &&
        error.cause.status === 404
      ) {
        return okAsync(false);
      }

      return errAsync(error);
    });
}
