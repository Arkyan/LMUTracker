const path = require('path');

module.exports = async function(context) {
  // Seulement pour Windows
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const appOutDir = context.appOutDir;
  const exePath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'LMUTrackerLogo.ico');

  console.log('Injection de l\'icône dans l\'exécutable...');
  console.log('EXE:', exePath);
  console.log('Icône:', iconPath);

  try {
    const { rcedit } = await import('rcedit');
    await rcedit(exePath, {
      icon: iconPath
    });
    console.log('✅ Icône injectée avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'injection de l\'icône:', error);
    throw error;
  }
};
