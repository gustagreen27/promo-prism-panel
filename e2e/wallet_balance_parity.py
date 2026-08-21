"""E2E: garante que o badge do header e /painel/financeiro leiam a mesma fonte de saldo.

Uso (com sessão de cliente disponível no ambiente):
    python3 e2e/wallet_balance_parity.py

Verificações:
 1. Ambos os valores (data-testid="header-credits" e "financeiro-credits") existem.
 2. Os dois números são idênticos (mesma queryKey ["wallet", workspaceId]).
 3. Nenhum aviso de divergência é renderizado.
 4. O botão de exportar CSV do histórico está presente.
"""

import asyncio
import json
import os
import re
import sys

from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")


def to_int(text: str) -> int:
    return int(re.sub(r"\D", "", text or "0") or 0)


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})

        if cj := os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON"):
            await context.add_cookies([{**c, "url": BASE} for c in json.loads(cj)])

        page = await context.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")

        key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if key and sj:
            await page.evaluate(
                f"localStorage.setItem({json.dumps(key)}, {json.dumps(sj)})"
            )

        await page.goto(f"{BASE}/painel/financeiro", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="financeiro-credits"]', timeout=20000)
        await page.wait_for_selector('[data-testid="header-credits"]', timeout=20000)
        await page.wait_for_timeout(1500)

        header = to_int(await page.inner_text('[data-testid="header-credits"]'))
        finance = to_int(await page.inner_text('[data-testid="financeiro-credits"]'))
        warning = await page.locator("text=Divergência de saldo detectada").count()
        export_btn = await page.locator('[data-testid="export-credits-csv"]').count()

        ok = header == finance and warning == 0 and export_btn == 1
        print(
            json.dumps(
                {
                    "header_credits": header,
                    "financeiro_credits": finance,
                    "divergence_warning": warning,
                    "export_button": export_btn,
                    "status": "pass" if ok else "fail",
                },
                ensure_ascii=False,
            )
        )
        await browser.close()
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
