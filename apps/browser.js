const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
      await page.waitForSelector('#rcmloginuser', { timeout: 30000 });
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
    
    // 点击打开点赞栏目的按钮
    console.log('正在查找并点击打开点赞栏目的按钮...');
    const openReactionResult = await page.evaluate(() => {
      // 查找包含加号和笑脸图标的按钮
      const buttons = Array.from(document.querySelectorAll('button[data-button="true"]'));
      const reactionButton = buttons.find(button => {
        // 检查按钮是否包含SVG图标
        const svgs = button.querySelectorAll('svg');
        if (svgs.length >= 2) {
          // 检查是否包含加号图标
          const hasPlusIcon = Array.from(svgs).some(svg =>
            svg.classList.contains('tabler-icon-plus') ||
            svg.outerHTML.includes('tabler-icon-plus')
          );
          
          // 检查是否包含笑脸图标
          const hasSmileIcon = Array.from(svgs).some(svg =>
            svg.classList.contains('tabler-icon-mood-smile') ||
            svg.outerHTML.includes('tabler-icon-mood-smile')
          );
          
          return hasPlusIcon && hasSmileIcon;
        }
        return false;
      });
      
      if (reactionButton) {
        console.log('找到点赞栏目按钮，准备点击');
        reactionButton.click();
        return true;
      }
      
      // 尝试通过class查找
      const classFindButton = document.querySelector('button.mantine-fjh1u7[data-button="true"]');
      if (classFindButton) {
        console.log('通过class找到点赞栏目按钮，准备点击');
        classFindButton.click();
        return true;
      }
      
      return false;
    });
    
    if (openReactionResult) {
      console.log('✓ 成功点击打开点赞栏目按钮');
      
      // 等待点赞栏目出现
      console.log('等待点赞栏目出现...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 截图保存点赞栏目状态
      await page.screenshot({ path: 'reaction-panel-opened.png', fullPage: false });
      console.log('✓ 已保存点赞栏目截图到 reaction-panel-opened.png');
    } else {
      console.warn('⚠️ 未找到点赞栏目按钮，将直接尝试点赞');
    }
    
    // 创建截图保存目录
    const fs = require('fs');
    const screenshotDir = './screenshots';
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      console.log(`✓ 已创建截图保存目录: ${screenshotDir}`);
    }
    
    // 初始化计数器
    let successLikeCount = 0;  // 成功点赞计数
    let consecutiveFailCount = 0;  // 连续失败计数
    let scrollCount = 0;  // 滚动次数计数
    
    // 截图保存初始状态在本地目录
    await page.screenshot({ path: `auto-like-initial.png`, fullPage: true });
    console.log(`✓ 已保存初始状态截图到 auto-like-initial.png`);
    
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
            await page.screenshot({ path: `${screenshotDir}/auto-like-success-${successLikeCount}.png`, fullPage: false });
            console.log(`✓ 已保存第 ${successLikeCount} 次点赞成功截图到 ${screenshotDir}`);
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
        
        // 滚动页面 - 使用更可靠的滚动方法
        console.log('使用有效的滚动方法...');
        
        // 方法1: 使用键盘按键模拟滚动 - 连续按两次PageDown键以获得更大的滚动距离
        await page.keyboard.press('PageDown');
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('PageDown');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 方法2: 使用scrollIntoView滚动到更远的元素
        await page.evaluate(() => {
          // 查找页面中间偏下的元素
          const elements = Array.from(document.querySelectorAll('*'));
          const middleElements = elements
            .filter(el => {
              const rect = el.getBoundingClientRect();
              // 查找位于视口底部以下的元素，确保滚动距离足够大
              return rect.top > window.innerHeight * 1.5 && rect.top < window.innerHeight * 3;
            })
            .sort((a, b) => {
              const rectA = a.getBoundingClientRect();
              const rectB = b.getBoundingClientRect();
              return rectB.top - rectA.top; // 按从下到上的顺序排序
            });
          
          if (middleElements.length > 0) {
            // 滚动到找到的元素，使用block: 'center'确保元素在视口中间
            middleElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            console.log('成功滚动到远处元素');
            return true;
          }
          return false;
        });
        
        scrollCount++;
        console.log(`✓ 已滚动页面 ${scrollCount} 次`);
        
        // 等待新内容加载
        console.log('等待新内容加载...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 每次滚动都保存截图，以便验证滚动是否有效
        await page.screenshot({ path: `${screenshotDir}/auto-like-scroll-${scrollCount}.png`, fullPage: false });
        console.log(`✓ 已保存第 ${scrollCount} 次滚动截图到 ${screenshotDir}`);
        
        // 如果滚动3次还未找到可点击按钮，增加连续失败计数
        if (scrollCount % 3 === 0 && scrollCount > 0) {
          consecutiveFailCount++;
          console.log(`警告: 已滚动 ${scrollCount} 次但未找到可点击按钮，增加失败计数到 ${consecutiveFailCount}`);
        }
      }
    }
    
    // 保存最终状态截图本地目录
    await page.screenshot({ path: `auto-like-final.png`, fullPage: true });
    console.log(`✓ 已保存最终状态截图到 auto-like-final.png`);
    
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
    
    // 尝试截图保存错误状态在本地目录
    try {
      await page.screenshot({ path: `auto-like-error.png`, fullPage: true });
      console.log(`已保存错误截图到 auto-like-error.png`);
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

/**
 * 读取测试记录文件
 * @returns {Object} 测试记录对象
 */
function readTestRecords() {
  try {
    const recordsPath = path.join(__dirname, '..', 'records', 'test_records.json');
    if (!fs.existsSync(recordsPath)) {
      // 如果记录文件不存在，创建一个空记录
      const emptyRecords = { records: {} };
      fs.writeFileSync(recordsPath, JSON.stringify(emptyRecords, null, 2), 'utf8');
      return emptyRecords;
    }
    
    const recordsData = fs.readFileSync(recordsPath, 'utf8');
    return JSON.parse(recordsData);
  } catch (error) {
    console.error('读取测试记录文件出错:', error.message);
    // 返回空记录对象
    return { records: {} };
  }
}

/**
 * 更新测试记录文件
 * @param {string} email 邮箱地址
 * @param {string} date 测试日期
 * @param {boolean} success 测试是否成功
 */
function updateTestRecord(email, date, success) {
  try {
    const recordsPath = path.join(__dirname, '..', 'records', 'test_records.json');
    const records = readTestRecords();
    
    // 更新记录
    records.records[email] = {
      lastTestDate: date,
      lastTestResult: success ? 'success' : 'failed',
      lastTestTime: new Date().toISOString()
    };
    
    // 写入文件
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`✓ 已更新测试记录: ${email} - ${date} - ${success ? '成功' : '失败'}`);
  } catch (error) {
    console.error('更新测试记录文件出错:', error.message);
  }
}

