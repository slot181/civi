const puppeteer = require('puppeteer');

/**
 * 配置请求拦截，过滤资源并修改请求头
 * @param {import('puppeteer').Page} page 页面实例
 * @param {boolean} filterResources 是否过滤资源（图片、字体、媒体）
 * @returns {Promise<void>}
 */
async function setupRequestInterception(page, filterResources = false) {
  // 重置请求拦截
  if (page._requestInterceptionEnabled) {
    page.removeAllListeners('request');
  } else {
    await page.setRequestInterception(true);
    page._requestInterceptionEnabled = true;
  }
  
  // 添加新的请求监听器
  page.on('request', (request) => {
    // 检查请求是否已被处理（Puppeteer最佳实践）
    if (request.isInterceptResolutionHandled && request.isInterceptResolutionHandled()) return;
    
    const resourceType = request.resourceType();
    // 根据参数决定是否过滤资源
    if (filterResources && ['image', 'font', 'media'].includes(resourceType)) {
      request.abort();
    } else {
      // 修改请求头
      const headers = request.headers();
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      request.continue({ headers });
    }
  });
}

/**
 * 启动浏览器并返回浏览器实例
 * @returns {Promise<import('puppeteer').Browser>} 浏览器实例
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: 'new', // 使用无头模式
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security', // 禁用网页安全策略，可能绕过CORS限制
      '--disable-features=IsolateOrigins,site-per-process', // 禁用站点隔离
      '--disable-site-isolation-trials',
      '--ignore-certificate-errors', // 忽略证书错误
      '--ignore-certificate-errors-spki-list',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // 设置用户代理
    ],
    ignoreHTTPSErrors: true, // 忽略HTTPS错误
    timeout: 30000 // 增加启动超时时间到30秒
  });
}

/**
 * 访问指定URL并获取页面信息
 * @param {import('puppeteer').Page} page 页面实例
 * @param {string} url 要访问的URL
 * @param {number} timeout 超时时间（毫秒）
 * @returns {Promise<{success: boolean, title: string, error: string|null}>} 访问结果
 */
