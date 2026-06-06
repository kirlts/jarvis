import { test, expect } from '@playwright/test';

test.describe('Authentication and Session Management', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept telemetry and other outside requests
    await page.route(/\/telemetry\.refine\.dev/, route => route.abort());
  });

  test('Test 1: Should reject invalid JWT and show error banner', async ({ page }) => {
    await page.goto('/login');

    // Attempt to submit empty token
    await page.click('#login-submit-button');
    await expect(page.locator('.error-banner')).toHaveText('El token es obligatorio');

    // Attempt to submit malformed token
    await page.fill('#jwt-token-input', 'invalid-token-12345');
    await page.click('#login-submit-button');
    
    // We expect the banner to show "Invalid JWT format"
    // Since Refine useLogin resolves error with returned error message,
    // let's ensure the LoginPage catches and displays the error by mocking authProvider
    await expect(page.locator('.error-banner')).toContainText('Invalid JWT format');
  });

  test('Test 2: Should login successfully via Dev Login and log out', async ({ page }) => {
    const validRs256Token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.mock_signature';

    // Mock the dev-login API endpoint
    await page.route(/\/admin\/dev-login/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: validRs256Token }),
      });
    });

    // Mock the check auth and tenants call post-login
    await page.route(/\/admin\/tenants/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.goto('/login');

    // Perform dev login
    await page.click('#dev-login-button');

    // Verify redirected to dashboard / main view
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Trigger logout
    await page.click('button:has-text("Cerrar Sesión")');

    // Verify redirected back to login page
    await expect(page).toHaveURL('/login');
  });
});
