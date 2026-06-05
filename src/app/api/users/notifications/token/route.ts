import { withAuth } from "@/lib/http/withAuth";
import { toUserResponse } from "@/lib/http/userResult";
import {
  internalError,
  jsonError,
  parseJsonBody,
} from "@/lib/http/route";
import { deviceBodySchema } from "@/lib/validators/auth";
import { clearDeviceToken, setDeviceToken } from "@/services/users/user";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = deviceBodySchema.safeParse(parsed.data);
    if (!body.success) {
      return jsonError(400, {
        msg: "There was an error while trying to set notifications on your device, please, check your settings",
      });
    }

    try {
      const result = await setDeviceToken(authUser.id, body.data.device);
      return toUserResponse(result, (data) => Response.json(data));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}

export async function DELETE(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      const result = await clearDeviceToken(authUser.id);
      return toUserResponse(result, (data) => Response.json(data));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}
