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
      waitUntil: 'domcontentloaded', // 只等待DOM内容加载，不等待所有资源
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
 * 在Civitai网站上请求发送登录邮件
 * @param {import('puppeteer').Page} page 页面实例
 * @param {string} email 用于接收登录邮件的邮箱地址
 * @returns {Promise<{success: boolean, error: string|null}>} 请求结果
 */
async function requestCivitaiLoginEmail(page, email) {
  try {
    console.log('========== 开始执行civitai邮件发送流程 ==========');
    
    // 使用visitUrl函数访问登录页面，而不是直接使用page.goto
    console.log('使用visitUrl函数访问登录页面...');
    const loginUrl = 'https://deno-arna-civitai-proxy.deno.dev/login';
    const loginPageResult = await visitUrl(page, loginUrl, 30000);
    
    if (!loginPageResult.success) {
      throw new Error('无法访问civitai登录页面: ' + loginPageResult.error);
    }
    
    console.log('✓ 已访问civitai登录页面');
    
    // 等待登录表单加载
    console.log('正在等待civitai登录表单加载...');
    try {
      await page.waitForSelector('#input_email', { timeout: 20000 });
      console.log('✓ civitai登录表单已加载');
    } catch (formError) {
      console.error('❌ civitai等待登录表单超时:', formError.message);
      
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
      console.log('civitai登录表单HTML结构:', loginFormHTML);
    } catch (formHtmlError) {
      console.warn('⚠️ civitai无法获取登录表单HTML:', formHtmlError.message);
    }
    
    // 等待一下确保表单完全加载
    console.log('等待civitai表单完全加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 输入邮箱
    console.log(`正在输入civitai邮箱: ${email}...`);
    await page.type('#input_email', email);
    
    // 在邮箱输入完毕后截图
    console.log('正在截取邮箱输入完成后的页面...');
    await page.screenshot({ path: 'email-input-completed.png', fullPage: true });
    console.log('✓ 已保存邮箱输入完成截图到 email-input-completed.png');
    
    console.log(`✓ 已输入civitai邮箱: ${email}`);
    
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
      console.log('等待civitai发送邮件结果...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 尝试获取结果信息
      const resultMessage = await page.evaluate(() => {
        // 尝试查找可能的成功或错误消息元素
        const messageElement = document.querySelector('.mantine-Notification-root') ||
                              document.querySelector('[role="alert"]');
        return messageElement ? messageElement.textContent : '未找到结果消息';
      });
      console.log('结果消息:', resultMessage);
      
      console.log('✓ civitai邮件发送流程完成');
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
    console.error('❌ civitai发送邮件过程中出错:', error.message);
    
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
    
    // 执行请求Civitai登录邮件流程，使用测试邮箱
    const testEmail = 'buladinesh405@gmail.com';
    console.log(`准备使用邮箱 ${testEmail} 请求Civitai登录邮件`);
    const loginResult = await requestCivitaiLoginEmail(page, testEmail);
    
    if (loginResult.success) {
      console.log('✓ Civitai登录邮件请求成功');
      
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
      
      // 执行完整工作流程
      const mailUsername = 'slot@stonecoks.vip';
      const mailPassword = 'ww..MM123456789';
      console.log(`准备使用账户 ${mailUsername} 执行完整工作流程`);
      const workflowResult = await completeWorkflow(browser, mailUsername, mailPassword);
      
      if (workflowResult.success) {
        console.log('✓ 完整工作流程执行成功');
      } else {
        console.log('❌ 完整工作流程执行失败:', workflowResult.error);
      }
    } else {
      console.log('❌ Civitai登录邮件请求失败:', loginResult.error);
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

/**
 * 在邮箱中查找Civitai邮件
 * @param {import('puppeteer').Page} page 页面实例
 * @returns {Promise<{success: boolean, element: any|null, error: string|null}>} 查找结果
 */
async function findCivitaiEmail(page) {
  try {
    console.log('========== 开始查找Civitai邮件 ==========');
    
    // 等待邮件列表加载
    console.log('正在等待邮件列表加载...');
    try {
      await page.waitForSelector('#messagelist tbody tr', { timeout: 20000 });
      console.log('✓ 邮件列表已加载');
    } catch (listError) {
      console.error('❌ 等待邮件列表超时:', listError.message);
      
      // 尝试获取当前页面信息
      try {
        const currentUrl = await page.url();
        console.log('当前页面URL:', currentUrl);
        
        // 尝试获取页面内容
        const pageContent = await page.content();
        console.log('页面内容片段:', pageContent.substring(0, 500) + '...');
        
        // 尝试截图
        await page.screenshot({ path: 'mail-list-error.png', fullPage: true });
        console.log('已保存邮件列表错误截图到 mail-list-error.png');
      } catch (infoError) {
        console.error('获取页面信息失败:', infoError.message);
      }
      
      throw new Error('无法找到邮件列表: ' + listError.message);
    }
    
    // 查找Civitai邮件
    console.log('正在查找Civitai邮件...');
    const emailElement = await page.evaluate(() => {
      // 获取所有邮件行
      const rows = Array.from(document.querySelectorAll('#messagelist tbody tr'));
      
      // 查找发件人为Civitai且主题包含"Sign in to Civitai"的邮件
      for (const row of rows) {
        const fromElement = row.querySelector('.rcmContactAddress');
        const subjectElement = row.querySelector('.subject a span');
        
        if (fromElement && subjectElement) {
          const from = fromElement.textContent.trim();
          const subject = subjectElement.textContent.trim();
          
          if (from.includes('Civitai') && subject.includes('Sign in to Civitai')) {
            // 返回邮件行的ID
            return row.id;
          }
        }
      }
      
      return null;
    });
    
    if (emailElement) {
      console.log(`✓ 找到Civitai邮件: ${emailElement}`);
      console.log('========== Civitai邮件查找完成 ==========');
      
      return {
        success: true,
        element: emailElement,
        error: null
      };
    } else {
      console.error('❌ 未找到Civitai邮件');
      
      // 尝试截图
      await page.screenshot({ path: 'no-civitai-email.png', fullPage: true });
      console.log('已保存未找到邮件截图到 no-civitai-email.png');
      
      throw new Error('未找到Civitai邮件');
    }
  } catch (error) {
    console.error('❌ 查找Civitai邮件过程中出错:', error.message);
    
    return {
      success: false,
      element: null,
      error: error.message
    };
  }
}

/**
 * 打开Civitai邮件
 * @param {import('puppeteer').Page} page 页面实例
 * @param {string} emailId 邮件元素ID
 * @returns {Promise<{success: boolean, error: string|null}>} 打开结果
 */
async function openCivitaiEmail(page, emailId) {
  try {
    console.log('========== 开始打开Civitai邮件 ==========');
    
    // 点击邮件
    console.log(`正在点击邮件: ${emailId}...`);
    await page.evaluate((id) => {
      const emailRow = document.getElementById(id);
      if (emailRow) {
        // 找到邮件行中的主题链接并点击
        const subjectLink = emailRow.querySelector('.subject a');
        if (subjectLink) {
          subjectLink.click();
          return true;
        }
      }
      return false;
    }, emailId);
    
    // 等待邮件内容加载
    console.log('正在等待邮件内容加载...');
    try {
      await page.waitForSelector('#messagebody', { timeout: 20000 });
      console.log('✓ 邮件内容已加载');
      
      // 等待5秒，确保邮件内容完全加载
      console.log('等待5秒，确保邮件内容完全加载...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('✓ 等待完成');
      
      // 尝试截图
      await page.screenshot({ path: 'civitai-email-opened.png', fullPage: true });
      console.log('已保存邮件打开截图到 civitai-email-opened.png');
      
      console.log('========== Civitai邮件打开完成 ==========');
      
      return {
        success: true,
        error: null
      };
    } catch (contentError) {
      console.error('❌ 等待邮件内容超时:', contentError.message);
      
      // 尝试获取当前页面信息
      try {
        const currentUrl = await page.url();
        console.log('当前页面URL:', currentUrl);
        
        // 尝试获取页面内容
        const pageContent = await page.content();
        console.log('页面内容片段:', pageContent.substring(0, 500) + '...');
        
        // 尝试截图
        await page.screenshot({ path: 'mail-content-error.png', fullPage: true });
        console.log('已保存邮件内容错误截图到 mail-content-error.png');
      } catch (infoError) {
        console.error('获取页面信息失败:', infoError.message);
      }
      
      throw new Error('无法加载邮件内容: ' + contentError.message);
    }
  } catch (error) {
    console.error('❌ 打开Civitai邮件过程中出错:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 在邮件内容中找到并点击"Sign in"按钮
 * @param {import('puppeteer').Page} page 页面实例
 * @returns {Promise<{success: boolean, error: string|null}>} 点击结果
 */
async function clickSignInButton(page) {
  try {
    console.log('========== 开始查找并点击Sign in按钮 ==========');
    
    // 查找Sign in按钮
    console.log('正在查找Sign in按钮...');
    const signInButton = await page.evaluate(() => {
      // 查找包含civitai.com/api/auth/callback/email的链接
      const links = Array.from(document.querySelectorAll('a[href*="civitai.com/api/auth/callback/email"]'));
      if (links.length > 0) {
        // 返回第一个匹配的链接的href
        return links[0].href;
      }
      return null;
    });
    
    if (signInButton) {
      console.log(`✓ 找到Sign in按钮: ${signInButton}`);
      
      // 点击Sign in按钮
      console.log('正在点击Sign in按钮...');
      
      // 直接在当前页面打开链接，而不是创建新标签页
      console.log('正在当前页面打开链接...');
      
      // 保存链接URL
      const signInUrl = signInButton;
      
      // 使用visitUrl函数导航到Sign in链接，以便更好地伪装请求
      console.log(`正在使用visitUrl函数导航到: ${signInUrl}`);
      const visitResult = await visitUrl(page, signInUrl, 60000); // 增加超时时间到60秒
      
      if (!visitResult.success) {
        throw new Error('无法访问Civitai登录链接: ' + visitResult.error);
      }
      console.log('✓ 已成功导航到Sign in链接');
      
      // 尝试截图
      await page.screenshot({ path: 'civitai-login-result.png', fullPage: true });
      console.log('已保存Civitai登录结果截图到 civitai-login-result.png');
      
      console.log('========== Sign in按钮点击完成 ==========');
      
      return {
        success: true,
        error: null
      };
    } else {
      console.error('❌ 未找到Sign in按钮');
      
      // 尝试截图
      await page.screenshot({ path: 'no-sign-in-button.png', fullPage: true });
      console.log('已保存未找到Sign in按钮截图到 no-sign-in-button.png');
      
      throw new Error('未找到Sign in按钮');
    }
  } catch (error) {
    console.error('❌ 查找并点击Sign in按钮过程中出错:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 检查并设置Civitai页面的排序选项为"Newest"
 * @param {import('puppeteer').Page} page 页面实例
 * @returns {Promise<{success: boolean, error: string|null}>} 操作结果
 */
async function checkAndSetNewestSorting(page) {
  try {
    console.log('========== 开始检查并设置排序选项 ==========');
    
    // 等待页面完全加载
    console.log('等待页面完全加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 检查当前排序选项
    console.log('正在检查当前排序选项...');
    const isSortedByNewest = await page.evaluate(() => {
      // 查找排序按钮，包含"Newest"文本和排序图标
      const sortButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const sortButton = sortButtons.find(button => {
        const buttonText = button.textContent || '';
        return buttonText.includes('Newest') &&
               button.querySelector('svg') !== null;
      });
      
      // 如果找到包含"Newest"的排序按钮，则认为已经是按"Newest"排序
      return !!sortButton;
    });
    
    if (isSortedByNewest) {
      console.log('✓ 当前已经按"Newest"排序');
      return {
        success: true,
        error: null
      };
    }
    
    console.log('当前不是按"Newest"排序，准备点击排序按钮...');
    
    // 点击排序按钮打开下拉菜单
    const clickSortButton = await page.evaluate(() => {
      // 查找包含排序图标的按钮
      const sortButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const sortButton = sortButtons.find(button => {
        return button.querySelector('svg[class*="tabler-icon-sort-descending"]') !== null ||
               button.querySelector('svg[class*="tabler-icon-chevron-down"]') !== null;
      });
      
      if (sortButton) {
        sortButton.click();
        return true;
      }
      return false;
    });
    
    if (!clickSortButton) {
      console.error('❌ 未找到排序按钮');
      await page.screenshot({ path: 'sort-button-not-found.png', fullPage: true });
      throw new Error('未找到排序按钮');
    }
    
    console.log('✓ 已点击排序按钮');
    
    // 等待下拉菜单出现
    console.log('等待下拉菜单出现...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 在下拉菜单中点击"Newest"选项
    console.log('正在查找并点击"Newest"选项...');
    const clickNewestOption = await page.evaluate(() => {
      // 查找下拉菜单中的"Newest"选项
      // 首先查找所有菜单项
      const menuItems = Array.from(document.querySelectorAll('.mantine-Menu-item'));
      
      // 然后查找包含"Newest"文本的菜单项
      const newestOption = menuItems.find(item => {
        // 查找菜单项内部的标签元素
        const labelElement = item.querySelector('.mantine-Menu-itemLabel');
        if (labelElement) {
          const labelText = labelElement.textContent || '';
          return labelText.trim() === 'Newest';
        }
        return false;
      });
      
      console.log('找到的菜单项数量:', menuItems.length);
      if (menuItems.length > 0) {
        console.log('菜单项内容:', menuItems.map(item => item.textContent).join(', '));
      }
      
      if (newestOption) {
        console.log('找到Newest选项，准备点击');
        newestOption.click();
        return true;
      }
      
      // 如果没有找到精确匹配，尝试模糊匹配
      const fuzzyMatch = menuItems.find(item => {
        return (item.textContent || '').includes('Newest');
      });
      
      if (fuzzyMatch) {
        console.log('找到模糊匹配的Newest选项，准备点击');
        fuzzyMatch.click();
        return true;
      }
      
      return false;
    });
    
    if (!clickNewestOption) {
      console.error('❌ 未找到"Newest"选项');
      await page.screenshot({ path: 'newest-option-not-found.png', fullPage: true });
      throw new Error('未找到"Newest"选项');
    }
    
    console.log('✓ 已点击"Newest"选项');
    
    // 等待排序应用
    console.log('等待排序应用...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 截图保存最终结果
    await page.screenshot({ path: 'newest-sorting-applied.png', fullPage: true });
    console.log('✓ 已保存排序应用后截图到 newest-sorting-applied.png');
    
    console.log('========== 排序选项设置完成 ==========');
    
    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('❌ 检查并设置排序选项过程中出错:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 完成从邮箱登录到Civitai登录的完整工作流程
 * @param {import('puppeteer').Browser} browser 浏览器实例
 * @param {string} username 邮箱用户名
 * @param {string} password 邮箱密码
 * @returns {Promise<{success: boolean, error: string|null}>} 完整流程结果
 */
async function completeWorkflow(browser, username, password) {
  try {
    console.log('========== 开始执行完整工作流程 ==========');
    
    // 登录邮箱
    console.log('正在登录邮箱...');
    const mailLoginResult = await loginToServ00Mail(browser, username, password);
    
    if (!mailLoginResult.success) {
      throw new Error('邮箱登录失败: ' + mailLoginResult.error);
    }
    console.log('✓ 邮箱登录成功');
    
    // 获取当前活动页面
    const pages = await browser.pages();
    const page = pages[pages.length - 1]; // 假设最后一个页面是邮箱页面
    
    // 等待10秒，确保邮箱界面完全加载
    console.log('等待10秒，确保邮箱界面完全加载...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('✓ 等待完成');
    
    // 查找Civitai邮件
    console.log('正在查找Civitai邮件...');
    const findResult = await findCivitaiEmail(page);
    
    if (!findResult.success) {
      throw new Error('查找Civitai邮件失败: ' + findResult.error);
    }
    console.log('✓ 找到Civitai邮件');
    
    // 打开Civitai邮件
    console.log('正在打开Civitai邮件...');
    const openResult = await openCivitaiEmail(page, findResult.element);
    
    if (!openResult.success) {
      throw new Error('打开Civitai邮件失败: ' + openResult.error);
    }
    console.log('✓ 成功打开Civitai邮件');
    
    // 点击Sign in按钮
    console.log('正在点击Sign in按钮...');
    const clickResult = await clickSignInButton(page);
    
    if (!clickResult.success) {
      throw new Error('点击Sign in按钮失败: ' + clickResult.error);
    }
    console.log('✓ 成功点击Sign in按钮并登录Civitai');
    
    // 导航到视频页面
    console.log('正在导航到Civitai视频页面...');
    const videosUrl = 'https://civitai.com/videos';
    const videosPageResult = await visitUrl(page, videosUrl, 30000);
    
    if (!videosPageResult.success) {
      throw new Error('无法访问Civitai视频页面: ' + videosPageResult.error);
    }
    console.log('✓ 已成功导航到Civitai视频页面');
    
    // 等待视频页面加载完成
    console.log('等待视频页面加载完成...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✓ 等待完成');
    
    // 截图保存视频页面状态
    await page.screenshot({ path: 'civitai-videos-page.png', fullPage: true });
    console.log('✓ 已保存视频页面截图到 civitai-videos-page.png');
    
    // 检查并设置排序选项为"Newest"
    console.log('正在检查并设置排序选项...');
    const sortingResult = await checkAndSetNewestSorting(page);
    
    if (!sortingResult.success) {
      console.warn('⚠️ 设置排序选项失败:', sortingResult.error);
      // 继续执行，不中断工作流程
    } else {
      console.log('✓ 成功设置排序选项为"Newest"');
    }
    
    // 执行自动点赞视频功能
    console.log('正在执行自动点赞视频功能...');
    const likeResult = await autoLikeVideos(page);
    
    if (!likeResult.success) {
      console.warn('⚠️ 自动点赞视频功能执行失败:', likeResult.error);
    } else {
      console.log(`✓ 自动点赞视频功能执行成功，共点赞 ${likeResult.likeCount} 次`);
    }
    
    console.log('========== 完整工作流程执行完毕 ==========');
    
    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('❌ 执行完整工作流程过程中出错:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 自动点赞视频功能
 * @param {import('puppeteer').Page} page 页面实例
 * @returns {Promise<{success: boolean, likeCount: number, error: string|null}>} 点赞结果
 */
async function autoLikeVideos(page) {
  try {
    console.log('========== 开始执行自动点赞视频功能 ==========');
    
    // 将滚动轴重置到页面顶部
    console.log('正在将滚动轴重置到页面顶部...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    console.log('✓ 已将滚动轴重置到页面顶部');
    
    // 等待页面内容加载
    console.log('等待页面内容加载...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 初始化计数器
    let successLikeCount = 0;  // 成功点赞计数
    let consecutiveFailCount = 0;  // 连续失败计数
    let scrollCount = 0;  // 滚动次数计数
    
    // 截图保存初始状态
    await page.screenshot({ path: `auto-like-initial.png`, fullPage: true });
    console.log('✓ 已保存初始状态截图到 auto-like-initial.png');
    
    // 开始循环查找并点赞
    while (successLikeCount < 50 && consecutiveFailCount < 5) {
      console.log(`\n当前状态: 成功点赞 ${successLikeCount} 次, 连续失败 ${consecutiveFailCount} 次, 滚动 ${scrollCount} 次`);
      
      // 查找所有👍按钮
      const likeButtons = await page.evaluate(() => {
        // 查找所有按钮
        const buttons = Array.from(document.querySelectorAll('button[data-button="true"]'));
        
        // 过滤出包含👍表情的按钮
        const likeButtons = buttons.filter(button => {
          const text = button.textContent || '';
          return text.includes('👍');
        });
        
        // 返回按钮信息
        return likeButtons.map(button => {
          // 检查按钮是否已点击过（通过class判断）
          const isClicked = button.classList.contains('mantine-1rk94m8');
          // 获取按钮在页面中的位置
          const rect = button.getBoundingClientRect();
          
          return {
            isClicked,
            isVisible: rect.top >= 0 && rect.top <= window.innerHeight,
            top: rect.top,
            text: button.textContent
          };
        });
      });
      
      console.log(`找到 ${likeButtons.length} 个👍按钮, 其中 ${likeButtons.filter(b => b.isClicked).length} 个已点击过`);
      
      // 查找第一个可见且未点击的按钮
      const buttonToClick = likeButtons.find(button => button.isVisible && !button.isClicked);
      
      if (buttonToClick) {
        // 找到可点击的按钮
        console.log(`找到可点击的👍按钮: ${buttonToClick.text}`);
        
        // 点击按钮
        const clickResult = await page.evaluate(() => {
          // 查找所有按钮
          const buttons = Array.from(document.querySelectorAll('button[data-button="true"]'));
          
          // 过滤出包含👍表情且未点击过的按钮
          const likeButtons = buttons.filter(button => {
            const text = button.textContent || '';
            return text.includes('👍') && !button.classList.contains('mantine-1rk94m8');
          });
          
          // 找到第一个可见的按钮
          for (const button of likeButtons) {
            const rect = button.getBoundingClientRect();
            if (rect.top >= 0 && rect.top <= window.innerHeight) {
              // 点击按钮
              button.click();
              return true;
            }
          }
          
          return false;
        });
        
        if (clickResult) {
          console.log('✓ 成功点击👍按钮');
          successLikeCount++;
          consecutiveFailCount = 0;  // 重置连续失败计数
          
          // 每10次点赞保存一次截图
          if (successLikeCount % 10 === 0) {
            await page.screenshot({ path: `auto-like-success-${successLikeCount}.png`, fullPage: false });
            console.log(`✓ 已保存第 ${successLikeCount} 次点赞成功截图`);
          }
          
          // 延迟1-2秒
          const delay = Math.floor(Math.random() * 1000) + 1000;  // 1000-2000毫秒
          console.log(`等待 ${delay}ms 后继续...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.log('❌ 点击👍按钮失败');
          consecutiveFailCount++;
        }
      } else {
        // 没有找到可点击的按钮，需要滚动页面
        console.log('未找到可点击的👍按钮，准备滚动页面...');
        
        // 滚动页面
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.7);  // 滚动70%视口高度
        });
        
        scrollCount++;
        console.log(`✓ 已滚动页面 ${scrollCount} 次`);
        
        // 等待新内容加载
        console.log('等待新内容加载...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 每5次滚动保存一次截图
        if (scrollCount % 5 === 0) {
          await page.screenshot({ path: `auto-like-scroll-${scrollCount}.png`, fullPage: false });
          console.log(`✓ 已保存第 ${scrollCount} 次滚动截图`);
        }
        
        // 如果滚动了很多次但仍未找到可点击按钮，增加连续失败计数
        if (scrollCount % 10 === 0 && scrollCount > 0) {
          consecutiveFailCount++;
          console.log(`警告: 已滚动 ${scrollCount} 次但未找到可点击按钮，增加失败计数到 ${consecutiveFailCount}`);
        }
      }
    }
    
    // 保存最终状态截图
    await page.screenshot({ path: 'auto-like-final.png', fullPage: true });
    console.log('✓ 已保存最终状态截图到 auto-like-final.png');
    
    // 输出结果统计
    if (successLikeCount >= 50) {
      console.log(`✓ 已成功点赞 ${successLikeCount} 次，达到目标次数，自动结束`);
    } else if (consecutiveFailCount >= 5) {
      console.log(`⚠️ 连续失败 ${consecutiveFailCount} 次，自动结束`);
    }
    
    console.log(`总计: 成功点赞 ${successLikeCount} 次, 滚动 ${scrollCount} 次`);
    console.log('========== 自动点赞视频功能执行完毕 ==========');
    
    return {
      success: true,
      likeCount: successLikeCount,
      error: null
    };
  } catch (error) {
    console.error('❌ 自动点赞视频过程中出错:', error.message);
    
    // 尝试截图保存错误状态
    try {
      await page.screenshot({ path: 'auto-like-error.png', fullPage: true });
      console.log('已保存错误截图到 auto-like-error.png');
    } catch (screenshotError) {
      console.error('保存错误截图失败:', screenshotError.message);
    }
    
    return {
      success: false,
      likeCount: 0,
      error: error.message
    };
  }
}

module.exports = {
  setupRequestInterception,
  launchBrowser,
  visitUrl,
  requestCivitaiLoginEmail,
  loginToServ00Mail,
  findCivitaiEmail,
  openCivitaiEmail,
  clickSignInButton,
  checkAndSetNewestSorting,
  autoLikeVideos,
  completeWorkflow,
  runBrowserTest
};