import fs from 'fs/promises';
import esbuild from 'esbuild';

const files = [
  'src/constants/categories.ts',
  'src/data/mockProducts.ts',
  'src/services/productService.ts',
  'src/store/cartWishlistStore.ts',
  'src/store/myListingsStore.ts',
  'src/utils/formatCurrency.ts'
];

async function run() {
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const result = await esbuild.transform(content, {
        loader: 'ts'
      });
      const newFile = file.replace(/\.ts$/, '.js');
      await fs.writeFile(newFile, result.code);
      await fs.unlink(file);
      console.log(`Converted ${file} to ${newFile}`);
    } catch (e) {
      console.error(`Failed on ${file}:`, e.message);
    }
  }
}

run();
