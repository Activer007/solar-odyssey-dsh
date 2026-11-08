import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, timeout: 90000, workers: 1,
  use: { baseURL:'http://127.0.0.1:5173', viewport:{width:1440,height:900}, headless:true,
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']},
  },
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:30000},
});
