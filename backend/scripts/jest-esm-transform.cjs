// Transform the patched HTML parser's ESM dependencies for the CommonJS Jest runner.
// Production uses the original modules on Node 22; the sanitizer is not mocked.
const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    const result = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, sourceMap: true },
    });
    return { code: result.outputText, map: result.sourceMapText };
  },
};
