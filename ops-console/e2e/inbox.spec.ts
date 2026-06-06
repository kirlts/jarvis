import { test, expect } from '@playwright/test';

test.describe('S3 Storage Browser Observability', () => {
  let storageList = [
    {
      id: '01905555-5555-7555-8555-555555555591',
      tenant_id: '01905555-5555-7555-8555-555555555551',
      file_name: 'screenshot_error.png',
      size: 1048576, // 1 MB
      mime_type: 'image/png',
      storage_key: 'tenants/1/screenshot_error.png',
      status: 'uploaded',
      created_at: '2026-05-29T14:00:00.000Z',
      deleted_at: null
    },
    {
      id: '01905555-5555-7555-8555-555555555592',
      tenant_id: '01905555-5555-7555-8555-555555555551',
      file_name: 'voice_note.mp3',
      size: 256000,
      mime_type: 'audio/mpeg',
      storage_key: 'tenants/1/voice_note.mp3',
      status: 'pending',
      created_at: '2026-05-29T14:05:00.000Z',
      deleted_at: null
    }
  ];

  test.beforeEach(async ({ page }) => {
    // Intercept telemetry and other outside requests
    await page.route('**/telemetry.refine.dev/**', route => route.abort());

    // Inject valid RS256 login token to bypass auth page
    const validRs256Token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.mock_signature';
    await page.addInitScript((token) => {
      window.sessionStorage.setItem('jarvis_admin_token', token);
    }, validRs256Token);

    // Mock tenants list (needed to resolve tenant dropdown)
    await page.route('**/admin/tenants?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: '01905555-5555-7555-8555-555555555551', name: 'Acme Corporation' }
          ],
          meta: { total: 1 }
        }),
      });
    });

    // Mock storage list
    await page.route('**/admin/storage?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: storageList,
          meta: { total: storageList.length }
        }),
      });
    });

    // Mock storage summary
    await page.route('**/admin/storage/summary', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active_files: 1,
          pending_files: 1,
          deleted_files: 0,
          active_bytes: '1048576',
          tenants_with_files: 1
        }),
      });
    });

    // Mock storage batch presigned urls
    await page.route('**/admin/storage/batch-urls', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '01905555-5555-7555-8555-555555555591', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
        ]),
      });
    });
  });

  test('Test 10: Storage Summary Cards, Filtering, and Media Expand Preview', async ({ page }) => {
    await page.goto('/storage');

    // Verify page header is visible
    await expect(page.locator('h1')).toContainText('Storage');

    // Verify summary cards render correctly
    await expect(page.locator('.dashboard-card:has-text("Archivos activos") .dashboard-card-value')).toHaveText('1');
    await expect(page.locator('.dashboard-card:has-text("Pendientes") .dashboard-card-value')).toHaveText('1');

    // Verify table lists the files
    await expect(page.locator('td:has-text("screenshot_error.png")')).toBeVisible();
    await expect(page.locator('td:has-text("voice_note.mp3")')).toBeVisible();

    // Fill search filter
    const searchInput = page.locator('#storage-search');
    await searchInput.fill('screenshot');

    // Verify search payload was entered correctly
    await expect(searchInput).toHaveValue('screenshot');

    // Click on the screenshot row to toggle visual media preview expand
    await page.click('td:has-text("screenshot_error.png")');

    // Verify media preview image element becomes visible inside the expanded row context
    const previewImg = page.locator('img[alt="screenshot_error.png"]');
    await expect(previewImg).toBeVisible();
    await expect(previewImg).toHaveAttribute('src', /data:image\/png/);
  });
});
