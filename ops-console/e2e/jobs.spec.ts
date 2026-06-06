import { test, expect } from '@playwright/test';

test.describe('Operations Background Queue Monitoring', () => {
  let jobsList = [
    {
      id: '01905555-5555-7555-8555-555555555571',
      name: 'sync-inbox-process',
      state: 'completed',
      data: { tenantId: 'tenant-1' },
      created_on: '2026-05-29T12:00:00.000Z',
      started_on: '2026-05-29T12:00:01.000Z',
      completed_on: '2026-05-29T12:00:05.000Z',
      tenant_id: null,
      tenant_name: null,
      description: null
    },
    {
      id: '01905555-5555-7555-8555-555555555572',
      name: 'ocr-extraction',
      state: 'failed',
      data: { tenantId: 'tenant-2', error: 'MinIO timeout' },
      created_on: '2026-05-29T12:10:00.000Z',
      started_on: '2026-05-29T12:10:02.000Z',
      completed_on: null,
      tenant_id: null,
      tenant_name: null,
      description: null
    }
  ];

  test.beforeEach(async ({ page }) => {
    // Intercept telemetry and other outside requests
    await page.route(/\/telemetry\.refine\.dev/, route => route.abort());

    // Inject valid RS256 login token to bypass auth page
    const validRs256Token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.mock_signature';
    await page.addInitScript((token) => {
      window.sessionStorage.setItem('jarvis_admin_token', token);
    }, validRs256Token);
  });

  test('Test 9: Job Monitoring, Filtering, and Purging', async ({ page }) => {
    let purgeCalled = false;
    await page.route(/\/admin\/jobs/, async route => {
      const method = route.request().method();
      if (method === 'DELETE') {
        purgeCalled = true;
        jobsList = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ purgedCount: 2 }),
        });
      } else {
        const url = new URL(route.request().url());
        const stateFilter = url.searchParams.get('state');
        let filteredJobs = jobsList;
        if (stateFilter) {
          filteredJobs = jobsList.filter(j => j.state === stateFilter);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(filteredJobs),
        });
      }
    });

    await page.goto('/operaciones');

    // Verify both jobs are rendered in the list table
    await expect(page.locator('td:has-text("sync-inbox-process")')).toBeVisible();
    await expect(page.locator('td:has-text("ocr-extraction")')).toBeVisible();

    // Click "Fallidos" button to filter down jobs
    await page.click('button:has-text("Fallidos")');

    // Verify only failed job remains in view
    await expect(page.locator('td:has-text("sync-inbox-process")')).not.toBeVisible();
    await expect(page.locator('td:has-text("ocr-extraction")')).toBeVisible();

    // Click "Todos" to reset filter
    await page.click('button:has-text("Todos")');

    // Trigger Bulk Purge Jobs action
    await page.click('#purge-jobs-button');

    // Confirm inside the modal
    await page.click('#confirm-purge-jobs');

    // Verify job table lists zero records / empty state is shown
    await expect(page.locator('td:has-text("sync-inbox-process")')).not.toBeVisible();
    await expect(page.locator('td:has-text("ocr-extraction")')).not.toBeVisible();
    expect(purgeCalled).toBe(true);
  });
});