/**
 * 检查账号是否已在当天测试过
 * @param {string} email 邮箱地址
 * @returns {boolean} 是否已测试过
 */
function isTestedToday(email) {
  try {
    const records = readTestRecords();
    const record = records.records[email];
    
    if (!record) {
      return false; // 没有记录，表示未测试过
    }
    
    // 获取当前日期（格式：YYYY-MM-DD）
    const today = new Date().toISOString().split('T')[0];
    
    // 获取记录中的测试日期
    const lastTestDate = record.lastTestDate;
    
    // 如果最后测试日期是今天，且测试成功，则返回true
    return lastTestDate === today && record.lastTestResult === 'success';
  } catch (error) {
    console.error('检查测试记录出错:', error.message);
    return false; // 出错时默认为未测试过
  }
}

/**
 * 运行多账号浏览器测试流程
 * @param {Object} config 邮箱配置对象，包含邮箱列表和最大重试次数
 * @returns {Promise<void>}
 */
async function runMultiAccountTest(config) {
  console.log('=============================================');
  console.log('开始执行 Civitai 多账号自动点赞测试');
  console.log(`共有 ${config.emails.length} 个账号待测试`);
  console.log(`最大重试次数: ${config.maxRetries}`);
  console.log('=============================================');
  
  // 创建结果目录
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
    console.log(`✓ 已创建结果保存目录: ${resultsDir}`);
  }
  
  // 创建记录目录
  const recordsDir = path.join(__dirname, '..', 'records');
  if (!fs.existsSync(recordsDir)) {
    fs.mkdirSync(recordsDir, { recursive: true });
    console.log(`✓ 已创建记录保存目录: ${recordsDir}`);
  }
  
  // 创建结果日志文件
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = path.join(resultsDir, `test-results-${timestamp}.log`);
  
  // 记录测试结果
  const testResults = {
    startTime: new Date().toISOString(),
    totalAccounts: config.emails.length,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    accountResults: []
  };
  
  // 邮箱服务账号信息
  const mailUsername = 'slot@stonecoks.vip';
  const mailPassword = 'ww..MM123456789';
  
  // 获取当前日期（格式：YYYY-MM-DD）
  const today = new Date().toISOString().split('T')[0];
  
  // 循环处理每个邮箱账号
  for (let i = 0; i < config.emails.length; i++) {
    const emailAccount = config.emails[i];
    const email = emailAccount.email;
    const description = emailAccount.description || `账号${i+1}`;
    
    console.log(`\n=============================================`);
    console.log(`准备测试账号 ${i+1}/${config.emails.length}: ${email} (${description})`);
    console.log(`=============================================`);
    
    // 检查账号是否已在当天测试过
    if (isTestedToday(email)) {
      console.log(`⏭️ 账号 ${email} 今天(${today})已经测试过，跳过测试`);
      
      // 记录跳过的账号
      testResults.skippedCount++;
      testResults.accountResults.push({
        email: email,
        description: description,
        finalStatus: 'skipped',
        skipReason: '当日已测试过',
        skipDate: today
      });
      
      // 保存当前结果到日志文件
      fs.writeFileSync(logFilePath, JSON.stringify(testResults, null, 2), 'utf8');
      console.log(`✓ 已保存测试结果到: ${logFilePath}`);
      
      // 继续处理下一个账号
      continue;
    }
    
    console.log(`开始测试账号 ${i+1}/${config.emails.length}: ${email} (${description})`);
    console.log(`=============================================`);
    
    const accountResult = {
      email: email,
      description: description,
      attempts: [],
      finalStatus: 'pending'
    };
    
    let success = false;
    let attemptCount = 0;
    let browser = null;
    
    try {
      // 尝试执行测试，最多重试maxRetries次
      while (!success && attemptCount < config.maxRetries) {
        attemptCount++;
        console.log(`\n开始第 ${attemptCount}/${config.maxRetries} 次尝试...`);
        
        const attemptResult = {
          attemptNumber: attemptCount,
          startTime: new Date().toISOString(),
          endTime: null,
          success: false,
          error: null
        };
        
        try {
          // 每次尝试都启动一个新的浏览器实例，确保没有缓存
          console.log('正在启动新的浏览器实例...');
          browser = await launchBrowser();
          console.log('✓ 浏览器启动成功');
          
          // 创建新页面
          const page = await browser.newPage();
          console.log('✓ 创建新页面成功');
          
          // 设置视口大小，确保元素可见
          await page.setViewport({ width: 1280, height: 800 });
          console.log('✓ 设置视口大小: 1280x800');
          
          // 设置页面控制台消息监听，帮助调试
          page.on('console', msg => console.log('浏览器控制台:', msg.text()));
          
          // 设置更多的页面选项
          await page.setDefaultNavigationTimeout(60000); // 设置导航超时为60秒
          await page.setDefaultTimeout(30000); // 设置默认超时为30秒
          
          // 设置请求拦截，启用资源过滤以提高性能
          await setupRequestInterception(page, true);
          
          // 执行请求Civitai登录邮件流程
          console.log(`准备使用邮箱 ${email} 请求Civitai登录邮件`);
          const loginResult = await requestCivitaiLoginEmail(page, email);
          
          if (loginResult.success) {
            console.log('✓ Civitai登录邮件请求成功');
            
            // 等待30秒后执行邮箱登录
            console.log('\n等待30秒后执行邮箱登录...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            console.log('✓ 等待完成，开始执行邮箱登录');
            
            // 执行完整工作流程
            console.log(`准备使用账户 ${mailUsername} 执行完整工作流程`);
            const workflowResult = await completeWorkflow(browser, mailUsername, mailPassword);
            
            if (workflowResult.success) {
              console.log('✓ 完整工作流程执行成功');
              success = true;
              attemptResult.success = true;
            } else {
              console.log('❌ 完整工作流程执行失败:', workflowResult.error);
              attemptResult.error = `工作流程失败: ${workflowResult.error}`;
            }
          } else {
            console.log('❌ Civitai登录邮件请求失败:', loginResult.error);
            attemptResult.error = `登录邮件请求失败: ${loginResult.error}`;
          }
        } catch (error) {
          console.error(`❌ 第 ${attemptCount} 次尝试出错:`, error.message);
          attemptResult.error = error.message;
        } finally {
          // 无论成功还是失败，都关闭当前浏览器实例，清除所有缓存
          if (browser) {
            console.log('\n正在关闭浏览器实例，清除缓存...');
            await browser.close();
            console.log('✓ 浏览器已关闭，缓存已清除');
            browser = null;
          }
        }
        
        // 记录本次尝试结果
        attemptResult.endTime = new Date().toISOString();
        accountResult.attempts.push(attemptResult);
        
        // 如果成功，更新测试记录并跳出循环
        if (success) {
          console.log(`✓ 账号 ${email} 测试成功！`);
          accountResult.finalStatus = 'success';
          testResults.successCount++;
          
          // 更新测试记录
          updateTestRecord(email, today, true);
          console.log(`✓ 已更新 ${email} 的测试记录`);
          
          break;
        }
        
        // 如果已达到最大重试次数，标记为失败
        if (attemptCount >= config.maxRetries) {
          console.log(`❌ 账号 ${email} 已达到最大重试次数 ${config.maxRetries}，测试失败`);
          accountResult.finalStatus = 'failed';
          testResults.failureCount++;
        } else {
          // 否则，等待一段时间后重试
          const retryDelay = 10000; // 10秒
          console.log(`将在 ${retryDelay/1000} 秒后进行第 ${attemptCount+1} 次尝试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    } catch (error) {
      console.error(`❌ 账号 ${email} 测试过程中发生错误:`, error.message);
      console.error('错误堆栈:', error.stack);
      
      // 确保浏览器关闭
      if (browser) {
        try {
          console.log('\n正在关闭浏览器...');
          await browser.close();
          console.log('✓ 浏览器已关闭');
        } catch (closeError) {
          console.error('❌ 关闭浏览器时出错:', closeError.message);
        }
      }
      
      // 标记账号为失败
      accountResult.finalStatus = 'failed';
      accountResult.error = error.message;
      testResults.failureCount++;
    }
    
    // 将账号结果添加到总结果中
    testResults.accountResults.push(accountResult);
    
    // 保存当前结果到日志文件
    fs.writeFileSync(logFilePath, JSON.stringify(testResults, null, 2), 'utf8');
    console.log(`✓ 已保存测试结果到: ${logFilePath}`);
    
    // 每个账号测试完成后等待一段时间
    if (i < config.emails.length - 1) {
      const accountDelay = 5000; // 5秒
      console.log(`等待 ${accountDelay/1000} 秒后测试下一个账号...`);
      await new Promise(resolve => setTimeout(resolve, accountDelay));
    }
  }
  
  // 所有账号测试完成
  testResults.endTime = new Date().toISOString();
  console.log('\n=============================================');
  console.log('所有账号测试完成');
  console.log(`成功: ${testResults.successCount}/${testResults.totalAccounts}`);
  console.log(`失败: ${testResults.failureCount}/${testResults.totalAccounts}`);
  console.log(`跳过: ${testResults.skippedCount}/${testResults.totalAccounts}`);
  console.log('=============================================');
  
  // 保存最终结果到日志文件
  fs.writeFileSync(logFilePath, JSON.stringify(testResults, null, 2), 'utf8');
  console.log(`✓ 已保存最终测试结果到: ${logFilePath}`);
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
  autoLikeVideos,
  completeWorkflow,
  runMultiAccountTest
};