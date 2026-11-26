import { userErrorResponse } from "../../_user";
import { buildAuthorization, providerFrom } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = providerFrom(body.provider);
    if (!provider) return Response.json({ error: "Choose Instagram or YouTube." }, { status: 400 });
    return await buildAuthorization(request, provider);
  } catch (error) { return userErrorResponse(error); }
}
