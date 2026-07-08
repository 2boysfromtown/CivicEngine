const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const filePath = 'file:///' + path.resolve(__dirname, 'pitch_deck.html').replace(/\\/g, '/');
  console.log('Loading pitch deck HTML:', filePath);
  
  await page.goto(filePath);
  await page.waitForLoadState('networkidle');
  
  console.log('Generating pitch_deck.pdf...');
  await page.pdf({
    path: 'pitch_deck.pdf',
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: {
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px'
    }
  });
  
  console.log('Pitch deck PDF created successfully at: ' + path.resolve(__dirname, 'pitch_deck.pdf'));
  await browser.close();
}

main().catch(error => {
  console.error('Error generating PDF:', error);
  process.exit(1);
});