async function visitUrl(page, url, timeout = 30000) {
  try {
    console.log(`正在打开: ${url}`);
    
    // 设置请求拦截，不过滤资源
    if (!page._requestInterceptionEnabled) {
      await setupRequestInterception(page, false);
    }
    
    // 尝试访问页面
    await page.goto(url, {
      waitUntil: 'networkidle2', // 等待网络空闲，更可靠但可能更慢
      timeout: timeout
    });
    
    // 等待页面加载
    console.log('等待页面加载...');
    try {
      // 尝试等待body元素出现
      await page.waitForSelector('body', { timeout: 5000 });
      console.log('✓ 页面body元素已加载');
    } catch (bodyError) {
      console.warn('⚠️ 无法检测到body元素，但继续执行:', bodyError.message);
    }
    
    // 获取页面标题
    let title = '';
    try {
      title = await page.title();
      console.log(`成功打开: ${url}`);
      console.log(`页面标题: ${title}`);
    } catch (titleError) {
      console.warn('⚠️ 无法获取页面标题:', titleError.message);
    }
    
    // 尝试获取页面内容
    try {
      const content = await page.content();
      console.log(`页面内容长度: ${content.length} 字符`);
      console.log(`页面内容片段: ${content.substring(0, 200)}...`);
    } catch (contentError) {
      console.warn('⚠️ 无法获取页面内容:', contentError.message);
    }
    
    return {
      success: true,
      title: title,
      error: null
    };
  } catch (error) {
    console.error(`❌ 打开 ${url} 时出错:`, error.message);
    console.error('错误堆栈:', error.stack);
    
    // 尝试截图保存错误状态
    try {
      await page.screenshot({ path: 'navigation-error.png' });
      console.log('已保存错误截图到 navigation-error.png');
    } catch (screenshotError) {
      console.error('保存错误截图失败:', screenshotError.message);
    }
    
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
    
    // 使用visitUrl函数访问登录页面，而不是直接使用page.goto
    console.log('使用visitUrl函数访问登录页面...');
    const loginUrl = 'https://civitai.com/login';
    const loginPageResult = await visitUrl(page, loginUrl, 30000);
    
    if (!loginPageResult.success) {
      throw new Error('无法访问登录页面: ' + loginPageResult.error);
    }
    
    console.log('✓ 已访问登录页面');
    
    // 等待登录表单加载
    console.log('正在等待登录表单加载...');
    try {
      await page.waitForSelector('#input_email', { timeout: 20000 });
      console.log('✓ 登录表单已加载');
    } catch (formError) {
      console.error('❌ 等待登录表单超时:', formError.message);
      
      // 尝试获取当前页面信息
      try {
        const currentUrl = await page.url();
        console.log('当前页面URL:', currentUrl);
        
        // 尝试获取页面内容
        const pageContent = await page.content();
        console.log('页面内容片段:', pageContent.substring(0, 500) + '...');
        
        // 尝试截图
        await page.screenshot({ path: 'form-error.png', fullPage: true });
        console.log('已保存表单错误截图到 form-error.png');
        
        // 尝试查找页面上的所有输入框
        const inputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input')).map(input => ({
            id: input.id,
            type: input.type,
            name: input.name,
            placeholder: input.placeholder,
            visible: input.offsetParent !== null
          }));
        });
        console.log('页面上的输入框:', inputs);
      } catch (infoError) {
        console.error('获取页面信息失败:', infoError.message);
      }
      
      throw new Error('无法找到邮箱输入框: ' + formError.message);
    }
    
    // 获取登录表单HTML结构，帮助调试
    try {
      const loginFormHTML = await page.evaluate(() => {
        const form = document.querySelector('form');
        return form ? form.outerHTML : '未找到登录表单';
      });
      console.log('登录表单HTML结构:', loginFormHTML);
    } catch (formHtmlError) {
      console.warn('⚠️ 无法获取登录表单HTML:', formHtmlError.message);
    }
    
    // 等待一下确保表单完全加载
    console.log('等待表单完全加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 输入邮箱
    console.log(`正在输入邮箱: ${email}...`);
    await page.type('#input_email', email);
    console.log(`✓ 已输入邮箱: ${email}`);
    
    // 等待一下确保输入完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
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
 * 登录到Serv00邮箱服务
 * @param {import('puppeteer').Browser} browser 浏览器实例
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<{success: boolean, error: string|null}>} 登录结果
 */
