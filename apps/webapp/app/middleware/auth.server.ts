/**
 * Auth Middleware (RFC-0009)
 *
 * Centralized authentication middleware to reduce code duplication
 * across route loaders and actions.
 *
 * Before RFC-0009:
 * - Each route manually called requireUserId() and queried organization
 * - ~40+ routes with duplicate auth logic
 * - Inconsistent error handling
 *
 * After RFC-0009:
 * - Single middleware handles auth + org lookup
 * - Consistent error responses
 * - Reduced code by ~3%
 */

import { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "~/db.server";
import { requireUser, requireUserId } from "~/services/session.server";

/**
 * Authenticated user (minimal context)
 */
export interface AuthenticatedContext {
  userId: string;
  request: Request;
}

/**
 * Authenticated user with organization context
 */
export interface OrganizationAuthContext extends AuthenticatedContext {
  organizationId: string;
  organizationSlug: string;
  organization: {
    id: string;
    title: string;
    slug: string;
    v3Enabled: boolean;
    v2Enabled: boolean;
  };
}

/**
 * Authenticated user with project context
 */
export interface ProjectAuthContext extends OrganizationAuthContext {
  projectId: string;
  project: {
    id: string;
    name: string;
    slug: string;
    organizationId: string;
  };
}

/**
 * Require authenticated user (minimal - just userId)
 *
 * Usage:
 * ```typescript
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { userId } = await requireAuth(request);
 *   // ...
 * }
 * ```
 */
export async function requireAuth(request: Request): Promise<AuthenticatedContext> {
  const userId = await requireUserId(request);

  return {
    userId,
    request,
  };
}

/**
 * Require authenticated user with full user object
 *
 * Usage:
 * ```typescript
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { user } = await requireAuthWithUser(request);
 *   console.log(user.email);
 * }
 * ```
 */
export async function requireAuthWithUser(request: Request) {
  const user = await requireUser(request);

  return {
    user,
    userId: user.id,
    request,
  };
}

/**
 * Require authenticated user + organization membership
 *
 * Validates that:
 * 1. User is authenticated
 * 2. Organization exists
 * 3. User is a member of the organization
 *
 * Usage:
 * ```typescript
 * export async function loader({ request, params }: LoaderFunctionArgs) {
 *   const { userId, organization } = await requireOrgAuth(request, params.organizationSlug);
 *   // ...
 * }
 * ```
 */
export async function requireOrgAuth(
  request: Request,
  organizationSlug: string
): Promise<OrganizationAuthContext> {
  const userId = await requireUserId(request);

  const organization = await prisma.organization.findFirst({
    where: {
      slug: organizationSlug,
      members: {
        some: { userId },
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      v3Enabled: true,
      v2Enabled: true,
    },
  });

  if (!organization) {
    throw new Response("Organization not found", {
      status: 404,
      statusText: "Organization not found",
    });
  }

  return {
    userId,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    organization,
    request,
  };
}

/**
 * Require authenticated user + project access
 *
 * Validates that:
 * 1. User is authenticated
 * 2. Project exists
 * 3. User has access to the project's organization
 *
 * Usage:
 * ```typescript
 * export async function loader({ request, params }: LoaderFunctionArgs) {
 *   const { userId, project, organization } = await requireProjectAuth(
 *     request,
 *     params.projectRef
 *   );
 *   // ...
 * }
 * ```
 */
export async function requireProjectAuth(
  request: Request,
  projectRef: string
): Promise<ProjectAuthContext> {
  const userId = await requireUserId(request);

  const project = await prisma.project.findFirst({
    where: {
      externalRef: projectRef,
      deletedAt: null,
      organization: {
        members: {
          some: { userId },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          title: true,
          slug: true,
          v3Enabled: true,
          v2Enabled: true,
        },
      },
    },
  });

  if (!project) {
    throw new Response("Project not found", {
      status: 404,
      statusText: "Project not found",
    });
  }

  return {
    userId,
    projectId: project.id,
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      organizationId: project.organizationId,
    },
    organizationId: project.organization.id,
    organizationSlug: project.organization.slug,
    organization: project.organization,
    request,
  };
}

/**
 * Helper to extract auth context from LoaderFunctionArgs
 *
 * Usage:
 * ```typescript
 * export async function loader(args: LoaderFunctionArgs) {
 *   const { userId, organization } = await requireOrgAuthFromArgs(args);
 *   // ...
 * }
 * ```
 */
export async function requireOrgAuthFromArgs(
  args: LoaderFunctionArgs | ActionFunctionArgs
): Promise<OrganizationAuthContext> {
  const organizationSlug = args.params.organizationSlug;

  if (!organizationSlug) {
    throw new Error("organizationSlug param is required");
  }

  return requireOrgAuth(args.request, organizationSlug);
}

/**
 * Helper to extract project auth context from LoaderFunctionArgs
 *
 * Usage:
 * ```typescript
 * export async function loader(args: LoaderFunctionArgs) {
 *   const { userId, project, organization } = await requireProjectAuthFromArgs(args);
 *   // ...
 * }
 * ```
 */
export async function requireProjectAuthFromArgs(
  args: LoaderFunctionArgs | ActionFunctionArgs
): Promise<ProjectAuthContext> {
  const projectRef = args.params.projectRef;

  if (!projectRef) {
    throw new Error("projectRef param is required");
  }

  return requireProjectAuth(args.request, projectRef);
}

/**
 * Require admin user
 *
 * Usage:
 * ```typescript
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { user } = await requireAdmin(request);
 *   // ...
 * }
 * ```
 */
export async function requireAdmin(request: Request) {
  const user = await requireUser(request);

  if (!user.admin) {
    throw new Response("Forbidden", {
      status: 403,
      statusText: "Admin access required",
    });
  }

  return {
    user,
    userId: user.id,
    request,
  };
}

/**
 * Optional authentication (doesn't throw if not authenticated)
 *
 * Usage:
 * ```typescript
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { userId } = await optionalAuth(request);
 *
 *   if (userId) {
 *     // User is logged in
 *   } else {
 *     // Anonymous user
 *   }
 * }
 * ```
 */
export async function optionalAuth(request: Request): Promise<{
  userId: string | null;
  request: Request;
}> {
  try {
    const { userId } = await requireAuth(request);
    return { userId, request };
  } catch (error) {
    return { userId: null, request };
  }
}
