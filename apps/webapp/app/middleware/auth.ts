import { json } from "@remix-run/server-runtime";
import { prisma } from "~/db.server";
import { authenticateApiRequest, authenticateApiRequestWithFailure } from "~/services/apiAuth.server";
import { requireUser } from "~/services/session.server";
import type { User } from "@trigger.dev/database";

/**
 * Auth middleware for API routes
 * Validates API key and returns authentication result
 * Throws 401 error if authentication fails
 */
export async function requireAuth(request: Request) {
  const authenticationResult = await authenticateApiRequest(request);

  if (!authenticationResult) {
    throw json({ error: "Invalid or Missing API key" }, { status: 401 });
  }

  return authenticationResult;
}

/**
 * Auth middleware for API routes with detailed error messages
 * Validates API key and returns authentication result
 * Throws 401 error with specific error message if authentication fails
 */
export async function requireAuthWithFailure(
  request: Request,
  options: { allowPublicKey?: boolean; allowJWT?: boolean } = {}
) {
  const authenticationResult = await authenticateApiRequestWithFailure(request, options);

  if (!authenticationResult.ok) {
    throw json({ error: authenticationResult.error }, { status: 401 });
  }

  return authenticationResult;
}

/**
 * Auth middleware for web routes
 * Validates user session and organization membership
 * Throws 401 if not authenticated, 403 if not a member of the organization
 */
export async function requireOrgMember(request: Request, orgSlug: string) {
  const user = await requireUser(request);

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: user.id,
      organization: { slug: orgSlug },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    throw json(
      { error: "You do not have access to this organization" },
      { status: 403 }
    );
  }

  return { user, membership };
}

/**
 * Auth middleware for web routes
 * Validates user session and project access (through organization membership)
 * Throws 401 if not authenticated, 404 if project not found or no access
 */
export async function requireProject(
  request: Request,
  orgSlug: string,
  projectSlug: string
) {
  const user = await requireUser(request);

  const project = await prisma.project.findFirst({
    where: {
      slug: projectSlug,
      deletedAt: null,
      organization: {
        slug: orgSlug,
        members: { some: { userId: user.id } },
      },
    },
    include: {
      organization: true,
      environments: {
        select: {
          id: true,
          type: true,
          slug: true,
          orgMember: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Response(undefined, {
      status: 404,
      statusText: "Project not found",
    });
  }

  return { user, project };
}

/**
 * Auth middleware for web routes
 * Validates user session and organization membership, returns organization
 * Throws 401 if not authenticated, 404 if organization not found or no access
 */
export async function requireOrganization(request: Request, orgSlug: string) {
  const user = await requireUser(request);

  const organization = await prisma.organization.findFirst({
    where: {
      slug: orgSlug,
      members: { some: { userId: user.id } },
    },
    include: {
      members: {
        where: {
          userId: user.id,
        },
        take: 1,
      },
    },
  });

  if (!organization || organization.members.length === 0) {
    throw json(
      { error: "Organization not found or you do not have access" },
      { status: 404 }
    );
  }

  return { user, organization, membership: organization.members[0] };
}

/**
 * Type-safe wrapper for organization member with user context
 */
export type AuthenticatedOrgContext = {
  user: Awaited<ReturnType<typeof requireUser>>;
  membership: NonNullable<
    Awaited<ReturnType<typeof prisma.orgMember.findFirst>>
  > & {
    organization: NonNullable<
      Awaited<ReturnType<typeof prisma.organization.findFirst>>
    >;
  };
};

/**
 * Type-safe wrapper for project with user context
 */
export type AuthenticatedProjectContext = {
  user: Awaited<ReturnType<typeof requireUser>>;
  project: NonNullable<
    Awaited<ReturnType<typeof prisma.project.findFirst>>
  > & {
    organization: NonNullable<
      Awaited<ReturnType<typeof prisma.organization.findFirst>>
    >;
  };
};
