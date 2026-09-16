import { chromium } from 'playwright'

const shot = (p) => 'C:\\Users\\DELL\\AppData\\Local\\Temp\\claude\\c--Users-DELL-Downloads-bhuiyan-industry-bhuiyan\\cd0eb30c-22db-4b12-a910-18729873b30c\\scratchpad\\' + p

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://localhost:5173/login')
await page.waitForTimeout(1000)

const inputs = page.locator('input')
await inputs.nth(0).fill('admin@gmail.com')
await inputs.nth(1).fill('12345678')
await page.screenshot({ path: shot('login-filled.png') })

await page.getByText('Log in', { exact: true }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: shot('after-login.png') })

await page.goto('http://localhost:5173/ledger')
await page.waitForTimeout(1500)
await page.screenshot({ path: shot('ledger-check.png') })
await browser.close()
console.log('done')
