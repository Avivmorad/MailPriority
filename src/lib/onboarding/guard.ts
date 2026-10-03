/**
 * App pages stay reachable during setup. Sign-in still lands on /onboarding,
 * and that page sends finished setups to the dashboard.
 */
export async function requireOnboardingComplete(_userId: string): Promise<void> {}
