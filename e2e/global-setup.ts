/**
 * Global setup: seeds a test user in the backend database before E2E tests run.
 *
 * The test user is created via the backend's internal sign-in endpoint.
 * Auth is bypassed in E2E by injecting a pre-signed session cookie.
 */

import { chromium, FullConfig } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const TEST_USER_EMAIL = process.env.E2E_TEST_USER_EMAIL || "e2e-test@recipes.local";
const TEST_USER_NAME = "E2E Test User";

export default async function globalSetup(_config: FullConfig) {
  // Seed the test user in the backend
  const res = await fetch(`${BACKEND_URL}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.BACKEND_INTERNAL_SECRET
        ? { "X-Internal-Secret": process.env.BACKEND_INTERNAL_SECRET }
        : {}),
    },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      name: TEST_USER_NAME,
      image: null,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test user: ${res.status} ${text}`);
  }

  console.log(`✅ Test user seeded: ${TEST_USER_EMAIL}`);

  // Note: actual login in tests uses the credentials provider or a test bypass.
  // See tests/auth.spec.ts for the login flow.
}