async function loginToServ00Mail(browser, username, password) {
  try {
    console.log('========== 开始执行Serv00邮箱登录流程 ==========');
    
    // 创建新标签页
    console.log('正在创建新标签页...');
    const page = await browser.newPage();
    console.log('✓ 创建新标签页成功');
    
    // 设置视口大小
    await page.setViewport({ width: 1280, height: 800 });
    console.log('✓ 设置视口大小: 1280x800');
    
    // 设置请求拦截
    await setupRequestInterception(page, false);
    
    // 访问邮箱登录页面
    const mailUrl = 'https://mail.serv00.com';
    console.log(`正在打开邮箱登录页面: ${mailUrl}`);
    const visitResult = await visitUrl(page, mailUrl, 30000);
    
    if (!visitResult.success) {
      throw new Error('无法访问邮箱登录页面: ' + visitResult.error);
    }
    console.log('✓ 已访问邮箱登录页面');
    
    // 等待登录表单加载
    console.log('正在等待登录表单加载...');
    try {
      await page.waitForSelector('#rcmloginuser', { timeout: 20000 });
      console.log('✓ 登录表单已加载');
    } catch (formError) {
      console.error('❌ 等待登录表单超时:', formError.message);
      
      // 尝试获取当前页面信息
      try {
        const currentUrl = await page.url();
        console.log('当前页面URL:', currentUrl);
        
        // 尝试获取页面内容
        const pageContent = await page.content();
        console.log('页面内容片段:', pageContent.substring(0, 500) + '...');
        
        // 尝试截图
        await page.screenshot({ path: 'mail-form-error.png', fullPage: true });
        console.log('已保存表单错误截图到 mail-form-error.png');
      } catch (infoError) {
        console.error('获取页面信息失败:', infoError.message);
      }
      
      throw new Error('无法找到邮箱登录表单: ' + formError.message);
    }
    
    // 输入用户名
    console.log(`正在输入用户名: ${username}...`);
    await page.type('#rcmloginuser', username);
    console.log(`✓ 已输入用户名`);
    
    // 输入密码
    console.log('正在输入密码...');
    await page.type('#rcmloginpwd', password);
    console.log('✓ 已输入密码');
    
    // 等待一下确保输入完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 点击登录按钮
    console.log('正在点击登录按钮...');
    const loginButton = await page.$('#rcmloginsubmit');
    if (loginButton) {
      await loginButton.click();
      console.log('✓ 已点击登录按钮');
      
      // 等待登录结果
      console.log('等待登录结果...');
      try {
        // 等待登录成功后可能出现的元素
        await page.waitForNavigation({ timeout: 20000 });
        console.log('✓ 页面已导航，可能登录成功');
        
        // 获取登录后的页面状态
        const postLoginInfo = await page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title
          };
        });
        console.log('登录后页面信息:', postLoginInfo);
        
        // 尝试截图
        await page.screenshot({ path: 'mail-login-success.png', fullPage: true });
        console.log('已保存登录成功截图到 mail-login-success.png');
        
        console.log('✓ 邮箱登录流程完成');
        console.log('========== 邮箱登录流程执行完毕 ==========');
        
        return {
          success: true,
          error: null
        };
      } catch (navError) {
        console.error('❌ 等待登录结果超时:', navError.message);
        
        // 检查是否有错误消息
        const errorMessage = await page.evaluate(() => {
          const errorElement = document.querySelector('.error') ||
                              document.querySelector('.alert') ||
                              document.querySelector('[role="alert"]');
          return errorElement ? errorElement.textContent : null;
        });
        
        if (errorMessage) {
          console.error('登录错误消息:', errorMessage);
        }
        
        // 尝试截图
        await page.screenshot({ path: 'mail-login-error.png', fullPage: true });
        console.log('已保存登录错误截图到 mail-login-error.png');
        
        throw new Error('登录超时或失败: ' + (errorMessage || navError.message));
      }
    } else {
      console.error('❌ 未找到登录按钮');
      throw new Error('未找到登录按钮');
    }
  } catch (error) {
    console.error('❌ 邮箱登录过程中出错:', error.message);
    
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
    
    // 设置请求失败监听(调试使用)
    // page.on('requestfailed', request => {
    //   console.log(`❌ 请求失败: ${request.url()}`);
    //   console.log(`  失败原因: ${request.failure().errorText}`);
    // });
    
    // 设置更多的页面选项
    await page.setDefaultNavigationTimeout(60000); // 设置导航超时为60秒
    await page.setDefaultTimeout(30000); // 设置默认超时为30秒
    
    // 设置请求拦截，启用资源过滤以提高性能
    // 这将阻止加载图片、字体、媒体等资源，减少网络负载
    await setupRequestInterception(page, true);
    
    // 直接执行登录流程，不先访问主页
    console.log('\n直接执行登录流程...');
    
    // 执行登录流程，使用测试邮箱
    const testEmail = 'arena1516611@gmail.com';
    console.log(`准备使用邮箱 ${testEmail} 执行登录流程`);
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
      
      // 等待30秒后执行邮箱登录
      console.log('\n等待30秒后执行邮箱登录...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      console.log('✓ 等待完成，开始执行邮箱登录');
      
      // 执行邮箱登录流程
      const mailUsername = 'slot@stonecoks.vip';
      const mailPassword = 'ww..MM123456789';
      console.log(`准备使用账户 ${mailUsername} 登录邮箱`);
      const mailLoginResult = await loginToServ00Mail(browser, mailUsername, mailPassword);
      
      if (mailLoginResult.success) {
        console.log('✓ 邮箱登录流程执行成功');
      } else {
        console.log('❌ 邮箱登录流程执行失败:', mailLoginResult.error);
      }
    } else {
      console.log('❌ 登录流程执行失败:', loginResult.error);
    }
    
    // 等待一段时间以便查看结果
    console.log('等待5秒钟...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
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
  setupRequestInterception,
  launchBrowser,
  visitUrl,
  loginToCivitai,
  loginToServ00Mail,
  runBrowserTest
};