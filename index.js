const puppeteer = require('puppeteer');

(async () => {
  // 启动浏览器
  const browser = await puppeteer.launch({
    // 如果在 Linux 环境中运行，可能需要以下参数
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 导航到指定 URL
  const url = 'https://civitai.com';
  console.log(`正在打开: ${url}`);
  await page.goto(url, {
    waitUntil: 'networkidle2', // 等待网络空闲
  });

  console.log(`成功打开: ${url}`);
  console.log(`页面标题: ${await page.title()}`);

  // 你可以在这里添加更多操作，例如截图、提取信息等

  // 关闭浏览器
  await browser.close();
  console.log('浏览器已关闭');
})();