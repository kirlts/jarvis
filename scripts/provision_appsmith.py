import asyncio
import os
from playwright.async_api import async_playwright
import time

async def provision_appsmith():
    print("[*] Iniciando Playwright para configurar Appsmith...")
    async with async_playwright() as p:
        # Launch browser in headless mode
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Use docker networking hostname if running inside provisioner, else localhost/caddy
        base_url = os.environ.get("APPSMITH_URL", "http://appsmith:80")
        url = f"{base_url}/setup/welcome"
        print(f"[*] Navegando a {url}")
        
        # Go to the setup page and wait for network to be somewhat idle
        await page.goto(url, wait_until="networkidle")
        
        # Wait a bit just in case
        await asyncio.sleep(2)
                # Check if we are on the welcome page
        if "setup/welcome" in page.url:
            print("[*] Formulario de setup detectado. Completando campos...")
            
            try:
                # Wait up to 30 seconds to see if First Name appears and is visible
                await page.wait_for_selector('input[placeholder="John"]', state="visible", timeout=30000)
                print("[*] Completando Paso 1...")
                
                # Fill using placeholders with valid formatting to pass frontend validation
                await page.locator('input[placeholder="John"]').fill("Admin")
                await page.locator('input[placeholder="Doe"]').fill("Jarvis")
                await page.locator('input[placeholder="How can we reach you?"]').fill("admin@jarvis-internal.com")
                await page.locator('input[placeholder="Make it strong!"]').fill("Jarvis_sandbox_2026!")
                await page.locator('input[placeholder="Type correctly"]').fill("Jarvis_sandbox_2026!")
                
                await asyncio.sleep(1)
                
                print("[*] Haciendo click en Continue...")
                await page.get_by_role("button", name="Continue").click()
                
            except Exception as e:
                print(f"[*] Paso 1 omitido o falló: {e}")
            
            print("[*] Esperando el paso 2...")
            
            # Wait for Step 2 elements to appear AND be visible
            try:
                await page.wait_for_selector("text=What is your general development proficiency?", state="visible", timeout=10000)
                
                # Select 'Advanced'
                await page.locator("text=Advanced").locator("visible=true").first.click()
                
                # Select 'Work Project'
                await page.locator("text=Work Project").locator("visible=true").first.click()
                
                try:
                    await page.locator('text="I accept receiving security and product updates"').locator("visible=true").click()
                except Exception:
                    pass
                    
                print("[*] Paso 2 completado. Finalizando setup...")
                
                # Click the 'Get started' button
                await page.locator("text=Get started").locator("visible=true").first.click()
            except Exception as e:
                print(f"[*] Paso 2 omitido o falló: {e}")
            
            print("[*] Esperando a que el dashboard cargue...")
            try:
                await page.wait_for_url("**/applications*", timeout=20000)
                print("[✓] Appsmith configurado exitosamente. Administrador creado.")
                print(f"[*] Credenciales: admin@jarvis-internal.com / Jarvis_sandbox_2026!")
            except Exception:
                print("[!] Timeout esperando el dashboard, pero el setup probablemente terminó.")
        else:
            print("[✓] Appsmith ya estaba configurado o no mostró la pantalla de setup.")
            print(f"[*] URL actual: {page.url}")
            
        await browser.close()

if __name__ == "__main__":
    try:
        asyncio.run(provision_appsmith())
    except Exception as e:
        print(f"[ERROR] Falló la configuración de Appsmith: {e}")
