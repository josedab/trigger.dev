import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { json } from "@remix-run/server-runtime";
import { prisma } from "~/db.server";
import { requireAuth } from "~/middleware/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const authenticationResult = await requireAuth(request);

  const environmentWithUser = await prisma.runtimeEnvironment.findUnique({
    select: {
      orgMember: {
        select: {
          userId: true,
        },
      },
    },
    where: {
      id: authenticationResult.environment.id,
    },
  });

  const result = {
    ...authenticationResult.environment,
    userId: environmentWithUser?.orgMember?.userId,
  };

  return json(result);
}
