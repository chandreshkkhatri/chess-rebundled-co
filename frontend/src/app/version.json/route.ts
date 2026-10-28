// The build this server is running; open pages compare it with their own build
// to offer a reload after a deploy (see src/lib/appUpdate.ts). Generated once
// per build.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    buildId: process.env.NEXT_PUBLIC_BUILD_ID || '',
    builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || '',
  });
}
