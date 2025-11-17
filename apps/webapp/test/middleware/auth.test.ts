import { describe, it, expect, vi, beforeEach } from "vitest";
import * as auth from "../../app/middleware/auth";
import * as apiAuth from "../../app/services/apiAuth.server";
import * as session from "../../app/services/session.server";
import { prisma } from "../../app/db.server";

// Mock dependencies
vi.mock("../../app/services/apiAuth.server");
vi.mock("../../app/services/session.server");
vi.mock("../../app/db.server", () => ({
  prisma: {
    orgMember: {
      findFirst: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
  },
}));

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("should return authentication result when API key is valid", async () => {
      const mockRequest = new Request("https://example.com");
      const mockAuthResult = {
        ok: true,
        apiKey: "test_key",
        type: "PRIVATE" as const,
        environment: { id: "env_123" },
      };

      vi.mocked(apiAuth.authenticateApiRequest).mockResolvedValue(mockAuthResult as any);

      const result = await auth.requireAuth(mockRequest);

      expect(result).toEqual(mockAuthResult);
      expect(apiAuth.authenticateApiRequest).toHaveBeenCalledWith(mockRequest);
    });

    it("should throw 401 error when API key is invalid", async () => {
      const mockRequest = new Request("https://example.com");
      vi.mocked(apiAuth.authenticateApiRequest).mockResolvedValue(undefined);

      await expect(auth.requireAuth(mockRequest)).rejects.toThrow();
    });
  });

  describe("requireAuthWithFailure", () => {
    it("should return authentication result when API key is valid", async () => {
      const mockRequest = new Request("https://example.com");
      const mockAuthResult = {
        ok: true,
        apiKey: "test_key",
        type: "PRIVATE" as const,
        environment: { id: "env_123" },
      };

      vi.mocked(apiAuth.authenticateApiRequestWithFailure).mockResolvedValue(
        mockAuthResult as any
      );

      const result = await auth.requireAuthWithFailure(mockRequest);

      expect(result).toEqual(mockAuthResult);
    });

    it("should throw 401 error with specific message when API key is invalid", async () => {
      const mockRequest = new Request("https://example.com");
      const mockAuthResult = {
        ok: false,
        error: "Invalid API Key",
      };

      vi.mocked(apiAuth.authenticateApiRequestWithFailure).mockResolvedValue(
        mockAuthResult as any
      );

      await expect(auth.requireAuthWithFailure(mockRequest)).rejects.toThrow();
    });
  });

  describe("requireOrgMember", () => {
    it("should return user and membership when user is a member of the organization", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };
      const mockMembership = {
        id: "member_123",
        userId: "user_123",
        organization: { id: "org_123", slug: "test-org" },
      };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.orgMember.findFirst).mockResolvedValue(mockMembership as any);

      const result = await auth.requireOrgMember(mockRequest, "test-org");

      expect(result).toEqual({ user: mockUser, membership: mockMembership });
      expect(prisma.orgMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          organization: { slug: "test-org" },
        },
        include: {
          organization: true,
        },
      });
    });

    it("should throw 403 error when user is not a member of the organization", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.orgMember.findFirst).mockResolvedValue(null);

      await expect(auth.requireOrgMember(mockRequest, "test-org")).rejects.toThrow();
    });
  });

  describe("requireProject", () => {
    it("should return user and project when user has access to the project", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };
      const mockProject = {
        id: "project_123",
        slug: "test-project",
        organization: { id: "org_123", slug: "test-org" },
        environments: [],
      };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any);

      const result = await auth.requireProject(mockRequest, "test-org", "test-project");

      expect(result).toEqual({ user: mockUser, project: mockProject });
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          slug: "test-project",
          deletedAt: null,
          organization: {
            slug: "test-org",
            members: { some: { userId: mockUser.id } },
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
    });

    it("should throw 404 error when project is not found", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.project.findFirst).mockResolvedValue(null);

      await expect(
        auth.requireProject(mockRequest, "test-org", "test-project")
      ).rejects.toThrow();
    });
  });

  describe("requireOrganization", () => {
    it("should return user, organization, and membership when user has access", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };
      const mockOrganization = {
        id: "org_123",
        slug: "test-org",
        members: [{ id: "member_123", userId: "user_123" }],
      };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.organization.findFirst).mockResolvedValue(mockOrganization as any);

      const result = await auth.requireOrganization(mockRequest, "test-org");

      expect(result).toEqual({
        user: mockUser,
        organization: mockOrganization,
        membership: mockOrganization.members[0],
      });
    });

    it("should throw 404 error when organization is not found", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);

      await expect(auth.requireOrganization(mockRequest, "test-org")).rejects.toThrow();
    });

    it("should throw 404 error when user is not a member", async () => {
      const mockRequest = new Request("https://example.com");
      const mockUser = { id: "user_123", email: "test@example.com" };
      const mockOrganization = {
        id: "org_123",
        slug: "test-org",
        members: [],
      };

      vi.mocked(session.requireUser).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.organization.findFirst).mockResolvedValue(mockOrganization as any);

      await expect(auth.requireOrganization(mockRequest, "test-org")).rejects.toThrow();
    });
  });
});
