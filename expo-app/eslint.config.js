const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expo,
  // Compiler migration diagnostics are visible warnings across the existing app.
  // Rules of Hooks and other correctness errors remain blocking.
  { rules: {
    'react-hooks/refs': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
  } },
  { ignores: ['node_modules/**', '.expo/**'] },
]);
