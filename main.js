/**
 * Civitai 项目主入口文件
 * 
 * 该文件作为项目的主入口点，负责调用 apps 目录中的各个模块功能
 */

// 导入浏览器模块
const browserModule = require('./apps/browser');

// 主函数
async function main() {
  console.log('Civitai 项目启动中...');
  
  try {
    // 运行浏览器测试
    await browserModule.runBrowserTest();
    
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