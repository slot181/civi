/**
 * Civitai 项目主入口文件
 * 
 * 该文件作为项目的主入口点，负责调用 apps 目录中的各个模块功能
 */

// 导入必要的模块
const fs = require('fs');
const path = require('path');
const browserModule = require('./apps/browser');

/**
 * 读取邮箱配置文件
 * @returns {Object} 配置对象，包含邮箱列表和最大重试次数
 * @throws {Error} 如果配置文件不存在或邮箱列表为空
 */
function readEmailConfig() {
  try {
    const configPath = path.join(__dirname, 'config', 'emails.json');
    console.log(`正在读取配置文件: ${configPath}`);
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config.emails || config.emails.length === 0) {
      throw new Error('配置文件中未找到有效的邮箱账号');
    }
    
    console.log(`成功读取配置文件，包含 ${config.emails.length} 个邮箱账号`);
    return config;
  } catch (error) {
    console.error('读取配置文件出错:', error.message);
    throw error; // 重新抛出错误，让调用者处理
  }
}

// 主函数
async function main() {
  console.log('Civitai 项目启动中...');
  
  try {
    // 读取邮箱配置
    const emailConfig = readEmailConfig();
    
    // 运行多账号浏览器测试
    await browserModule.runMultiAccountTest(emailConfig);
    
    console.log('Civitai 项目执行完成');
  } catch (error) {
    console.error('Civitai 项目执行出错:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});