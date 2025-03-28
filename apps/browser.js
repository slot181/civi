const puppeteer = require('puppeteer');

/**
 * 启动浏览器并返回浏览器实例
 * @returns {Promise<import('puppeteer').Browser>} 浏览器实例
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: 'new', // 使用无头模式
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
 * 在Civitai网站上执行登录流程
 * @param {import('puppeteer').Page} page 页面实例
 * @param {string} email 用于登录的邮箱地址
 * @returns {Promise<{success: boolean, error: string|null}>} 登录结果
 */
async function loginToCivitai(page, email) {
  try {
    console.log('========== 开始执行登录流程 ==========');
    
    // 等待页面完全加载
    console.log('正在等待页面加载完成...');
    await page.waitForSelector('body', { timeout: 10000 });
    
    // 获取页面HTML，帮助调试
    const pageHTML = await page.content();
    console.log('页面HTML片段:', pageHTML.substring(0, 500) + '...');
    
    // 尝试查找登录按钮
    console.log('正在寻找登录按钮...');
    
    // 获取所有可能的登录按钮
    const signInButtons = await page.evaluate(() => {
      // 尝试多种选择器
      const buttons = [
        // 通过文本内容查找
        ...Array.from(document.querySelectorAll('a, button')).filter(el =>
          el.textContent && el.textContent.trim().toLowerCase() === 'sign in'),
        // 通过href属性查找
        ...Array.from(document.querySelectorAll('a[href*="login"]')),
        // 通过rel属性查找
        ...Array.from(document.querySelectorAll('a[rel="nofollow"]')),
        // 通过data-button属性查找
        ...Array.from(document.querySelectorAll('a[data-button="true"]'))
      ];
      
      return buttons.map(button => ({
        text: button.textContent.trim(),
        outerHTML: button.outerHTML,
        href: button.getAttribute('href'),
        classes: button.getAttribute('class')
      }));
    });
    
    console.log('找到可能的登录按钮:', signInButtons.length);
    signInButtons.forEach((btn, index) => {
      console.log(`按钮 ${index + 1}:`, btn);
    });
    
    // 尝试点击第一个找到的登录按钮
    if (signInButtons.length > 0) {
      const buttonSelector = signInButtons[0].href ?
        `a[href="${signInButtons[0].href}"]` :
        `a.${signInButtons[0].classes.split(' ')[0]}`;
      
      console.log('使用选择器:', buttonSelector);
      await page.waitForSelector(buttonSelector, { timeout: 5000 });
      console.log('✓ 找到登录按钮');
      
      // 点击"Sign In"按钮
      console.log('正在点击登录按钮...');
      await page.click(buttonSelector);
      console.log('✓ 已点击登录按钮');
    } else {
      // 如果找不到登录按钮，尝试直接访问登录页面
      console.log('未找到登录按钮，尝试直接访问登录页面...');
      await page.goto('https://civitai.com/login?returnUrl=/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      console.log('✓ 已直接访问登录页面');
    }
    
    // 等待登录弹窗加载
    console.log('正在等待登录弹窗加载...');
    await page.waitForSelector('#input_email', { timeout: 10000 });
    console.log('✓ 登录弹窗已加载');
    
    // 获取登录弹窗HTML结构，帮助调试
    const loginFormHTML = await page.evaluate(() => {
      const form = document.querySelector('form');
      return form ? form.outerHTML : '未找到登录表单';
    });
    console.log('登录表单HTML结构:', loginFormHTML);
    
    // 等待一下确保表单完全加载
    console.log('等待表单完全加载...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 输入邮箱
    console.log(`正在输入邮箱: ${email}...`);
    await page.type('#input_email', email);
    console.log(`✓ 已输入邮箱: ${email}`);
    
    // 等待一下确保输入完成
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 点击"Continue"按钮
    console.log('正在寻找Continue按钮...');
    const continueButton = await page.$('button[type="submit"]');
    if (continueButton) {
      console.log('找到Continue按钮，正在点击...');
      
      // 获取按钮HTML结构，帮助调试
      const buttonHTML = await page.evaluate(() => {
        const button = document.querySelector('button[type="submit"]');
        return button ? button.outerHTML : '未找到按钮';
      });
      console.log('Continue按钮HTML结构:', buttonHTML);
      
      await continueButton.click();
      console.log('✓ 已点击Continue按钮');
      
      // 等待发送邮件的结果
      console.log('等待发送邮件结果...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 尝试获取结果信息
      const resultMessage = await page.evaluate(() => {
        // 尝试查找可能的成功或错误消息元素
        const messageElement = document.querySelector('.mantine-Notification-root') ||
                              document.querySelector('[role="alert"]');
        return messageElement ? messageElement.textContent : '未找到结果消息';
      });
      console.log('结果消息:', resultMessage);
      
      console.log('✓ 邮件发送流程完成');
      console.log('========== 登录流程执行完毕 ==========');
      
      return {
        success: true,
        error: null
      };
    } else {
      console.error('❌ 未找到Continue按钮');
      
      // 获取当前页面HTML，帮助调试
      const pageHTML = await page.content();
      console.log('当前页面HTML片段:', pageHTML.substring(0, 500) + '...');
      
      throw new Error('未找到Continue按钮');
    }
  } catch (error) {
    console.error('❌ 登录过程中出错:', error.message);
    
    // 尝试截图保存错误状态
    try {
      await page.screenshot({ path: 'login-error.png' });
      console.log('已保存错误截图到 login-error.png');
    } catch (screenshotError) {
      console.error('保存错误截图失败:', screenshotError.message);
    }
    
    return {
      success: false,
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
  
  console.log('=============================================');
  console.log('开始执行 Civitai 自动登录测试');
  console.log('=============================================');
  
  try {
    // 启动浏览器
    console.log('正在启动浏览器...');
    browser = await launchBrowser();
    console.log('✓ 浏览器启动成功');
    
    const page = await browser.newPage();
    console.log('✓ 创建新页面成功');
    
    // 设置视口大小，确保元素可见
    await page.setViewport({ width: 1280, height: 800 });
    console.log('✓ 设置视口大小: 1280x800');
    
    // 设置页面控制台消息监听，帮助调试
    page.on('console', msg => console.log('浏览器控制台:', msg.text()));
    
    // 设置请求失败监听
    page.on('requestfailed', request => {
      console.log(`❌ 请求失败: ${request.url()}`);
      console.log(`  失败原因: ${request.failure().errorText}`);
    });
    
    // 直接访问目标网站
    console.log('\n正在访问 civitai.com...');
    const targetUrl = 'https://civitai.com';
    const targetResult = await visitUrl(page, targetUrl);
    
    if (targetResult.success) {
      console.log('✓ 成功打开 civitai.com');
      console.log(`✓ 页面标题: ${targetResult.title}`);
      
      // 获取页面基本信息
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          readyState: document.readyState,
          elementCount: document.querySelectorAll('*').length
        };
      });
      console.log('页面信息:', pageInfo);
      
      // 执行登录流程，使用测试邮箱
      const testEmail = 'arena1516611@gmail.com';
      console.log(`\n准备使用邮箱 ${testEmail} 执行登录流程`);
      const loginResult = await loginToCivitai(page, testEmail);
      
      if (loginResult.success) {
        console.log('✓ 登录流程执行成功');
        
        // 获取登录后的页面状态
        const postLoginInfo = await page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title
          };
        });
        console.log('登录后页面信息:', postLoginInfo);
      } else {
        console.log('❌ 登录流程执行失败:', loginResult.error);
      }
      
      // 等待一段时间以便查看结果
      console.log('等待5秒钟...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('❌ 打开 civitai.com 失败');
      console.log('  错误信息:', targetResult.error);
      console.log('  这可能是由于网络限制或网站响应慢导致的');
      console.log('  尝试使用代理或VPN可能会解决此问题');
      
      // 尝试获取当前页面信息，帮助调试
      try {
        const currentUrl = await page.url();
        const pageTitle = await page.title();
        console.log('当前页面URL:', currentUrl);
        console.log('当前页面标题:', pageTitle);
      } catch (infoError) {
        console.error('获取页面信息失败:', infoError.message);
      }
    }
    
    // 关闭浏览器
    console.log('\n正在关闭浏览器...');
    await browser.close();
    console.log('✓ 浏览器已关闭');
    
    console.log('=============================================');
    console.log('测试执行完毕');
    console.log('=============================================');
  } catch (error) {
    console.error('❌ 执行过程中发生错误:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 确保浏览器关闭
    try {
      if (browser) {
        console.log('\n正在关闭浏览器...');
        await browser.close();
        console.log('✓ 浏览器已关闭');
      }
    } catch (closeError) {
      console.error('❌ 关闭浏览器时出错:', closeError.message);
    }
    
    console.log('=============================================');
    console.log('测试执行失败');
    console.log('=============================================');
  }
}

module.exports = {
  launchBrowser,
  visitUrl,
  loginToCivitai,
  runBrowserTest
};