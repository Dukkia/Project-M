const Jimp = require('jimp');
console.log('Jimp exported:', Object.keys(Jimp));
if (typeof Jimp.read === 'function') {
  console.log('Jimp.read is a function');
} else {
  console.log('Jimp.read is NOT a function, it is type:', typeof Jimp.read);
}
