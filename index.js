const puppeteer = require('puppeteer');

(async () => {
  try {
    // 启动浏览器
    const browser = await puppeteer.launch({
      headless: 'new', // 使用新的无头模式
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    const page = await browser.newPage();
    
    // 导航到指定 URL
    const url = 'https://newapi.stonecoks.vip'; // 先尝试打开newapi，确认基本功能正常
    console.log(`正在打开: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // 只等待DOM内容加载，不等待所有资源
      timeout: 15000
    });

    console.log(`成功打开百度: ${url}`);
    console.log(`页面标题: ${await page.title()}`);
    
    // 如果百度能成功打开，再尝试打开 civitai.com
    console.log('百度打开成功，现在尝试打开 civitai.com');
    const civitaiUrl = 'https://civitai.com';
    console.log(`正在打开: ${civitaiUrl}`);
    
    try {
      // 尝试打开 civitai.com，但设置较短的超时时间
      await page.goto(civitaiUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000 // 设置较短的超时时间，避免等待太久
      });
      console.log(`成功打开 civitai.com`);
      console.log(`页面标题: ${await page.title()}`);
    } catch (civitaiError) {
      console.error('打开 civitai.com 时出错:', civitaiError.message);
      console.log('这可能是由于网络限制或网站响应慢导致的');
      console.log('尝试使用代理或VPN可能会解决此问题');
    }

    // 关闭浏览器
    await browser.close();
    console.log('浏览器已关闭');
  } catch (error) {
    console.error('发生错误:', error.message);
    
    // 确保浏览器关闭
    try {
      if (typeof browser !== 'undefined' && browser) {
        await browser.close();
        console.log('浏览器已关闭');
      }
    } catch (closeError) {
      console.error('关闭浏览器时出错:', closeError.message);
    }
  }
})();