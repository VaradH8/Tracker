/**
 * Legacy entry-point kept so older imports of `@/auth` don't break.
 * The real implementation now lives in `lib/auth.ts`. New code should
 * import from `@/lib/auth` directly.
 */
export {
  signIn,
  signOut,
  register,
  getCurrentUser,
  changePassword,
  type SessionUser,
} from "./lib/auth";
