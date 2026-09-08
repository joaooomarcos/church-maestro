/**
 * Gerador de PDFs para Checklists do Maestro
 *
 * INSTALAÇÃO (primeira vez):
 * 1. Na pasta manuais/, execute:
 *    npm install puppeteer-core
 *
 * 2. No macOS com Chrome instalado: execute diretamente
 *    node gerar_pdf.js
 *
 * 3. No Windows com Chrome instalado: edite o caminho executablePath
 *    (ou deixe em branco para o Puppeteer auto-detectar)
 *
 * USO:
 * npm run gerar-pdf
 * ou
 * ./gerar_pdf.sh (macOS/Linux)
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

(async () => {
  const dir = __dirname;
  const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.startsWith('node_modules'));

  if (htmlFiles.length === 0) {
    console.log('Nenhum arquivo HTML encontrado em:', dir);
    process.exit(0);
  }

  // Detectar o caminho do Chrome conforme o SO
  let executablePath = '';
  if (process.platform === 'darwin') {
    // macOS
    executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (process.platform === 'win32') {
    // Windows
    executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else {
    // Linux
    executablePath = '/usr/bin/google-chrome';
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const generated = [];

  for (const htmlFile of htmlFiles) {
    const filePath = path.resolve(dir, htmlFile);
    const outputPath = path.resolve(dir, htmlFile.replace('.html', '.pdf'));

    console.log(`Gerando: ${htmlFile} → ${path.basename(outputPath)}`);

    const page = await browser.newPage();
    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    await page.close();
    generated.push(outputPath);
  }

  await browser.close();

  console.log(`\n${generated.length} PDF(s) gerado(s) com sucesso!`);

  // Abrir PDFs (opcional, apenas em macOS)
  if (process.platform === 'darwin') {
    generated.forEach(p => exec(`open "${p}"`));
  }
})();
