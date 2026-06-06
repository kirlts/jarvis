import { test, expect } from '@playwright/test';

test.describe('Tenant Lifecycle Management', () => {
  let tenantsList = [
    {
      id: '01905555-5555-7555-8555-555555555551',
      name: 'Acme Corporation',
      created_at: '2026-05-29T10:00:00.000Z',
      deleted_at: null,
      config: { description: 'Original description' },
      status: 'active'
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

    // Unified Mock Router for tenants endpoints
    await page.route(/\/admin\/tenants/, async route => {
      const method = route.request().method();
      const url = route.request().url();

      if (url.includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessions: 1,
            inbox: { total: 5, pending: 0 },
            storage: { files: 0, bytes: '0' }
          }),
        });
      } else if (url.includes('01905555-5555-7555-8555-555555555551')) {
        if (method === 'PATCH') {
          const payload = JSON.parse(route.request().postData() || '{}');
          const tenantIndex = tenantsList.findIndex(t => t.id === '01905555-5555-7555-8555-555555555551');
          if (tenantIndex !== -1) {
            tenantsList[tenantIndex].config.description = payload.config?.description || '';
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(tenantsList[tenantIndex]),
          });
        } else if (method === 'DELETE') {
          tenantsList = tenantsList.filter(t => t.id !== '01905555-5555-7555-8555-555555555551');
          await route.fulfill({ status: 204 });
        } else {
          // GET single tenant
          const tenant = tenantsList.find(t => t.id === '01905555-5555-7555-8555-555555555551');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(tenant),
          });
        }
      } else {
        // List tenants (or POST create)
        if (method === 'POST') {
          const payload = JSON.parse(route.request().postData() || '{}');
          if (payload.name === 'Acme Corporation') {
            await route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'El nombre de usuario ya existe' }),
            });
          } else {
            const newTenant = {
              id: '01905555-5555-7555-8555-555555555552',
              name: payload.name,
              created_at: new Date().toISOString(),
              deleted_at: null,
              config: {},
              status: 'active'
            };
            tenantsList.push(newTenant);
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(newTenant),
            });
          }
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: tenantsList, meta: { total: tenantsList.length } }),
          });
        }
      }
    });

    // Mock empty inbox, audit and jobs lists for detail overview page
    await page.route(/\/admin\/inbox/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
    await page.route(/\/admin\/audit/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
    await page.route(/\/admin\/jobs/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
    await page.route(/\/admin\/whatsapp\/status\/.*\/channels/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('Test 3: Tenant Creation and Unique Name Constraint Validation', async ({ page }) => {
    await page.goto('/usuarios');

    // Open creation dialog/form
    await page.click('#create-tenant-button');

    // Fill form with a duplicate name
    await page.fill('#tenant-name-input', 'Acme Corporation');
    await page.click('#submit-tenant-button');

    // Verify error message/banner
    await expect(page.locator('.error-banner')).toBeVisible();

    // Fill form with a unique name
    await page.fill('#tenant-name-input', 'Stark Industries');
    await page.click('#submit-tenant-button');

    // Verify new tenant is added and we returned to the list
    await expect(page.locator('td:has-text("Stark Industries")')).toBeVisible();
  });

  test('Test 4: Tenant Details and Inline Editing of Description', async ({ page }) => {
    await page.goto('/usuarios');

    // Click on tenant in the list to open details
    await page.click('td:has-text("Acme Corporation")');

    // Verify redirection to details page
    await expect(page).toHaveURL(/\/usuarios\/01905555-5555-7555-8555-555555555551/);

    // Double click description container to edit
    const descContainer = page.locator('div[title="Doble clic para editar"]');
    await descContainer.dblclick();

    // Fill new description
    const descInput = page.locator('textarea[placeholder*="Descripción"]');
    await descInput.fill('Updated Acme Description');
    await descInput.blur(); // Trigger save on blur

    // Verify description shows updated text
    await expect(page.locator('div[title="Doble clic para editar"] p')).toHaveText('Updated Acme Description');
  });

  test('Test 5: Tenant Soft-Delete Flow', async ({ page }) => {
    await page.goto('/usuarios');

    // Click Delete button for the tenant row
    const deleteBtn = page.locator('#delete-tenant-01905555-5555-7555-8555-555555555551');
    await deleteBtn.click();

    // Confirm inside modal
    await page.click('#confirm-delete-button');

    // Verify tenant is deleted from the table list
    await expect(page.locator('td:has-text("Acme Corporation")')).not.toBeVisible();
  });
});
