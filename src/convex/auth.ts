// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Password: classic email + password sign-in/sign-up (flow via signIn("password", …)).
  // emailOtp: kept as a server-side fallback. Anonymous: guest sessions.
  providers: [Password, emailOtp, Anonymous],
});