import { redirect, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { SelectBestEnvironmentPresenter } from "~/presenters/SelectBestEnvironmentPresenter.server";
import { requireProject } from "~/middleware/auth";
import { ProjectParamSchema, v3ProjectSettingsPath } from "~/utils/pathBuilder";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { organizationSlug, projectParam } = ProjectParamSchema.parse(params);
  const { user, project } = await requireProject(request, organizationSlug, projectParam);

  const selector = new SelectBestEnvironmentPresenter();
  const environment = await selector.selectBestEnvironment(project.id, user, project.environments);

  return redirect(v3ProjectSettingsPath({ slug: organizationSlug }, project, environment));
};
