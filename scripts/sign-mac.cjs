const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = function signMacBundle({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return;

  const appPath = join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
