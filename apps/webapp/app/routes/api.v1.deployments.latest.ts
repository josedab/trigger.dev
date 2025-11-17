import { LoaderFunctionArgs, json } from "@remix-run/server-runtime";
import { WorkerInstanceGroupType } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { requireAuth } from "~/middleware/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const authenticationResult = await requireAuth(request);
  const authenticatedEnv = authenticationResult.environment;

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      type: WorkerInstanceGroupType.UNMANAGED,
      environmentId: authenticatedEnv.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!deployment) {
    return json({ error: "Deployment not found" }, { status: 404 });
  }

  return json({
    id: deployment.friendlyId,
    status: deployment.status,
    contentHash: deployment.contentHash,
    shortCode: deployment.shortCode,
    version: deployment.version,
    imageReference: deployment.imageReference,
    errorData: deployment.errorData,
  });
}
