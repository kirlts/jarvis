import { test, expect } from '@playwright/test';

test.describe('WhatsApp Channel Multi-Channel Lifecycle', () => {
  let channelsList = [
    {
      id: '01905555-5555-7555-8555-555555555561',
      tenant_id: '01905555-5555-7555-8555-555555555551',
      name: 'Ventas Latam',
      phone_number: '56912345678',
      status: 'connected',
      config: { processor: 'whisper', language: 'auto' },
      session_status: 'connected',
      qr_code: null,
      session_id: 'sess-ventas-1',
      created_at: '2026-05-29T11:00:00.000Z'
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

    // Mock individual tenant details (needed for WhatsApp tab context)
    await page.route(/\/admin\/tenants\/01905555-5555-7555-8555-555555555551$/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '01905555-5555-7555-8555-555555555551',
          name: 'Acme Corporation',
          created_at: '2026-05-29T10:00:00.000Z',
          deleted_at: null,
          config: {},
          status: 'active'
        }),
      });
    });

    // Mock tenant stats endpoint
    await page.route(/\/admin\/tenants\/01905555-5555-7555-8555-555555555551\/stats/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessions: 1,
          inbox: { total: 10, pending: 0 },
          storage: { files: 2, bytes: '1234567' }
        }),
      });
    });

    // Mock empty inbox, audit and jobs lists for overview tab
    await page.route(/\/admin\/inbox/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
    await page.route(/\/admin\/audit/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
    await page.route(/\/admin\/jobs/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });
  });

  test('Test 6: WhatsApp Channel Creation & Transition to QR Code State', async ({ page }) => {
    let postCalled = false;
    await page.route(/\/admin\/whatsapp\/status\/.*\/channels/, async route => {
      const method = route.request().method();
      if (method === 'POST') {
        postCalled = true;
        const payload = JSON.parse(route.request().postData() || '{}');
        const newChannel = {
          id: '01905555-5555-7555-8555-555555555562',
          tenant_id: '01905555-5555-7555-8555-555555555551',
          name: payload.name,
          phone_number: null,
          status: 'qr_pending',
          config: {},
          session_status: 'qr_pending',
          qr_code: 'livelink-qr-mock-data-value',
          session_id: 'sess-new-qr-2',
          created_at: new Date().toISOString()
        };
        channelsList.push(newChannel);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newChannel),
        });
      } else {
        // Return plain array directly as expected by custom dataProvider and channelsResult mapping
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(channelsList),
        });
      }
    });

    await page.goto('/usuarios/01905555-5555-7555-8555-555555555551');

    // Click on WhatsApp tab
    await page.click('button:has-text("Conexión WhatsApp")');

    // Verify current list shows Ventas Latam
    await expect(page.locator('.channel-list-item:has-text("Ventas Latam")')).toBeVisible();

    // Click to add a new WhatsApp channel
    await page.click('#create-channel-button');

    // Fill channel info
    await page.fill('input[placeholder*="Nombre del canal"]', 'Soporte España');
    await page.click('button:has-text("Crear")');

    // Verify post endpoint was triggered
    expect(postCalled).toBe(true);

    // Click on the Soporte España channel list item to open detail panel
    await page.click('.channel-list-item:has-text("Soporte España")');

    // Verify QR code image is rendered successfully
    const qrImg = page.locator('img[alt="QR Code"]');
    await expect(qrImg).toBeVisible();
    await expect(qrImg).toHaveAttribute('src', /api\.qrserver\.com\/v1\/create-qr-code/);
  });

  test('Test 7: WhatsApp Channel Dynamic Plugin Configuration', async ({ page }) => {
    let patchPayload: any = null;
    await page.route(/\/admin\/whatsapp\/status\/.*\/channels/, async route => {
      const method = route.request().method();
      if (method === 'PATCH') {
        patchPayload = JSON.parse(route.request().postData() || '{}');
        const channelIndex = channelsList.findIndex(c => c.id === '01905555-5555-7555-8555-555555555561');
        if (channelIndex !== -1) {
          channelsList[channelIndex].config = patchPayload.config;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(channelsList[channelIndex]),
        });
      } else {
        // Return plain array directly
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(channelsList),
        });
      }
    });

    await page.goto('/usuarios/01905555-5555-7555-8555-555555555551');
    await page.click('button:has-text("Conexión WhatsApp")');

    // Open detail panel for Ventas Latam
    await page.click('.channel-list-item:has-text("Ventas Latam")');

    // Select Antigravity CLI processor plugin from select dropdown
    const processorSelect = page.locator('label:has-text("Procesador") + select');
    await processorSelect.selectOption('antigravity');

    // Fill in custom fields rendered dynamically for antigravity
    await page.fill('label:has-text("Proyecto Objetivo") + input', '/home/kirlts/jarvis/other');
    await page.fill('label:has-text("Timeout") + input', '60');

    // Click Save Config button
    await page.click('button:has-text("Guardar Cambios")');

    // Verify the PATCH payload matches our selection
    expect(patchPayload).not.toBeNull();
    expect(patchPayload.config.processor).toBe('antigravity');
    expect(patchPayload.config.target_project).toBe('/home/kirlts/jarvis/other');
    expect(patchPayload.config.timeout_sec).toBe(60);
  });

  test('Test 8: WhatsApp Channel Disconnection / Removal Flow', async ({ page }) => {
    let deleteCalled = false;
    await page.route(/\/admin\/whatsapp\/status\/.*\/channels/, async route => {
      const method = route.request().method();
      if (method === 'DELETE') {
        deleteCalled = true;
        channelsList = channelsList.filter(c => c.id !== '01905555-5555-7555-8555-555555555561');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        // Return plain array directly
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(channelsList),
        });
      }
    });

    await page.goto('/usuarios/01905555-5555-7555-8555-555555555551');
    await page.click('button:has-text("Conexión WhatsApp")');

    // Click Ventas Latam to open detail panel
    await page.click('.channel-list-item:has-text("Ventas Latam")');

    // Hook Playwright dialog handler to accept confirm dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('¿Desconectar este canal?');
      await dialog.accept();
    });

    // Click Disconnect/Delete button inside detail panel
    await page.click('button:has-text("Desconectar")');

    // Verify channel disconnect endpoint was called
    expect(deleteCalled).toBe(true);

    // Verify channel list item Ventas Latam disappears from list
    await expect(page.locator('.channel-list-item:has-text("Ventas Latam")')).not.toBeVisible();
  });
});
