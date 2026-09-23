import type { Express } from "express";
import type { Context } from "@netlify/functions";
import { withLambda, type HandlerResponse } from "@netlify/aws-lambda-compat";
import serverless from "serverless-http";

/** Thin Express bridge on Netlify's modern Functions runtime; no listening socket. */
export function createNetlifyHandler(createApplication: () => Express) {
  let invoke: ReturnType<typeof serverless> | undefined;
  return async (request: Request, context: Context): Promise<Response> => {
    // Build once per warm function instance; request-specific IP/path never live in shared state.
    const bridge = withLambda(
      async (event, lambdaContext): Promise<HandlerResponse> => {
        try {
          invoke ??= serverless(createApplication());
          const headers = { ...event.headers },
            multiValueHeaders = { ...event.multiValueHeaders };
          for (const name of ["x-forwarded-for", "forwarded"]) {
            delete headers[name];
            delete multiValueHeaders[name];
          }
          const normalized = {
            ...event,
            headers,
            multiValueHeaders,
            path: event.path.replace(
              /^\/\.netlify\/functions\/api(?=\/|$)/,
              "/api",
            ),
            requestContext: {
              requestId: context.requestId,
              identity: { sourceIp: context.ip },
            },
          };
          return (await invoke(normalized, {
            ...lambdaContext,
            callbackWaitsForEmptyEventLoop: false,
          })) as HandlerResponse;
        } catch {
          return {
            statusCode: 503,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
            body: JSON.stringify({
              message:
                "The service could not confirm the result. Check the current state before retrying.",
            }),
          };
        }
      },
    );
    return bridge(request, context);
  };
}
