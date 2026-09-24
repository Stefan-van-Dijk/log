# Code libraries

Vendored locally so code contents never need to be sent to a remote encoder and scanning/generation remains available offline after the test app is cached.

- JsBarcode 3.12.1 — https://github.com/lindell/JsBarcode — npm `jsbarcode@3.12.1`, `dist/JsBarcode.all.min.js` — MIT.
- QR Code Generator 2.0.4 — https://github.com/kazuhikoarase/qrcode-generator — npm `qrcode-generator@2.0.4`, `dist/qrcode.js` — MIT (copyright notice also included in source).
- ZXing JS 0.21.3 — https://github.com/zxing-js/library — npm `@zxing/library@0.21.3`, `umd/index.min.js` — Apache-2.0.

Original library code and license notices are retained. ZXing reads frames from a camera stream owned by the Cards module, which stops all tracks on close, navigation, or backgrounding. No dependency on the browser's optional BarcodeDetector API.
