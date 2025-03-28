const puppeteer = require('puppeteer');

/**
 * 启动浏览器并返回浏览器实例
 * @returns {Promise<import('puppeteer').Browser>} 浏览器实例
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: 'new', // 使用新的无头模式
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
}

/**
 * 访问指定URL并获取页面信息
 * @param {import('puppeteer').Page} page 页面实例
 * @param {string} url 要访问的URL
 * @param {number} timeout 超时时间（毫秒）
 * @returns {Promise<{success: boolean, title: string, error: string|null}>} 访问结果
 */
async function visitUrl(page, url, timeout = 15000) {
  try {
    console.log(`正在打开: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // 只等待DOM内容加载，不等待所有资源
      timeout: timeout
    });
    
    const title = await page.title();
    console.log(`成功打开: ${url}`);
    console.log(`页面标题: ${title}`);
    
    return {
      success: true,
      title: title,
      error: null
    };
  } catch (error) {
    console.error(`打开 ${url} 时出错:`, error.message);
    return {
      success: false,
      title: '',
      error: error.message
    };
  }
}

/**
 * 运行浏览器测试流程
 * @returns {Promise<void>}
 */
async function runBrowserTest() {
  let browser;
  
  try {
    // 启动浏览器
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    // 首先访问测试URL
    const testUrl = 'https://newapi.stonecoks.vip';
    const testResult = await visitUrl(page, testUrl);
    
    // 如果测试URL能成功打开，再尝试打开目标网站
    if (testResult.success) {
      console.log('测试网站打开成功，现在尝试打开 civitai.com');
      const targetUrl = 'https://civitai.com';
      const targetResult = await visitUrl(page, targetUrl);
      
      if (!targetResult.success) {
        console.log('这可能是由于网络限制或网站响应慢导致的');
        console.log('尝试使用代理或VPN可能会解决此问题');
      }
    }
    
    // 关闭浏览器
    await browser.close();
    console.log('浏览器已关闭');
  } catch (error) {
    console.error('发生错误:', error.message);
    
    // 确保浏览器关闭
    try {
      if (browser) {
        await browser.close();
        console.log('浏览器已关闭');
      }
    } catch (closeError) {
      console.error('关闭浏览器时出错:', closeError.message);
    }
  }
}

module.exports = {
  launchBrowser,
  visitUrl,
  runBrowserTest
};