const puppeteer = require('puppeteer');

(async () => {
  try {
    // 启动浏览器
    const browser = await puppeteer.launch({
      // 如果在 Linux 环境中运行，可能需要以下参数
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      timeout: 60000 // 增加浏览器启动超时时间到 60 秒
    });
    const page = await browser.newPage();
    
    // 设置页面超时
    page.setDefaultNavigationTimeout(60000); // 增加导航超时时间到 60 秒
    page.setDefaultTimeout(60000); // 增加默认操作超时时间到 60 秒

    // 导航到指定 URL
    const url = 'https://civitai.com';
    console.log(`正在打开: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2', // 等待网络空闲
      timeout: 60000 // 为这个特定导航设置 60 秒超时
    });

    console.log(`成功打开: ${url}`);
    console.log(`页面标题: ${await page.title()}`);

    // 你可以在这里添加更多操作，例如截图、提取信息等

    // 关闭浏览器
    await browser.close();
    console.log('浏览器已关闭');
  } catch (error) {
    console.error('发生错误:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 尝试截图记录错误状态（如果浏览器和页面已经创建）
    try {
      if (typeof page !== 'undefined' && page) {
        const screenshotPath = `error-screenshot-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`错误截图已保存至: ${screenshotPath}`);
      }
    } catch (screenshotError) {
      console.error('无法保存错误截图:', screenshotError.message);
    }
    
    // 确保浏览器关闭
    try {
      if (typeof browser !== 'undefined' && browser) {
        await browser.close();
        console.log('浏览器已关闭');
      }
    } catch (closeError) {
      console.error('关闭浏览器时出错:', closeError.message);
    }
    
    process.exit(1); // 以错误状态退出
  }
})();