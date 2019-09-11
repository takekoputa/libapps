// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = {
  'root': true,
  'env': {
    'browser': true,
    // This allows the runtime environment (i.e. objects).
    'es6': true,
  },
  'parserOptions': {
    // This sets the syntax parsing level.
    'ecmaVersion': 2018,
    'sourceType': 'module',
  },

  // See https://eslint.org/docs/rules/ for details.
  // These rules were picked based on the existing codebase.  If you find one
  // to be too onerous and not required by the styleguide, feel free to discuss.
  'rules': {
    'array-bracket-spacing': 'error',
    'arrow-spacing': ['error', {'before': true, 'after': true}],
    'block-spacing': ['error', 'always'],
    'comma-style': 'error',
    'eol-last': 'error',
    'generator-star-spacing': ['error', 'after'],
    'lines-between-class-members': 'error',
    'new-parens': 'error',
    'no-alert': 'error',
    'no-catch-shadow': 'error',
    'no-cond-assign': 'error',
    'no-const-assign': 'error',
    'no-debugger': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty-character-class': 'error',
    'no-eval': 'error',
    'no-ex-assign': 'error',
    'no-extra-semi': 'error',
    'no-implied-eval': 'error',
    'no-invalid-regexp': 'error',
    'no-irregular-whitespace': 'error',
    'no-label-var': 'error',
    'no-mixed-spaces-and-tabs': 'error',
    'no-multiple-empty-lines': 'error',
    'no-new': 'error',
    'no-new-func': 'error',
    'no-new-object': 'error',
    'no-new-wrappers': 'error',
    'no-return-await': 'error',
    'no-script-url': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-shadow-restricted-names': 'error',
    'no-tabs': 'error',
    'no-template-curly-in-string': 'error',
    'no-trailing-spaces': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unneeded-ternary': 'error',
    'no-unreachable': 'error',
    'no-void': 'error',
    // We allow TODO comments.
    'no-warning-comments': [
      'error', {
        'terms': ['fix', 'fixme', 'xxx'],
      },
    ],
    'no-whitespace-before-property': 'error',
    'no-with': 'error',
    'prefer-numeric-literals': 'error',
    'quote-props': ['error', 'consistent'],
    'rest-spread-spacing': 'error',
    'semi': ['error', 'always'],
    'semi-style': ['error', 'last'],
    'space-unary-ops': 'error',
    'switch-colon-spacing': ['error', {'after': true, 'before': false}],
    'symbol-description': 'error',
    'template-curly-spacing': ['error', 'never'],
    'unicode-bom': ['error', 'never'],
    'use-isnan': 'error',
    'valid-typeof': 'error',
    'yoda': 'error',
  },
};
