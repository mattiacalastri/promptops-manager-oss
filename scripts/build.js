const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const srcDir = path.join(__dirname, '..', 'src');

// Ensure dist exists
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Bundle JS
esbuild.buildSync({
  entryPoints: [path.join(srcDir, 'app.js')],
  bundle: true,
  outfile: path.join(distDir, 'app.bundle.js'),
  platform: 'browser',
  format: 'iife',
  external: ['electron'],
  minify: false,
  sourcemap: false,
});

// Copy CSS
fs.copyFileSync(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));

// Copy xterm CSS
const xtermCss = path.join(__dirname, '..', 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css');
fs.copyFileSync(xtermCss, path.join(distDir, 'xterm.css'));

// Copy HTML
fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));

// Copy assets
const assetsDir = path.join(srcDir, 'assets');
const distAssetsDir = path.join(distDir, 'assets');
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}
if (fs.existsSync(assetsDir)) copyDir(assetsDir, distAssetsDir);

console.log('Build complete.');
