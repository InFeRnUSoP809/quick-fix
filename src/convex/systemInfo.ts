import { query } from "./_generated/server";

/*
 * Server-side configuration flags (booleans only — never values).
 * Used by the admin UI to show which secrets are present.
 */
export const checkConfig = query({
  args: {},
  handler: async () => {
    return {
      hasDeepseekKey: !!process.env.DEEPSEEK_API_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  },
});
